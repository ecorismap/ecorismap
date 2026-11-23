import { notifyStorageWriteFailed, resetStorageWriteFailNoticeForTest } from '../storageWriteFailNotice';

const mockAlert = jest.fn();
jest.mock('../../components/atoms/Alert', () => ({
  Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
}));

describe('notifyStorageWriteFailed（永続化監査 S-M4）', () => {
  beforeEach(() => {
    mockAlert.mockReset();
    resetStorageWriteFailNoticeForTest();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  test('何度失敗しても知らせるのは1回だけ', () => {
    notifyStorageWriteFailed(new Error('no space'));
    notifyStorageWriteFailed(new Error('no space'));
    notifyStorageWriteFailed(new Error('no space'));
    expect(mockAlert).toHaveBeenCalledTimes(1);
  });

  test('通知に失敗しても例外を外へ出さない', () => {
    mockAlert.mockImplementation(() => {
      throw new Error('not mounted');
    });
    expect(() => notifyStorageWriteFailed(new Error('x'))).not.toThrow();
  });
});
