type MockEThree = {
  identity: string;
  findUsers: jest.Mock;
  hasLocalPrivateKey: jest.Mock;
  restorePrivateKey: jest.Mock;
  getGroup: jest.Mock;
  loadGroup: jest.Mock;
  cleanup: jest.Mock;
  encrypt: jest.Mock;
};

const makeEThree = (identity: string): MockEThree => ({
  identity,
  findUsers: jest.fn().mockResolvedValue({ card: identity }),
  hasLocalPrivateKey: jest.fn().mockResolvedValue(true),
  restorePrivateKey: jest.fn().mockRejectedValue(Object.assign(new Error('wrong'), { name: 'WrongKeyknoxPasswordError' })),
  getGroup: jest.fn(),
  loadGroup: jest.fn(),
  cleanup: jest.fn(),
  encrypt: jest.fn(),
});

const mockAuth: { currentUser: { uid: string } | null } = { currentUser: null };
const mockInitialize = jest.fn();

jest.mock('@virgilsecurity/e3kit-native', () => ({
  EThree: { initialize: (...args: unknown[]) => mockInitialize(...args) },
}));
jest.mock('react-native-virgil-crypto', () => ({ virgilCrypto: {} }));
jest.mock('react-native-keychain', () => ({}));
jest.mock('../../firebase/firebase', () => ({
  auth: mockAuth,
  functions: {},
  httpsCallable: jest.fn(),
  firebaseReady: Promise.resolve(),
}));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/' }));

type E3kitModule = typeof import('../e3kit');

describe('initializeUser は前ユーザー名義のeThreeを使い回さない', () => {
  let instanceA: MockEThree;
  let instanceB: MockEThree;
  let initializeUser: E3kitModule['initializeUser'];
  let loadGroup: E3kitModule['loadGroup'];

  beforeEach(async () => {
    // initializeUser の30秒タイムアウト用タイマーがワーカー終了を妨げないようにする
    jest.useFakeTimers();
    instanceA = makeEThree('userA');
    instanceB = makeEThree('userB');
    mockInitialize.mockReset();
    mockInitialize.mockResolvedValueOnce(instanceA).mockResolvedValueOnce(instanceB);
    mockAuth.currentUser = { uid: 'userA' };
    // eThree はモジュール内の状態なので、テストごとに読み込み直してAで初期化された状態から始める
    jest.isolateModules(() => {
      const mod = jest.requireActual<E3kitModule>('../e3kit');
      initializeUser = mod.initializeUser;
      loadGroup = mod.loadGroup;
    });
    await initializeUser('userA');
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('同じユーザーなら再初期化しない（メンバーが ownerUid を渡しても同様）', async () => {
    mockInitialize.mockClear();
    expect((await initializeUser('userA')).isOK).toBe(true);
    expect((await initializeUser('someOwner')).isOK).toBe(true);
    expect(mockInitialize).not.toHaveBeenCalled();
  });

  test('Firebaseの現ユーザーが変わっていたら、鍵は消さずにインスタンスを作り直す', async () => {
    mockAuth.currentUser = { uid: 'userB' };
    expect((await initializeUser('userB')).isOK).toBe(true);
    expect(mockInitialize).toHaveBeenCalledTimes(2);
    // ローカル鍵の削除(cleanup)はしない
    expect(instanceA.cleanup).not.toHaveBeenCalled();
    // 以後の処理は新しいインスタンスで行われる
    instanceB.getGroup.mockResolvedValue({ update: jest.fn().mockResolvedValue(undefined) });
    expect((await loadGroup('g-switch', 'owner')).isOK).toBe(true);
    expect(instanceB.getGroup).toHaveBeenCalled();
    expect(instanceA.getGroup).not.toHaveBeenCalled();
  });

  test('切り替え時に前ユーザーで読んだグループのキャッシュを捨てる', async () => {
    const groupA = { id: 'A', update: jest.fn().mockResolvedValue(undefined) };
    instanceA.getGroup.mockResolvedValue(groupA);
    expect((await loadGroup('g-cache', 'owner')).group).toBe(groupA);

    mockAuth.currentUser = { uid: 'userB' };
    await initializeUser('userB');
    const groupB = { id: 'B', update: jest.fn().mockResolvedValue(undefined) };
    instanceB.getGroup.mockResolvedValue(groupB);
    expect((await loadGroup('g-cache', 'owner')).group).toBe(groupB);
  });

  test('Firebaseが未ログインなら照合せず従来どおり使い回す', async () => {
    mockAuth.currentUser = null;
    mockInitialize.mockClear();
    expect((await initializeUser('userA')).isOK).toBe(true);
    expect(mockInitialize).not.toHaveBeenCalled();
  });
});
