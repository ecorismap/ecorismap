import { EThree } from '@virgilsecurity/e3kit-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProjectType } from '../../types';
import { virgilCrypto } from 'react-native-virgil-crypto';
import { Buffer } from 'buffer';
import { splitStringsIntoChunksOfLen } from '../../utils/General';
import { FUNC_ENCRYPTION } from '../../constants/AppConstants';
import { compressFileToTempUri, decompressFileToTempUri, gzip, unzip } from '../../utils/Zip';
import { functions, httpsCallable, waitForFirebaseInitialization } from '../firebase/firebase';

let eThree: EThree;
let currentUserId: string | null = null;
let isInitializing = false;

// E3Kitが初期化されているかどうかを確認
export const isE3KitInitialized = () => {
  return eThree !== undefined && currentUserId !== null;
};

// 必要に応じてE3Kitを初期化
export const ensureE3KitInitialized = async (userId: string) => {
  if (!FUNC_ENCRYPTION) return { isOK: true, message: '' };

  // 既に同じユーザーで初期化済みの場合はスキップ
  if (isE3KitInitialized() && currentUserId === userId) {
    return { isOK: true, message: '' };
  }

  // 別のユーザーの場合、または未初期化の場合は初期化
  if (currentUserId !== userId) {
    currentUserId = null;
    eThree = undefined as any;
  }

  // 初期化中の場合は待つ
  if (isInitializing) {
    // 初期化が完了するまで待つ（最大30秒）
    const startTime = Date.now();
    while (isInitializing && Date.now() - startTime < 30000) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (isE3KitInitialized() && currentUserId === userId) {
      return { isOK: true, message: '' };
    }
  }

  // 初期化を実行
  isInitializing = true;
  try {
    const result = await initializeUser(userId);
    if (result.isOK) {
      currentUserId = userId;
    }
    return result;
  } finally {
    isInitializing = false;
  }
};

export const initializeUser = async (userId: string) => {
  if (!FUNC_ENCRYPTION) return { isOK: true, message: '' };

  //console.log('[e3kit] Starting initializeUser for userId:', userId);

  try {
    // Firebase初期化を待つ
    await waitForFirebaseInitialization();

    const getToken = httpsCallable(functions, 'getVirgilJwt');
    //@ts-ignore
    const initializeFunction = () =>
      getToken()
        .then((result) => {
          //@ts-ignore
          return result.data.token;
        });

    // タイムアウトを設定（30秒）
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('E3Kit initialization timeout')), 30000)
    );

    //@ts-ignore
    const initializePromise = EThree.initialize(initializeFunction, { AsyncStorage });

    //@ts-ignore
    eThree = await Promise.race([initializePromise, timeoutPromise]);

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
    //console.error('[e3kit] Error in initializeUser:', e.message || e);
    return { isOK: false, message: e.message || String(e) };
  }
};

export const registEncrypt = async (backupPassword: string) => {
  if (!FUNC_ENCRYPTION) return { isOK: true };
  try {
    // registEncryptは初期化の一部なので、eThreeを直接使用
    if (!eThree) {
      throw new Error('E3Kit not initialized');
    }
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
    if (eThree && typeof eThree.cleanup === 'function') {
      await eThree.cleanup();
    }
    // E3Kitの状態をリセット
    eThree = undefined as any;
    currentUserId = null;
    isInitializing = false;
    return { isOK: true };
  } catch (e) {
    console.log('[cleanupEncryptKey] Error:', e);
    // エラーが発生しても状態をリセット
    eThree = undefined as any;
    currentUserId = null;
    isInitializing = false;
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
    }
    
    // E3Kitの初期化を確認
    const initResult = await ensureE3KitInitialized(userId);
    if (!initResult.isOK) {
      throw new Error(`E3Kit initialization failed: ${initResult.message}`);
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
    }

    // E3Kitの初期化を確認
    const initResult = await ensureE3KitInitialized(userId);
    if (!initResult.isOK) {
      return undefined;
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

export const encryptFileEThree = async (
  uri: string
): Promise<
  | {
      encdata: Blob | File;
      key: undefined;
    }
  | {
      encdata: Blob | File;
      key: string;
    }
  | {
      encdata: undefined;
      key: undefined;
    }
> => {
  // TODO: Implement file encryption using uri
  // console.log('Encrypting file from URI:', uri);
  if (uri) {
    // Placeholder implementation
  }
  return {
    encdata: undefined,
    key: undefined,
  };
};
export const encryptFileEThreeRN = async (uri: string) => {
  try {
    if (!FUNC_ENCRYPTION) {
      const zipUri = await compressFileToTempUri(uri);
      return { encUri: zipUri, key: '' };
    }
    const keypair = virgilCrypto.generateKeys();
    const encryptedFilePath = await virgilCrypto.encryptFile({
      inputPath: uri,
      outputPath: undefined,
      publicKeys: keypair.publicKey,
    });

    return {
      encUri: encryptedFilePath,
      key: Buffer.from(virgilCrypto.exportPrivateKey(keypair.privateKey) as Uint8Array).toString('base64'),
    };
  } catch (e) {
    console.log(e);
    return { encUri: undefined, key: undefined };
  }
};
export const decryptFileEThree = async (
  file: Blob,
  key: string
): Promise<
  | {
      decdata: Blob;
    }
  | {
      decdata: undefined;
    }
> => {
  // TODO: Implement file decryption using file and key
  // console.log('Decrypting file:', file, key);
  if (file && key) {
    // Placeholder implementation
  }
  return {
    decdata: undefined,
  };
};

export const decryptFileEThreeRN = async (uri: string, key: string) => {
  try {
    if (!FUNC_ENCRYPTION) {
      const unzipUri = await decompressFileToTempUri(uri);
      return { decUri: unzipUri };
    }
    const decryptedFilePath = await virgilCrypto.decryptFile({
      inputPath: uri,
      outputPath: undefined,
      privateKey: virgilCrypto.importPrivateKey(key),
    });
    return { decUri: decryptedFilePath };
  } catch (e) {
    console.log(e);
    return { decUri: undefined };
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
    // loadGroupは既にencryptEThree/decryptEThreeから呼ばれており、
    // それらが初期化を確認しているので、ここでは eThree の存在チェックのみ
    if (!eThree) {
      console.error('[loadGroup] E3Kit (eThree) is not initialized');
      return { isOK: false, group: undefined };
    }
    
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
    console.error('[loadGroup] Error loading group:', e.message || e);
    console.error('[loadGroup] GroupId:', groupId, 'Owner:', owner);
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
    //ToDo 登録ユーザーのチェックはできるはず。
    return true;
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
