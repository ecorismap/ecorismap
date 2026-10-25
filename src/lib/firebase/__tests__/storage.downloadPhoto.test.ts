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
