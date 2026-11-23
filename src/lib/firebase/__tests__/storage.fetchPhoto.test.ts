jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
  downloadAsync: jest.fn(),
  cacheDirectory: 'file:///cache/',
}));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../firebase', () => ({
  storage: {},
  ref: jest.fn(),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(),
  deleteObject: jest.fn(),
  listAll: jest.fn(),
  getMetadata: jest.fn(),
}));
jest.mock('../../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
jest.mock('../../virgilsecurity/e3kit', () => ({
  encryptFileEThreeRN: jest.fn(),
  decryptFileEThreeRN: jest.fn(),
  encryptFileEThree: jest.fn(),
  decryptFileEThree: jest.fn(),
}));
jest.mock('../../../utils/db', () => ({ db: {} }));
jest.mock('../../../utils/blob', () => ({ blobToBase64: jest.fn() }));

import * as FileSystem from 'expo-file-system/legacy';
import { decryptFileEThreeRN } from '../../virgilsecurity/e3kit';
import { downloadPhoto, fetchPhoto } from '../storage';

// 写真の一括取得で、暗号文の一時ファイルを写真ごとに別の名前にする（写真監査 P-M11）

const mockFs = FileSystem as jest.Mocked<typeof FileSystem>;
const mockDecrypt = decryptFileEThreeRN as jest.MockedFunction<typeof decryptFileEThreeRN>;

describe('fetchPhoto（ネイティブ）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.downloadAsync.mockImplementation(async (_url: string, to: string) => ({ uri: to, status: 200 }) as never);
    mockDecrypt.mockImplementation(async (uri: string) => ({ decUri: `/cache/dec_of_${uri.split('/').pop()}` }));
  });

  it('同時に取得しても、写真ごとに別の一時ファイルへ落として、その写真のファイルを復号する', async () => {
    const results = await Promise.all([
      fetchPhoto('https://example.com/a', 'keyA'),
      fetchPhoto('https://example.com/b', 'keyB'),
      fetchPhoto('https://example.com/c', 'keyC'),
    ]);

    const targets = mockFs.downloadAsync.mock.calls.map(([, to]) => to);
    expect(new Set(targets).size).toBe(3);
    targets.forEach((to) => expect(to.startsWith('file:///cache/photo_')).toBe(true));
    // 各写真は自分が落とした一時ファイルを自分の鍵で復号する
    mockDecrypt.mock.calls.forEach(([uri, key], i) => {
      expect(uri).toBe(targets[i]);
      expect(key).toBe(['keyA', 'keyB', 'keyC'][i]);
    });
    expect(results.every((r) => r.isOK)).toBe(true);
  });

  it('成功したら自分の暗号文の一時ファイルだけを消す', async () => {
    await fetchPhoto('https://example.com/a', 'keyA');

    const [, encPath] = mockFs.downloadAsync.mock.calls[0];
    expect(mockFs.deleteAsync).toHaveBeenCalledTimes(1);
    expect(mockFs.deleteAsync).toHaveBeenCalledWith(encPath, { idempotent: true });
  });

  it('復号に失敗しても自分の一時ファイルだけを消し、失敗を返す', async () => {
    mockDecrypt.mockResolvedValueOnce({ decUri: undefined });

    const result = await fetchPhoto('https://example.com/a', 'keyA');

    const [, encPath] = mockFs.downloadAsync.mock.calls[0];
    expect(result.isOK).toBe(false);
    expect(mockFs.deleteAsync).toHaveBeenCalledWith(encPath, { idempotent: true });
    expect(mockFs.deleteAsync).toHaveBeenCalledTimes(1);
  });

  it('ダウンロードが200でなければ失敗を返し、一時ファイルを消す', async () => {
    mockFs.downloadAsync.mockImplementationOnce(async (_url: string, to: string) => ({ uri: to, status: 403 }) as never);

    const result = await fetchPhoto('https://example.com/a', 'keyA');

    expect(result.isOK).toBe(false);
    expect(mockDecrypt).not.toHaveBeenCalled();
    expect(mockFs.deleteAsync).toHaveBeenCalledTimes(1);
  });

  it('downloadPhoto は写し終えた復号済みファイルも消す', async () => {
    const result = await downloadPhoto('https://example.com/a', 'keyA', 'IMG_1.JPG', 'file:///docs/projects/P1/L1/U1');

    expect(result.isOK).toBe(true);
    expect(mockFs.copyAsync).toHaveBeenCalledTimes(1);
    const { from } = mockFs.copyAsync.mock.calls[0][0];
    expect(mockFs.deleteAsync).toHaveBeenCalledWith(from, { idempotent: true });
  });
});
