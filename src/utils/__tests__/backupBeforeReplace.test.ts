import { backupBeforeReplace, confirmProceedWithoutBackup } from '../backupBeforeReplace';
import type { RootState } from '../../store';

const mockConfirm = jest.fn<Promise<boolean>, [string, unknown]>();
jest.mock('../../components/molecules/AlertAsync', () => ({
  ConfirmAsync: (message: string, text: unknown) => mockConfirm(message, text),
  waitForModalTransition: () => Promise.resolve(),
}));
const mockSave = jest.fn();
jest.mock('../projectBackup', () => ({
  saveProjectBackupWithResult: (state: unknown, trigger: unknown) => mockSave(state, trigger),
}));

describe('backupBeforeReplace（永続化監査 S-L2・S-M5）', () => {
  beforeEach(() => {
    mockConfirm.mockReset();
    mockSave.mockReset();
  });

  test('保存できた・不要なら確認せずに続ける', async () => {
    expect(await confirmProceedWithoutBackup('saved')).toBe(true);
    expect(await confirmProceedWithoutBackup('notNeeded')).toBe(true);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  test('作れなかったら続けるかを尋ね、答えをそのまま返す', async () => {
    mockConfirm.mockResolvedValueOnce(false);
    expect(await confirmProceedWithoutBackup('failed')).toBe(false);
    mockConfirm.mockResolvedValueOnce(true);
    expect(await confirmProceedWithoutBackup('failed')).toBe(true);
    expect(mockConfirm).toHaveBeenCalledTimes(2);
  });

  test('今の状態の7スライスを指定のトリガーで保存する', async () => {
    mockSave.mockReturnValueOnce('failed');
    mockConfirm.mockResolvedValueOnce(false);
    const state = {
      settings: { s: 1 },
      layers: [],
      tileMaps: [],
      dataSet: [],
      user: {},
      projects: [],
      dataSync: {},
      other: 'x',
    } as unknown as RootState;
    expect(await backupBeforeReplace(state, 'fileNew')).toBe(false);
    expect(mockSave).toHaveBeenCalledWith(
      { settings: { s: 1 }, layers: [], tileMaps: [], dataSet: [], user: {}, projects: [], dataSync: {} },
      'fileNew'
    );
  });
});
