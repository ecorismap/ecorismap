/**
 * 同期監査（docs/SYNC_AUDIT_2026-11.md）の M11 の回帰テスト（辞書ファイルの保存先）。
 * - 新しい保存は版付きのパスへ書き、旧形式の dictionary.sqlite には触れない（設定の保存に失敗しても、設定が指す
 *   旧ファイルと鍵の組が壊れない）
 * - 版付きのパスで読めなければ旧形式のパスを読む（更新前のアプリの管理者が保存した場合の互換）
 */
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  downloadAsync: jest.fn(async () => ({ uri: 'file:///cache/enc', status: 200 })),
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///docs/',
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('../firebase', () => ({
  storage: {},
  ref: jest.fn((_storage: unknown, path: string) => path),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(),
  deleteObject: jest.fn(),
  listAll: jest.fn(),
}));
jest.mock('../../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
jest.mock('../../virgilsecurity/e3kit', () => ({
  encryptFileEThreeRN: jest.fn(),
  decryptFileEThreeRN: jest.fn(async () => ({ decUri: '/cache/dec.sqlite' })),
  encryptFileEThree: jest.fn(async () => ({ encdata: 'ENC', key: 'K2' })),
  decryptFileEThree: jest.fn(),
}));
jest.mock('../../../utils/db', () => ({ db: {} }));
jest.mock('../../../utils/blob', () => ({ blobToBase64: jest.fn() }));

import { deleteObject, getDownloadURL, ref, uploadBytes } from '../firebase';
import { deleteDictionaryFile, dictionaryStoragePath, downloadDictionary, uploadDictionary } from '../storage';

const mockedRef = ref as jest.Mock;
const mockedUploadBytes = uploadBytes as jest.Mock;
const mockedGetDownloadURL = getDownloadURL as jest.Mock;
const mockedDeleteObject = deleteObject as jest.Mock;

const LEGACY = 'projects/P1/DICTIONARY/L1/dictionary.sqlite';
const V1 = 'projects/P1/DICTIONARY/L1/dictionary_v1.sqlite';

describe('M11: 辞書ファイルを版付きのパスに置く', () => {
  beforeEach(() => jest.clearAllMocks());

  test('保存先: 版があれば版付き、無ければ旧形式', () => {
    expect(dictionaryStoragePath('P1', 'L1')).toBe(LEGACY);
    expect(dictionaryStoragePath('P1', 'L1', 'v1')).toBe(V1);
  });

  test('アップロードは版付きのパスだけに書き、旧形式のファイルを上書きしない', async () => {
    const res = await uploadDictionary('P1', 'L1', 'file:///tmp/dict.sqlite', 'v1');
    expect(res).toMatchObject({ isOK: true, key: 'K2', encdata: 'ENC' });
    expect(mockedUploadBytes).toHaveBeenCalledTimes(1);
    expect(mockedUploadBytes).toHaveBeenCalledWith(V1, 'ENC');
    expect(mockedRef.mock.calls.map((c) => c[1])).not.toContain(LEGACY);
  });

  test('版付きのパスで読めなければ旧形式のパスを読む', async () => {
    mockedGetDownloadURL.mockImplementation(async (path: string) => {
      if (path === V1) throw new Error('storage/object-not-found');
      return 'https://example.com/legacy';
    });
    const res = await downloadDictionary('P1', 'L1', 'K1', 'v1');
    expect(res.isOK).toBe(true);
    expect(mockedGetDownloadURL.mock.calls.map((c) => c[0])).toEqual([V1, LEGACY]);
  });

  test('版付きのパスで読めれば旧形式は読まない', async () => {
    mockedGetDownloadURL.mockResolvedValue('https://example.com/v1');
    const res = await downloadDictionary('P1', 'L1', 'K1', 'v1');
    expect(res.isOK).toBe(true);
    expect(mockedGetDownloadURL.mock.calls.map((c) => c[0])).toEqual([V1]);
  });

  test('版の無い設定（旧形式）は旧形式のパスを読む', async () => {
    mockedGetDownloadURL.mockResolvedValue('https://example.com/legacy');
    const res = await downloadDictionary('P1', 'L1', 'K1');
    expect(res.isOK).toBe(true);
    expect(mockedGetDownloadURL.mock.calls.map((c) => c[0])).toEqual([LEGACY]);
  });

  test('パスの区切りを作れる版は使わず失敗を返す', async () => {
    const res = await downloadDictionary('P1', 'L1', 'K1', '../../PHOTO/x');
    expect(res.isOK).toBe(false);
    expect(mockedGetDownloadURL).not.toHaveBeenCalled();
  });

  test('両方とも読めなければ失敗を返す', async () => {
    mockedGetDownloadURL.mockRejectedValue(new Error('network'));
    const res = await downloadDictionary('P1', 'L1', 'K1', 'v1');
    expect(res.isOK).toBe(false);
  });

  test('古い版の削除は、既に無くても成功とみなす', async () => {
    mockedDeleteObject.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'storage/object-not-found' }));
    await expect(deleteDictionaryFile('P1', 'L1', 'v1')).resolves.toEqual({ isOK: true, message: '' });
    expect(mockedDeleteObject).toHaveBeenCalledWith(V1);
  });
});
