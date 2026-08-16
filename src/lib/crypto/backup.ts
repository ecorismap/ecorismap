import { functions, httpsCallable, firebaseReady } from '../firebase/firebase';
import { deriveKB64, generateSaltB64, DEFAULT_KDF_ITERATIONS } from './kdf';
import { encryptWithKeyMaterial, decryptWithKeyMaterial } from './identity';

/**
 * 識別秘密鍵のPINバックアップ（Virgil Keyknox/Pythia の後継、クライアント側）。
 *
 * フロー（functions/src/key-backup-func.ts と対）:
 *   作成: k=PBKDF2(PIN,salt) → beginKeyBackup→KEK受領 → KEKでblob暗号化 → commitKeyBackup
 *   復元: getKeyBackupStatus→salt取得 → k導出 → restoreKeyBackup（レート制限つき）→ KEKでblob復号
 *
 * 秘密鍵の平文・PINはサーバーへ送らない。サーバーが持つのは暗号化blobとKEK検証値のみで、
 * KEKの導出にはKMS呼び出しが必須＝blobが漏れてもオフライン総当たりできない。
 * web/native の分岐は下層（kdf/identity/firebase）が担うため本ファイルは共通。
 */

export type KeyBackupStatus = {
  exists: boolean;
  salt?: string;
  kdfParams?: { iterations: number };
  keyVersion?: number;
  /** restoreのロック中はその解除時刻(ms)。未ロックは null */
  lockedUntil?: number | null;
};

// callableエラーをUI向けのメッセージキーへ正規化する
const normalizeError = (e: any): { message: string; lockedUntil?: number } => {
  const code: string = e?.code ?? '';
  if (code.endsWith('failed-precondition')) {
    return { message: 'backup-locked', lockedUntil: e?.details?.lockedUntil };
  }
  if (code.endsWith('permission-denied')) {
    return { message: 'backup-wrong-pin' };
  }
  if (code.endsWith('not-found')) {
    return { message: 'backup-not-found' };
  }
  if (code.endsWith('resource-exhausted')) {
    return { message: 'backup-too-many-requests' };
  }
  return { message: 'backup-error' };
};

export const getKeyBackupStatus = async (): Promise<
  { isOK: true; status: KeyBackupStatus } | { isOK: false; message: string }
> => {
  try {
    await firebaseReady;
    const call = httpsCallable(functions, 'getKeyBackupStatus');
    const result = await call();
    return { isOK: true, status: result.data as KeyBackupStatus };
  } catch (e) {
    console.log('[getKeyBackupStatus] error', e);
    return { isOK: false, message: normalizeError(e).message };
  }
};

/**
 * 識別秘密鍵のバックアップを作成（または新しいPINで作り直し）する。
 * @param pin ユーザーのPIN（6桁化・弱PIN拒否はUI側のバリデーションで担保）
 * @param privateKeyB64 バックアップ対象の識別秘密鍵
 * @param keyVersion publicKeys台帳と対応する鍵世代
 */
export const createKeyBackup = async (
  pin: string,
  privateKeyB64: string,
  keyVersion: number
): Promise<{ isOK: boolean; message: string }> => {
  try {
    await firebaseReady;
    const salt = generateSaltB64();
    const iterations = DEFAULT_KDF_ITERATIONS;
    const k = await deriveKB64(pin, salt, iterations);

    const begin = httpsCallable(functions, 'beginKeyBackup');
    const beginResult = await begin({ k });
    const { kek } = beginResult.data as { kek: string };

    const encPrivateKey = await encryptWithKeyMaterial(privateKeyB64, kek);

    const commit = httpsCallable(functions, 'commitKeyBackup');
    await commit({ k, encPrivateKey, salt, kdfParams: { iterations }, keyVersion });
    return { isOK: true, message: '' };
  } catch (e) {
    console.log('[createKeyBackup] error', e);
    return { isOK: false, message: normalizeError(e).message };
  }
};

/**
 * PINでバックアップから識別秘密鍵を復元する。
 * 誤PINの連続でロックされる（message='backup-locked'、lockedUntil=解除時刻ms）。
 */
export const restoreKeyBackup = async (
  pin: string
): Promise<
  | { isOK: true; privateKey: string; keyVersion: number }
  | { isOK: false; message: string; lockedUntil?: number }
> => {
  try {
    await firebaseReady;
    const statusResult = await getKeyBackupStatus();
    if (!statusResult.isOK) {
      return { isOK: false, message: statusResult.message };
    }
    const { status } = statusResult;
    if (!status.exists || status.salt === undefined || status.kdfParams === undefined) {
      return { isOK: false, message: 'backup-not-found' };
    }
    if (status.lockedUntil != null && Date.now() < status.lockedUntil) {
      return { isOK: false, message: 'backup-locked', lockedUntil: status.lockedUntil };
    }

    const k = await deriveKB64(pin, status.salt, status.kdfParams.iterations);
    const restore = httpsCallable(functions, 'restoreKeyBackup');
    const result = await restore({ k });
    const { kek, encPrivateKey, keyVersion } = result.data as {
      kek: string;
      encPrivateKey: string;
      keyVersion: number;
    };
    const privateKey = await decryptWithKeyMaterial(encPrivateKey, kek);
    return { isOK: true, privateKey, keyVersion };
  } catch (e) {
    console.log('[restoreKeyBackup] error', e);
    const normalized = normalizeError(e);
    return { isOK: false, message: normalized.message, lockedUntil: normalized.lockedUntil };
  }
};
