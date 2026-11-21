import AsyncStorage from '@react-native-async-storage/async-storage';
import * as e3kit from '../virgilsecurity/e3kit';
import {
  fetchPublicKeyHistoryFromLedger,
  getPublicKeyFromLedger,
  LedgerPublicKey,
  publishPublicKeyToLedger,
} from '../firebase/publicKeys';
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
 * ただしローカル鍵は毎回台帳の現行鍵と照合する（他端末での鍵リセットや、
 * 古いバックアップからの復元で「古い鍵のまま移行済み」に固定されるのを防ぐため）。
 */

const MIGRATED_MARKER_PREFIX = 'keyMigrated:';
// KMSバックアップの keyVersion が台帳と一致すると確認できた台帳世代。
// マーカーだけではバックアップの世代ずれ（publish後にバックアップだけ失敗等）を検知できないため、
// 台帳世代が変わるたびに一度だけサーバーへ照会し直す。
const BACKUP_VERIFIED_PREFIX = 'keyBackupVerified:';
// 鍵リセット開始〜新鍵の台帳publish+KMSバックアップ完了までの間だけ立てる。
// 中断後の再起動で、旧鍵のPIN復元へ黙って戻らず、必ず新鍵のバックアップをやり直させるため。
const RESET_PENDING_PREFIX = 'keyResetPending:';

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
    await AsyncStorage.removeItem(`${BACKUP_VERIFIED_PREFIX}${uid}`);
  } catch (e) {
    console.log('[clearMigratedMarker] error', e);
  }
};

const getVerifiedBackupKeyVersion = async (uid: string): Promise<number | undefined> => {
  try {
    const value = await AsyncStorage.getItem(`${BACKUP_VERIFIED_PREFIX}${uid}`);
    if (value === null) return undefined;
    const keyVersion = Number(value);
    return Number.isInteger(keyVersion) ? keyVersion : undefined;
  } catch (e) {
    return undefined;
  }
};

const markBackupVerified = async (uid: string, keyVersion: number): Promise<void> => {
  try {
    await AsyncStorage.setItem(`${BACKUP_VERIFIED_PREFIX}${uid}`, String(keyVersion));
  } catch (e) {
    console.log('[markBackupVerified] error', e);
  }
};

export const isKeyResetPending = async (uid: string): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(`${RESET_PENDING_PREFIX}${uid}`)) === 'true';
  } catch (e) {
    return false;
  }
};

/** 鍵リセットの直前に呼ぶ（リセット中断後も新鍵のバックアップをやり直させるため、リセットより先に立てる）。 */
export const markKeyResetPending = async (uid: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(`${RESET_PENDING_PREFIX}${uid}`, 'true');
  } catch (e) {
    console.log('[markKeyResetPending] error', e);
  }
};

export const clearKeyResetPending = async (uid: string): Promise<void> => {
  try {
    await AsyncStorage.removeItem(`${RESET_PENDING_PREFIX}${uid}`);
  } catch (e) {
    console.log('[clearKeyResetPending] error', e);
  }
};

export type KeyMigrationState =
  | { state: 'migrated' }
  | {
      state: 'migrated-need-restore';
      lockedUntil?: number | null;
      /** stale-local-key: 端末の鍵が台帳の現行鍵と違う（他端末で鍵リセット済み等） */
      reason?: 'stale-local-key';
    }
  | {
      state: 'needs-backup';
      /**
       * reset-pending: 鍵リセット後のバックアップが未完了（この端末の新鍵を台帳+KMSへ載せる必要がある）
       * backup-stale: 端末の鍵は台帳と一致するが、KMSバックアップが古い世代のまま
       */
      reason: 'reset-pending' | 'backup-stale';
    }
  | { state: 'needs-migration' }
  | { state: 'error'; message: string };

type LedgerComparison =
  | { result: 'match'; keyVersion: number }
  | { result: 'mismatch'; ledger: LedgerPublicKey }
  | { result: 'no-ledger' }
  // 台帳を取得できない（オフライン等）。照合できないときは従来どおりの判定に任せ、次回に再照合する
  | { result: 'unknown' };

const compareWithLedger = async (uid: string, publicKeyB64: string): Promise<LedgerComparison> => {
  let ledger: LedgerPublicKey | undefined;
  try {
    ledger = await getPublicKeyFromLedger(uid);
  } catch (e) {
    console.log('[compareWithLedger] ledger error', e);
    return { result: 'unknown' };
  }
  if (ledger === undefined) return { result: 'no-ledger' };
  return ledger.publicKey === publicKeyB64
    ? { result: 'match', keyVersion: ledger.keyVersion }
    : { result: 'mismatch', ledger };
};

const comparePrivateKeyWithLedger = async (uid: string, privateKeyB64: string): Promise<LedgerComparison> => {
  let publicKey: string;
  try {
    publicKey = await extractPublicKeyB64(privateKeyB64);
  } catch (e) {
    console.log('[comparePrivateKeyWithLedger] invalid key', e);
    return { result: 'unknown' };
  }
  return compareWithLedger(uid, publicKey);
};

/**
 * 端末に残っていた鍵が台帳の現行公開鍵と一致するか検証する。
 * 過去に鍵リセットをしたユーザーの端末にはローテーション前の古い鍵が残っていることがあり、
 * 検証なしで採用すると復号が静かに全滅するため、採用（コピー）前に必ず確認する。
 */
export const isKeyConsistentWithLedger = async (uid: string, privateKeyB64: string): Promise<boolean> => {
  return (await comparePrivateKeyWithLedger(uid, privateKeyB64)).result === 'match';
};

/**
 * 台帳の現行 keyVersion を返す。未登録・取得失敗は undefined。
 * PIN変更で、KMSバックアップが台帳より新しい世代（他端末で鍵リセットの途中）かを確かめるために使う。
 */
export const getLedgerKeyVersion = async (uid: string): Promise<number | undefined> => {
  try {
    return (await getPublicKeyFromLedger(uid))?.keyVersion;
  } catch (e) {
    console.log('[getLedgerKeyVersion] ledger error', e);
    return undefined;
  }
};

/**
 * 端末にある識別鍵のうち台帳の現行鍵と一致するものと、その keyVersion を返す。
 * PIN変更の再バックアップで、KMSにある（古いかもしれない）鍵ではなく現行鍵を包み直すために使う。
 * 一致する鍵が無い・台帳を取得できない場合は undefined。
 */
export const findLocalKeyMatchingLedger = async (
  uid: string
): Promise<{ privateKey: string; keyVersion: number } | undefined> => {
  const stored = await loadIdentityPrivateKey(uid);
  if (stored !== undefined) {
    const match = await comparePrivateKeyWithLedger(uid, stored);
    if (match.result === 'match') return { privateKey: stored, keyVersion: match.keyVersion };
  }
  const exported = await e3kit.exportLocalIdentityKey(uid);
  if (exported !== undefined) {
    const match = await compareWithLedger(uid, exported.publicKey);
    if (match.result === 'match') return { privateKey: exported.privateKey, keyVersion: match.keyVersion };
  }
  return undefined;
};

/**
 * 鍵リセットが中断されたままかを判定する。
 * @returns 中断中なら needs-backup。リセットが実は完了していた・新鍵が失われていた場合は
 *          マーカーを消して undefined（通常の判定へ進む）
 */
const checkResetPending = async (uid: string): Promise<KeyMigrationState | undefined> => {
  // e3kit未初期化だとローカルの新鍵を確認できない。新鍵が無いと誤判定してマーカーを消すと
  // 旧鍵の復元へ戻ってしまうため、判定できないまま中断中として扱う
  if (!e3kit.isInitialized()) return { state: 'needs-backup', reason: 'reset-pending' };
  const exported = await e3kit.exportLocalIdentityKey(uid);
  if (exported === undefined) {
    // 新鍵が端末から失われた（明示ログアウト等）。台帳・KMSに残る旧鍵で続けるしかない
    await clearKeyResetPending(uid);
    return undefined;
  }
  const match = await compareWithLedger(uid, exported.publicKey);
  if (match.result === 'match') {
    const statusResult = await getKeyBackupStatus();
    if (statusResult.isOK && statusResult.status.exists && statusResult.status.keyVersion === match.keyVersion) {
      // 台帳publish・KMSバックアップとも済んでいた（マーカー消去の前に中断した）
      await clearKeyResetPending(uid);
      return undefined;
    }
  }
  return { state: 'needs-backup', reason: 'reset-pending' };
};

/**
 * 移行状態を判定する。
 * - migrated: 移行済みでローカル鍵もある（何もしなくてよい）
 * - migrated-need-restore: 他端末で移行済みだがこの端末に（現行の）鍵がない（新PINで復元が必要）
 * - needs-backup: この端末の鍵をKMSへバックアップし直す必要がある（reason参照）
 * - needs-migration: 未移行（移行フォームへ）
 */
export const getKeyMigrationState = async (uid: string): Promise<KeyMigrationState> => {
  if (await isKeyResetPending(uid)) {
    const pending = await checkResetPending(uid);
    if (pending !== undefined) return pending;
  }

  // ローカルマーカーがあり、鍵が台帳と一致し、バックアップ世代も確認済みならサーバー照会を省略
  let markedWithLocalKey = false;
  if (await isMarkedMigrated(uid)) {
    const localKey = await loadIdentityPrivateKey(uid);
    if (localKey !== undefined) {
      markedWithLocalKey = true;
      const match = await comparePrivateKeyWithLedger(uid, localKey);
      if (match.result === 'mismatch') return { state: 'migrated-need-restore', reason: 'stale-local-key' };
      if (match.result !== 'match') return { state: 'migrated' };
      if ((await getVerifiedBackupKeyVersion(uid)) === match.keyVersion) return { state: 'migrated' };
      // 台帳とは一致するが、この台帳世代でのKMSバックアップは未確認 → サーバー照会へ
    }
    // マーカーはあるが鍵がない（キーチェーン消去等）→ サーバー照会からやり直す
  }
  const statusResult = await getKeyBackupStatus();
  if (!statusResult.isOK) {
    // 鍵は手元にあり台帳とも矛盾しないので、オフライン等で締め出さない（世代確認は次回）
    if (markedWithLocalKey) return { state: 'migrated' };
    return { state: 'error', message: statusResult.message };
  }
  const { status } = statusResult;
  if (!status.exists) {
    return { state: 'needs-migration' };
  }

  // 台帳とは一致する鍵を採用したうえで、KMSバックアップの世代を確かめる。
  // バックアップが台帳より古い世代＝別端末で復元すると古い鍵が戻るので、再バックアップを促す。
  // 新しい世代は別端末が鍵の更新途中（バックアップ済み・publish前）の可能性があり、
  // ここで上書きさせると相手の新鍵のバックアップを消してしまうため何もしない
  const adopt = async (keyVersion: number): Promise<KeyMigrationState> => {
    await markMigrated(uid);
    if (status.keyVersion !== undefined && status.keyVersion < keyVersion) {
      return { state: 'needs-backup', reason: 'backup-stale' };
    }
    if (status.keyVersion === keyVersion) await markBackupVerified(uid, keyVersion);
    return { state: 'migrated' };
  };

  // サーバーには移行済み
  const localKey = await loadIdentityPrivateKey(uid);
  if (localKey !== undefined) {
    const match = await comparePrivateKeyWithLedger(uid, localKey);
    if (match.result === 'match') return adopt(match.keyVersion);
    if (match.result === 'mismatch') {
      return { state: 'migrated-need-restore', lockedUntil: status.lockedUntil, reason: 'stale-local-key' };
    }
    // 照合できない（台帳なし・取得失敗）ときは従来どおり端末の鍵で続ける
    await markMigrated(uid);
    return { state: 'migrated' };
  }
  // e3kit側にローカル鍵が残っていて台帳の現行鍵と一致すれば、新ストレージへコピーして完了
  //（古い鍵の可能性があるため必ず整合検証する。isKeyConsistentWithLedger参照）
  const exported = await e3kit.exportLocalIdentityKey(uid);
  if (exported !== undefined) {
    const match = await compareWithLedger(uid, exported.publicKey);
    if (match.result === 'match') {
      await saveIdentityPrivateKey(uid, exported.privateKey);
      return adopt(match.keyVersion);
    }
  }
  return { state: 'migrated-need-restore', lockedUntil: status.lockedUntil };
};

type KeyToPublish =
  | { isOK: true; privateKey: string; publicKey: string; ledger: LedgerPublicKey | undefined }
  | { isOK: false; message: string };

/**
 * 台帳+KMSへ載せる鍵を選ぶ。
 * - 鍵リセット中: e3kit の新鍵（新ストレージには旧鍵が残っている可能性があるため使わない）
 * - それ以外: 台帳と一致する鍵を優先し、無ければ e3kit の鍵（初回移行・旧版アプリでのリセット後）。
 *   e3kit の鍵が台帳の旧世代なら、台帳を古い鍵へ巻き戻さないよう拒否する
 */
const resolveKeyToPublish = async (uid: string): Promise<KeyToPublish> => {
  const resetPending = await isKeyResetPending(uid);
  const exported = await e3kit.exportLocalIdentityKey(uid);
  // リセット中に新鍵が見えないまま進むと旧鍵を再バックアップしてリセットを黙って取り消すため、ここで止める
  if (resetPending && exported === undefined) {
    return { isOK: false, message: 'migrate-no-local-key' };
  }
  const stored = resetPending ? undefined : await loadIdentityPrivateKey(uid);
  if (exported === undefined && stored === undefined) {
    return { isOK: false, message: 'migrate-no-local-key' };
  }
  // keyVersion を先に決めてからバックアップするため、台帳が読めないと進めない
  let ledger: LedgerPublicKey | undefined;
  try {
    ledger = await getPublicKeyFromLedger(uid);
  } catch (e) {
    console.log('[resolveKeyToPublish] ledger error', e);
    return { isOK: false, message: 'failPublishPublicKey' };
  }
  if (resetPending && exported !== undefined) {
    return { isOK: true, privateKey: exported.privateKey, publicKey: exported.publicKey, ledger };
  }
  let storedPublicKey: string | undefined;
  if (stored !== undefined) {
    try {
      storedPublicKey = await extractPublicKeyB64(stored);
    } catch (e) {
      console.log('[resolveKeyToPublish] stored key is invalid', e);
    }
  }
  if (stored !== undefined && storedPublicKey !== undefined && storedPublicKey === ledger?.publicKey) {
    return { isOK: true, privateKey: stored, publicKey: storedPublicKey, ledger };
  }
  if (exported !== undefined) {
    if (ledger !== undefined && exported.publicKey !== ledger.publicKey) {
      // 履歴を読めないまま「旧世代ではない」とみなすと台帳を古い鍵へ巻き戻しうるため、取得失敗なら中断する
      const historyResult = await fetchPublicKeyHistoryFromLedger(uid);
      if (!historyResult.isOK) {
        return { isOK: false, message: 'failPublishPublicKey' };
      }
      if (historyResult.history.includes(exported.publicKey)) {
        return { isOK: false, message: 'migrate-stale-local-key' };
      }
    }
    return { isOK: true, privateKey: exported.privateKey, publicKey: exported.publicKey, ledger };
  }
  if (stored !== undefined && storedPublicKey !== undefined && ledger === undefined) {
    return { isOK: true, privateKey: stored, publicKey: storedPublicKey, ledger };
  }
  return { isOK: false, message: 'migrate-stale-local-key' };
};

/**
 * 未移行ユーザーの移行本体。端末にある既存の識別鍵をそのまま新方式へ載せ替える。
 * 鍵リセット後の再同期・古くなったKMSバックアップの作り直しにも使う（鍵の選び方は resolveKeyToPublish）。
 * 前提: e3kit が初期化済みでローカル鍵がある（initializeEncript の分岐で保証）。
 * @param newPin KMSバックアップに使うPIN（原則これまでと同じPIN。バリデーションは呼び出し側）
 */
export const migrateIdentityKey = async (uid: string, newPin: string): Promise<{ isOK: boolean; message: string }> => {
  // 1. 載せる鍵と台帳の現状
  const source = await resolveKeyToPublish(uid);
  if (!source.isOK) {
    return { isOK: false, message: source.message };
  }
  const { privateKey, publicKey, ledger } = source;
  const expectedKeyVersion =
    ledger === undefined ? 1 : ledger.publicKey === publicKey ? ledger.keyVersion : ledger.keyVersion + 1;

  // 2. KMS方式のPINバックアップを先に作る。台帳を先に更新すると、バックアップだけ失敗したときに
  //    「台帳=新鍵・KMS=旧鍵」となり、別端末の復元で旧鍵が戻ってしまうため
  const backupResult = await createKeyBackup(newPin, privateKey, expectedKeyVersion);
  if (!backupResult.isOK) {
    return { isOK: false, message: backupResult.message };
  }

  // 3. 台帳へ公開鍵をpublish（シーディング済みなら鍵一致で冪等。カードは監査用）
  const card = await e3kit.exportOwnCard(uid);
  const publishResult = await publishPublicKeyToLedger(uid, publicKey, card);
  if (!publishResult.isOK || publishResult.keyVersion === undefined) {
    return { isOK: false, message: publishResult.message };
  }
  if (publishResult.keyVersion !== expectedKeyVersion) {
    // 予測と違う世代になった（別端末が同時に台帳を更新した等）。バックアップの世代を台帳に合わせる
    const retryResult = await createKeyBackup(newPin, privateKey, publishResult.keyVersion);
    if (!retryResult.isOK) {
      return { isOK: false, message: retryResult.message };
    }
  }

  // 4. 新ローカルストレージへ保存してマーカー
  await saveIdentityPrivateKey(uid, privateKey);
  await markMigrated(uid);
  await markBackupVerified(uid, publishResult.keyVersion);
  await clearKeyResetPending(uid);
  return { isOK: true, message: '' };
};

/**
 * KMSバックアップが台帳より1世代新しい（鍵リセット・移行で KMS へ commit した後、台帳 publish の前に
 * 中断した）場合に、復元した鍵を台帳へ publish して中断した更新を完了させる。
 * 台帳が未登録のときは keyVersion=1 の作成、登録済みなら旧世代を history へ退避して +1 する。
 */
const completeInterruptedPublish = async (
  uid: string,
  publicKey: string,
  backupKeyVersion: number,
  ledger: LedgerPublicKey | undefined
): Promise<{ isOK: true; keyVersion: number } | { isOK: false; message: string }> => {
  const expected = ledger === undefined ? 1 : ledger.keyVersion + 1;
  if (backupKeyVersion !== expected) return { isOK: false, message: 'backup-stale' };
  if (ledger !== undefined) {
    // 退避済みの旧世代の鍵なら「新しい世代」ではない。台帳を巻き戻さないよう拒否し、
    // 履歴を読めないときも同じ理由で publish しない（再試行させる）
    const historyResult = await fetchPublicKeyHistoryFromLedger(uid);
    if (!historyResult.isOK) return { isOK: false, message: 'backup-ledger-publish-failed' };
    if (historyResult.history.includes(publicKey)) return { isOK: false, message: 'backup-stale' };
  }
  // card は監査用。復元端末のカードキャッシュは新鍵と対応する保証が無いため付けない。
  // 世代を指定して、台帳キャッシュが古くても KMS と違う世代へはローテーションさせない
  const publishResult = await publishPublicKeyToLedger(uid, publicKey, undefined, backupKeyVersion);
  if (!publishResult.isOK || publishResult.keyVersion === undefined) {
    // ledger-version-conflict=並行して別の端末が台帳を更新した。復元した鍵は現行ではないので保存しない
    return {
      isOK: false,
      message: publishResult.message === 'ledger-version-conflict' ? 'backup-stale' : 'backup-ledger-publish-failed',
    };
  }
  return { isOK: true, keyVersion: publishResult.keyVersion };
};

/**
 * 移行済みユーザーの新PINによる復元（新しい端末）。
 * 復元後、e3kit のローカルストレージにも書き戻して旧グループ暗号の dual-read を有効にする。
 * 復元した鍵が台帳の現行鍵と違うとき:
 * - バックアップが台帳より古い: 保存もマーカーも立てずに message='backup-stale'
 *   （古い鍵で「移行済み」に固定されるのを防ぐ）
 * - バックアップが台帳より1世代新しい（publish前に中断）: 台帳へ publish して完了させる
 *   （publish できなければ message='backup-ledger-publish-failed' で再試行させる）
 */
export const restoreIdentityKeyV2 = async (
  uid: string,
  pin: string
): Promise<{ isOK: boolean; message: string; lockedUntil?: number }> => {
  const result = await restoreKeyBackup(pin);
  if (!result.isOK) {
    return { isOK: false, message: result.message, lockedUntil: result.lockedUntil };
  }
  // 台帳の公開鍵と復元した秘密鍵の整合を確認（blobとledgerの取り違え・破損・古いバックアップの検知）
  let publicKey: string;
  try {
    publicKey = await extractPublicKeyB64(result.privateKey);
  } catch (e) {
    console.log('[restoreIdentityKeyV2] restored key is invalid', e);
    return { isOK: false, message: 'backup-error' };
  }
  const match = await compareWithLedger(uid, publicKey);
  let verifiedKeyVersion: number | undefined =
    match.result === 'match' && result.keyVersion === match.keyVersion ? match.keyVersion : undefined;
  if (match.result === 'mismatch') {
    console.log(
      '[restoreIdentityKeyV2] restored key does not match ledger',
      result.keyVersion,
      match.ledger.keyVersion
    );
    if (result.keyVersion <= match.ledger.keyVersion) {
      return { isOK: false, message: 'backup-stale' };
    }
    const completed = await completeInterruptedPublish(uid, publicKey, result.keyVersion, match.ledger);
    if (!completed.isOK) return { isOK: false, message: completed.message };
    verifiedKeyVersion = completed.keyVersion;
  } else if (match.result === 'no-ledger' && result.keyVersion === 1) {
    // 初回移行で KMS へ commit 後、台帳作成の前に中断していた。ベストエフォートで台帳を作る
    //（失敗しても従来どおり復元は成功扱い。台帳が無いと他メンバーからの鍵配布ができないため）
    const completed = await completeInterruptedPublish(uid, publicKey, result.keyVersion, undefined);
    if (completed.isOK) verifiedKeyVersion = completed.keyVersion;
    // 台帳が実は（キャッシュに無いだけで）別の鍵で登録済みだった＝復元した鍵は現行ではない
    else if (completed.message === 'backup-stale') return { isOK: false, message: 'backup-stale' };
  }
  await saveIdentityPrivateKey(uid, result.privateKey);
  // e3kit側にも書き戻す（eThree未初期化・失敗でも復元自体は成功扱い。旧groupを開く時に効く）
  await e3kit.importLocalIdentityKey(uid, result.privateKey);
  await markMigrated(uid);
  // 照合できなかった（オフライン等）・世代がずれている場合は確認済みにせず、次回の判定で再照合する
  if (verifiedKeyVersion !== undefined) {
    await markBackupVerified(uid, verifiedKeyVersion);
  }
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
