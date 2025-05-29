import {
  DataFS,
  DataType,
  LocationType,
  PermissionType,
  PositionFS,
  ProjectDataType,
  ProjectFS,
  ProjectSettingsFS,
  ProjectSettingsType,
  ProjectType,
  RecordType,
  UpdateProjectFS,
} from '../../types';
//@ts-ignore
import sizeof from 'firestore-size';
import obj_sizeof from 'object-sizeof';
import { decryptEThree as dec, encryptEThree as enc } from '../virgilsecurity/e3kit';
import {
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
} from './firebase';
import { t } from '../../i18n/config';

export const getUidByEmail = async (email: string) => {
  try {
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
    const getUids = httpsCallable(functions, 'getUidsByEmails');
    const { data } = await getUids({ emails: emails });
    return data as (string | null)[];
  } catch (e) {
    throw new Error(t('common.message.failGetUids'));
  }
};

export const getAllProjects = async (uid: string, excludeMember = false) => {
  try {
    let q;
    if (excludeMember) {
      q = query(collection(firestore, 'projects'), where('ownerUid', '==', uid));
    } else {
      q = query(collection(firestore, 'projects'), where('membersUid', 'array-contains', uid));
    }
    const querySnapshot = await getDocsFromServer(q);
    const result = querySnapshot.docs.map(async (doc) => {
      const { encdata, ownerUid, encryptedAt, license, storage, ...others } = doc.data() as ProjectFS;
      const data = await dec(toDate(encryptedAt), encdata, ownerUid, doc.id);
      if (data === undefined) {
        return undefined;
      } else {
        //ToDO 2022.6.24以降に作成したプロジェクトは、functionsでstorage,licenseを設定するのでundefineにはならないはず。
        //古いプロジェクトがなくなったらコードとProjectFSのtypeを変更すること
        return {
          id: doc.id,
          ownerUid,
          storage: storage ?? { count: 0 },
          license: license ?? 'Free',
          ...data,
          ...others,
        } as ProjectType;
      }
    });
    const projects = await Promise.all(result);
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
    const { id, ownerUid, adminsUid, membersUid, storage, license, ...others } = project;
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
    const { id, ownerUid, adminsUid, membersUid, storage, license, ...others } = project;
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
    querySnapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
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
    snapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
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
    // ドキュメント参照をモジュラー API で作成
    const settingsRef = doc(firestore, 'projects', projectId, 'settings', 'default');
    // ドキュメントを取得
    const snap = await getDoc(settingsRef);

    // データをプロジェクト設定型として取得
    const settings = snap.data() as ProjectSettingsFS;
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
): Promise<void> => {
  // モジュラー API でバッチを作成
  const batch = writeBatch(firestore);

  // data サブコレクション参照
  const dataCol = collection(firestore, 'projects', projectId, 'data');

  // 各チャンクをバッチに追加
  chunks.forEach((chunk, index) => {
    const dataFS: DataFS = {
      userId,
      layerId,
      permission,
      encdata: chunk,
      encryptedAt: Timestamp.now(),
      chunkIndex: index,
    };
    // 自動 ID のドキュメント参照を作成
    const docRef = doc(dataCol);
    batch.set(docRef, dataFS);
  });

  // コミットして一括書き込みを実行
  await batch.commit();
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
  snapshot.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });

  // 6. 一括コミットで削除を実行
  await batch.commit();
};

export const uploadDataHelper = async (projectId: string, data: ProjectDataType) => {
  const { userId, layerId, permission, ...others } = data;
  const encdataArray = await enc(others, userId, projectId);
  const KBytes = sizeof(encdataArray) / 1024;

  if (KBytes > MAX_SIZE_KB) {
    return { isOK: false, message: t('hooks.message.dataSizeTooLarge') };
  }

  const chunks = chunkData(encdataArray, CHUNK_SIZE);
  await deleteExistingData(projectId, userId, layerId, permission);
  await uploadChunks(projectId, chunks, userId, layerId, permission);

  return { isOK: true, message: '' };
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
      docs = docs.filter((docSnap) => docSnap.data().userId !== excludeUserId);
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
    snapshot.docs.forEach((docSnap) => {
      batch.update(docSnap.ref, { permission: newPermission });
    });

    // 4. 一括コミットで更新を実行
    await batch.commit();
    return { isOK: true, message: '' };
  } catch (error) {
    console.error('権限一括更新エラー:', error);
    return { isOK: false, message: '権限の一括更新に失敗しました' };
  }
};
