import {
  DataFS,
  DataType,
  LocationType,
  PermissionType,
  PositionFS,
  ProjectDataType,
  ProjectFS,
  ProjectKeyFS,
  ProjectSettingsFS,
  ProjectSettingsType,
  ProjectType,
  RecordType,
  UpdateProjectFS,
} from '../../types';
//@ts-ignore
import sizeof from 'firestore-size';
import obj_sizeof from 'object-sizeof';
import {
  decryptEThree as decGroup,
  encryptEThree as encGroup,
  wrapDEKForMember,
  unwrapDEK,
} from '../virgilsecurity/e3kit';
import { createProjectDEK, encryptWithDEK, decryptWithDEK, ExportedDEK } from '../virgilsecurity/dek';
import { FUNC_ENCRYPTION, CREATE_DEK_PROJECTS } from '../../constants/AppConstants';
import {
  auth,
  collection,
  deleteDoc,
  doc,
  firestore,
  functions,
  getDoc,
  getDocs,
  getDocsFromServer,
  httpsCallable,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  firebaseReady,
} from './firebase';
import { t } from '../../i18n/config';

// ============================================================================
// 暗号方式（group | dek）の分岐とDEK（エンベロープ暗号）の鍵管理
//
// enc/dec はプロジェクトの暗号方式に応じて分岐する:
//  - 'group'（従来）: Virgil グループ暗号（encGroup/decGroup）。参加者追加はオーナー専用。
//  - 'dek'（新方式）: プロジェクト毎のDEK公開鍵で暗号化し、DEK秘密鍵を各メンバーの公開鍵で
//    ラップして projects/{id}/keys/{uid} に保存。任意の管理者がメンバー追加可能。
// crypto層（dek.ts/e3kit.ts）は純粋に保ち、Firestore結合（keys読み取り・方式判別）はここに置く。
// ============================================================================

type ProjectCrypto = { scheme: 'group' | 'dek'; dekPublicKey?: string; dekPrivateKey?: string };
const projectCryptoCache = new Map<string, ProjectCrypto>();

/** プロジェクトの暗号情報キャッシュをクリア（ログアウト・プロジェクト切替時に呼ぶ）。 */
export const clearProjectCryptoCache = () => projectCryptoCache.clear();

/** 既知のDEKをキャッシュへ事前登録する（新規作成・移行直後に enc が即使えるように）。 */
export const setProjectCryptoCache = (projectId: string, crypto: ProjectCrypto) => {
  projectCryptoCache.set(projectId, crypto);
};

/** 現在ユーザー宛ての keys/{uid} を読み、unwrap してDEK秘密鍵(base64)を得る。無ければ undefined。 */
const loadProjectDEKForCurrentUser = async (projectId: string): Promise<string | undefined> => {
  const uid = auth?.currentUser?.uid;
  if (!uid) return undefined;
  const keyRef = doc(firestore, 'projects', projectId, 'keys', uid);
  const snap = await getDoc(keyRef);
  const keyData = snap.data() as ProjectKeyFS | undefined;
  if (!keyData) return undefined;
  return unwrapDEK(keyData.encDek, keyData.wrapperUid, toDate(keyData.encryptedAt));
};

/** プロジェクトの暗号方式とDEK鍵を取得（キャッシュ付き）。 */
const getProjectCrypto = async (projectId: string): Promise<ProjectCrypto> => {
  // 暗号無効モードでは常にgroup経路（gzipのみ）に委譲する。
  if (!FUNC_ENCRYPTION) return { scheme: 'group' };
  const cached = projectCryptoCache.get(projectId);
  if (cached) return cached;
  const snap = await getDoc(doc(firestore, 'projects', projectId));
  const pdata = snap.data() as ProjectFS | undefined;
  if (pdata?.cryptoScheme !== 'dek') {
    const crypto: ProjectCrypto = { scheme: 'group' };
    projectCryptoCache.set(projectId, crypto);
    return crypto;
  }
  // dek: 公開鍵は平文、秘密鍵は keys/{uid} を unwrap して取得
  const dekPrivateKey = await loadProjectDEKForCurrentUser(projectId);
  const crypto: ProjectCrypto = { scheme: 'dek', dekPublicKey: pdata.dekPublicKey, dekPrivateKey };
  projectCryptoCache.set(projectId, crypto);
  return crypto;
};

/** 方式分岐つき暗号化（従来 enc と同シグネチャ）。 */
const enc = async (data: any, userId: string, projectId: string): Promise<string[]> => {
  const crypto = await getProjectCrypto(projectId);
  if (crypto.scheme === 'dek') {
    if (!crypto.dekPublicKey) throw new Error('DEK public key not available');
    return encryptWithDEK(data, crypto.dekPublicKey);
  }
  return encGroup(data, userId, projectId);
};

/** 方式分岐つき復号（従来 dec と同シグネチャ。復号できなければ undefined）。 */
const dec = async (encryptedAt: Date, encdata: string[], userId: string, projectId: string): Promise<any> => {
  const crypto = await getProjectCrypto(projectId);
  if (crypto.scheme === 'dek') {
    if (crypto.dekPrivateKey) {
      try {
        // try内でawaitしないと復号エラーをcatchできない（rejectされたPromiseをそのまま返してしまう）。
        return await decryptWithDEK(encdata, crypto.dekPrivateKey);
      } catch (e) {
        // 移行(Phase ii)プロジェクトでは一部データ(PRIVATE/PUBLIC等)が旧グループ暗号のまま残る。
        // DEKで復号できない場合はグループ暗号へフォールバックする(dual-read)。
      }
    }
    return decGroup(encryptedAt, encdata, userId, projectId);
  }
  return decGroup(encryptedAt, encdata, userId, projectId);
};

/** 方式分岐つき復号の公開ラッパー（firestore.ts 外から使う場合）。 */
export const decryptProjectData = (
  encryptedAt: Date,
  encdata: string[],
  userId: string,
  projectId: string
): Promise<any> => dec(encryptedAt, encdata, userId, projectId);

/**
 * 生成済みDEKを全メンバーの公開鍵でラップして projects/{id}/keys/{uid} に保存する。
 * プロジェクト doc 作成後に呼ぶこと（Rulesが project の adminsUid/membersUid を参照するため）。
 */
export const distributeProjectDEK = async (
  projectId: string,
  memberUids: string[],
  dek: ExportedDEK,
  wrapperUid: string
): Promise<{ isOK: boolean; message: string }> => {
  try {
    const encryptedAt = Timestamp.now();
    const batch = writeBatch(firestore);
    for (const uid of memberUids) {
      const encDek = await wrapDEKForMember(dek.privateKey, uid);
      const keyFS: ProjectKeyFS = { encDek, wrapperUid, encryptedAt };
      batch.set(doc(firestore, 'projects', projectId, 'keys', uid), keyFS);
    }
    await batch.commit();
    return { isOK: true, message: '' };
  } catch (e) {
    console.log('[distributeProjectDEK] error', e);
    return { isOK: false, message: t('hooks.message.failAddGroupMembers') };
  }
};

/**
 * 管理者が新メンバーを追加する: 既存DEKを取得し、新メンバーの公開鍵でラップして keys/{newUid} を書く。
 * オーナー不要（DEKを開封できる任意の管理者が実行可能）。
 */
export const addMemberKey = async (
  projectId: string,
  newMemberUid: string
): Promise<{ isOK: boolean; message: string }> => {
  try {
    const wrapperUid = auth?.currentUser?.uid;
    if (!wrapperUid) return { isOK: false, message: t('hooks.message.pleaseLogin') };
    const crypto = await getProjectCrypto(projectId);
    if (crypto.scheme !== 'dek' || !crypto.dekPrivateKey) {
      return { isOK: false, message: 'project not in dek scheme or DEK unavailable' };
    }
    const encDek = await wrapDEKForMember(crypto.dekPrivateKey, newMemberUid);
    const keyFS: ProjectKeyFS = { encDek, wrapperUid, encryptedAt: Timestamp.now() };
    await setDoc(doc(firestore, 'projects', projectId, 'keys', newMemberUid), keyFS);
    return { isOK: true, message: '' };
  } catch (e) {
    console.log('[addMemberKey] error', e);
    return { isOK: false, message: t('hooks.message.failAddGroupMembers') };
  }
};

/** メンバーのDEKコピーを削除する（メンバー削除時。真の失効にはDEKローテーションが別途必要）。 */
export const removeMemberKey = async (
  projectId: string,
  uid: string
): Promise<{ isOK: boolean; message: string }> => {
  try {
    await deleteDoc(doc(firestore, 'projects', projectId, 'keys', uid));
    return { isOK: true, message: '' };
  } catch (e) {
    console.log('[removeMemberKey] error', e);
    return { isOK: false, message: '' };
  }
};

export const getUidByEmail = async (email: string) => {
  try {
    await firebaseReady;
    const getUid = httpsCallable(functions, 'getUidByEmail');
    const { data } = await getUid({ email: email });
    if (data === null) throw new Error(t('common.message.failGetUids'));
    return data as string;
  } catch {
    throw new Error(t('common.message.failGetUids'));
  }
};

export const getUidsByEmails = async (emails: string[]) => {
  try {
    await firebaseReady;
    const getUids = httpsCallable(functions, 'getUidsByEmails');
    const { data } = await getUids({ emails: emails });
    return data as (string | null)[];
  } catch (e) {
    throw new Error(t('common.message.failGetUids'));
  }
};

export const getAllProjects = async (uid: string, excludeMember = false) => {
  // const perfStart = performance.now();
  try {
    let q;
    if (excludeMember) {
      q = query(collection(firestore, 'projects'), where('ownerUid', '==', uid));
    } else {
      q = query(collection(firestore, 'projects'), where('membersUid', 'array-contains', uid));
    }

    // 常にサーバーから最新データを取得（プロジェクト一覧は最新情報が重要）
    // const firebaseStart = performance.now();
    const querySnapshot = await getDocsFromServer(q);
    // const firebaseEnd = performance.now();
    // console.log(`[PERF] Firebase getDocsFromServer: ${(firebaseEnd - firebaseStart).toFixed(0)}ms (${querySnapshot.docs.length} projects)`);

    // 設定取得と復号化を並列で実行（全プラットフォーム共通）

    // 1. 設定の更新日時を全並列で取得
    // const settingsStart = performance.now();
    const settingsResults = await Promise.all(
      querySnapshot.docs.map((docSnapshot) => getSettingsUpdatedAt(docSnapshot.id))
    );
    // const settingsEnd = performance.now();
    // console.log(`[PERF] Settings fetch (parallel): ${(settingsEnd - settingsStart).toFixed(0)}ms`);

    // 2. 設定取得完了後、復号化を並列で実行
    // const decryptStart = performance.now();
    const result = querySnapshot.docs.map(async (docSnapshot, index) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { encdata, ownerUid, encryptedAt, license, storage, cryptoScheme, dekPublicKey, ...others } =
        docSnapshot.data() as ProjectFS;
      // group方式は方式が確定しているのでキャッシュへ事前登録し、dec内での余分なproject doc再読み取りを防ぐ
      // （既存プロジェクトの読み取り回数を従来どおりに保つ）。dek方式はDEK秘密鍵の遅延取得が要るので事前登録しない。
      if (cryptoScheme !== 'dek') {
        setProjectCryptoCache(docSnapshot.id, { scheme: 'group' });
      }
      const data = await dec(toDate(encryptedAt), encdata, ownerUid, docSnapshot.id);
      if (data === undefined) {
        return undefined;
      } else {
        return {
          id: docSnapshot.id,
          ownerUid,
          storage: storage ?? { count: 0 },
          license: license ?? 'Free',
          ...data,
          ...others,
          encryptedAt: toDate(encryptedAt),
          cryptoScheme: cryptoScheme ?? 'group',
          // 事前に取得した設定の更新日時を使用
          settingsEncryptedAt: settingsResults[index],
        } as ProjectType;
      }
    });

    const projects = await Promise.all(result);
    // const decryptEnd = performance.now();
    // console.log(`[PERF] Decrypt all projects: ${(decryptEnd - decryptStart).toFixed(0)}ms`);

    // const perfEnd = performance.now();
    // console.log(`[PERF] === getAllProjects TOTAL: ${(perfEnd - perfStart).toFixed(0)}ms ===`);

    if (projects.includes(undefined)) {
      const filteredProjects = projects.filter((v): v is ProjectType => v !== undefined);
      return { isOK: true, message: t('common.message.cannotLoadProject'), projects: filteredProjects };
    }
    return { isOK: true, message: '', projects: projects as ProjectType[] };
  } catch (error) {
    console.log(error);
    throw new Error(t('common.message.failGetProjects'));
  }
};

export const addProject = async (project: ProjectType) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ownerUid, adminsUid, membersUid, storage, license, settingsEncryptedAt, ...others } = project;

    // 新規プロジェクトはエンベロープ暗号（DEK）方式で作成する（管理者によるメンバー追加を可能にするため）。
    // CREATE_DEK_PROJECTS が有効な場合のみ、新規プロジェクトをエンベロープ暗号(DEK)方式で作成する。
    // （ロールアウト安全のため。false の間は従来のグループ暗号で作成し、旧クライアントでも開ける。）
    if (FUNC_ENCRYPTION && CREATE_DEK_PROJECTS) {
      const dek = await createProjectDEK();
      // enc が即DEKを使えるようキャッシュへ事前登録
      setProjectCryptoCache(id, { scheme: 'dek', dekPublicKey: dek.publicKey, dekPrivateKey: dek.privateKey });
      const encdata = await enc(others, ownerUid, id);
      const projectFS: ProjectFS = {
        ownerUid,
        adminsUid,
        membersUid,
        encdata,
        encryptedAt: Timestamp.now(),
        cryptoScheme: 'dek',
        dekPublicKey: dek.publicKey,
      };
      await setDoc(doc(firestore, 'projects', id), projectFS);
      // プロジェクト doc 作成後に keys を配布（Rulesが project の adminsUid/membersUid を参照するため）
      const distRes = await distributeProjectDEK(id, membersUid, dek, ownerUid);
      if (!distRes.isOK) return { isOK: false, message: distRes.message };
      return { isOK: true, message: '' };
    }

    // 従来のグループ暗号方式（フラグOFF）または暗号無効モード(gzip)。
    // グループ暗号の場合、Virgilグループは createE3kitGroup で作成済み。
    setProjectCryptoCache(id, { scheme: 'group' });
    const encdata = await enc(others, ownerUid, id);
    const projectFS: ProjectFS = {
      ownerUid,
      adminsUid,
      membersUid,
      encdata,
      encryptedAt: Timestamp.now(),
    };
    await setDoc(doc(firestore, 'projects', id), projectFS);
    return { isOK: true, message: '' };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: 'プロジェクトの追加に失敗しました' };
  }
};

export const updateProject = async (project: ProjectType) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ownerUid, adminsUid, membersUid, storage, license, settingsEncryptedAt, ...others } = project;
    const encdata = await enc(others, ownerUid, id);
    const updateProjectFS: UpdateProjectFS = {
      adminsUid,
      membersUid,
      encdata,
      encryptedAt: Timestamp.now(),
    };
    await updateDoc(doc(firestore, 'projects', id), updateProjectFS);
    return { isOK: true, message: '' };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: 'プロジェクトの更新に失敗しました' };
  }
};

export const deleteAllProjects = async (uid: string) => {
  const deletedIds = [];
  try {
    const q = query(collection(firestore, 'projects'), where('ownerUid', '==', uid));
    const querySnapshot = await getDocs(q);
    for (const v of querySnapshot.docs) {
      //projectを削除するとfunctionsがトリガーされsubcollectionも削除する
      const projectRef = doc(firestore, 'projects', v.id);
      await deleteDoc(projectRef);
      deletedIds.push(v.id);
    }
    return { isOK: true, message: '', deletedIds };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: 'プロジェクトの削除に失敗しました', deletedIds: undefined };
  }
};

export const deleteProject = async (projectId: string) => {
  try {
    // ドキュメント参照を作成
    const projectRef = doc(firestore, 'projects', projectId);
    // ドキュメント削除（Cloud Functions 側で subcollection も削除される想定）
    await deleteDoc(projectRef);
    return { isOK: true, message: '' };
  } catch (error) {
    console.error('プロジェクト削除エラー:', error);
    return { isOK: false, message: 'プロジェクトの削除に失敗しました' };
  }
};

export const deleteAllData = async (projectId: string) => {
  try {
    // 1. サブコレクション 'data' への参照を取得
    const dataCol = collection(firestore, 'projects', projectId, 'data');
    // 2. 全ドキュメントを取得
    const querySnapshot = await getDocs(dataCol);
    if (querySnapshot.empty) {
      return { isOK: true, message: '' };
    }

    // 3. バッチを作成して一括削除
    const batch = writeBatch(firestore);
    querySnapshot.docs.forEach(
      (docSnap) => {
        batch.delete(docSnap.ref);
      }
    );
    await batch.commit();

    return { isOK: true, message: '' };
  } catch (error) {
    console.error('データ削除エラー:', error);
    return { isOK: false, message: 'データの削除に失敗しました' };
  }
};
export const deleteData = async (
  projectId: string,
  layerId: string,
  permission?: PermissionType | 'TEMPLATE',
  userId?: string
) => {
  try {
    // ベースのコレクション参照
    const dataCol = collection(firestore, 'projects', projectId, 'data');

    // クエリを動的に組み立て
    let q;
    if (permission === 'TEMPLATE') {
      // テンプレートを含めて削除
      q = query(dataCol, where('layerId', '==', layerId), where('permission', '==', 'TEMPLATE'));
    } else if (permission !== undefined && userId !== undefined) {
      // 特定ユーザー＆権限のデータを削除
      q = query(
        dataCol,
        where('layerId', '==', layerId),
        where('userId', '==', userId),
        where('permission', '==', permission)
      );
    } else {
      // layerId のみで削除
      q = query(dataCol, where('layerId', '==', layerId));
    }

    // ドキュメント取得
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return { isOK: true, message: '' };
    }

    // バッチ処理で一括削除
    const batch = writeBatch(firestore);
    snapshot.docs.forEach(
      (docSnap) => {
        batch.delete(docSnap.ref);
      }
    );
    await batch.commit();

    return { isOK: true, message: '' };
  } catch (error) {
    console.error('データ削除エラー:', error);
    return { isOK: false, message: 'データの削除に失敗しました' };
  }
};

export const uploadProjectSettings = async (projectId: string, editorUid: string, settings: ProjectSettingsType) => {
  try {
    const timestamp = Timestamp.now();
    const encdata = await enc({ ...settings, updatedAt: toDate(timestamp) }, editorUid, projectId);
    const settingsFS: ProjectSettingsFS = { editorUid, encdata, encryptedAt: timestamp };
    await setDoc(doc(firestore, 'projects', projectId, 'settings', 'default'), settingsFS);
    return { isOK: true, message: '', timestamp: toDate(timestamp) };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: 'プロジェクトの設定のアップロードに失敗しました', timestamp: undefined };
  }
};

export const getSettingsUpdatedAt = async (projectId: string): Promise<Date | undefined> => {
  try {
    // サーバーから最新データを取得（キャッシュを使用しない）
    const settingsQuery = query(
      collection(firestore, 'projects', projectId, 'settings'),
      where('__name__', '==', 'default')
    );
    const snap = await getDocsFromServer(settingsQuery);

    if (snap.empty) {
      return undefined;
    }

    // データをプロジェクト設定型として取得
    const settings = snap.docs[0].data() as ProjectSettingsFS;
    // encryptedAt フィールドを Date に変換して返す
    return toDate(settings.encryptedAt);
  } catch (error) {
    console.error('設定更新日時取得エラー:', error);
    return undefined;
  }
};

export const downloadProjectSettings = async (
  projectId: string
): Promise<
  { isOK: true; message: ''; data: ProjectSettingsType } | { isOK: false; message: string; data?: undefined }
> => {
  try {
    // ドキュメント参照をモジュラー API で作成
    const settingsRef = doc(firestore, 'projects', projectId, 'settings', 'default');
    // ドキュメントを取得
    const snap = await getDoc(settingsRef);

    // データを型付きで取得
    const settings = snap.data() as ProjectSettingsFS;

    // encryptedAt を Date に変換
    const encryptedAtDate = toDate(settings.encryptedAt);

    // 復号化を実行
    const data = await dec(encryptedAtDate, settings.encdata, settings.editorUid, projectId);
    if (data === undefined) {
      throw new Error('復号化できません');
    }

    return { isOK: true, message: '', data };
  } catch (error) {
    console.error('プロジェクト設定ダウンロードエラー:', error);
    return {
      isOK: false,
      message: 'プロジェクトの設定のダウンロードに失敗しました',
    };
  }
};

const projectDataSetToDataSet = async (projectId: string, projectDataSet: any) => {
  // layerId と userId の組み合わせをキーとしてグループ化するための Map
  const dataMap = new Map<string, { [index: number]: string[] }>();
  const metadataMap = new Map<string, { layerId: string; userId: string; encryptedAt: Timestamp }>();

  // 各ドキュメントを処理
  projectDataSet.docs.forEach((v: any) => {
    const { encdata, layerId, chunkIndex, userId, encryptedAt } = v.data() as DataFS;
    // コンポジットキーを生成: layerId_userId の形式
    const compositeKey = `${layerId}_${userId}`;

    // compositeKey でグループがなければ作成
    if (!dataMap.has(compositeKey)) {
      dataMap.set(compositeKey, {});
    }
    // chunkIndexがない場合は 0 とする
    const index = chunkIndex !== undefined ? chunkIndex : 0;
    dataMap.get(compositeKey)![index] = encdata;

    // メタデータは最初に見つかった情報を保存する
    if (!metadataMap.has(compositeKey)) {
      metadataMap.set(compositeKey, { layerId, userId, encryptedAt });
    }
  });

  // 各グループごとにチャンクを結合し、復号を試みる
  const dataSet = await Promise.all(
    Array.from(dataMap.entries()).map(async ([compositeKey, chunkMap]) => {
      const { layerId, userId, encryptedAt } = metadataMap.get(compositeKey)!;

      // チャンクのキーを数値順にソートし、正しい順序で結合
      const encdata = Object.keys(chunkMap)
        .sort((a, b) => Number(a) - Number(b))
        .map((index) => chunkMap[Number(index)])
        .flat();
      const data = await dec(toDate(encryptedAt), encdata, userId, projectId);
      if (data !== undefined) {
        const recordsWithSyncFlag: RecordType[] = data.data.map((record: RecordType) => ({
          ...record,
        }));

        return {
          userId,
          layerId,
          data: recordsWithSyncFlag,
        } as DataType;
      } else {
        // 復号できない場合は null を返す
        return null;
      }
    })
  );

  // 復号に成功したデータのみを返す
  return dataSet.filter((v: any): v is DataType => v !== null);
};

const chunkData = (encdataArray: string[], chunkSize: number): string[][] => {
  let currentChunk: string[] = [];
  let currentChunkSize = 0;
  const chunks: string[][] = [];

  for (const encdata of encdataArray) {
    const encdataSize = obj_sizeof(encdata);
    if (currentChunkSize + encdataSize > chunkSize) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentChunkSize = 0;
    }
    currentChunk.push(encdata);
    currentChunkSize += encdataSize;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
};

const MAX_SIZE_KB = 5000;
const CHUNK_SIZE = 900 * 1024; // 900KB

export const uploadChunks = async (
  projectId: string,
  chunks: string[][],
  userId: string,
  layerId: string,
  permission: PermissionType | 'TEMPLATE'
): Promise<Timestamp> => {
  // モジュラー API でバッチを作成
  const batch = writeBatch(firestore);

  // data サブコレクション参照
  const dataCol = collection(firestore, 'projects', projectId, 'data');

  // 全チャンクで同一の encryptedAt を使う（楽観的ロックの基準値を決定的にするため）
  const encryptedAt = Timestamp.now();

  // 各チャンクをバッチに追加
  chunks.forEach((chunk, index) => {
    const dataFS: DataFS = {
      userId,
      layerId,
      permission,
      encdata: chunk,
      encryptedAt,
      chunkIndex: index,
    };
    // 自動 ID のドキュメント参照を作成
    const docRef = doc(dataCol);
    batch.set(docRef, dataFS);
  });

  // コミットして一括書き込みを実行
  await batch.commit();

  return encryptedAt;
};

export const deleteExistingData = async (
  projectId: string,
  userId: string,
  layerId: string,
  permission: PermissionType | 'TEMPLATE'
): Promise<void> => {
  // 1. バッチ作成
  const batch = writeBatch(firestore);

  // 2. サブコレクションへの参照を作成
  const dataCol = collection(firestore, 'projects', projectId, 'data');

  // 3. クエリを組み立て
  const q = query(
    dataCol,
    where('permission', '==', permission),
    where('layerId', '==', layerId),
    where('userId', '==', userId)
  );

  // 4. 一致するドキュメントを取得
  const snapshot = await getDocs(q);

  // 5. バッチに削除操作を登録
  snapshot.docs.forEach(
    (docSnap) => {
      batch.delete(docSnap.ref);
    }
  );

  // 6. 一括コミットで削除を実行
  await batch.commit();
};

export const uploadDataHelper = async (
  projectId: string,
  data: ProjectDataType
): Promise<{ isOK: boolean; message: string; encryptedAt?: number }> => {
  const { userId, layerId, permission, ...others } = data;
  const encdataArray = await enc(others, userId, projectId);
  const KBytes = sizeof(encdataArray) / 1024;

  if (KBytes > MAX_SIZE_KB) {
    return { isOK: false, message: t('hooks.message.dataSizeTooLarge') };
  }

  const chunks = chunkData(encdataArray, CHUNK_SIZE);
  await deleteExistingData(projectId, userId, layerId, permission);
  const encryptedAt = await uploadChunks(projectId, chunks, userId, layerId, permission);

  // チャンクが無い（空データ）場合はクラウドにドキュメントが存在しないため基準値は未確立(undefined)とする
  return { isOK: true, message: '', encryptedAt: chunks.length > 0 ? encryptedAt.toMillis() : undefined };
};

export const downloadCommonData = async (projectId: string) => {
  try {
    // 1. サブコレクション 'data' への参照を作成
    const dataCol = collection(firestore, 'projects', projectId, 'data');

    // 2. 'permission' フィールドが 'COMMON' のドキュメントを絞り込むクエリを作成
    const q = query(dataCol, where('permission', '==', 'COMMON'));

    // 3. クエリを実行してスナップショットを取得
    const projectDataSet = await getDocs(q);

    // 4. ユーティリティ関数で変換
    const dataSet = await projectDataSetToDataSet(projectId, projectDataSet);

    return { isOK: true, message: '', data: dataSet };
  } catch (error) {
    console.error('コモンデータダウンロードエラー:', error);
    return {
      isOK: false,
      message: 'コモンデータのダウンロードに失敗しました',
    };
  }
};

export const downloadAllData = async (projectId: string) => {
  try {
    // サブコレクション 'data' への参照をモジュラー API で取得
    const dataCol = collection(firestore, 'projects', projectId, 'data');

    // 全ドキュメントを取得
    const projectDataSet = await getDocs(dataCol);

    // ユーティリティ関数で変換
    const dataSet = await projectDataSetToDataSet(projectId, projectDataSet);

    return { isOK: true, message: '', data: dataSet };
  } catch (error) {
    console.error('データダウンロードエラー:', error);
    return {
      isOK: false,
      message: 'データのダウンロードに失敗しました',
    };
  }
};

export const downloadPublicAndCommonData = async (projectId: string) => {
  try {
    // 1. サブコレクション 'data' への参照を取得
    const dataCol = collection(firestore, 'projects', projectId, 'data');
    // 2. 'permission' が 'PUBLIC' または 'COMMON' のドキュメントを取得するクエリを作成
    const q = query(dataCol, where('permission', 'in', ['PUBLIC', 'COMMON']));
    // 3. クエリを実行してスナップショットを取得
    const projectDataSet = await getDocs(q);
    // 4. ユーティリティ関数でスナップショットをアプリ向けデータ形式に変換
    const dataSet = await projectDataSetToDataSet(projectId, projectDataSet);
    return { isOK: true, message: '', data: dataSet };
  } catch (error) {
    console.error('データダウンロードエラー:', error);
    return {
      isOK: false,
      message: 'データのダウンロードに失敗しました',
    };
  }
};

/**
 * PUBLICデータを取得する
 * @param projectId プロジェクトID
 * @param options オプション: excludeUserId
 */
export const downloadPublicData = async (projectId: string, { excludeUserId }: { excludeUserId?: string } = {}) => {
  try {
    // 1. data サブコレクションへの参照を取得
    const dataCol = collection(firestore, 'projects', projectId, 'data');
    // 2. 'PUBLIC' 権限のドキュメントを絞り込むクエリを作成
    const q = query(dataCol, where('permission', '==', 'PUBLIC'));
    // 3. クエリを実行してスナップショットを取得
    const projectDataSet = await getDocs(q);

    // 4. excludeUserId があれば対象外ユーザーのドキュメントをフィルタリング
    let docs = projectDataSet.docs;
    if (excludeUserId) {
      docs = docs.filter(
        (docSnap) => {
          const data = docSnap.data() as DataFS;
          return data.userId !== excludeUserId;
        }
      );
    }

    // 5. フィルタ後の docs 配列をユーティリティ関数に渡す
    const dataSet = await projectDataSetToDataSet(projectId, { docs });

    return { isOK: true, message: '', data: dataSet };
  } catch (error) {
    console.error('データダウンロードエラー:', error);
    return {
      isOK: false,
      message: 'データのダウンロードに失敗しました',
    };
  }
};

/**
 * PRIVATEデータを取得する
 * @param projectId プロジェクトID
 * @param options オプション: userId, excludeUserId
 */
export const downloadPrivateData = async (
  projectId: string,
  { userId, excludeUserId }: { userId?: string; excludeUserId?: string } = {}
) => {
  try {
    // 1. 'data' サブコレクションへの参照を取得
    const dataCol = collection(firestore, 'projects', projectId, 'data');

    // 2. 'permission' === 'PRIVATE' のクエリを組み立て
    let q = query(dataCol, where('permission', '==', 'PRIVATE'));

    // 3. userId が指定されていればさらに絞り込む
    if (userId) {
      q = query(q, where('userId', '==', userId));
    }

    // 4. クエリを実行してスナップショットを取得
    const projectDataSet = await getDocs(q);

    // 5. スナップショットをアプリ用データ形式に変換
    let dataSet = await projectDataSetToDataSet(projectId, projectDataSet);

    // 6. excludeUserId があれば結果から除外
    if (excludeUserId) {
      dataSet = dataSet.filter((item) => item.userId !== excludeUserId);
    }

    return { isOK: true, message: '', data: dataSet };
  } catch (error) {
    console.error('プライベートデータダウンロードエラー:', error);
    return {
      isOK: false,
      message: 'データのダウンロードに失敗しました',
    };
  }
};
export const downloadTemplateData = async (projectId: string) => {
  try {
    // 'data' サブコレクションを参照し、permission==='TEMPLATE' のドキュメントを取得
    const dataCol = collection(firestore, 'projects', projectId, 'data');
    const q = query(dataCol, where('permission', '==', 'TEMPLATE'));
    const projectDataSet = await getDocs(q);

    // 取得したスナップショットをアプリ用データ形式に変換
    const dataSet = await projectDataSetToDataSet(projectId, projectDataSet);
    return { isOK: true, message: '', data: dataSet };
  } catch (error) {
    console.error('テンプレートデータダウンロードエラー:', error);
    return { isOK: false, message: 'データのダウンロードに失敗しました' };
  }
};

/**
 * 既存のグループ暗号プロジェクトをDEK(エンベロープ暗号)方式へ移行する（Phase ii / 遅延移行）。
 * 管理者端末で実行する（E2Eのためクラウド関数では復号できない）。
 *
 * 方針:
 *  - 再暗号化する(DEK化): プロジェクトメタ・設定・COMMON・TEMPLATE（新メンバーに必要な共有データ）。
 *  - そのまま残す: PRIVATE/PUBLIC（各メンバー所有）。Virgilグループも残し、これらは dual-read で復号する。
 *  - DEK秘密鍵は引数 project の membersUid 全員へラップして keys/{uid} に保存する。
 * 冪等: 既にDEK方式なら何もしない。
 */
export const migrateProjectToDEK = async (
  project: ProjectType
): Promise<{ isOK: boolean; message: string }> => {
  try {
    const wrapperUid = auth?.currentUser?.uid;
    if (!wrapperUid) return { isOK: false, message: t('hooks.message.pleaseLogin') };

    const { id, ownerUid, membersUid } = project;

    // 既にDEK方式なら多重移行しない。
    const current = await getProjectCrypto(id);
    if (current.scheme === 'dek') return { isOK: true, message: '' };

    // 1. まだgroup方式のうちに、移行対象データを復号して取り出す（このdecはグループ暗号で動く）。
    const settingsRes = await downloadProjectSettings(id);
    const commonRes = await downloadCommonData(id);
    const templateRes = await downloadTemplateData(id);
    if (!commonRes.isOK || !templateRes.isOK) {
      return { isOK: false, message: t('common.message.cannotLoadProject') };
    }

    // 2. DEKを生成し、以降の暗号化がDEKを使うようキャッシュを切り替える。
    const dek = await createProjectDEK();
    setProjectCryptoCache(id, { scheme: 'dek', dekPublicKey: dek.publicKey, dekPrivateKey: dek.privateKey });

    // 3. 既存の全メンバーへDEKを配布（keys/{uid}）。新メンバーは呼び出し側が addMemberKey で追加する。
    const distRes = await distributeProjectDEK(id, membersUid, dek, wrapperUid);
    if (!distRes.isOK) return { isOK: false, message: distRes.message };

    // 4. プロジェクトメタをDEKで再暗号化し、cryptoScheme/dekPublicKey を設定（管理者更新としてRulesを通す）。
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, ownerUid: _o, adminsUid: _a, membersUid: _m, storage, license, settingsEncryptedAt, ...others } =
      project;
    const encdata = await enc(others, ownerUid, id);
    await updateDoc(doc(firestore, 'projects', id), {
      encdata,
      encryptedAt: Timestamp.now(),
      cryptoScheme: 'dek',
      dekPublicKey: dek.publicKey,
    });

    // 5. 設定・COMMON・TEMPLATE をDEKで再暗号化して書き戻す。
    if (settingsRes.isOK) {
      await uploadProjectSettings(id, wrapperUid, settingsRes.data);
    }
    for (const d of commonRes.data ?? []) {
      if (d.userId === undefined) continue;
      await uploadDataHelper(id, { userId: d.userId, layerId: d.layerId, data: d.data, permission: 'COMMON' });
    }
    for (const d of templateRes.data ?? []) {
      if (d.userId === undefined) continue;
      await uploadDataHelper(id, { userId: d.userId, layerId: d.layerId, data: d.data, permission: 'TEMPLATE' });
    }

    return { isOK: true, message: '' };
  } catch (e) {
    console.log('[migrateProjectToDEK] error', e);
    // 失敗時はキャッシュを破棄し、次回読み込みでサーバの確定状態に同期させる。
    clearProjectCryptoCache();
    return { isOK: false, message: t('common.message.failGetProjects') };
  }
};

/**
 * 現在位置情報を暗号化してアップロードします
 */
export const uploadCurrentPosition = async (
  userId: string,
  projectId: string,
  data: { icon: { photoURL: string | null; initial: string }; coords: LocationType }
) => {
  try {
    // データを暗号化
    const encdata = await enc(data, userId, projectId);
    const positionFS: PositionFS = {
      encdata,
      encryptedAt: Timestamp.now(),
    };

    // ドキュメント参照を作成してアップロード
    const positionRef = doc(firestore, 'projects', projectId, 'position', userId);
    await setDoc(positionRef, positionFS);

    return { isOK: true, message: '' };
  } catch (error) {
    console.error('現在位置アップロードエラー:', error);
    return { isOK: false, message: '現在位置のアップロードに失敗しました' };
  }
};

export const deleteCurrentPosition = async (userId: string, projectId: string) => {
  try {
    // ドキュメント参照をモジュラー API で作成
    const positionRef = doc(firestore, 'projects', projectId, 'position', userId);
    // ドキュメント削除
    await deleteDoc(positionRef);
    return { isOK: true, message: '' };
  } catch (error) {
    console.error('現在位置削除エラー:', error);
    return { isOK: false, message: '現在位置の削除に失敗しました' };
  }
};

export const toDate = (timestamp: Timestamp) => {
  return new Date(timestamp.seconds * 1000 + timestamp.nanoseconds / 100000);
};

export const updateLicense = async (project: ProjectType) => {
  // ドキュメント参照をモジュラー API で作成
  const projectRef = doc(firestore, 'projects', project.id);

  return new Promise<{ isOK: boolean; message: string }>((resolve) => {
    // onSnapshot でリアルタイム監視を開始
    const unsubscribe = onSnapshot(projectRef, (snapshot) => {
      // フィールドを取得（snapshot.get() も使用可能）
      const data = snapshot.data();
      const license = data?.license as string | undefined;

      // license が設定されていて 'Unknown' でなければ解決
      if (license !== undefined && license !== 'Unknown') {
        unsubscribe();
        resolve({ isOK: true, message: '' });
      }
    });
  });
};

// 指定したlayerIdの全データのpermissionを一括で更新
export const updateLayerDataPermission = async (
  projectId: string,
  layerId: string,
  oldPermission: string,
  newPermission: string
) => {
  try {
    // 1. data サブコレクションを参照し、layerId と oldPermission で絞り込むクエリを作成
    const dataCol = collection(firestore, 'projects', projectId, 'data');
    const q = query(dataCol, where('layerId', '==', layerId), where('permission', '==', oldPermission));

    // 2. クエリを実行
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      // 更新対象がなければ即座に成功を返す
      return { isOK: true, message: '' };
    }

    // 3. バッチ作成＆更新操作を登録
    const batch = writeBatch(firestore);
    snapshot.docs.forEach(
      (docSnap) => {
        batch.update(docSnap.ref, { permission: newPermission });
      }
    );

    // 4. 一括コミットで更新を実行
    await batch.commit();
    return { isOK: true, message: '' };
  } catch (error) {
    console.error('権限一括更新エラー:', error);
    return { isOK: false, message: '権限の一括更新に失敗しました' };
  }
};

/**
 * プロジェクト内の全データのサマリー情報を取得（復号化なし）
 * クラウドデータ管理画面で使用
 */
export const getCloudDataSummary = async (
  projectId: string
): Promise<{
  isOK: boolean;
  message: string;
  data?: {
    layerId: string;
    userId: string;
    permission: PermissionType | 'TEMPLATE';
    chunkCount: number;
    lastUpdatedAt: Date;
  }[];
}> => {
  try {
    const dataCol = collection(firestore, 'projects', projectId, 'data');
    const snapshot = await getDocs(dataCol);

    // layerId + userId + permission でグループ化
    const summaryMap = new Map<
      string,
      {
        layerId: string;
        userId: string;
        permission: PermissionType | 'TEMPLATE';
        chunkCount: number;
        lastUpdatedAt: Date;
      }
    >();

    snapshot.docs.forEach(
      (docSnap) => {
        const data = docSnap.data() as DataFS;
        const key = `${data.layerId}_${data.userId}_${data.permission}`;

        const existing = summaryMap.get(key);
        const encryptedAt = toDate(data.encryptedAt);

        if (existing) {
          existing.chunkCount += 1;
          if (encryptedAt > existing.lastUpdatedAt) {
            existing.lastUpdatedAt = encryptedAt;
          }
        } else {
          summaryMap.set(key, {
            layerId: data.layerId,
            userId: data.userId,
            permission: data.permission,
            chunkCount: 1,
            lastUpdatedAt: encryptedAt,
          });
        }
      }
    );

    return {
      isOK: true,
      message: '',
      data: Array.from(summaryMap.values()),
    };
  } catch (error) {
    console.error('getCloudDataSummary Error:', error);
    return {
      isOK: false,
      message: t('CloudDataManagement.message.failGetData'),
    };
  }
};

/**
 * 自分のデータの「クラウド最終更新時刻(encryptedAt)」を軽量に取得する。
 * 楽観的ロックの衝突検知に使う。復号は行わない。
 * userId 限定クエリにすることで一般メンバーでもSecurity Rules上読み取り可能
 * （getCloudDataSummary はフィルタ無し全件読みのため管理者しか実行できない点に注意）。
 * 返り値: `${layerId}_${permission}` -> encryptedAt(ms) の Map
 */
export const getMyDataUpdatedAt = async (
  projectId: string,
  userId: string
): Promise<{ isOK: boolean; message: string; data?: Map<string, number> }> => {
  try {
    const dataCol = collection(firestore, 'projects', projectId, 'data');
    const q = query(dataCol, where('userId', '==', userId));
    const snapshot = await getDocs(q);

    const result = new Map<string, number>();
    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data() as DataFS;
      const key = `${data.layerId}_${data.permission}`;
      const ms = toDate(data.encryptedAt).getTime();
      const existing = result.get(key);
      if (existing === undefined || ms > existing) {
        result.set(key, ms);
      }
    });

    return { isOK: true, message: '', data: result };
  } catch (error) {
    console.error('getMyDataUpdatedAt Error:', error);
    return { isOK: false, message: t('CloudDataManagement.message.failGetData') };
  }
};

/**
 * プロジェクト設定から指定したレイヤ定義を削除
 * クラウドデータ管理画面で使用
 */
export const deleteLayerFromSettings = async (
  projectId: string,
  editorUid: string,
  layerIdsToDelete: string[]
): Promise<{ isOK: boolean; message: string }> => {
  try {
    // 1. 現在のプロジェクト設定を取得
    const settingsResult = await downloadProjectSettings(projectId);
    if (!settingsResult.isOK || !settingsResult.data) {
      return { isOK: false, message: t('CloudDataManagement.message.failDeleteLayer') };
    }

    // 2. 削除対象レイヤをフィルタリング
    const updatedLayers = settingsResult.data.layers.filter((layer) => !layerIdsToDelete.includes(layer.id));

    // 3. 更新した設定を保存
    const updatedSettings: ProjectSettingsType = {
      ...settingsResult.data,
      layers: updatedLayers,
    };

    const result = await uploadProjectSettings(projectId, editorUid, updatedSettings);
    if (!result.isOK) {
      return { isOK: false, message: t('CloudDataManagement.message.failDeleteLayer') };
    }

    return { isOK: true, message: '' };
  } catch (error) {
    console.error('deleteLayerFromSettings Error:', error);
    return { isOK: false, message: t('CloudDataManagement.message.failDeleteLayer') };
  }
};
