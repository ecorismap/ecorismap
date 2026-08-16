/**
 * 識別秘密鍵のローカル保管（Web版）。IndexedDB を使う。
 * e3kit-browser の keyEntryStorage の後継。値は base64 エクスポート済み秘密鍵。
 *
 * XSS 露出面は localStorage と同等だが、サイズ制限がなく同期APIブロッキングもないため
 * IndexedDB を採用する（E2E の脅威モデル上、Web版の鍵保管は「配布JSを信頼する」前提）。
 */

const DB_NAME = 'ecorismap-identity';
const STORE_NAME = 'privateKeys';
const DB_VERSION = 1;

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = operation(tx.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
};

export const saveIdentityPrivateKey = async (uid: string, privateKeyB64: string): Promise<void> => {
  await withStore('readwrite', (store) => store.put(privateKeyB64, uid));
};

export const loadIdentityPrivateKey = async (uid: string): Promise<string | undefined> => {
  try {
    const value = await withStore<string | undefined>('readonly', (store) => store.get(uid));
    return typeof value === 'string' ? value : undefined;
  } catch (e) {
    console.log('[loadIdentityPrivateKey] error', e);
    return undefined;
  }
};

export const deleteIdentityPrivateKey = async (uid: string): Promise<void> => {
  await withStore('readwrite', (store) => store.delete(uid));
};
