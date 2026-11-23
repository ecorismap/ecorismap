jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  downloadAsync: jest.fn(async () => ({ uri: 'file:///cache/enc', status: 200 })),
  cacheDirectory: 'file:///cache/',
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('../firebase', () => ({
  storage: {},
  ref: jest.fn(),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(),
  deleteObject: jest.fn(),
  listAll: jest.fn(),
}));
jest.mock('../../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
jest.mock('../../virgilsecurity/e3kit', () => ({
  encryptFileEThreeRN: jest.fn(),
  decryptFileEThreeRN: jest.fn(async () => ({ decUri: '/cache/dec.jpg' })),
  encryptFileEThree: jest.fn(),
  decryptFileEThree: jest.fn(),
}));
jest.mock('../../../utils/db', () => ({ db: {} }));
jest.mock('../../../utils/blob', () => ({ blobToBase64: jest.fn() }));

import * as FileSystem from 'expo-file-system/legacy';
import { downloadPhoto } from '../storage';

const mockFileSystem = FileSystem as jest.Mocked<typeof FileSystem>;
const FOLDER = 'file:///docs/projects/P1/L1/U1';

describe('downloadPhoto (写真名によるパストラバーサル防止)', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['../../../../SQLite/evil.sqlite', '../shared_prefs/x.xml', 'a/b.jpg', '%2e%2e%2fx.jpg', '..', ''])(
    '不正な写真名 %p は書き込まず失敗を返す',
    async (name) => {
      const result = await downloadPhoto('https://example.com/p', 'key', name, FOLDER);

      expect(result.isOK).toBe(false);
      expect(result.uri).toBeNull();
      expect(mockFileSystem.makeDirectoryAsync).not.toHaveBeenCalled();
      expect(mockFileSystem.copyAsync).not.toHaveBeenCalled();
    }
  );

  it('通常の写真名ならフォルダ配下に保存する', async () => {
    const result = await downloadPhoto('https://example.com/p', 'key', 'IMG_0001.JPG', FOLDER);

    expect(result).toEqual({ isOK: true, message: '', uri: `${FOLDER}/IMG_0001.JPG` });
    expect(mockFileSystem.copyAsync).toHaveBeenCalledWith({ from: 'file:///cache/dec.jpg', to: `${FOLDER}/IMG_0001.JPG` });
  });
});

describe('downloadPhoto: 同名のファイルがある以前の写真名（写真監査 P-L15）', () => {
  const PHOTO_ID = '01JABCDEFGHJKMNPQRSTVWXYZ0';
  const URL = `https://firebasestorage.googleapis.com/v0/b/bkt/o/projects%2FP1%2FPHOTO%2FL1%2FU1%2F${PHOTO_ID}?alt=media`;
  const existing = (paths: string[]) =>
    mockFileSystem.getInfoAsync.mockImplementation((async (uri: string) => ({
      exists: paths.includes(uri),
    })) as unknown as typeof FileSystem.getInfoAsync);

  beforeEach(() => {
    jest.clearAllMocks();
    existing([]);
  });

  it('同じ写真だと確かめられなければ、既にあるファイルを使わず id 付きの名前に保存する', async () => {
    existing([`${FOLDER}/EMAP_1.jpg`]);
    const result = await downloadPhoto(URL, 'key', 'EMAP_1.jpg', FOLDER);

    expect(result).toEqual({ isOK: true, message: '', uri: `${FOLDER}/${PHOTO_ID}_EMAP_1.jpg` });
    expect(mockFileSystem.copyAsync).toHaveBeenCalledWith({
      from: 'file:///cache/dec.jpg',
      to: `${FOLDER}/${PHOTO_ID}_EMAP_1.jpg`,
    });
  });

  it('id 付きの名前が既にあれば取得せずに使う', async () => {
    existing([`${FOLDER}/EMAP_1.jpg`, `${FOLDER}/${PHOTO_ID}_EMAP_1.jpg`]);
    const result = await downloadPhoto(URL, 'key', 'EMAP_1.jpg', FOLDER);

    expect(result.uri).toBe(`${FOLDER}/${PHOTO_ID}_EMAP_1.jpg`);
    expect(mockFileSystem.copyAsync).not.toHaveBeenCalled();
  });

  it('options の写真 id を URL より優先する', async () => {
    existing([`${FOLDER}/EMAP_1.jpg`]);
    const result = await downloadPhoto(URL, 'key', 'EMAP_1.jpg', FOLDER, { photoId: 'ph1' });

    expect(result.uri).toBe(`${FOLDER}/ph1_EMAP_1.jpg`);
  });

  it('同じ写真だと確かめられたとき（reuseExisting）は既にあるファイルを使う', async () => {
    existing([`${FOLDER}/EMAP_1.jpg`]);
    const result = await downloadPhoto(URL, 'key', 'EMAP_1.jpg', FOLDER, { reuseExisting: true });

    expect(result.uri).toBe(`${FOLDER}/EMAP_1.jpg`);
    expect(mockFileSystem.copyAsync).not.toHaveBeenCalled();
  });

  it('同名のファイルが無ければ写真名のまま保存する', async () => {
    const result = await downloadPhoto(URL, 'key', 'EMAP_1.jpg', FOLDER);

    expect(result.uri).toBe(`${FOLDER}/EMAP_1.jpg`);
  });

  it('一意な名前・id 付きの名前は、既にあればそのまま使う', async () => {
    existing([`${FOLDER}/EMAP_20261123_100000_7K3QZ9.jpg`, `${FOLDER}/${PHOTO_ID}_EMAP_1.jpg`]);

    expect((await downloadPhoto(URL, 'key', 'EMAP_20261123_100000_7K3QZ9.jpg', FOLDER)).uri).toBe(
      `${FOLDER}/EMAP_20261123_100000_7K3QZ9.jpg`
    );
    expect((await downloadPhoto(URL, 'key', `${PHOTO_ID}_EMAP_1.jpg`, FOLDER)).uri).toBe(
      `${FOLDER}/${PHOTO_ID}_EMAP_1.jpg`
    );
    expect(mockFileSystem.copyAsync).not.toHaveBeenCalled();
  });
});
