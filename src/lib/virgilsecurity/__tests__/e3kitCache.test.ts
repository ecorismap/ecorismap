const mockEThree = {
  encrypt: jest.fn(),
  findUsers: jest.fn(),
  hasLocalPrivateKey: jest.fn(),
  restorePrivateKey: jest.fn(),
  getGroup: jest.fn(),
  loadGroup: jest.fn(),
};

jest.mock('@virgilsecurity/e3kit-native', () => ({
  EThree: { initialize: jest.fn(() => Promise.resolve(mockEThree)) },
}));
jest.mock('react-native-virgil-crypto', () => ({ virgilCrypto: {} }));
jest.mock('react-native-keychain', () => ({}));
jest.mock('../../firebase/firebase', () => ({ functions: {}, httpsCallable: jest.fn(), firebaseReady: Promise.resolve() }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/' }));

import { clearPublicKeyCache, decryptFileEThree, encryptFileEThree, initializeUser, loadGroup } from '../e3kit';

describe('e3kit(native) のキャッシュは失敗を保持しない', () => {
  beforeAll(async () => {
    // initializeUser の30秒タイムアウト用タイマーがワーカー終了を妨げないようにする
    jest.useFakeTimers();
    mockEThree.findUsers.mockResolvedValue({ card: 'self' });
    mockEThree.hasLocalPrivateKey.mockResolvedValue(true);
    mockEThree.restorePrivateKey.mockRejectedValue(Object.assign(new Error('wrong'), { name: 'WrongKeyknoxPasswordError' }));
    const res = await initializeUser('me');
    expect(res.isOK).toBe(true);
  });

  afterAll(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  beforeEach(() => {
    clearPublicKeyCache();
    mockEThree.findUsers.mockReset();
    mockEThree.getGroup.mockReset();
    mockEThree.loadGroup.mockReset();
  });

  test('findUsersが一度失敗しても、次の呼び出しで再取得してグループを読める', async () => {
    mockEThree.getGroup.mockResolvedValue(null);
    mockEThree.findUsers.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ card: 'owner' });
    mockEThree.loadGroup.mockResolvedValue({ id: 'g' });

    expect((await loadGroup('g', 'owner')).isOK).toBe(false);
    const second = await loadGroup('g', 'owner');
    expect(second.isOK).toBe(true);
    expect(mockEThree.findUsers).toHaveBeenCalledTimes(2);
  });

  test('group.update()の失敗(isOK:false)もキャッシュしない', async () => {
    const update = jest.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined);
    mockEThree.getGroup.mockResolvedValue({ update });

    expect((await loadGroup('g', 'owner')).isOK).toBe(false);
    expect((await loadGroup('g', 'owner')).isOK).toBe(true);
    expect(mockEThree.getGroup).toHaveBeenCalledTimes(2);
  });

  test('成功結果はキャッシュして再利用する', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    mockEThree.getGroup.mockResolvedValue({ update });

    expect((await loadGroup('g', 'owner')).isOK).toBe(true);
    expect((await loadGroup('g', 'owner')).isOK).toBe(true);
    expect(mockEThree.getGroup).toHaveBeenCalledTimes(1);
  });
});

describe('e3kit(native) のWeb専用ファイル暗号化API', () => {
  test('encryptFileEThreeは黙ってundefinedを返さず失敗する', async () => {
    await expect(encryptFileEThree('file:///a.pdf')).rejects.toThrow(/web-only/);
  });

  test('decryptFileEThreeは黙ってundefinedを返さず失敗する', async () => {
    await expect(decryptFileEThree(new Blob(['x']), 'k')).rejects.toThrow(/web-only/);
  });
});
