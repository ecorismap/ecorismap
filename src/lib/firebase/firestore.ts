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
  UpdateProjectFS,
} from '../../types';
//@ts-ignore
import sizeof from 'firestore-size';
import obj_sizeof from 'object-sizeof';
import { decryptEThree as dec, encryptEThree as enc } from '../virgilsecurity/e3kit';
import firebase, { firestore, functions } from './firebase';
import { t } from '../../i18n/config';
import { Timestamp } from '@firebase/firestore-types';

export const getUidByEmail = async (email: string) => {
  try {
    const getUid = functions.httpsCallable('getUidByEmail');
    const { data } = await getUid({ email: email });
    if (data === null) throw new Error(t('common.message.failGetUids'));
    return data as string;
  } catch {
    throw new Error(t('common.message.failGetUids'));
  }
};

export const getUidsByEmails = async (emails: string[]) => {
  try {
    const getUids = functions.httpsCallable('getUidsByEmails');
    const { data } = await getUids({ emails: emails });
    return data as (string | null)[];
  } catch (e) {
    throw new Error(t('common.message.failGetUids'));
  }
};

export const getAllProjects = async (uid: string, excludeMember = false) => {
  try {
    let querySnapshot;
    if (excludeMember) {
      querySnapshot = await firestore.collection('projects').where('ownerUid', '==', uid).get({ source: 'server' });
    } else {
      querySnapshot = await firestore
        .collection('projects')
        .where('membersUid', 'array-contains', uid)
        .get({ source: 'server' });
    }

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
      encryptedAt: firebase.firestore.Timestamp.now(),
    };
    await firestore.doc(`projects/${id}`).set(projectFS);

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
      encryptedAt: firebase.firestore.Timestamp.now(),
    };
    await firestore.doc(`projects/${project.id}`).update(updateProjectFS);
    return { isOK: true, message: '' };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: 'プロジェクトの更新に失敗しました' };
  }
};

export const deleteAllProjects = async (uid: string) => {
  const deletedIds = [];
  try {
    const querySnapshot = await firestore.collection('projects').where('ownerUid', '==', uid).get();
    for (const v of querySnapshot.docs) {
      //projectを削除するとfunctionsがトリガーされsubcollectionも削除する
      await firestore.collection('projects').doc(v.id).delete();
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
    //projectを削除するとfunctionsがトリガーされsubcollectionも削除する
    await firestore.collection('projects').doc(projectId).delete();
    return { isOK: true, message: '' };
  } catch (error) {
    return { isOK: false, message: 'プロジェクトの削除に失敗しました' };
  }
};

export const deleteAllData = async (projectId: string) => {
  try {
    const querySnapshot = await firestore.collection(`projects/${projectId}/data`).get();
    if (querySnapshot.docs.length === 0) return { isOK: true, message: '' };
    const batch = firestore.batch();
    //@ts-ignore
    querySnapshot.docs.forEach((v) => batch.delete(v.ref));
    batch.commit();
    return { isOK: true, message: '' };
  } catch (error) {
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
    let querySnapshot;

    if (permission === 'TEMPLATE') {
      //他の管理者が作成したテンプレートも含め削除する
      querySnapshot = await firestore
        .collection(`projects/${projectId}/data`)
        .where('layerId', '==', layerId)
        .where('permission', '==', 'TEMPLATE')
        .get();
    } else if (permission !== undefined && userId !== undefined) {
      querySnapshot = await firestore
        .collection(`projects/${projectId}/data`)
        .where('layerId', '==', layerId)
        .where('userId', '==', userId)
        .where('permission', '==', permission)
        .get();
    } else {
      querySnapshot = await firestore.collection(`projects/${projectId}/data`).where('layerId', '==', layerId).get();
    }
    if (querySnapshot.docs.length === 0) return { isOK: true, message: '' };
    const batch = firestore.batch();
    //@ts-ignore
    querySnapshot.docs.forEach((v) => batch.delete(v.ref));
    batch.commit();
    return { isOK: true, message: '' };
  } catch (error) {
    return { isOK: false, message: 'データの削除に失敗しました' };
  }
};

export const uploadProjectSettings = async (projectId: string, editorUid: string, settings: ProjectSettingsType) => {
  try {
    const timestamp = firebase.firestore.Timestamp.now();
    const encdata = await enc({ ...settings, updatedAt: toDate(timestamp) }, editorUid, projectId);
    const settingsFS: ProjectSettingsFS = { editorUid, encdata, encryptedAt: timestamp };
    await firestore.doc(`projects/${projectId}/settings/default`).set(settingsFS);
    return { isOK: true, message: '', timestamp: toDate(timestamp) };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: 'プロジェクトの設定のアップロードに失敗しました', timestamp: undefined };
  }
};

export const getSettingsUpdatedAt = async (projectId: string) => {
  try {
    const settings = (await firestore.doc(`projects/${projectId}/settings/default`).get()).data() as ProjectSettingsFS;
    return toDate(settings.encryptedAt);
  } catch (error) {
    console.log(error);
    return undefined;
  }
};

export const downloadProjectSettings = async (projectId: string) => {
  try {
    const settings = (await firestore.doc(`projects/${projectId}/settings/default`).get()).data() as ProjectSettingsFS;
    const data: ProjectSettingsType | undefined = await dec(
      toDate(settings.encryptedAt),
      settings.encdata,
      settings.editorUid,
      projectId
    );
    if (data === undefined) throw new Error('復号化できません');
    return { isOK: true, message: '', data };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: 'プロジェクトの設定のダウンロードに失敗しました', data: undefined };
  }
};

const projectDataSetToDataSet = async (projectId: string, projectDataSet: any) => {
  const dataMap = new Map<string, { [index: number]: string[] }>();
  const metadataMap = new Map<string, { userId: string; encryptedAt: Timestamp }>();

  // チャンクをグループ化
  projectDataSet.docs.forEach((v: any) => {
    const { encdata, layerId, chunkIndex, userId, encryptedAt } = v.data() as DataFS;

    if (!dataMap.has(layerId)) {
      dataMap.set(layerId, {});
    }
    // chunkIndexがない場合、0とする
    const index = chunkIndex !== undefined ? chunkIndex : 0;
    dataMap.get(layerId)![index] = encdata;

    if (!metadataMap.has(layerId)) {
      metadataMap.set(layerId, { userId, encryptedAt });
    }
  });

  const dataSet = await Promise.all(
    Array.from(dataMap.entries()).map(async ([layerId, chunkMap]) => {
      const { userId, encryptedAt } = metadataMap.get(layerId)!;

      // チャンクを正しい順序で結合
      const encdata = Object.keys(chunkMap)
        .sort((a, b) => Number(a) - Number(b))
        .map((index) => chunkMap[Number(index)])
        .flat();

      const data = await dec(toDate(encryptedAt), encdata, userId, projectId);
      if (data !== undefined) {
        return { userId, layerId, ...data } as DataType;
      } else {
        //削除されたメンバーのデータは、復号できない。
        //プロジェクトを読み込むときに削除するか（最適化）、アカウントを削除するときにfunctionsで削除するか
        return null;
      }
    })
  );

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

const uploadChunks = async (
  projectId: string,
  chunks: string[][],
  userId: string,
  layerId: string,
  permission: PermissionType | 'TEMPLATE'
) => {
  const batch = firestore.batch();
  for (let i = 0; i < chunks.length; i++) {
    const dataFS: DataFS = {
      userId,
      layerId,
      permission,
      encdata: chunks[i],
      encryptedAt: firebase.firestore.Timestamp.now(),
      chunkIndex: i,
    };
    const docRef = firestore.collection(`projects/${projectId}/data`).doc();
    //@ts-ignore
    batch.set(docRef, dataFS);
  }
  await batch.commit();
};

const deleteExistingData = async (
  projectId: string,
  userId: string,
  layerId: string,
  permission: PermissionType | 'TEMPLATE'
) => {
  const batch = firestore.batch();
  const querySnapshot = await firestore
    .collection(`projects/${projectId}/data`)
    .where('permission', '==', permission)
    .where('layerId', '==', layerId)
    .where('userId', '==', userId)
    .get();
  //@ts-ignore
  querySnapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
};

export const uploadDataHelper = async (projectId: string, data: ProjectDataType) => {
  const { userId, layerId, permission, ...others } = data;
  const encdataArray = await enc(others, userId, projectId);
  const KBytes = sizeof(encdataArray) / 1024;

  if (KBytes > MAX_SIZE_KB) {
    return { isOK: false, message: 'データのサイズが大きいためアップロードできません' };
  }

  const chunks = chunkData(encdataArray, CHUNK_SIZE);
  await deleteExistingData(projectId, userId, layerId, permission);
  await uploadChunks(projectId, chunks, userId, layerId, permission);

  return { isOK: true, message: '' };
};

export const downloadCommonData = async (projectId: string) => {
  try {
    const projectDataSet = await firestore
      .collection(`projects/${projectId}/data`)
      .where('permission', '==', 'COMMON')
      .get();
    const dataSet = await projectDataSetToDataSet(projectId, projectDataSet);
    return { isOK: true, message: '', data: dataSet };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: 'コモンデータのダウンロードに失敗しました', data: undefined };
  }
};

export const downloadAllData = async (projectId: string) => {
  try {
    const projectDataSet = await firestore.collection(`projects/${projectId}/data`).get();
    const dataSet = await projectDataSetToDataSet(projectId, projectDataSet);
    return { isOK: true, message: '', data: dataSet };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: 'データのダウンロードに失敗しました', data: undefined };
  }
};

export const downloadPublicAndAllPrivateData = async (projectId: string) => {
  try {
    const projectDataSet = await firestore
      .collection(`projects/${projectId}/data`)
      .where('permission', 'in', ['PUBLIC', 'PRIVATE'])
      .get();
    const dataSet = await projectDataSetToDataSet(projectId, projectDataSet);

    return { isOK: true, message: '', data: dataSet };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: 'データのダウンロードに失敗しました', data: undefined };
  }
};

export const downloadPublicAndCommonData = async (projectId: string) => {
  try {
    const projectDataSet = await firestore
      .collection(`projects/${projectId}/data`)
      .where('permission', 'in', ['PUBLIC', 'COMMON'])
      .get();
    const dataSet = await projectDataSetToDataSet(projectId, projectDataSet);
    return { isOK: true, message: '', data: dataSet };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: 'データのダウンロードに失敗しました', data: undefined };
  }
};

export const downloadPublicData = async (projectId: string) => {
  try {
    const projectDataSet = await firestore
      .collection(`projects/${projectId}/data`)
      .where('permission', '==', 'PUBLIC')
      .get();
    const dataSet = await projectDataSetToDataSet(projectId, projectDataSet);

    return { isOK: true, message: '', data: dataSet };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: 'データのダウンロードに失敗しました', data: undefined };
  }
};

export const downloadPrivateData = async (userId_: string, projectId: string) => {
  try {
    const projectDataSet = await firestore
      .collection(`projects/${projectId}/data`)
      .where('permission', '==', 'PRIVATE')
      .where('userId', '==', userId_)
      .get();
    const dataSet = await projectDataSetToDataSet(projectId, projectDataSet);
    return { isOK: true, message: '', data: dataSet };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: 'データのダウンロードに失敗しました', data: undefined };
  }
};

export const downloadAllPrivateData = async (userId_: string, projectId: string) => {
  try {
    const projectDataSet = await firestore
      .collection(`projects/${projectId}/data`)
      .where('permission', '==', 'PRIVATE')
      .get();
    const dataSet = await projectDataSetToDataSet(projectId, projectDataSet);
    return { isOK: true, message: '', data: dataSet };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: 'データのダウンロードに失敗しました', data: undefined };
  }
};

export const downloadTemplateData = async (userId_: string, projectId: string) => {
  try {
    const projectDataSet = await firestore
      .collection(`projects/${projectId}/data`)
      .where('permission', '==', 'TEMPLATE')
      .get();
    const dataSet = await projectDataSetToDataSet(projectId, projectDataSet);
    return { isOK: true, message: '', data: dataSet };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: 'データのダウンロードに失敗しました', data: undefined };
  }
};

export const uploadCurrentPosition = async (
  userId: string,
  projectId: string,
  data: { icon: { photoURL: string | null; initial: string }; coords: LocationType }
) => {
  try {
    const encdata = await enc(data, userId, projectId);
    const positionFS: PositionFS = { encdata, encryptedAt: firebase.firestore.Timestamp.now() };
    await firestore.doc(`projects/${projectId}/position/${userId}`).set(positionFS);
    return { isOK: true, message: '' };
  } catch (error: any) {
    return { isOK: false, message: '現在位置のアップロードに失敗しました' };
  }
};

export const deleteCurrentPosition = async (userId: string, projectId: string) => {
  try {
    await firestore.collection(`projects/${projectId}/position`).doc(userId).delete();
    return { isOK: true, message: '' };
  } catch (error: any) {
    return { isOK: false, message: '現在位置の削除に失敗しました' };
  }
};

export const toDate = (timestamp: Timestamp) => {
  return new Date(timestamp.seconds * 1000 + timestamp.nanoseconds / 100000);
};

export const updateLicense = async (project: ProjectType) => {
  return await new Promise<{ isOK: boolean; message: string }>((resolve) => {
    //@ts-ignore
    const unsubscribe = firestore.doc(`projects/${project.id}`).onSnapshot(async (snapshot) => {
      if (!snapshot.exists) return;
      const license = snapshot.get('license');
      if (license !== undefined && license !== 'Unknown') {
        unsubscribe();
        resolve({ isOK: true, message: '' });
      }
    });
  });
};
