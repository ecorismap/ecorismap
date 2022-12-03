import { EThree } from '@virgilsecurity/e3kit-browser';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
import 'firebase/compat/functions';
import { ProjectType } from '../../types';
import { decryptSharedFile, encryptSharedFile } from './e3kit-browser';
import { splitStringsIntoChunksOfLen } from '../../utils/General';
import { FUNC_ENCRYPTION } from '../../constants/AppConstants';
import { gzip, unzip } from '../../utils/Zip';
import { gzipFile, unzipFile } from '../../utils/Zip';

//ToDo バックアップUI
//キーのリセット処理UI

let eThree: EThree;

export const initializeUser = async (userId: string) => {
  if (!FUNC_ENCRYPTION) return { isOK: true, state: '' };

  const getToken = firebase.app().functions('asia-northeast1').httpsCallable('getVirgilJwt');
  const initializeFunction = () => getToken().then((result) => result.data.token);
  try {
    eThree = await EThree.initialize(initializeFunction);
    const hasRegistered = await hasRegisterdUser(userId);
    if (!hasRegistered) {
      return { isOK: false, message: 'not-registered' };
    }
    const hasPrivateKey = await eThree.hasLocalPrivateKey();
    if (!hasPrivateKey) {
      return { isOK: false, message: 'not-localkey' };
    }
    const hasBackup = await hasPrivateKeyBackup();
    if (!hasBackup) {
      return { isOK: false, message: 'not-backup' };
    }
    return { isOK: true, message: '' };
  } catch (e: any) {
    console.log(e);
    return { isOK: false, message: e };
  }
};

export const registEncrypt = async (backupPassword: string) => {
  if (!FUNC_ENCRYPTION) return { isOK: true };
  try {
    await eThree.register();
    await eThree.backupPrivateKey(backupPassword);
    return { isOK: true };
  } catch (e) {
    console.log(e);
    return { isOK: false };
  }
};

export const backupEncryptKey = async (backupPassword: string) => {
  if (!FUNC_ENCRYPTION) return { isOK: true };
  try {
    await eThree.backupPrivateKey(backupPassword);
    return { isOK: true };
  } catch (e) {
    console.log(e);
    return { isOK: false };
  }
};

export const cleanupEncryptKey = async () => {
  if (!FUNC_ENCRYPTION) return { isOK: true };
  try {
    await eThree.cleanup();
    return { isOK: true };
  } catch (e) {
    console.log(e);
    return { isOK: false };
  }
};

export const deleteEncryptKey = async () => {
  if (!FUNC_ENCRYPTION) return { isOK: true };
  try {
    await eThree.resetPrivateKeyBackup();
    await eThree.unregister();
    return { isOK: true };
  } catch (e) {
    console.log(e);
    return { isOK: false };
  }
};

export const resetEncryptKey = async () => {
  if (!FUNC_ENCRYPTION) return { isOK: true };
  try {
    await eThree.resetPrivateKeyBackup();
    await eThree.cleanup();
    await eThree.rotatePrivateKey();
    return { isOK: true };
  } catch (e) {
    console.log(e);
    return { isOK: false };
  }
};

export const restoreEncryptKey = async (backupPassword: string) => {
  if (!FUNC_ENCRYPTION) return { isOK: true };
  try {
    await eThree.restorePrivateKey(backupPassword);
    return { isOK: true };
  } catch (e) {
    console.log(e);
    return { isOK: false };
  }
};

export const changeEncryptPassword = async (oldPassword: string, newPassword: string) => {
  if (!FUNC_ENCRYPTION) return { isOK: true };
  try {
    await eThree.changePassword(oldPassword, newPassword);
    return { isOK: true };
  } catch (e) {
    console.log(e);
    return { isOK: false };
  }
};

export const encryptEThree = async (data: any, userId: string, groupId: string) => {
  try {
    if (!FUNC_ENCRYPTION) {
      return [gzip(JSON.stringify(data))];
      //return [JSON.stringify(data)];
    }
    const { isOK, group } = await loadGroup(groupId, userId);
    if (!isOK || group === undefined) {
      throw new Error('no group for encryption');
    }
    const dataString = JSON.stringify(data);
    //e3kitで暗号化は30000バイトの制限がある。文字列のlengthと違うので安全に20000にしてある
    const dataArray = splitStringsIntoChunksOfLen(dataString, 20000);
    return await Promise.all(dataArray.map((d) => group.encrypt(d) as Promise<string>));
  } catch (e: any) {
    //暗号化できない場合はdecと違い問題なのでエラーを返す
    throw new Error(e.message);
  }
};

export const decryptEThree = async (encryptedAt: Date, dataString: string[], userId: string, groupId: string) => {
  try {
    if (!FUNC_ENCRYPTION) {
      return JSON.parse(unzip(dataString[0]));
      //return JSON.parse(dataString[0]);
    }

    const { isOK, group } = await loadGroup(groupId, userId);
    if (!isOK || group === undefined) {
      throw new Error('no group for encryption');
    }
    const publicKey = await eThree.findUsers(userId);
    const dataArray = await Promise.all(
      dataString.map((d) => group.decrypt(d, publicKey, encryptedAt) as Promise<string>)
    );
    const data = JSON.parse(dataArray.join(''));
    return data;
  } catch (e) {
    console.log(e);
    //一部のメンバーのデータがローテーションのため復号できない場合がある。
    //他の処理は継続させるためにundefineを返す。
    return undefined;
  }
};

export const encryptFileEThreeRN = () => {};
export const encryptFileEThree = async (uri: string) => {
  try {
    //if (!FUNC_ENCRYPTION) return { encdata: file, key: '' };
    if (!FUNC_ENCRYPTION) return { encdata: await gzipFile(uri), key: '' };
    const response = await fetch(uri);
    const blob = await response.blob();
    const { encryptedSharedFile, fileKey } = await encryptSharedFile(blob);

    return {
      encdata: encryptedSharedFile,
      key: fileKey,
    };
  } catch (e) {
    console.log(e);
    return { encdata: undefined, key: undefined };
  }
};

export const decryptFileEThreeRN = () => {};
export const decryptFileEThree = async (file: Blob, key: string) => {
  try {
    //if (!FUNC_ENCRYPTION) return { decdata: file };
    if (!FUNC_ENCRYPTION) return { decdata: await unzipFile(file) };
    const decryptedData = await decryptSharedFile(file, key);
    return { decdata: decryptedData };
  } catch (e) {
    console.log(e);
    return { decdata: undefined };
  }
};

export const createGroup = async (groupId: string, members: ProjectType['membersUid']) => {
  if (!FUNC_ENCRYPTION) return { isOK: true };
  try {
    const participants = await eThree.findUsers(members);
    await eThree.createGroup(groupId, participants);
    return { isOK: true };
  } catch (e) {
    return { isOK: false };
  }
};

export const deleteGroup = async (groupId: string) => {
  if (!FUNC_ENCRYPTION) return { isOK: true };
  try {
    await eThree.deleteGroup(groupId);
    return { isOK: true };
  } catch (e) {
    return { isOK: false };
  }
};

export const addGroupMembers = async (groupId: string, ownerUid: string, membersUid: string[]) => {
  if (!FUNC_ENCRYPTION) return { isOK: true };
  try {
    const newParticipant = await eThree.findUsers(membersUid);
    const { isOK, group } = await loadGroup(groupId, ownerUid);
    if (!isOK || group === undefined) {
      return { isOK: false };
    }
    await group.add(newParticipant);
    return { isOK: true };
  } catch (e) {
    console.log(e);
    if (`${e}`.indexOf('Participant(s) have already been added') !== -1) return { isOK: true };
    return { isOK: false };
  }
};

export const reAddGroupMember = async (groupId: string, ownerUid: string, memberUid: string) => {
  if (!FUNC_ENCRYPTION) return { isOK: true };
  try {
    const newParticipant = await eThree.findUsers(memberUid);
    const { isOK, group } = await loadGroup(groupId, ownerUid);
    if (!isOK || group === undefined) {
      return { isOK: false };
    }

    await group.reAdd(newParticipant);
    return { isOK: true };
  } catch (e) {
    console.log(e);
    return { isOK: false };
  }
};

export const deleteGroupMembers = async (groupId: string, ownerUid: string, membersUid: string[]) => {
  if (!FUNC_ENCRYPTION) return { isOK: true };
  try {
    const existingParticipant = await eThree.findUsers(membersUid);
    const { isOK, group } = await loadGroup(groupId, ownerUid);
    if (!isOK || group === undefined) {
      return { isOK: false };
    }

    await group.remove(existingParticipant);
    return { isOK: true };
  } catch (e: any) {
    console.log(e);
    if (e.name === 'UsersNotFoundError') {
      return { isOK: true };
    } else if (`${e}`.indexOf('Attempted to remove non-existent group participants') !== -1) {
      return { isOK: true };
    } else {
      return { isOK: false };
    }
  }
};

export const loadGroup = async (groupId: string, owner: ProjectType['ownerUid']) => {
  if (!FUNC_ENCRYPTION) return { isOK: true };
  try {
    //console.log(groupId, owner);
    let group = await eThree.getGroup(groupId);
    if (group === null) {
      const ownerCard = await eThree.findUsers(owner);
      group = await eThree.loadGroup(groupId, ownerCard);
    } else {
      await group.update();
    }
    return { isOK: true, group };
  } catch (e: any) {
    console.log('loadGroup error:', e);
    return { isOK: false, group: undefined };
  }
};
export const hasPrivateKeyBackup = async () => {
  if (!FUNC_ENCRYPTION) return true;
  // This code is taken from a comment on vigril slack
  // we use underscore because we enforce the backup PIN will always be at least 4 chars
  return eThree
    .restorePrivateKey('_')
    .then(() => true)
    .catch((e) => {
      if (e.name === 'PrivateKeyNoBackupError') return false;
      if (e.name === 'WrongKeyknoxPasswordError') return true;
      throw e;
    });
};

export const hasRegisterdUser = async (userId: string | null) => {
  if (userId === null) return false;
  if (!FUNC_ENCRYPTION) {
    return { isOK: true };
  } else {
    return eThree
      .findUsers(userId)
      .then(() => true)
      .catch((e) => {
        if (e.name === 'UsersNotFoundError') return false;
        throw e;
      });
  }
};