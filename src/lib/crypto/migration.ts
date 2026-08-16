import AsyncStorage from '@react-native-async-storage/async-storage';
import * as e3kit from '../virgilsecurity/e3kit';
import { getPublicKeyFromLedger, publishPublicKeyToLedger } from '../firebase/publicKeys';
import { createKeyBackup, getKeyBackupStatus, restoreKeyBackup } from './backup';
import { loadIdentityPrivateKey, saveIdentityPrivateKey } from './keyStorage';
import { extractPublicKeyB64 } from './identity';

/**
 * 識別鍵の脱Virgil移行オーケストレーション。
 *
 * 「移行」= 既存の識別鍵ペアはそのまま、保管の仕組みだけを置き換える:
 *   - 公開鍵: Virgil Cards → Firestore台帳(publicKeys/{uid})
 *   - 秘密鍵バックアップ: Virgil Keyknox(旧PIN) → KMS方式(原則これまでと同じPIN)
 *   - ローカル保管: e3kit keyEntryStorage → keyStorage（移行期間中は両方に持つ）
 *
 * 移行済み判定はサーバー真実（KMSバックアップの有無）で行い、
 * ローカルマーカーで2回目以降のサーバー照会を省略する。
 */

const MIGRATED_MARKER_PREFIX = 'keyMigrated:';

export const isMarkedMigrated = async (uid: string): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(`${MIGRATED_MARKER_PREFIX}${uid}`)) === 'true';
  } catch (e) {
    return false;
  }
};

export const markMigrated = async (uid: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(`${MIGRATED_MARKER_PREFIX}${uid}`, 'true');
  } catch (e) {
    // マーカーは高速化のためだけなので失敗しても致命的でない
    console.log('[markMigrated] error', e);
  }
};

/** 鍵リセット時に呼ぶ。次回ログインで再移行（新鍵の台帳publish+バックアップ再作成）を促す。 */
export const clearMigratedMarker = async (uid: string): Promise<void> => {
  try {
    await AsyncStorage.removeItem(`${MIGRATED_MARKER_PREFIX}${uid}`);
  } catch (e) {
    console.log('[clearMigratedMarker] error', e);
  }
};

export type KeyMigrationState =
  | { state: 'migrated' }
  | { state: 'migrated-need-restore'; lockedUntil?: number | null }
  | { state: 'needs-migration' }
  | { state: 'error'; message: string };

/**
 * 端末に残っていた鍵が台帳の現行公開鍵と一致するか検証する。
 * 過去に鍵リセットをしたユーザーの端末にはローテーション前の古い鍵が残っていることがあり、
 * 検証なしで採用すると復号が静かに全滅するため、採用（コピー）前に必ず確認する。
 */
export const isKeyConsistentWithLedger = async (uid: string, privateKeyB64: string): Promise<boolean> => {
  try {
    const ledger = await getPublicKeyFromLedger(uid);
    if (ledger === undefined) return false;
    const publicKey = await extractPublicKeyB64(privateKeyB64);
    return publicKey === ledger.publicKey;
  } catch (e) {
    console.log('[isKeyConsistentWithLedger] error', e);
    return false;
  }
};

/**
 * 移行状態を判定する。
 * - migrated: 移行済みでローカル鍵もある（何もしなくてよい）
 * - migrated-need-restore: 他端末で移行済みだがこの端末に鍵がない（新PINで復元が必要）
 * - needs-migration: 未移行（移行フォームへ）
 */
export const getKeyMigrationState = async (uid: string): Promise<KeyMigrationState> => {
  // ローカルマーカーがあればサーバー照会を省略
  if (await isMarkedMigrated(uid)) {
    const localKey = await loadIdentityPrivateKey(uid);
    if (localKey !== undefined) return { state: 'migrated' };
    // マーカーはあるが鍵がない（キーチェーン消去等）→ サーバー照会からやり直す
  }
  const statusResult = await getKeyBackupStatus();
  if (!statusResult.isOK) {
    return { state: 'error', message: statusResult.message };
  }
  if (!statusResult.status.exists) {
    return { state: 'needs-migration' };
  }
  // サーバーには移行済み
  const localKey = await loadIdentityPrivateKey(uid);
  if (localKey !== undefined) {
    await markMigrated(uid);
    return { state: 'migrated' };
  }
  // e3kit側にローカル鍵が残っていて台帳の現行鍵と一致すれば、新ストレージへコピーして完了
  //（古い鍵の可能性があるため必ず整合検証する。isKeyConsistentWithLedger参照）
  const exported = await e3kit.exportLocalIdentityKey(uid);
  if (exported !== undefined && (await isKeyConsistentWithLedger(uid, exported.privateKey))) {
    await saveIdentityPrivateKey(uid, exported.privateKey);
    await markMigrated(uid);
    return { state: 'migrated' };
  }
  return { state: 'migrated-need-restore', lockedUntil: statusResult.status.lockedUntil };
};

/**
 * 未移行ユーザーの移行本体。端末にある既存の識別鍵をそのまま新方式へ載せ替える。
 * 前提: e3kit が初期化済みでローカル鍵がある（initializeEncript の分岐で保証）。
 * @param newPin KMSバックアップに使うPIN（原則これまでと同じPIN。バリデーションは呼び出し側）
 */
export const migrateIdentityKey = async (uid: string, newPin: string): Promise<{ isOK: boolean; message: string }> => {
  // 1. 既存鍵の取り出し（e3kit公式API経由）
  const exported = await e3kit.exportLocalIdentityKey(uid);
  if (exported === undefined) {
    return { isOK: false, message: 'migrate-no-local-key' };
  }
  // 2. 台帳へ公開鍵をpublish（シーディング済みなら鍵一致で冪等。カードは監査用）
  const card = await e3kit.exportOwnCard(uid);
  const publishResult = await publishPublicKeyToLedger(uid, exported.publicKey, card);
  if (!publishResult.isOK || publishResult.keyVersion === undefined) {
    return { isOK: false, message: publishResult.message };
  }
  // 3. KMS方式のPINバックアップを作成
  const backupResult = await createKeyBackup(newPin, exported.privateKey, publishResult.keyVersion);
  if (!backupResult.isOK) {
    return { isOK: false, message: backupResult.message };
  }
  // 4. 新ローカルストレージへ保存してマーカー
  await saveIdentityPrivateKey(uid, exported.privateKey);
  await markMigrated(uid);
  return { isOK: true, message: '' };
};

/**
 * 移行済みユーザーの新PINによる復元（新しい端末）。
 * 復元後、e3kit のローカルストレージにも書き戻して旧グループ暗号の dual-read を有効にする。
 */
export const restoreIdentityKeyV2 = async (
  uid: string,
  pin: string
): Promise<{ isOK: boolean; message: string; lockedUntil?: number }> => {
  const result = await restoreKeyBackup(pin);
  if (!result.isOK) {
    return { isOK: false, message: result.message, lockedUntil: result.lockedUntil };
  }
  // 台帳の公開鍵と復元した秘密鍵の整合を確認（blobとledgerの取り違え・破損の検知）
  try {
    await extractPublicKeyB64(result.privateKey);
  } catch (e) {
    console.log('[restoreIdentityKeyV2] restored key is invalid', e);
    return { isOK: false, message: 'backup-error' };
  }
  await saveIdentityPrivateKey(uid, result.privateKey);
  // e3kit側にも書き戻す（eThree未初期化・失敗でも復元自体は成功扱い。旧groupを開く時に効く）
  await e3kit.importLocalIdentityKey(uid, result.privateKey);
  await markMigrated(uid);
  return { isOK: true, message: '' };
};

/**
 * 新規ユーザーの登録（V2）。
 * 移行期間中は e3kit.registEncrypt で Card発行+keyknoxバックアップも同一PINで併行作成し、
 * 旧バージョンのアプリとの相互運用（このユーザー宛の共有・旧アプリでの復元）を保つ。
 */
export const registerIdentityV2 = async (uid: string, pin: string): Promise<{ isOK: boolean; message: string }> => {
  const registResult = await e3kit.registEncrypt(pin);
  if (!registResult.isOK) {
    return { isOK: false, message: 'regist-failed' };
  }
  return migrateIdentityKey(uid, pin);
};
