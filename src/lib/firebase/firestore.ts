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
import { decryptEThree as decGroup, encryptEThree as encGroup } from '../virgilsecurity/e3kit';
// DEKのラップ/アンラップは脱Virgilファサード経由（ENABLE_KEY_LEDGER で台帳優先、e3kitへフォールバック）
import { wrapDEKForMember, unwrapDEK } from '../crypto';
import { getPublicKeyFromLedger } from './publicKeys';
import { createProjectDEK, encryptWithDEK, decryptWithDEK, ExportedDEK } from '../virgilsecurity/dek';
import { FUNC_ENCRYPTION, CREATE_DEK_PROJECTS, ENABLE_KEY_LEDGER } from '../../constants/AppConstants';
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

// ownerUid: Virgilグループのチケットはプロジェクトオーナー名義で保管されるため、
// グループ暗号の復号・暗号化時に loadGroup へ渡す照会名義として必要。
// （データ所有者のuidを渡すと他人のデータでは存在しない棚を照会して必ず失敗する）
type ProjectCrypto = { scheme: 'group' | 'dek'; ownerUid?: string; dekPublicKey?: string; dekPrivateKey?: string };
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
    const crypto: ProjectCrypto = { scheme: 'group', ownerUid: pdata?.ownerUid };
    projectCryptoCache.set(projectId, crypto);
    return crypto;
  }
  // dek: 公開鍵は平文、秘密鍵は keys/{uid} を unwrap して取得
  // ownerUid は dual-read（旧グループ暗号へのフォールバック復号）の loadGroup 照会に使うため dek でも保持する
  const dekPrivateKey = await loadProjectDEKForCurrentUser(projectId);
  const crypto: ProjectCrypto = { scheme: 'dek', ownerUid: pdata.ownerUid, dekPublicKey: pdata.dekPublicKey, dekPrivateKey };
  // 開封失敗（キーリセット後・再共有待ち等）を負キャッシュすると、キャッシュをクリアできるのが
  // ログアウトとプロジェクトを開く操作しかなく、再共有後も一覧再取得で回復できなくなる。
  // 失敗時はキャッシュせず、次回の dec で keys/{uid} を再unwrapさせる。
  if (dekPrivateKey !== undefined) {
    projectCryptoCache.set(projectId, crypto);
  }
  return crypto;
};

/** 方式分岐つき暗号化（従来 enc と同シグネチャ）。 */
const enc = async (data: any, userId: string, projectId: string): Promise<string[]> => {
  const crypto = await getProjectCrypto(projectId);
  if (crypto.scheme === 'dek') {
    if (!crypto.dekPublicKey) throw new Error('DEK public key not available');
    return encryptWithDEK(data, crypto.dekPublicKey);
  }
  return encGroup(data, userId, projectId, crypto.ownerUid);
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
    return decGroup(encryptedAt, encdata, userId, projectId, crypto.ownerUid);
  }
  return decGroup(encryptedAt, encdata, userId, projectId, crypto.ownerUid);
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
      return { isOK: false, message: t('hooks.message.failGetDekForReshare') };
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
    // Functions側の1リクエスト上限(50件)に合わせてチャンク分割する
    const CHUNK_SIZE = 50;
    const results: (string | null)[] = [];
    for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
      const { data } = await getUids({ emails: emails.slice(i, i + CHUNK_SIZE) });
      results.push(...(data as (string | null)[]));
    }
    return results;
  } catch (e) {
    throw new Error(t('common.message.failGetUids'));
  }
};

// 署名付きタイル配信の署名取得。どのURLが署名を要するかの判定はFunctions側にあるので、
// アプリはタイル/スタイル/PDFのURLをそのまま渡して、3分類の応答を受け取る。
export const getTileSignatures = async (urls: string[]) => {
  await firebaseReady;
  const call = httpsCallable(functions, 'getTileSignatures');
  // Functions側の1リクエスト上限(100件)に合わせてチャンク分割する
  const CHUNK_SIZE = 100;
  const merged = {
    signatures: {} as { [url: string]: string },
    unsigned: [] as string[],
    denied: [] as string[],
    expires: 0,
  };
  for (let i = 0; i < urls.length; i += CHUNK_SIZE) {
    const { data } = await call({ urls: urls.slice(i, i + CHUNK_SIZE) });
    const chunk = data as {
      signatures: { [url: string]: string };
      unsigned: string[];
      denied: string[];
      expires: number;
    };
    Object.assign(merged.signatures, chunk.signatures);
    merged.unsigned.push(...chunk.unsigned);
    merged.denied.push(...chunk.denied);
    // チャンクごとにexpiresは僅かにずれる。短い方に寄せて期限切れを避ける
    merged.expires = merged.expires === 0 ? chunk.expires : Math.min(merged.expires, chunk.expires);
  }
  return merged;
};

export const getAllProjects = async (uid: string, excludeMember = false, includeArchived = false) => {
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

    // アーカイブ済みは平文フィールド archived で判別できるので、includeArchived が false のときは
    // 設定取得(getSettingsUpdatedAt: 1読み取り/件)と復号(dec)の対象から外し、読み込みコストを下げる。
    // ※ where('archived','==',false) はレガシーdoc(フィールド無し)が該当せず複合インデックスも要るため、
    //   安価なdoc一覧クエリの結果をクライアント側の平文フィルタで振り分ける。
    const targetDocs = includeArchived
      ? querySnapshot.docs
      : querySnapshot.docs.filter((docSnapshot) => (docSnapshot.data() as ProjectFS).archived !== true);

    // 設定取得と復号化を並列で実行（全プラットフォーム共通）

    // 1. 設定の更新日時を全並列で取得
    // const settingsStart = performance.now();
    const settingsResults = await Promise.all(targetDocs.map((docSnapshot) => getSettingsUpdatedAt(docSnapshot.id)));
    // const settingsEnd = performance.now();
    // console.log(`[PERF] Settings fetch (parallel): ${(settingsEnd - settingsStart).toFixed(0)}ms`);

    // 2. 設定取得完了後、復号化を並列で実行
    // const decryptStart = performance.now();
    const result = targetDocs.map(async (docSnapshot, index) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { encdata, ownerUid, encryptedAt, license, storage, cryptoScheme, dekPublicKey, archived, ...others } =
        docSnapshot.data() as ProjectFS;
      // group方式は方式が確定しているのでキャッシュへ事前登録し、dec内での余分なproject doc再読み取りを防ぐ
      // （既存プロジェクトの読み取り回数を従来どおりに保つ）。dek方式はDEK秘密鍵の遅延取得が要るので事前登録しない。
      if (cryptoScheme !== 'dek') {
        setProjectCryptoCache(docSnapshot.id, { scheme: 'group', ownerUid });
      }
      const data = await dec(toDate(encryptedAt), encdata, ownerUid, docSnapshot.id);
      if (data === undefined) {
        return undefined;
      } else {
        return {
          id: docSnapshot.id,
          ownerUid,
          storage: storage ?? { count: 0 },
          ...data,
          ...others,
          encryptedAt: toDate(encryptedAt),
          cryptoScheme: cryptoScheme ?? 'group',
          archived: archived ?? false,
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
    const { id, ownerUid, adminsUid, membersUid, storage, settingsEncryptedAt, ...others } = project;

    // 新規プロジェクトはエンベロープ暗号（DEK）方式で作成する（管理者によるメンバー追加を可能にするため）。
    // CREATE_DEK_PROJECTS が有効な場合のみ、新規プロジェクトをエンベロープ暗号(DEK)方式で作成する。
    // （ロールアウト安全のため。false の間は従来のグループ暗号で作成し、旧クライアントでも開ける。）
    if (FUNC_ENCRYPTION && CREATE_DEK_PROJECTS) {
      const dek = await createProjectDEK();
      // enc が即DEKを使えるようキャッシュへ事前登録
      setProjectCryptoCache(id, { scheme: 'dek', ownerUid, dekPublicKey: dek.publicKey, dekPrivateKey: dek.privateKey });
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
    setProjectCryptoCache(id, { scheme: 'group', ownerUid });
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
    return { isOK: false, message: t('firebase.message.failAddProject') };
  }
};

export const updateProject = async (project: ProjectType) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ownerUid, adminsUid, membersUid, storage, settingsEncryptedAt, ...others } = project;
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
    return { isOK: false, message: t('firebase.message.failUpdateProject') };
  }
};

// プロジェクトのアーカイブ／復元。
// archived は平文フィールドなので encdata を再暗号化せず、フラグだけを更新する（安価）。
export const archiveProject = async (projectId: string) => {
  try {
    await updateDoc(doc(firestore, 'projects', projectId), { archived: true });
    return { isOK: true, message: '' };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: t('firebase.message.failUpdateProject') };
  }
};

export const unarchiveProject = async (projectId: string) => {
  try {
    await updateDoc(doc(firestore, 'projects', projectId), { archived: false });
    return { isOK: true, message: '' };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: t('firebase.message.failUpdateProject') };
  }
};

// 復号処理を伴わずにオーナーのプロジェクトIDだけを取得する。
// アカウント削除時のStorage掃除用（復号に失敗するプロジェクトも漏らさないため）。
export const getOwnedProjectIds = async (uid: string) => {
  try {
    const q = query(collection(firestore, 'projects'), where('ownerUid', '==', uid));
    const querySnapshot = await getDocs(q);
    return { isOK: true, message: '', ids: querySnapshot.docs.map((v) => v.id) };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: t('common.message.failGetProjects'), ids: undefined };
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
    return { isOK: false, message: t('firebase.message.failDeleteProject'), deletedIds: undefined };
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
    return { isOK: false, message: t('firebase.message.failDeleteProject') };
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

    // 3. バッチ上限に収まるよう分割して一括削除
    await deleteDocsInBatches(querySnapshot.docs);

    return { isOK: true, message: '' };
  } catch (error) {
    console.error('データ削除エラー:', error);
    return { isOK: false, message: t('CloudDataManagement.message.failDeleteData') };
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

    // バッチ上限に収まるよう分割して一括削除
    await deleteDocsInBatches(snapshot.docs);

    return { isOK: true, message: '' };
  } catch (error) {
    console.error('データ削除エラー:', error);
    return { isOK: false, message: t('CloudDataManagement.message.failDeleteData') };
  }
};

/**
 * プロジェクト設定を暗号化して保存する。
 * @param timestampOverride 更新日時を明示指定する場合に渡す（省略時は現在時刻）。
 *   DEK移行のように「中身は再暗号化するが更新日時は据え置きたい」ケースで使う。
 *   平文の encryptedAt と暗号化ペイロード内の updatedAt は必ず同じ値にすること
 *   （アップロード時の衝突検知が両者の一致を前提にしているため。useRepository の uploadDataToRepository 参照）。
 */
export const uploadProjectSettings = async (
  projectId: string,
  editorUid: string,
  settings: ProjectSettingsType,
  timestampOverride?: Timestamp
) => {
  try {
    const timestamp = timestampOverride ?? Timestamp.now();
    // 暗号化ペイロードの updatedAt は旧 toDate（nanoseconds/100000）と同じ値で書く。
    // 旧クライアントは「暗号内のupdatedAt == 旧toDate(平文encryptedAt)」で設定の変更を検知するため、
    // ここで正しい値を書くと旧クライアント側だけが常に不一致になり誤警告が出る（新旧混在中はこの形式を維持する）。
    // 新クライアントは isSettingsUpdatedAtCurrent で新旧どちらの値も受け付ける。
    // TODO: 全クライアントが更新されたら toDate(timestamp) に戻し、isSettingsUpdatedAtCurrent の legacy 判定も削除する。
    const encdata = await enc({ ...settings, updatedAt: toLegacyDate(timestamp) }, editorUid, projectId);
    const settingsFS: ProjectSettingsFS = { editorUid, encdata, encryptedAt: timestamp };
    await setDoc(doc(firestore, 'projects', projectId, 'settings', 'default'), settingsFS);
    return { isOK: true, message: '', timestamp: toDate(timestamp) };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: t('firebase.message.failUploadProjectSettings'), timestamp: undefined };
  }
};

/**
 * 設定ドキュメントの平文メタ（更新日時・最終編集者）を生のまま返す。
 * DEK移行のように「中身は再暗号化するが更新日時と編集者は据え置きたい」場合に、
 * 再暗号化の前に控えておくために使う。toDate() を経由しないので値が歪まない。
 */
const getProjectSettingsMeta = async (
  projectId: string,
  fromServer = false
): Promise<{ encryptedAt: Timestamp; editorUid: string } | undefined> => {
  try {
    const ref = doc(firestore, 'projects', projectId, 'settings', 'default');
    let data: ProjectSettingsFS | undefined;
    if (fromServer) {
      // キャッシュを使わずサーバーの確定値を読む（衝突検知用）
      const snap = await getDocsFromServer(
        query(collection(firestore, 'projects', projectId, 'settings'), where('__name__', '==', 'default'))
      );
      data = snap.empty ? undefined : (snap.docs[0].data() as ProjectSettingsFS);
    } else {
      data = (await getDoc(ref)).data() as ProjectSettingsFS | undefined;
    }
    if (data === undefined) return undefined;
    return { encryptedAt: data.encryptedAt, editorUid: data.editorUid };
  } catch (error) {
    console.error('設定メタ取得エラー:', error);
    return undefined;
  }
};

/**
 * ローカルに保持している設定の updatedAt が、クラウドの現在の設定と同じ保存に由来するかを判定する。
 * アップロード前の「他の人が設定を変更していないか」の確認に使う。
 *
 * 単純な一致比較にしないのは、暗号化ペイロード内の updatedAt が保存時点の toDate() の実装に依存するため。
 * toDate() には nanoseconds を 100000 で割る不具合があり(修正済み)、それ以前に保存された設定には
 * 小数部が10倍になった値が入っている。平文の encryptedAt は常に正しいので、
 * 「正しい値」と「旧実装で書かれたであろう値」の両方を許容する。
 * 全プロジェクトの設定が再保存されれば legacy 側の判定は削除してよい。
 */
export const isSettingsUpdatedAtCurrent = async (
  projectId: string,
  localUpdatedAt: string | undefined
): Promise<boolean> => {
  if (localUpdatedAt === undefined) return false;
  const meta = await getProjectSettingsMeta(projectId, true);
  if (meta === undefined) return false;
  const local = new Date(localUpdatedAt).getTime();
  if (Number.isNaN(local)) return false;
  const current = meta.encryptedAt.seconds * 1000 + Math.floor(meta.encryptedAt.nanoseconds / 1000000);
  const legacy = meta.encryptedAt.seconds * 1000 + Math.floor(meta.encryptedAt.nanoseconds / 100000);
  return local === current || local === legacy;
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
      message: t('firebase.message.failDownloadProjectSettings'),
    };
  }
};

const projectDataSetToDataSet = async (projectId: string, projectDataSet: any) => {
  // layerId と userId の組み合わせをキーとしてグループ化するための Map
  const dataMap = new Map<string, { [index: number]: string[] }>();
  const metadataMap = new Map<string, { layerId: string; userId: string; encryptedAt: Timestamp }>();

  // 世代方式アップロードの残骸（不完全な新世代・削除し損ねた旧世代）を除外し、最新の完全世代のみ処理する
  const selectedDocs = selectCompleteGenerationDocs<{ data: () => unknown }>(projectDataSet.docs);

  // 各ドキュメントを処理
  selectedDocs.forEach((v: any) => {
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

/** 自己DEK移行(Phase iii)の対象グループ。cryptoScheme印の無いチャンクを含む userId×layerId。 */
export type UnmarkedDekGroupType = { userId: string; layerId: string; permission: 'PRIVATE' | 'PUBLIC' };

/**
 * ダウンロード済みのdata docスナップショットから、cryptoScheme印の無いチャンクを含むグループを集める。
 * 自己DEK移行の対象判定用。取得済みのdocsを使い回すため追加クエリ・追加ダウンロードは発生しない。
 */
export const collectUnmarkedDekGroups = (
  docs: { data: () => unknown }[],
  permission: 'PRIVATE' | 'PUBLIC'
): UnmarkedDekGroupType[] => {
  const groups = new Map<string, UnmarkedDekGroupType>();
  // 削除し損ねた旧世代の無印docで移行が毎回再トリガーされないよう、採用世代のdocだけを判定対象にする
  docs = selectCompleteGenerationDocs(docs);
  docs.forEach((docSnap) => {
    const d = docSnap.data() as DataFS;
    if (d.cryptoScheme === 'dek') return;
    groups.set(`${d.userId}_${d.layerId}`, { userId: d.userId, layerId: d.layerId, permission });
  });
  return [...groups.values()];
};

/**
 * data docスナップショット配列から、(layerId×userId×permission)グループごとに
 * 「最新の完全な世代」のdocだけを残して返す。
 *
 * 世代 = 同一encryptedAtのアップロード1回分。世代方式のuploadDataHelperは新世代を書き切ってから
 * 旧世代を削除するため、書き込み中断・削除失敗で複数世代のdocが一時的に共存しうる。
 * 読み側はこの関数で完全な最新世代だけを採用することで、原子コミットと同等の一貫性を得る。
 *
 * - 完全 = doc数がchunkCountと一致し、chunkIndexに重複が無い（世代IDが万一衝突して混ざった場合は
 *   不完全と判定され旧世代へフォールバックする安全側の設計）
 * - chunkCountを持たないレガシーdocは、グループ内でまとめて1つの完全な世代として扱う。
 *   旧実装ではチャンクごとにencryptedAtが異なりうるため（uploadDataHelperのencryptedAt共通化の
 *   コメント参照）、encryptedAtで世代分割してはならない（分割するとレガシーデータが喪失する）
 * - 完全な世代が1つも無いグループは従来挙動を保つため全docをそのまま返す
 */
export const selectCompleteGenerationDocs = <T extends { data: () => unknown }>(docs: T[]): T[] => {
  type Generation = {
    docs: T[];
    isLegacy: boolean;
    chunkCount?: number;
    chunkIndexes: Set<number>;
    // 世代の新旧比較用タイムスタンプ（秒, ナノ秒）。toDateのミリ秒丸めを避けて生値で比較する
    ts: [number, number];
  };
  const LEGACY_KEY = '__legacy__';
  const groups = new Map<string, Map<string, Generation>>();

  for (const docSnap of docs) {
    const d = docSnap.data() as DataFS;
    const groupKey = `${d.layerId}_${d.userId}_${d.permission}`;
    const ts: [number, number] = d.encryptedAt ? [d.encryptedAt.seconds, d.encryptedAt.nanoseconds] : [0, 0];
    const isLegacy = d.chunkCount === undefined;
    const genKey = isLegacy ? LEGACY_KEY : `${ts[0]}_${ts[1]}`;

    let generations = groups.get(groupKey);
    if (!generations) {
      generations = new Map();
      groups.set(groupKey, generations);
    }
    let gen = generations.get(genKey);
    if (!gen) {
      gen = { docs: [], isLegacy, chunkCount: d.chunkCount, chunkIndexes: new Set(), ts };
      generations.set(genKey, gen);
    }
    gen.docs.push(docSnap);
    gen.chunkIndexes.add(d.chunkIndex !== undefined ? d.chunkIndex : 0);
    // レガシー世代のタイムスタンプは所属docの最大値
    if (gen.isLegacy && (ts[0] > gen.ts[0] || (ts[0] === gen.ts[0] && ts[1] > gen.ts[1]))) {
      gen.ts = ts;
    }
    // 同一世代キー内でchunkCountが食い違う場合（世代ID衝突の兆候）は不完全扱いにするため印を消す
    if (!gen.isLegacy && gen.chunkCount !== d.chunkCount) {
      gen.chunkCount = undefined;
    }
  }

  const isComplete = (gen: Generation): boolean => {
    if (gen.isLegacy) return true;
    return gen.chunkCount !== undefined && gen.docs.length === gen.chunkCount && gen.chunkIndexes.size === gen.chunkCount;
  };

  const result: T[] = [];
  for (const generations of groups.values()) {
    let selected: Generation | undefined;
    for (const gen of generations.values()) {
      if (!isComplete(gen)) continue;
      if (
        selected === undefined ||
        gen.ts[0] > selected.ts[0] ||
        (gen.ts[0] === selected.ts[0] && gen.ts[1] > selected.ts[1]) ||
        // 同時刻ならchunkCount付き（新形式）を優先
        (gen.ts[0] === selected.ts[0] && gen.ts[1] === selected.ts[1] && selected.isLegacy && !gen.isLegacy)
      ) {
        selected = gen;
      }
    }
    if (selected !== undefined) {
      result.push(...selected.docs);
    } else {
      // 完全な世代が無い（通常は起きない）場合は従来挙動のまま全docを返す
      for (const gen of generations.values()) {
        result.push(...gen.docs);
      }
    }
  }
  return result;
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

const MAX_SIZE_KB = 50000; // 50MB。世代方式で1バッチ10MiBの制約からは解放されたため、暴走データに対する保険のみ
const CHUNK_SIZE = 900 * 1024; // 900KB
const ATOMIC_MAX_KB = 5000; // これ以下は従来どおり削除+書き込みを1バッチで原子コミット（10MiBに収まる実績値）
const MAX_BATCH_BYTES = 8 * 1024 * 1024; // 世代方式の書き込みバッチのサイズ上限目安（10MiBに対しマージン）
const MAX_BATCH_OPS = 400; // 1バッチの操作数上限（旧SDKの500制限に対する保険）

// 大量docの削除をバッチ上限内に収めて分割コミットする
const deleteDocsInBatches = async (docSnaps: { ref: any }[]) => {
  for (let i = 0; i < docSnaps.length; i += MAX_BATCH_OPS) {
    const batch = writeBatch(firestore);
    docSnaps.slice(i, i + MAX_BATCH_OPS).forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
  }
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
  // DEKで暗号化した場合はper-docの方式印を付ける（enc直後なのでキャッシュヒット）。
  // 旧グループ暗号データのDEK化の完了判定と残量計測に使う。
  const crypto = await getProjectCrypto(projectId);
  const cryptoScheme = crypto.scheme === 'dek' ? ('dek' as const) : undefined;

  // 既存docの取得。削除対象はこのスナップショットの全doc（過去の書き込み中断・削除失敗の残骸世代を含む）
  const dataCol = collection(firestore, 'projects', projectId, 'data');
  const q = query(
    dataCol,
    where('permission', '==', permission),
    where('layerId', '==', layerId),
    where('userId', '==', userId)
  );
  const existing = await getDocs(q);

  // 全チャンクで同一の encryptedAt を使う（楽観的ロックの基準値を決定的にするため + 世代IDを兼ねる）
  const encryptedAt = Timestamp.now();
  const makeDataFS = (chunk: string[], index: number): DataFS => ({
    userId,
    layerId,
    permission,
    encdata: chunk,
    encryptedAt,
    chunkIndex: index,
    chunkCount: chunks.length,
    // undefinedのフィールドはFirestoreに書けないため、印がある時だけ付与する
    ...(cryptoScheme === 'dek' ? { cryptoScheme: 'dek' as const } : {}),
  });

  if (KBytes <= ATOMIC_MAX_KB && existing.docs.length + chunks.length <= MAX_BATCH_OPS) {
    // 小グループ（従来の5MB相当以下）: 既存docの削除と新チャンクの書き込みを1つのバッチで原子的にコミットする。
    // 以前は削除→書き込みの2コミットで、その間に通信断・アプリ終了が起きると
    // クラウド側のこのグループのデータが一時的に消えた（モバイルの自己DEK移行で露出が増えるため原子化）。
    const batch = writeBatch(firestore);
    existing.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    chunks.forEach((chunk, index) => {
      // 自動 ID のドキュメント参照を作成してバッチに追加
      batch.set(doc(dataCol), makeDataFS(chunk, index));
    });
    await batch.commit();
  } else {
    // 大グループ（世代方式）: 1バッチ10MiB制限に収まらないため、新世代を複数バッチで書き切ってから旧docを削除する。
    // 書き込み途中で失敗しても、不完全な世代は読み側(selectCompleteGenerationDocs)が無視して旧世代を
    // 採用するため、原子コミットと同等の安全性を保つ。中断の残骸は次回アップロードの削除フェーズで一掃される。
    let batch = writeBatch(firestore);
    let batchOps = 0;
    let batchBytes = 0;
    for (let index = 0; index < chunks.length; index++) {
      const dataFS = makeDataFS(chunks[index], index);
      const docBytes = sizeof(dataFS);
      if (batchOps > 0 && (batchBytes + docBytes > MAX_BATCH_BYTES || batchOps >= MAX_BATCH_OPS)) {
        await batch.commit();
        batch = writeBatch(firestore);
        batchOps = 0;
        batchBytes = 0;
      }
      batch.set(doc(dataCol), dataFS);
      batchOps += 1;
      batchBytes += docBytes;
    }
    if (batchOps > 0) {
      await batch.commit();
    }

    // 削除フェーズ: 新世代は完全に読める状態にあるため、ここでの失敗は成功扱いにする
    // （旧世代の残骸は読み側が無視し、次回アップロードで一掃される。基準値を確立しない方が害が大きい）
    try {
      await deleteDocsInBatches(existing.docs);
    } catch (error) {
      console.warn('uploadDataHelper: 旧世代の削除に失敗（次回アップロードで一掃されます）:', error);
    }
  }

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
      message: t('firebase.message.failDownloadCommonData'),
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
      message: t('firebase.message.failDownloadData'),
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
      message: t('firebase.message.failDownloadData'),
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

    // 自己DEK移行(Phase iii)用: 印なしチャンクを含むグループを取得済みdocsから算出（追加クエリなし）
    const unmarkedDekGroups = collectUnmarkedDekGroups(docs, 'PUBLIC');

    return { isOK: true, message: '', data: dataSet, unmarkedDekGroups };
  } catch (error) {
    console.error('データダウンロードエラー:', error);
    return {
      isOK: false,
      message: t('firebase.message.failDownloadData'),
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

    // 自己DEK移行(Phase iii)用: 印なしチャンクを含むグループを取得済みdocsから算出（追加クエリなし）
    let unmarkedDekGroups = collectUnmarkedDekGroups(projectDataSet.docs, 'PRIVATE');
    if (excludeUserId) {
      unmarkedDekGroups = unmarkedDekGroups.filter((g) => g.userId !== excludeUserId);
    }

    return { isOK: true, message: '', data: dataSet, unmarkedDekGroups };
  } catch (error) {
    console.error('プライベートデータダウンロードエラー:', error);
    return {
      isOK: false,
      message: t('firebase.message.failDownloadData'),
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
    return { isOK: false, message: t('firebase.message.failDownloadData') };
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
    // 設定の更新日時・最終編集者は再暗号化後も据え置くため、上書きされる前に控えておく
    // （プロジェクト一覧の「更新日時」がこの値。移行日時に置き換わると実際の作業履歴が失われる）。
    const settingsMeta = await getProjectSettingsMeta(id);
    const commonRes = await downloadCommonData(id);
    const templateRes = await downloadTemplateData(id);
    if (!commonRes.isOK || !templateRes.isOK) {
      return { isOK: false, message: t('common.message.cannotLoadProject') };
    }

    // 2. DEKを生成し、以降の暗号化がDEKを使うようキャッシュを切り替える。
    const dek = await createProjectDEK();
    setProjectCryptoCache(id, { scheme: 'dek', ownerUid, dekPublicKey: dek.publicKey, dekPrivateKey: dek.privateKey });

    // 3. 既存の全メンバーへDEKを配布（keys/{uid}）。新メンバーは呼び出し側が addMemberKey で追加する。
    const distRes = await distributeProjectDEK(id, membersUid, dek, wrapperUid);
    if (!distRes.isOK) return { isOK: false, message: distRes.message };

    // 4. プロジェクトメタをDEKで再暗号化し、cryptoScheme/dekPublicKey を設定（管理者更新としてRulesを通す）。
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, ownerUid: _o, adminsUid: _a, membersUid: _m, storage, settingsEncryptedAt, ...others } = project;
    const encdata = await enc(others, ownerUid, id);
    await updateDoc(doc(firestore, 'projects', id), {
      encdata,
      encryptedAt: Timestamp.now(),
      cryptoScheme: 'dek',
      dekPublicKey: dek.publicKey,
    });

    // 5. 設定・COMMON・TEMPLATE をDEKで再暗号化して書き戻す。
    if (settingsRes.isOK) {
      // 中身はDEKで暗号化し直すが、更新日時と最終編集者は移行前の値のまま書く。
      await uploadProjectSettings(
        id,
        settingsMeta?.editorUid ?? wrapperUid,
        settingsRes.data,
        settingsMeta?.encryptedAt
      );
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
 * DEK化済みプロジェクトで、自分の PRIVATE/PUBLIC データをDEKで再暗号化して書き戻す（Phase iii パートA / 自己移行）。
 * 対象判定と復号データは「プロジェクトを開く際のダウンロード結果」（SelfMigrationInputType）を受け取って使い回すため、
 * この関数自体は追加ダウンロードを一切行わない（発生する通信は書き戻しのアップロードのみ）。
 * cryptoScheme 印の無いチャンクを含む自分のグループ（layerId×permission）だけを対象にし、
 * 書き戻しで印が付くため2回目以降は対象ゼロで即終了する（冪等）。
 * 印なし＝旧グループ暗号とは限らない（印付与開始前のDEK書き込みも含む）が、DEKで再暗号化するだけなので無害。
 * グループ単位の失敗は failedCount に計上して続行する（dual-readで読み続けられるため、呼び出し側は
 * 失敗してもプロジェクトを開く処理を継続してよい。次回開いた時に自動で再試行される）。
 */
export type SelfMigrationInputType = {
  /** ダウンロード時に算出した印なしグループ（自分以外のユーザーのグループが混ざっていてもよい） */
  unmarkedGroups: UnmarkedDekGroupType[];
  /** ダウンロード・復号済みのPRIVATEデータ（自分の分を含むこと） */
  privateData: DataType[];
  /** ダウンロード・復号済みのPUBLICデータ（自分の分を含むこと） */
  publicData: DataType[];
};

export const migrateSelfDataToDEK = async (
  projectId: string,
  input: SelfMigrationInputType,
  onProgress?: (done: number, total: number) => void
): Promise<{ isOK: boolean; message: string; migratedCount: number; failedCount: number }> => {
  try {
    const uid = auth?.currentUser?.uid;
    if (!uid) return { isOK: false, message: t('hooks.message.pleaseLogin'), migratedCount: 0, failedCount: 0 };

    // プロジェクトを開く際のダウンロードで算出済みの印なしグループから、自分の分だけを対象化。
    // 判定・復号ともダウンロード済みの情報で完結するため、この関数からの追加ダウンロードはゼロ。
    const targets = new Map<string, { layerId: string; permission: 'PRIVATE' | 'PUBLIC' }>();
    input.unmarkedGroups.forEach((g) => {
      if (g.userId !== uid) return;
      targets.set(`${g.layerId}_${g.permission}`, { layerId: g.layerId, permission: g.permission });
    });
    if (targets.size === 0) return { isOK: true, message: '', migratedCount: 0, failedCount: 0 };

    // DEKプロジェクトで復号鍵が使える時だけ動く（group方式・鍵の再共有待ちでは何もしない）。
    // ダウンロード直後なのでキャッシュヒットし、通信は発生しない。
    const crypto = await getProjectCrypto(projectId);
    if (crypto.scheme !== 'dek' || crypto.dekPrivateKey === undefined) {
      return { isOK: true, message: '', migratedCount: 0, failedCount: 0 };
    }

    // グループ単位で書き戻し（uploadDataHelperがDEKで再暗号化し、cryptoScheme印を付ける）。
    let migratedCount = 0;
    let failedCount = 0;
    const targetList = [...targets.values()];
    for (const [index, { layerId, permission }] of targetList.entries()) {
      onProgress?.(index + 1, targetList.length);
      const source = permission === 'PRIVATE' ? input.privateData : input.publicData;
      const d = source.find((v) => v.layerId === layerId && v.userId === uid);
      if (d === undefined) {
        // 復号できず projectDataSetToDataSet で除外されたグループ。残量計測で検知して個別対応する。
        failedCount++;
        continue;
      }
      const res = await uploadDataHelper(projectId, { userId: uid, layerId, permission, data: d.data });
      if (res.isOK) migratedCount++;
      else failedCount++;
    }
    return { isOK: true, message: '', migratedCount, failedCount };
  } catch (e) {
    console.log('[migrateSelfDataToDEK] error', e);
    return { isOK: false, message: t('firebase.message.failDownloadData'), migratedCount: 0, failedCount: 0 };
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
    return { isOK: false, message: t('firebase.message.failUploadCurrentPosition') };
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
    return { isOK: false, message: t('firebase.message.failDeleteCurrentPosition') };
  }
};

/**
 * 旧 toDate と同じ値（nanoseconds を 100000 で割る）を返す。小数部が10倍になり最大9秒進む。
 * 新旧クライアントが混在する間、プロジェクト設定の暗号化ペイロードに書く updatedAt の互換のためだけに使う。
 * 全クライアントが更新されたら削除してよい。
 */
const toLegacyDate = (timestamp: Timestamp) => {
  return new Date(timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 100000));
};

export const toDate = (timestamp: Timestamp) => {
  // 以前は nanoseconds を 100000 で割っており、小数部が10倍になって最大9秒ずれていた。
  // ずれは表示だけでなく、getMyDataUpdatedAt と アップロード基準値(uploadDataHelper が返す
  // toMillis の正確な値)との突き合わせも常に不一致にしていた（衝突検知の高速パスが死んでいた）。
  return new Date(timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1000000));
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

    // 3. バッチ上限に収まるよう分割して一括更新
    for (let i = 0; i < snapshot.docs.length; i += MAX_BATCH_OPS) {
      const batch = writeBatch(firestore);
      snapshot.docs.slice(i, i + MAX_BATCH_OPS).forEach((docSnap) => {
        batch.update(docSnap.ref, { permission: newPermission });
      });
      await batch.commit();
    }
    return { isOK: true, message: '' };
  } catch (error) {
    console.error('権限一括更新エラー:', error);
    return { isOK: false, message: t('firebase.message.failUpdatePermission') };
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

    // 世代残骸を除外して採用世代のみ集計する（doc数・最終更新の表示が実態と一致するように）
    selectCompleteGenerationDocs(snapshot.docs).forEach(
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
    // 別端末の書き込み途中（不完全な新世代）や削除残骸の値を基準値に採用しないよう、完全な最新世代のみ見る
    const selectedDocs = selectCompleteGenerationDocs(snapshot.docs);
    selectedDocs.forEach((docSnap) => {
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
): Promise<{ isOK: boolean; message: string; timestamp?: Date }> => {
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

    return { isOK: true, message: '', timestamp: result.timestamp };
  } catch (error) {
    console.error('deleteLayerFromSettings Error:', error);
    return { isOK: false, message: t('CloudDataManagement.message.failDeleteLayer') };
  }
};

/**
 * 各メンバーの鍵ラップ(keys/{uid})が台帳の現行鍵より古くないかを判定する（管理者向けバッジ用）。
 * 判定: keys/{uid}.encryptedAt < publicKeys/{uid}.createdAt（現行世代の作成時刻）なら、
 * ラップは鍵リセット前のもの＝本人は開けないため再共有が必要。
 * keysの読み取り権限がない（一般メンバー）・台帳未登録・鍵ラップ未作成は 'unknown'（バッジ非表示）。
 */
export const getMemberKeyFreshness = async (
  projectId: string,
  memberUids: string[]
): Promise<{ [uid: string]: 'ok' | 'needs-reshare' | 'unknown' }> => {
  const result: { [uid: string]: 'ok' | 'needs-reshare' | 'unknown' } = {};
  if (!ENABLE_KEY_LEDGER || !FUNC_ENCRYPTION) {
    memberUids.forEach((uid) => (result[uid] = 'unknown'));
    return result;
  }
  await Promise.all(
    memberUids.map(async (uid) => {
      try {
        const [keySnapshot, ledger] = await Promise.all([
          getDoc(doc(firestore, 'projects', projectId, 'keys', uid)),
          getPublicKeyFromLedger(uid),
        ]);
        if (!keySnapshot.exists() || ledger === undefined) {
          result[uid] = 'unknown';
          return;
        }
        const keyData = keySnapshot.data() as ProjectKeyFS;
        result[uid] = toDate(keyData.encryptedAt) < toDate(ledger.createdAt) ? 'needs-reshare' : 'ok';
      } catch (e) {
        // 権限なし(一般メンバー)等
        result[uid] = 'unknown';
      }
    })
  );
  return result;
};
