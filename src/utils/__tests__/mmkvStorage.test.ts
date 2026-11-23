// 設定監査 S-M4: MMKV の書き込み失敗が同期の例外として漏れず、redux-persist が受け取れる reject になる
const mockSet = jest.fn();
const mockRemove = jest.fn();

jest.unmock('../mmkvStorage');
jest.mock('react-native-mmkv', () => ({
  __esModule: true,
  createMMKV: jest.fn(() => ({
    set: (...args: unknown[]) => mockSet(...args),
    remove: (...args: unknown[]) => mockRemove(...args),
    getString: jest.fn(() => undefined),
  })),
}));

const { reduxMMKVStorage } = jest.requireActual('../mmkvStorage') as typeof import('../mmkvStorage');

describe('reduxMMKVStorage', () => {
  beforeEach(() => {
    mockSet.mockReset();
    mockRemove.mockReset();
  });

  it('書き込めたら true で resolve する', async () => {
    await expect(reduxMMKVStorage.setItem('persist:root', '{}')).resolves.toBe(true);
    expect(mockSet).toHaveBeenCalledWith('persist:root', '{}');
  });

  it('set が throw しても同期では投げず、reject で返す（redux-persist の onWriteFail に渡る）', async () => {
    const error = new Error('Failed to set value for key');
    mockSet.mockImplementation(() => {
      throw error;
    });
    let result: Promise<unknown> | undefined;
    expect(() => {
      result = reduxMMKVStorage.setItem('persist:root', '{}');
    }).not.toThrow();
    await expect(result).rejects.toBe(error);
  });

  it('remove が throw しても同期では投げず、reject で返す', async () => {
    const error = new Error('remove failed');
    mockRemove.mockImplementation(() => {
      throw error;
    });
    let result: Promise<unknown> | undefined;
    expect(() => {
      result = reduxMMKVStorage.removeItem('persist:root');
    }).not.toThrow();
    await expect(result).rejects.toBe(error);
  });
});
