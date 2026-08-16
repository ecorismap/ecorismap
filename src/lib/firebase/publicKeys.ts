import { collection, doc, firestore, getDoc, getDocs, setDoc, Timestamp, writeBatch } from './firebase';
import { PublicKeyFS, PublicKeyHistoryFS } from '../../types';

/**
 * 公開鍵台帳（publicKeys/{uid}）の I/O。Virgil Cards（findUsers）の後継。
 * - 読み取りは Promise キャッシュで並列呼び出しを1回に集約（e3kit.ts の findUsersWithCache と同パターン）
 * - 書き込み（publish）は本人のみ（Rules で強制）。鍵が変わる場合は旧世代を history へ退避して keyVersion を上げる
 */

export type LedgerPublicKey = {
  publicKey: string;
  keyVersion: number;
  createdAt: Timestamp;
};

// 台帳読み取りのPromiseキャッシュ（ログアウト時に clearPublicKeyLedgerCache を呼ぶこと）
const ledgerCache = new Map<string, Promise<LedgerPublicKey | undefined>>();

export const clearPublicKeyLedgerCache = () => {
  ledgerCache.clear();
};

const fetchPublicKey = async (uid: string): Promise<LedgerPublicKey | undefined> => {
  const snapshot = await getDoc(doc(firestore, 'publicKeys', uid));
  if (!snapshot.exists()) return undefined;
  const data = snapshot.data() as PublicKeyFS;
  return { publicKey: data.publicKey, keyVersion: data.keyVersion, createdAt: data.createdAt };
};

/** 台帳から現行の公開鍵を取得する。未登録なら undefined。 */
export const getPublicKeyFromLedger = async (uid: string): Promise<LedgerPublicKey | undefined> => {
  const cached = ledgerCache.get(uid);
  if (cached) return cached;
  const promise = fetchPublicKey(uid).catch((e) => {
    // 失敗はキャッシュに残さない（次回の呼び出しで再試行できるように）
    ledgerCache.delete(uid);
    throw e;
  });
  ledgerCache.set(uid, promise);
  return promise;
};

/**
 * 旧世代の公開鍵を新しい順で取得する（署名検証フォールバック用・ローテーションは稀なのでキャッシュしない）。
 */
export const getPublicKeyHistoryFromLedger = async (uid: string): Promise<string[]> => {
  try {
    const snapshot = await getDocs(collection(firestore, 'publicKeys', uid, 'history'));
    const entries = snapshot.docs.map((d) => d.data() as PublicKeyHistoryFS);
    entries.sort((a, b) => b.keyVersion - a.keyVersion);
    return entries.map((entry) => entry.publicKey);
  } catch (e) {
    console.log('[getPublicKeyHistoryFromLedger] error', e);
    return [];
  }
};

/**
 * 自分の公開鍵を台帳へ登録する（本人のみ・冪等）。
 * - 未登録: keyVersion=1 で作成
 * - 登録済みで同一鍵: 何もしない
 * - 登録済みで別鍵（ローテーション）: 旧世代を history/{旧keyVersion} へ退避して keyVersion+1 で上書き
 * @returns keyVersion=登録後の世代（PINバックアップの keyVersion に使う）
 */
export const publishPublicKeyToLedger = async (
  uid: string,
  publicKeyB64: string,
  card?: string
): Promise<{ isOK: boolean; message: string; keyVersion?: number }> => {
  try {
    const ref = doc(firestore, 'publicKeys', uid);
    const snapshot = await getDoc(ref);
    const now = Timestamp.now();

    if (!snapshot.exists()) {
      const entry: PublicKeyFS = {
        publicKey: publicKeyB64,
        keyVersion: 1,
        ...(card !== undefined ? { card } : {}),
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(ref, entry);
      ledgerCache.delete(uid);
      return { isOK: true, message: '', keyVersion: 1 };
    }

    const current = snapshot.data() as PublicKeyFS;
    if (current.publicKey === publicKeyB64) {
      return { isOK: true, message: '', keyVersion: current.keyVersion };
    }

    // 鍵ローテーション: 旧世代を退避してから上書き（同一バッチで原子的に）
    const batch = writeBatch(firestore);
    const historyEntry: PublicKeyHistoryFS = {
      publicKey: current.publicKey,
      keyVersion: current.keyVersion,
      createdAt: current.createdAt,
      rotatedAt: now,
    };
    batch.set(doc(firestore, 'publicKeys', uid, 'history', String(current.keyVersion)), historyEntry);
    const entry: PublicKeyFS = {
      publicKey: publicKeyB64,
      keyVersion: current.keyVersion + 1,
      ...(card !== undefined ? { card } : {}),
      createdAt: now,
      updatedAt: now,
    };
    batch.set(ref, entry);
    await batch.commit();
    ledgerCache.delete(uid);
    return { isOK: true, message: '', keyVersion: entry.keyVersion };
  } catch (e) {
    console.log('[publishPublicKeyToLedger] error', e);
    return { isOK: false, message: 'failPublishPublicKey' };
  }
};
