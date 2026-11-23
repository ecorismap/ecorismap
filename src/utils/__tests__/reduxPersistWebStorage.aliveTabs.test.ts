// readTileMapIdsFromAliveTabs の本体（ロック名→DB名の対応、自タブと他タブの読み分け、読めないときに消させない）を
// 確かめる。fake-indexeddb は入っていないので、Dexie をメモリ上の表に置き換える（永続化監査 S-H1）

type MockRecord = { key: string; value: string };

const mockDatabases = new Map<string, Map<string, MockRecord>>();

jest.mock('dexie', () => {
  class MockDexie {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    static getDatabaseNames = async () => Array.from(mockDatabases.keys());
    static delete = async (name: string) => {
      mockDatabases.delete(name);
    };
    version() {
      return {
        stores: () => {
          const tableName = 'keyvalue';
          const getRows = () => {
            let rows = mockDatabases.get(this.name);
            if (rows === undefined) {
              rows = new Map();
              mockDatabases.set(this.name, rows);
            }
            return rows;
          };
          (this as unknown as Record<string, unknown>)[tableName] = {
            get: async (key: string) => getRows().get(key),
            put: async (record: MockRecord) => {
              getRows().set(record.key, record);
            },
            bulkPut: async (records: MockRecord[]) => records.forEach((r) => getRows().set(r.key, r)),
            toArray: async () => Array.from(getRows().values()),
            delete: async (key: string) => {
              getRows().delete(key);
            },
          };
        },
      };
    }
    async open() {
      if (!mockDatabases.has(this.name)) mockDatabases.set(this.name, new Map());
    }
    close() {
      return undefined;
    }
  }
  return { __esModule: true, default: MockDexie };
});

const DB_PREFIX = 'ecorismapReduxPersist-';
const LOCK_PREFIX = 'ecorismap-redux-tab-';

const persistedRoot = (ids: string[]) =>
  JSON.stringify({ tileMaps: JSON.stringify(ids.map((id) => ({ id }))), _persist: '{}' });

const putRoot = (tabId: string, value: string) => {
  mockDatabases.set(DB_PREFIX + tabId, new Map([['persist:root', { key: 'persist:root', value }]]));
};

const setLocks = (held: string[], pending: string[] = []) => {
  const locks = {
    // 自タブのロックは取れたものとして、タブの寿命まで保持する（解決しない）
    request: (_name: string, _opts: unknown, callback: (lock: { name: string } | null) => Promise<void>) =>
      callback({ name: _name }),
    query: async () => ({
      held: held.map((tabId) => ({ name: LOCK_PREFIX + tabId })),
      pending: pending.map((tabId) => ({ name: LOCK_PREFIX + tabId })),
    }),
  };
  Object.defineProperty(global, 'navigator', { value: { locks }, configurable: true, writable: true });
};

const loadModule = () => {
  let mod: typeof import('../reduxPersistWebStorage') | undefined;
  jest.isolateModules(() => {
    mod = jest.requireActual('../reduxPersistWebStorage');
  });
  if (mod === undefined) throw new Error('module not loaded');
  return mod;
};

const originalNavigator = global.navigator;

beforeEach(() => {
  mockDatabases.clear();
  const session = new Map<string, string>([['ecorismap-redux-tab-id', 'own']]);
  Object.defineProperty(global, 'sessionStorage', {
    value: {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => session.set(key, value),
      removeItem: (key: string) => session.delete(key),
    },
    configurable: true,
    writable: true,
  });
});

afterAll(() => {
  Object.defineProperty(global, 'navigator', { value: originalNavigator, configurable: true, writable: true });
});

describe('readTileMapIdsFromAliveTabs（永続化監査 S-H1）', () => {
  it('自タブと生きている他タブ（保持・待機中）の地図一覧を集め、閉じたタブの分は含めない', async () => {
    putRoot('own', persistedRoot(['a']));
    putRoot('other', persistedRoot(['b']));
    putRoot('starting', persistedRoot(['c']));
    putRoot('dead', persistedRoot(['z']));
    setLocks(['own', 'other'], ['starting']);
    const { readTileMapIdsFromAliveTabs } = loadModule();
    const ids = await readTileMapIdsFromAliveTabs();
    expect(ids).toEqual(new Set(['a', 'b', 'c']));
  });

  it('生きているがまだDBを作っていないタブは飛ばす', async () => {
    putRoot('own', persistedRoot(['a']));
    setLocks(['own', 'fresh']);
    const { readTileMapIdsFromAliveTabs } = loadModule();
    expect(await readTileMapIdsFromAliveTabs()).toEqual(new Set(['a']));
  });

  it('他タブの保存値が読めないときは undefined（何も消させない）', async () => {
    putRoot('own', persistedRoot(['a']));
    putRoot('other', '{broken');
    setLocks(['own', 'other']);
    const { readTileMapIdsFromAliveTabs } = loadModule();
    expect(await readTileMapIdsFromAliveTabs()).toBeUndefined();
  });

  it('Web Locks が無いときは undefined', async () => {
    putRoot('own', persistedRoot(['a']));
    Object.defineProperty(global, 'navigator', { value: {}, configurable: true, writable: true });
    const { readTileMapIdsFromAliveTabs } = loadModule();
    expect(await readTileMapIdsFromAliveTabs()).toBeUndefined();
  });
});
