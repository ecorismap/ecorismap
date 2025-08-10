// Firebaseのモック（最初に定義する必要がある）
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  sendEmailVerification: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn(),
  serverTimestamp: jest.fn(),
}));

jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(() => ({})),
  ref: jest.fn(),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(),
  deleteObject: jest.fn(),
}));

jest.mock('firebase/app-check', () => ({
  initializeAppCheck: jest.fn(),
  ReCaptchaV3Provider: jest.fn(),
  ReCaptchaEnterpriseProvider: jest.fn(),
}));

jest.mock('../../lib/firebase/firebase', () => ({
  auth: {},
  db: {},
  storage: {},
  initialize: jest.fn(),
}));

jest.mock('../../lib/firebase/storage', () => ({
  uploadPhoto: jest.fn(),
  downloadFile: jest.fn(),
  deletePhoto: jest.fn(),
}));

import * as RNFS from 'react-native-fs';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { exportFileFromUri, exportFileFromData, moveFile, unlink } from '../File';

// encodeURIをモック
const originalEncodeURI = global.encodeURI;
global.encodeURI = jest.fn((uri) => {
  if (uri === 'file:///test.txt') {
    return 'file%3A%2F%2F%2Ftest.txt';
  } else if (uri === '/cache/test.txt') {
    return '%2Fcache%2Ftest.txt';
  }
  return originalEncodeURI(uri);
});

// モックの設定
jest.mock('react-native-fs', () => ({
  mkdir: jest.fn(),
  moveFile: jest.fn(),
  copyFile: jest.fn(),
  writeFile: jest.fn(),
  readDir: jest.fn(),
  exists: jest.fn(),
  unlink: jest.fn(),
  CachesDirectoryPath: '/cache',
  DownloadDirectoryPath: '/download',
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(),
}));

jest.mock('react-native-zip-archive', () => ({
  zip: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///document/',
  cacheDirectory: 'file:///cache/',
  readDirectoryAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
}));

describe('File', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.encodeURI as jest.Mock).mockClear();
  });

  afterAll(() => {
    global.encodeURI = originalEncodeURI;
  });

  describe('exportFileFromUri', () => {
    it('should share file from uri', async () => {
      // テスト実行
      await exportFileFromUri('file:///test.txt', 'test.txt');

      // 期待される結果
      expect(Sharing.shareAsync).toHaveBeenCalledWith('file://file%3A%2F%2F%2Ftest.txt', undefined);
    });

    it('should copy file to download directory on Android', async () => {
      // Platformをモックしてandroidに設定
      Platform.OS = 'android';

      // テスト実行
      await exportFileFromUri('file:///test.txt', 'test.txt');

      // 期待される結果
      expect(RNFS.copyFile).toHaveBeenCalledWith('file:///test.txt', '/download/test.txt');
      expect(Sharing.shareAsync).toHaveBeenCalledWith('file://file%3A%2F%2F%2Ftest.txt', undefined);

      // モックを元に戻す
      Platform.OS = 'ios';
    });
  });

  describe('exportFileFromData', () => {
    it('should export data to file', async () => {
      // テスト実行
      await exportFileFromData('test data', 'test.txt');

      // 期待される結果
      expect(RNFS.writeFile).toHaveBeenCalledWith('/cache/test.txt', 'test data', 'utf8');
      expect(Sharing.shareAsync).toHaveBeenCalledWith('file://%2Fcache%2Ftest.txt', {
        mimeType: 'text/plain',
      });
      expect(RNFS.unlink).toHaveBeenCalledWith('/cache/test.txt');
    });

    it('should write file to download directory on Android', async () => {
      // Platformをモックしてandroidに設定
      Platform.OS = 'android';

      // テスト実行
      await exportFileFromData('test data', 'test.txt');

      // 期待される結果
      expect(RNFS.writeFile).toHaveBeenCalledWith('/download/test.txt', 'test data', 'utf8');
      expect(RNFS.writeFile).toHaveBeenCalledWith('/cache/test.txt', 'test data', 'utf8');
      expect(Sharing.shareAsync).toHaveBeenCalledWith('file://%2Fcache%2Ftest.txt', {
        mimeType: 'text/plain',
      });
      expect(RNFS.unlink).toHaveBeenCalledWith('/cache/test.txt');

      // モックを元に戻す
      Platform.OS = 'ios';
    });
  });

  describe('unlink', () => {
    it('should unlink file if it exists', async () => {
      // ファイルが存在する場合
      (RNFS.exists as jest.Mock).mockReturnValueOnce(Promise.resolve(true));

      // テスト実行
      await unlink('file:///test.txt');

      // 期待される結果
      expect(RNFS.exists).toHaveBeenCalledWith('file:///test.txt');
      expect(RNFS.unlink).toHaveBeenCalledWith('file:///test.txt');
    });

    it('should not unlink file if it does not exist', async () => {
      // ファイルが存在しない場合
      (RNFS.exists as jest.Mock).mockReturnValueOnce(Promise.resolve(false));

      // テスト実行
      await unlink('file:///test.txt');

      // 期待される結果
      expect(RNFS.exists).toHaveBeenCalledWith('file:///test.txt');
      expect(RNFS.unlink).not.toHaveBeenCalled();
    });
  });

  describe('moveFile', () => {
    it('should move file', async () => {
      // テスト実行
      await moveFile('file:///source.txt', 'file:///dest.txt');

      // 期待される結果
      expect(RNFS.moveFile).toHaveBeenCalledWith('file:///source.txt', 'file:///dest.txt');
    });
  });
});
