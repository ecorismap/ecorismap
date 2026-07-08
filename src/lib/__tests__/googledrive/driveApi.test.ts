jest.mock('../../googledrive/auth', () => ({
  getAccessToken: jest.fn(),
}));

import { getAccessToken } from '../../googledrive/auth';
import {
  clearAppFolderCache,
  ensureAppFolder,
  initiateResumableUpload,
  listFiles,
  trashFile,
  uploadChunk,
} from '../../googledrive/driveApi';
import { DriveApiError } from '../../googledrive/types';

const mockGetAccessToken = getAccessToken as jest.MockedFunction<typeof getAccessToken>;

function makeResponse(options: { status?: number; body?: unknown; headers?: Record<string, string> } = {}) {
  const { status = 200, body = {}, headers = {} } = options;
  const lowered: Record<string, string> = {};
  Object.entries(headers).forEach(([k, v]) => (lowered[k.toLowerCase()] = v));
  return {
    status,
    ok: status < 400,
    statusText: `status-${status}`,
    headers: { get: (key: string) => lowered[key.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

let mockFetch: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  clearAppFolderCache();
  mockGetAccessToken.mockResolvedValue('token-1');
  mockFetch = jest.fn();
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('listFiles', () => {
  test('クエリを組み立ててファイル一覧を返す', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ body: { files: [{ id: '1', name: 'a.ecorismap' }] } }));
    const files = await listFiles({ q: "name='a'" });
    expect(files).toEqual([{ id: '1', name: 'a.ecorismap' }]);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('https://www.googleapis.com/drive/v3/files?');
    expect(url).toContain("q=name%3D%27a%27");
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token-1');
  });

  test('pageTokenを追跡して全ページを取得する', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse({ body: { files: [{ id: '1', name: 'a' }], nextPageToken: 'p2' } }))
      .mockResolvedValueOnce(makeResponse({ body: { files: [{ id: '2', name: 'b' }] } }));
    const files = await listFiles({ q: 'x' });
    expect(files.map((f) => f.id)).toEqual(['1', '2']);
    expect(mockFetch.mock.calls[1][0]).toContain('pageToken=p2');
  });

  test('401はトークンを再取得して1回だけリトライする', async () => {
    mockGetAccessToken.mockReset();
    mockGetAccessToken.mockResolvedValueOnce('expired').mockResolvedValueOnce('fresh');
    mockFetch
      .mockResolvedValueOnce(makeResponse({ status: 401, body: { error: { message: 'auth' } } }))
      .mockResolvedValueOnce(makeResponse({ body: { files: [] } }));
    const files = await listFiles({ q: 'x' });
    expect(files).toEqual([]);
    expect(mockGetAccessToken).toHaveBeenLastCalledWith({ forceRefresh: true });
    expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh');
  });

  test('429は指数バックオフでリトライする', async () => {
    jest.useFakeTimers();
    mockFetch
      .mockResolvedValueOnce(makeResponse({ status: 429 }))
      .mockResolvedValueOnce(makeResponse({ status: 503 }))
      .mockResolvedValueOnce(makeResponse({ body: { files: [] } }));
    const promise = listFiles({ q: 'x' });
    await jest.advanceTimersByTimeAsync(500 + 1000);
    const files = await promise;
    expect(files).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test('リトライ上限を超えたらDriveApiErrorを投げる', async () => {
    jest.useFakeTimers();
    mockFetch.mockResolvedValue(makeResponse({ status: 503, body: { error: { message: 'unavailable' } } }));
    const promise = listFiles({ q: 'x' }).catch((e) => e);
    await jest.advanceTimersByTimeAsync(500 + 1000 + 2000);
    const error = await promise;
    expect(error).toBeInstanceOf(DriveApiError);
    expect((error as DriveApiError).status).toBe(503);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test('エラーボディをDriveApiErrorに正規化する', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        status: 403,
        body: { error: { message: 'Rate limit exceeded', errors: [{ reason: 'userRateLimitExceeded' }] } },
      })
    );
    const error = await listFiles({ q: 'x' }).catch((e) => e);
    expect(error).toBeInstanceOf(DriveApiError);
    expect((error as DriveApiError).reason).toBe('userRateLimitExceeded');
    expect((error as DriveApiError).message).toBe('Rate limit exceeded');
  });
});

describe('ensureAppFolder', () => {
  test('既存フォルダがあればそのidを返す', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ body: { files: [{ id: 'folder-1', name: 'EcorisMap' }] } }));
    expect(await ensureAppFolder()).toBe('folder-1');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('なければ作成し、2回目以降はキャッシュを使う', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse({ body: { files: [] } }))
      .mockResolvedValueOnce(makeResponse({ body: { id: 'folder-new' } }));
    expect(await ensureAppFolder()).toBe('folder-new');
    const createCall = mockFetch.mock.calls[1];
    expect(createCall[1].method).toBe('POST');
    expect(JSON.parse(createCall[1].body).mimeType).toBe('application/vnd.google-apps.folder');

    expect(await ensureAppFolder()).toBe('folder-new');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('resumable upload', () => {
  test('initiateResumableUploadはLocationヘッダのセッションURLを返す', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ headers: { Location: 'https://upload.example.com/session-1' } })
    );
    const url = await initiateResumableUpload({
      metadata: { name: 'a.ecorismap', parents: ['folder-1'] },
      contentLength: 100,
      contentType: 'application/zip',
    });
    expect(url).toBe('https://upload.example.com/session-1');
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toContain('uploadType=resumable');
    expect(call[1].method).toBe('POST');
    expect(call[1].headers['X-Upload-Content-Length']).toBe('100');
  });

  test('fileId指定時はPATCHで既存ファイルを更新する', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ headers: { Location: 'https://upload.example.com/session-2' } }));
    await initiateResumableUpload({
      fileId: 'file-1',
      metadata: { name: 'a.ecorismap' },
      contentLength: 100,
      contentType: 'application/zip',
    });
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toContain('/files/file-1?uploadType=resumable');
    expect(call[1].method).toBe('PATCH');
  });

  test('Locationヘッダがなければエラーを投げる', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}));
    await expect(
      initiateResumableUpload({ metadata: { name: 'a' }, contentLength: 1, contentType: 'application/zip' })
    ).rejects.toBeInstanceOf(DriveApiError);
  });

  test('uploadChunkは308のRangeヘッダから次のオフセットを解釈する', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ status: 308, headers: { Range: 'bytes=0-8388607' } }));
    const result = await uploadChunk('https://upload.example.com/s', new Uint8Array(8388608), 0, 20000000);
    expect(result).toEqual({ done: false, nextOffset: 8388608 });
    expect(mockFetch.mock.calls[0][1].headers['Content-Range']).toBe('bytes 0-8388607/20000000');
  });

  test('uploadChunkは200で完了しファイルメタを返す', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ status: 200, body: { id: 'file-1', name: 'a.ecorismap' } }));
    const result = await uploadChunk('https://upload.example.com/s', new Uint8Array(100), 0, 100);
    expect(result.done).toBe(true);
    expect(result.file?.id).toBe('file-1');
  });
});

describe('trashFile', () => {
  test('trashed:trueでPATCHする', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ body: { id: 'file-1', trashed: true } }));
    await trashFile('file-1');
    const call = mockFetch.mock.calls[0];
    expect(call[1].method).toBe('PATCH');
    expect(JSON.parse(call[1].body)).toEqual({ trashed: true });
  });
});
