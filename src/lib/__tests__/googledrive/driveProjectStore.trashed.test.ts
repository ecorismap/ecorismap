/** A-L12: 上書き先がゴミ箱に入っていないかを確かめる */
jest.mock('../../googledrive/auth', () => ({
  getAccessToken: jest.fn(() => Promise.resolve('token')),
}));
jest.mock('../../googledrive/driveApi', () => ({
  ensureAppFolder: jest.fn(),
  listFiles: jest.fn(),
  initiateResumableUpload: jest.fn(),
  uploadChunk: jest.fn(),
  trashFile: jest.fn(),
  getFileMetadata: jest.fn(),
}));
jest.mock('../../googledrive/driveTransfer', () => ({
  readChunk: jest.fn(),
  downloadToUri: jest.fn(),
}));

import { getFileMetadata } from '../../googledrive/driveApi';
import { isOverwritableDriveProject } from '../../googledrive/driveProjectStore';
import { DriveApiError } from '../../googledrive/types';

const mockGetFileMetadata = getFileMetadata as jest.MockedFunction<typeof getFileMetadata>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isOverwritableDriveProject', () => {
  test('ゴミ箱に入っていなければ上書きできる', async () => {
    mockGetFileMetadata.mockResolvedValue({ id: 'f1', name: 'a.zip', trashed: false });
    await expect(isOverwritableDriveProject('f1')).resolves.toBe(true);
    expect(mockGetFileMetadata).toHaveBeenCalledWith('f1', 'id,trashed');
  });

  test('ゴミ箱に入っていれば上書きしない', async () => {
    mockGetFileMetadata.mockResolvedValue({ id: 'f1', name: 'a.zip', trashed: true });
    await expect(isOverwritableDriveProject('f1')).resolves.toBe(false);
  });

  test('完全に消えていれば（404）上書きしない', async () => {
    mockGetFileMetadata.mockRejectedValue(new DriveApiError(404, 'notFound', 'File not found'));
    await expect(isOverwritableDriveProject('f1')).resolves.toBe(false);
  });

  test('それ以外のエラーは保存を止めるためそのまま投げる', async () => {
    mockGetFileMetadata.mockRejectedValue(new DriveApiError(403, 'forbidden', 'denied'));
    await expect(isOverwritableDriveProject('f1')).rejects.toBeInstanceOf(DriveApiError);
  });
});
