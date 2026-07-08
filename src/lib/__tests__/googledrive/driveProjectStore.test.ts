jest.mock('../../googledrive/auth', () => ({
  getAccessToken: jest.fn(() => Promise.resolve('token')),
}));
jest.mock('../../googledrive/driveApi', () => ({
  ensureAppFolder: jest.fn(),
  listFiles: jest.fn(),
  initiateResumableUpload: jest.fn(),
  uploadChunk: jest.fn(),
  trashFile: jest.fn(),
}));
jest.mock('../../googledrive/driveTransfer', () => ({
  readChunk: jest.fn(),
  downloadToUri: jest.fn(),
}));

import { ensureAppFolder, initiateResumableUpload, listFiles, trashFile, uploadChunk } from '../../googledrive/driveApi';
import { readChunk } from '../../googledrive/driveTransfer';
import {
  deleteDriveProject,
  listDriveProjects,
  uploadDriveProject,
} from '../../googledrive/driveProjectStore';

const mockEnsureAppFolder = ensureAppFolder as jest.MockedFunction<typeof ensureAppFolder>;
const mockListFiles = listFiles as jest.MockedFunction<typeof listFiles>;
const mockInitiate = initiateResumableUpload as jest.MockedFunction<typeof initiateResumableUpload>;
const mockUploadChunk = uploadChunk as jest.MockedFunction<typeof uploadChunk>;
const mockTrashFile = trashFile as jest.MockedFunction<typeof trashFile>;
const mockReadChunk = readChunk as jest.MockedFunction<typeof readChunk>;

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsureAppFolder.mockResolvedValue('folder-1');
});

describe('listDriveProjects', () => {
  test('拡張子を除いた名前でマップし更新日時の降順に並べる', async () => {
    mockListFiles.mockResolvedValue([
      {
        id: 'f1',
        name: 'old.ecorismap',
        size: '100',
        modifiedTime: '2026-07-01T00:00:00Z',
        headRevisionId: 'r1',
        appProperties: { ecorismapProjectId: 'P1', ecorismapSchema: '1' },
      },
      {
        id: 'f2',
        name: 'new.ecorismap',
        size: '200',
        modifiedTime: '2026-07-08T00:00:00Z',
        headRevisionId: 'r2',
        appProperties: { ecorismapProjectId: 'P2', ecorismapSchema: '1' },
      },
    ]);
    const items = await listDriveProjects();
    expect(items.map((i) => i.name)).toEqual(['new', 'old']);
    expect(items[0]).toEqual({
      fileId: 'f2',
      name: 'new',
      projectId: 'P2',
      updatedAt: '2026-07-08T00:00:00Z',
      size: 200,
      headRevisionId: 'r2',
    });
    expect(mockListFiles.mock.calls[0][0].q).toContain("'folder-1' in parents");
    expect(mockListFiles.mock.calls[0][0].q).toContain("key='ecorismapSchema'");
  });
});

describe('uploadDriveProject', () => {
  test('新規作成はparentsとappPropertiesを付与しチャンク分割でアップロードする', async () => {
    const size = 20 * 1024 * 1024;
    mockInitiate.mockResolvedValue('https://upload.example.com/s');
    mockReadChunk.mockResolvedValue(new Uint8Array(1));
    mockUploadChunk
      .mockResolvedValueOnce({ done: false, nextOffset: 8 * 1024 * 1024 })
      .mockResolvedValueOnce({ done: false, nextOffset: 16 * 1024 * 1024 })
      .mockResolvedValueOnce({
        done: true,
        nextOffset: size,
        file: {
          id: 'f1',
          name: 'test.ecorismap',
          size: String(size),
          modifiedTime: '2026-07-08T00:00:00Z',
          headRevisionId: 'r1',
          appProperties: { ecorismapProjectId: 'P1' },
        },
      });

    const onProgress = jest.fn();
    const item = await uploadDriveProject({ name: 'test', source: '/tmp/test.ecorismap', size, onProgress });

    expect(item.fileId).toBe('f1');
    expect(item.name).toBe('test');
    const initArgs = mockInitiate.mock.calls[0][0];
    expect(initArgs.fileId).toBeUndefined();
    expect(initArgs.metadata.name).toBe('test.ecorismap');
    expect(initArgs.metadata.parents).toEqual(['folder-1']);
    expect(initArgs.metadata.appProperties?.ecorismapSchema).toBe('1');
    expect(initArgs.metadata.appProperties?.ecorismapProjectId).toBeTruthy();
    expect(mockUploadChunk).toHaveBeenCalledTimes(3);
    // 2番目のチャンクはオフセット8MiBから
    expect(mockUploadChunk.mock.calls[1][2]).toBe(8 * 1024 * 1024);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  test('上書きは既存fileIdとprojectIdを引き継ぎparentsを付けない', async () => {
    mockInitiate.mockResolvedValue('https://upload.example.com/s');
    mockReadChunk.mockResolvedValue(new Uint8Array(1));
    mockUploadChunk.mockResolvedValueOnce({
      done: true,
      nextOffset: 100,
      file: { id: 'f1', name: 'test.ecorismap', appProperties: { ecorismapProjectId: 'P-EXIST' } },
    });

    await uploadDriveProject({
      name: 'test',
      source: '/tmp/test.ecorismap',
      size: 100,
      existingFileId: 'f1',
      projectId: 'P-EXIST',
    });

    const initArgs = mockInitiate.mock.calls[0][0];
    expect(initArgs.fileId).toBe('f1');
    expect(initArgs.metadata.parents).toBeUndefined();
    expect(initArgs.metadata.appProperties?.ecorismapProjectId).toBe('P-EXIST');
    expect(mockEnsureAppFolder).not.toHaveBeenCalled();
  });

  test('進捗しないアップロードはエラーにする', async () => {
    mockInitiate.mockResolvedValue('https://upload.example.com/s');
    mockReadChunk.mockResolvedValue(new Uint8Array(1));
    mockUploadChunk.mockResolvedValue({ done: false, nextOffset: 0 });
    await expect(uploadDriveProject({ name: 'test', source: '/tmp/a', size: 100 })).rejects.toThrow(
      'did not make progress'
    );
  });
});

describe('deleteDriveProject', () => {
  test('trashFileを呼ぶ', async () => {
    await deleteDriveProject('f1');
    expect(mockTrashFile).toHaveBeenCalledWith('f1');
  });
});
