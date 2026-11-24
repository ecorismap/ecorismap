const mockEThree = {
  encrypt: jest.fn(),
  cleanup: jest.fn(),
};
const mockInitialize = jest.fn();

jest.mock('@virgilsecurity/e3kit-browser', () => ({ EThree: { initialize: (...args: unknown[]) => mockInitialize(...args) } }));
jest.mock('../e3kit-browser', () => ({ decryptSharedFile: jest.fn(), encryptSharedFile: jest.fn() }));
jest.mock('../../../utils/Zip', () => ({ gzip: jest.fn(), unzip: jest.fn(), gzipFile: jest.fn(), unzipFile: jest.fn() }));
jest.mock('../../firebase/firebase', () => ({ functions: {}, httpsCallable: jest.fn(() => jest.fn()) }));

import { initializeUser, isInitialized, purgeLocalKeys } from '../e3kit.web';

type FakeRequest = { onsuccess?: () => void; onerror?: () => void; onblocked?: () => void; error?: unknown };

describe('e3kit.web purgeLocalKeys / initializeUser', () => {
  const deleted: string[] = [];
  const originalIndexedDB = (global as { indexedDB?: unknown }).indexedDB;

  beforeEach(() => {
    deleted.length = 0;
    (global as { indexedDB?: unknown }).indexedDB = {
      deleteDatabase: (name: string) => {
        deleted.push(name);
        const req: FakeRequest = {};
        // 接続が残っているケースを模して blocked を返しても、処理が止まらないことを確認する
        setTimeout(() => (name.startsWith('level-js-') ? req.onblocked?.() : req.onsuccess?.()), 0);
        return req;
      },
    };
  });

  afterAll(() => {
    (global as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
  });

  test('eThree未初期化ならIndexedDBの鍵ストアとグループストアを削除する', async () => {
    await purgeLocalKeys();
    expect(deleted.sort()).toEqual(['.virgil-local-storage', 'level-js-.virgil-group-storage']);
  });

  test('initializeUserが失敗したらeThreeを残さず、messageは文字列になる', async () => {
    mockInitialize.mockResolvedValueOnce({
      ...mockEThree,
      findUsers: jest.fn().mockRejectedValue(new Error('network down')),
    });
    const res = await initializeUser('me');
    expect(res).toEqual({ isOK: false, message: 'network down' });
    expect(isInitialized()).toBe(false);
  });

  test('初期化済みならcleanupに任せ、IndexedDBは直接消さない', async () => {
    mockInitialize.mockResolvedValueOnce({
      ...mockEThree,
      findUsers: jest.fn().mockResolvedValue({}),
      hasLocalPrivateKey: jest.fn().mockResolvedValue(true),
      restorePrivateKey: jest.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'WrongKeyknoxPasswordError' })),
    });
    expect((await initializeUser('me')).isOK).toBe(true);
    await purgeLocalKeys();
    expect(deleted).toEqual([]);
  });
});
