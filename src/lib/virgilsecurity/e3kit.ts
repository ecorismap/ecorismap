import { EThree } from '@virgilsecurity/e3kit-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProjectType } from '../../types';
import { virgilCrypto } from 'react-native-virgil-crypto';
import { Buffer } from 'buffer';
import { splitStringsIntoChunksOfLen } from '../../utils/General';
import { FUNC_ENCRYPTION } from '../../constants/AppConstants';
import { compressFileToTempUri, decompressFileToTempUri, gzip, unzip } from '../../utils/Zip';
import { functions, httpsCallable } from '../firebase/firebase';

let eThree: EThree;

// 公開鍵のキャッシュ（findUsersのPromiseをキャッシュして並列呼び出しを防ぐ）
const publicKeyCache = new Map<string, Promise<any>>();
// グループのキャッシュ（loadGroupのPromiseをキャッシュして並列呼び出しを防ぐ）
const groupCache = new Map<string, Promise<{ isOK: boolean; group?: any }>>();

export const clearPublicKeyCache = () => {
  publicKeyCache.clear();
  groupCache.clear();
};

// キャッシュ付きfindUsers
const findUsersWithCache = async (userId: string): Promise<any> => {
  const cached = publicKeyCache.get(userId);
  if (cached) {
    return cached;
  }
  const promise = eThree.findUsers(userId);
  publicKeyCache.set(userId, promise);
  return promise;
};

export const isInitialized = (): boolean => {
  if (!FUNC_ENCRYPTION) return true;
  if (eThree === undefined) return false;
  
  try {
    // eThreeが実際に有効かどうか同期的にチェック
    // 注: hasLocalPrivateKeyは非同期なので、ここでは基本的なチェックのみ
    // 詳細なチェックはinitializeUser内で行われる
    return eThree !== undefined && typeof eThree.encrypt === 'function';
  } catch (e) {
    return false;
  }
};

export const initializeUser = async (userId: string) => {
  if (!FUNC_ENCRYPTION) return { isOK: true, message: '' };
  // eThreeが既に正常に初期化されているかチェック
  if (eThree !== undefined) {
    try {
      // eThreeが有効かどうか簡単なテストを実行
      await eThree.hasLocalPrivateKey();
      return { isOK: true, message: '' };
    } catch (e) {
      // eThreeが無効な場合は再初期化を続行
      console.log('eThree is invalid, reinitializing...');
      eThree = undefined as any;
    }
  }
  const getToken = httpsCallable(functions, 'getVirgilJwt');
  //@ts-ignore
  const initializeFunction = () => getToken().then((result) => result.data.token);

  try {
    // タイムアウトを設定（30秒）
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('E3Kit initialization timeout')), 30000)
    );

    //@ts-ignore
    eThree = (await Promise.race([EThree.initialize(initializeFunction, { AsyncStorage }), timeoutPromise])) as EThree;

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
    console.log('[initializeUser] Error:', e);
    // エラー時はeThreeをクリア
    eThree = undefined as any;
    return { isOK: false, message: e.message || e };
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
    if (eThree && typeof eThree.cleanup === 'function') {
      await eThree.cleanup();
    }
    // E3Kitの状態をリセット
    eThree = undefined as any;
    return { isOK: true };
  } catch (e) {
    console.log('[cleanupEncryptKey] Error:', e);
    // エラーが発生しても状態をリセット
    eThree = undefined as any;
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

    // eThreeが初期化されていない場合はエラーを投げる
    if (!eThree) {
      throw new Error('E3Kit not initialized');
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
  // const perfStart = performance.now();
  try {
    if (!FUNC_ENCRYPTION) {
      return JSON.parse(unzip(dataString[0]));
    }

    // eThreeが初期化されていない場合はundefinedを返す
    if (!eThree) {
      console.log('[decryptEThree] E3Kit not initialized');
      return undefined;
    }

    // const loadGroupStart = performance.now();
    // 復号化は読み取りのみなのでskipUpdate=trueで高速化
    const { isOK, group } = await loadGroup(groupId, userId, true);
    // const loadGroupEnd = performance.now();
    if (!isOK || group === undefined) {
      throw new Error('no group for encryption');
    }

    // 公開鍵をキャッシュから取得（Promiseをキャッシュして並列呼び出しを1回に集約）
    // const findUsersStart = performance.now();
    // const cacheHit = publicKeyCache.has(userId);
    const publicKey = await findUsersWithCache(userId);
    // const findUsersEnd = performance.now();

    // const decryptStart = performance.now();
    const dataArray = await Promise.all(
      dataString.map((d) => group.decrypt(d, publicKey, encryptedAt) as Promise<string>)
    );
    // const decryptEnd = performance.now();

    const data = JSON.parse(dataArray.join(''));
    // const perfEnd = performance.now();
    // console.log(`[PERF] decryptEThree(${groupId.slice(0, 8)}): total=${(perfEnd - perfStart).toFixed(0)}ms, loadGroup=${(loadGroupEnd - loadGroupStart).toFixed(0)}ms, findUsers=${(findUsersEnd - findUsersStart).toFixed(0)}ms${cacheHit ? '(cached)' : ''}, decrypt=${(decryptEnd - decryptStart).toFixed(0)}ms`);
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

// 内部のloadGroup実装（キャッシュなし）
const loadGroupInternal = async (
  groupId: string,
  owner: ProjectType['ownerUid'],
  skipUpdate = false
): Promise<{ isOK: boolean; group?: any }> => {
  if (!FUNC_ENCRYPTION) return { isOK: true };
  try {
    //console.log(groupId, owner);
    let group = await eThree.getGroup(groupId);
    if (group === null) {
      const ownerCard = await findUsersWithCache(owner);
      group = await eThree.loadGroup(groupId, ownerCard);
    } else if (!skipUpdate) {
      // skipUpdate=trueの場合、group.update()をスキップして高速化
      await group.update();
    }
    return { isOK: true, group };
  } catch (e: any) {
    console.log('loadGroup error:', e);
    return { isOK: false, group: undefined };
  }
};

// キャッシュ付きloadGroup（並列呼び出しを1回に集約）
// skipUpdate=true: プロジェクト一覧取得など、読み取りのみの場合に高速化
export const loadGroup = async (
  groupId: string,
  owner: ProjectType['ownerUid'],
  skipUpdate = false
): Promise<{ isOK: boolean; group?: any }> => {
  if (!FUNC_ENCRYPTION) return { isOK: true };

  const cacheKey = `${groupId}:${owner}:${skipUpdate}`;
  const cached = groupCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const promise = loadGroupInternal(groupId, owner, skipUpdate);
  groupCache.set(cacheKey, promise);
  return promise;
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
