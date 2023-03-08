// import firebase from 'firebase/compat/app';
// import 'firebase/compat/auth';
// import 'firebase/compat/firestore';
// import 'firebase/compat/storage';
// import 'firebase/compat/functions';

import {
  DataFS,
  DataType,
  LocationType,
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
import { decryptEThree as dec, encryptEThree as enc } from '../virgilsecurity/e3kit';
import firebase, { firestore, functions } from './firebase';

export const getUidByEmail = async (email: string) => {
  try {
    const getUid = functions.httpsCallable('getUidByEmail');
    const { data } = await getUid({ email: email });
    if (data === null) {
      return { isOK: false, message: 'ユーザーIDの取得に失敗しました', uid: undefined };
    }
    return { isOK: true, message: '', uid: data as string };
  } catch {
    return { isOK: false, message: 'ユーザーIDの取得に失敗しました', uid: undefined };
  }
};

export const getUidsByEmails = async (emails: string[]) => {
  try {
    const getUids = functions.httpsCallable('getUidsByEmails');
    const { data } = await getUids({ emails: emails });
    return data as (string | null)[];
  } catch (e) {
    console.log(e);
    return undefined;
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
      const message =
        '読み込めないプロジェクトがあります。プロジェクトのオーナーにアカウントのリセットを依頼してください。';
      const filteredProjects = projects.filter((v): v is ProjectType => v !== undefined);
      return { isOK: true, message, projects: filteredProjects };
    }
    return { isOK: true, message: '', projects: projects as ProjectType[] };
  } catch (error) {
    console.log(error);
    return { isOK: false, message: 'プロジェクトの取得に失敗しました', projects: undefined };
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

export const deleteData = async (projectId: string, layerId: string, userId: string) => {
  try {
    const querySnapshot = await firestore
      .collection(`projects/${projectId}/data`)
      .where('layerId', '==', layerId)
      .where('userId', '==', userId)
      .get();
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

export const copyProjectSettings = async (fromProjectId: string, toProjectId: string, editorUid: string) => {
  const { isOK: downloadOK, message: downloadMessage, data } = await downloadProjectSettings(fromProjectId);
  if (!downloadOK || data === undefined) {
    return { isOK: false, message: downloadMessage };
  }
  const { isOK: uploadOK, message: uploadMessage } = await uploadProjectSettings(toProjectId, editorUid, data);
  if (!uploadOK) {
    return { isOK: false, message: uploadMessage };
  }
  return { isOK: true, message: '' };
};

const projectDataSetToDataSet = async (projectId: string, projectDataSet: any) => {
  const dataSet = await Promise.all(
    projectDataSet.docs.map(async (v: any) => {
      const { encdata, userId, layerId, encryptedAt } = v.data() as DataFS;
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

export const uploadData = async (projectId: string, data: ProjectDataType) => {
  try {
    const { userId, layerId, permission, ...others } = data;
    const encdata = await enc(others, userId, projectId);
    const dataFS: DataFS = {
      userId,
      layerId,
      permission,
      encdata,
      encryptedAt: firebase.firestore.Timestamp.now(),
    };
    const KBytes = sizeof(dataFS) / 1024;
    //console.log(others);
    //console.log(KBytes);
    if (KBytes > 1000) {
      return { isOK: false, message: 'データのサイズが大きいためアップロードできません' };
    }
    //console.log(dataFS);
    await firestore.collection(`projects/${projectId}/data`).add(dataFS);
    return { isOK: true, message: '' };
  } catch (error) {
    return {
      isOK: false,
      message: `${error}
    データのアップロードに失敗しました`,
    };
  }
};

export const uploadCommonData = async (projectId: string, data: ProjectDataType) => {
  try {
    const { userId, layerId, permission, ...others } = data;
    const encdata = await enc(others, userId, projectId);
    const dataFS: DataFS = {
      userId,
      layerId,
      permission,
      encdata,
      encryptedAt: firebase.firestore.Timestamp.now(),
    };
    const KBytes = sizeof(dataFS) / 1024;
    //console.log(others);
    //console.log(KBytes);
    if (KBytes > 1000) {
      return { isOK: false, message: 'データのサイズが大きいためアップロードできません' };
    }
    //console.log(dataFS);

    const querySnapshot = await firestore
      .collection(`projects/${projectId}/data`)
      .where('permission', '==', 'COMMON')
      .where('layerId', '==', layerId)
      .get();
    if (querySnapshot.docs.length === 0) {
      await firestore.collection(`projects/${projectId}/data`).add(dataFS);
    } else if (querySnapshot.docs.length === 1) {
      await querySnapshot.docs[0].ref.set(dataFS);
    } else {
      throw new Error('COMMONデータが複数存在します');
    }

    return { isOK: true, message: '' };
  } catch (error) {
    return {
      isOK: false,
      message: `${error}
    データのアップロードに失敗しました`,
    };
  }
};

export const uploadTemplateData = async (projectId: string, data: ProjectDataType) => {
  try {
    const { userId, layerId, permission, ...others } = data;
    const encdata = await enc(others, userId, projectId);
    const dataFS: DataFS = {
      userId,
      layerId,
      permission,
      encdata,
      encryptedAt: firebase.firestore.Timestamp.now(),
    };
    const KBytes = sizeof(dataFS) / 1024;
    //console.log(others);
    //console.log(KBytes);
    if (KBytes > 1000) {
      return { isOK: false, message: 'データのサイズが大きいためアップロードできません' };
    }
    //console.log(dataFS);

    const querySnapshot = await firestore
      .collection(`projects/${projectId}/data`)
      .where('permission', '==', 'TEMPLATE')
      .where('layerId', '==', layerId)
      .get();
    if (querySnapshot.docs.length === 0) {
      await firestore.collection(`projects/${projectId}/data`).add(dataFS);
    } else if (querySnapshot.docs.length === 1) {
      await querySnapshot.docs[0].ref.set(dataFS);
    } else {
      throw new Error('TEMPLATEデータが複数存在します');
    }

    return { isOK: true, message: '' };
  } catch (error) {
    return {
      isOK: false,
      message: `${error}
    データのアップロードに失敗しました`,
    };
  }
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

export const copyCommonData = async (fromProjectId: string, toProjectId: string, isPhotoUpload: boolean) => {
  //ToDo バッチ？
  const { isOK: downloadOK, message: downloadMessage, data } = await downloadCommonData(fromProjectId);
  if (!downloadOK || data === undefined) {
    return { isOK: false, message: downloadMessage };
  }

  for (const { userId, ...d } of data) {
    if (userId === undefined) {
      return { isOK: false, message: 'コモンデータのコピーに失敗しました' };
    }
    if (isPhotoUpload) {
      //ToDo 写真をstorage上でコピーして、URLを更新
    }
    const { isOK: uploadOK, message: uploadMessage } = await uploadData(toProjectId, {
      userId,
      ...d,
      permission: 'COMMON',
    });
    if (!uploadOK) {
      return { isOK: false, message: uploadMessage };
    }
  }
  return { isOK: true, message: '' };
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

export const toDate = (timestamp: firebase.firestore.Timestamp) => {
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
