import Dexie from 'dexie';

// ============================================================================
// Web用 redux-persist ストレージアダプタ（IndexedDB / セッションスコープ維持）
//
// 従来のsessionStorageは約5MB制限があり、大きなdataSetでQuotaExceededになる。
// IndexedDBに移しつつ、現行の「タブを閉じたらデータが消える」セマンティクス
// （Firebase AuthのbrowserSessionPersistenceと寿命一致＝共有PCで復号済みデータが
// 残らない安全弁）を維持するため、以下の方式を採る:
//
// - sessionStorageにタブID（タブ寿命）を保持し、タブごとに独立したDBを使う。
//   リロード=同タブID=復元 / 新タブ・タブ閉じ後=新タブID=空 / 2タブ同時=別DBで干渉なし。
//   （「起動時に共有DBをクリア」方式は2タブ目の起動が1タブ目のデータを消すため不採用）
// - タブ複製はsessionStorageごとコピーされタブIDが重複するため、Web Locksで
//   自タブIDのロックが取れない場合は複製と判定し、新IDを発行して旧DB内容を引き継ぐ。
// - 閉じたタブのDB（孤児）は、各タブが保持するWeb Locks（クローズ/クラッシュで
//   自動解放）を起動時に照会して削除する。
// ============================================================================

const TAB_ID_KEY = 'ecorismap-redux-tab-id';
const DB_PREFIX = 'ecorismapReduxPersist-';
const LOCK_PREFIX = 'ecorismap-redux-tab-';
const LEGACY_ROOT_KEY = 'persist:root';

type KVRecord = { key: string; value: string };

class ReduxPersistDatabase extends Dexie {
  keyvalue!: Dexie.Table<KVRecord, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ keyvalue: 'key' });
  }
}

const generateTabId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

/**
 * 孤児DB（生存タブが保持していないDB）を選別する純関数。
 * pendingのロックも生存扱いにして、起動処理中のタブのDBを誤削除しない。
 */
export const selectOrphanDatabases = (
  dbNames: string[],
  aliveTabIds: Set<string>,
  currentTabId: string
): string[] =>
  dbNames
    .filter((name) => name.startsWith(DB_PREFIX))
    .filter((name) => {
      const tabId = name.slice(DB_PREFIX.length);
      return tabId !== currentTabId && !aliveTabIds.has(tabId);
    });

/**
 * 自タブIDのロックを取得し、タブが生きている間保持し続ける。
 * 戻り値: true=取得成功（このタブIDの正当な所有者）/ false=既に他タブが保持（＝タブ複製）。
 * Web Locks非対応環境ではtrue（複製判定・GCは諦めるが動作は継続）。
 */
const acquireTabLock = (tabId: string): Promise<boolean> =>
  new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('locks' in navigator)) {
      resolve(true);
      return;
    }
    navigator.locks
      .request(LOCK_PREFIX + tabId, { ifAvailable: true }, async (lock) => {
        if (lock === null) {
          resolve(false);
          return;
        }
        resolve(true);
        // このPromiseを解決しないことでタブの寿命までロックを保持する
        // （タブを閉じる/クラッシュでブラウザが自動解放する）
        await new Promise(() => undefined);
      })
      .catch(() => resolve(true));
  });

const collectOrphanDatabases = async (currentTabId: string): Promise<void> => {
  try {
    if (typeof navigator === 'undefined' || !('locks' in navigator) || typeof navigator.locks.query !== 'function') {
      return;
    }
    const dbNames = await Dexie.getDatabaseNames();
    const { held = [], pending = [] } = await navigator.locks.query();
    const aliveTabIds = new Set(
      [...held, ...pending]
        .map((lock) => lock.name ?? '')
        .filter((name) => name.startsWith(LOCK_PREFIX))
        .map((name) => name.slice(LOCK_PREFIX.length))
    );
    for (const dbName of selectOrphanDatabases(dbNames, aliveTabIds, currentTabId)) {
      await Dexie.delete(dbName);
    }
  } catch (e) {
    console.log('[reduxPersistWebStorage] GC error:', e);
  }
};

const init = async (): Promise<ReduxPersistDatabase> => {
  let tabId = sessionStorage.getItem(TAB_ID_KEY);
  let duplicatedFromDbName: string | null = null;

  if (tabId !== null) {
    const acquired = await acquireTabLock(tabId);
    if (!acquired) {
      // タブ複製: 同じタブIDのタブが既に生存 → 新IDを発行し、元タブのデータを引き継ぐ
      // （sessionStorageが複製される現行挙動の再現）
      duplicatedFromDbName = DB_PREFIX + tabId;
      tabId = null;
    }
  }
  if (tabId === null) {
    tabId = generateTabId();
    sessionStorage.setItem(TAB_ID_KEY, tabId);
    await acquireTabLock(tabId);
  }

  const db = new ReduxPersistDatabase(DB_PREFIX + tabId);
  await db.open();

  if (duplicatedFromDbName !== null) {
    try {
      const sourceDb = new ReduxPersistDatabase(duplicatedFromDbName);
      await sourceDb.open();
      const records = await sourceDb.keyvalue.toArray();
      if (records.length > 0) {
        await db.keyvalue.bulkPut(records);
      }
      sourceDb.close();
    } catch (e) {
      console.log('[reduxPersistWebStorage] duplicate copy error:', e);
    }
  }

  // 旧sessionStorage方式からの移行（リロードをまたいで新版が配信されたケースのみ。
  // タブを閉じていた既存ユーザーはsessionStorageが空なので対象外＝現行仕様どおり）
  try {
    const legacyValue = sessionStorage.getItem(LEGACY_ROOT_KEY);
    if (legacyValue !== null) {
      await db.keyvalue.put({ key: LEGACY_ROOT_KEY, value: legacyValue });
      sessionStorage.removeItem(LEGACY_ROOT_KEY);
    }
  } catch (e) {
    console.log('[reduxPersistWebStorage] legacy migration error:', e);
  }

  // 孤児DBの削除は起動をブロックしない
  void collectOrphanDatabases(tabId);

  return db;
};

// 遅延初期化: モジュールimportの副作用を避ける（テスト環境・ブラウザAPI不在時の安全性）
let dbReadyPromise: Promise<ReduxPersistDatabase> | null = null;
const getDb = (): Promise<ReduxPersistDatabase> => {
  if (dbReadyPromise === null) {
    dbReadyPromise = init();
  }
  return dbReadyPromise;
};

// redux-persistのStorageインターフェース
export const reduxPersistWebStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const db = await getDb();
    const record = await db.keyvalue.get(key);
    return record?.value ?? null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    const db = await getDb();
    await db.keyvalue.put({ key, value });
  },
  removeItem: async (key: string): Promise<void> => {
    const db = await getDb();
    await db.keyvalue.delete(key);
  },
};
