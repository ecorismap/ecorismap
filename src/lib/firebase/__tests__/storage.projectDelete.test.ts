jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(async () => undefined),
  downloadAsync: jest.fn(),
  cacheDirectory: 'file:///cache/',
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('../firebase', () => ({
  storage: {},
  ref: jest.fn((_storage: unknown, path: string) => ({ fullPath: path })),
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

import { deleteObject, listAll } from '../firebase';
import { deleteAllProjectStorageData, deleteProjectStorageData } from '../storage';

// プロジェクト削除で Storage の写真・PDF・スタイル・辞書（すべてサブフォルダにある）を消す（写真監査 P-M7）

type FakeRef = { fullPath: string };
const mockListAll = listAll as unknown as jest.Mock;
const mockDeleteObject = deleteObject as unknown as jest.Mock;

/** パスの一覧から、listAll が返す items（直下のファイル）と prefixes（直下のフォルダ）を作る */
const setupBucket = (paths: string[]) => {
  mockListAll.mockImplementation(async (folder: FakeRef) => {
    const base = `${folder.fullPath}/`;
    const items = new Set<string>();
    const prefixes = new Set<string>();
    for (const path of paths) {
      if (!path.startsWith(base)) continue;
      const rest = path.slice(base.length).split('/');
      if (rest.length === 1) items.add(path);
      else prefixes.add(`${base}${rest[0]}`);
    }
    return {
      items: [...items].map((fullPath) => ({ fullPath })),
      prefixes: [...prefixes].map((fullPath) => ({ fullPath })),
    };
  });
};

const PROJECT_FILES = [
  'projects/P1/PHOTO/L1/U1/photoA',
  'projects/P1/PHOTO/L1/U2/photoB',
  'projects/P1/PHOTO/L2/U1/photoC',
  'projects/P1/PDF/map1',
  'projects/P1/STYLE/map2',
  'projects/P1/DICTIONARY/L1/dictionary_v1.sqlite',
];

describe('deleteProjectStorageData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteObject.mockResolvedValue(undefined);
  });

  it('サブフォルダの写真・PDF・スタイル・辞書をすべて消す', async () => {
    setupBucket([...PROJECT_FILES, 'projects/P2/PHOTO/L1/U1/other']);

    const result = await deleteProjectStorageData('P1');

    expect(result.isOK).toBe(true);
    const deleted = mockDeleteObject.mock.calls.map(([r]: [FakeRef]) => r.fullPath).sort();
    expect(deleted).toEqual([...PROJECT_FILES].sort());
  });

  it('一覧の後に他から消された1件があっても、残りを消して成功にする', async () => {
    setupBucket(PROJECT_FILES);
    mockDeleteObject.mockImplementation(async (r: FakeRef) => {
      if (r.fullPath.endsWith('photoA')) throw Object.assign(new Error('gone'), { code: 'storage/object-not-found' });
    });

    const result = await deleteProjectStorageData('P1');

    expect(result.isOK).toBe(true);
    expect(mockDeleteObject).toHaveBeenCalledTimes(PROJECT_FILES.length);
  });

  it('権限エラーなどは失敗として返す（project doc を先に消させない）', async () => {
    setupBucket(PROJECT_FILES);
    mockDeleteObject.mockRejectedValue(Object.assign(new Error('denied'), { code: 'storage/unauthorized' }));

    const result = await deleteProjectStorageData('P1');

    expect(result.isOK).toBe(false);
  });

  it('不正なプロジェクト id ではバケットに触れない', async () => {
    setupBucket(PROJECT_FILES);

    const result = await deleteProjectStorageData('../P1');

    expect(result.isOK).toBe(false);
    expect(mockListAll).not.toHaveBeenCalled();
  });

  it('アカウント削除（複数プロジェクト）でも各プロジェクトのサブフォルダまで消す', async () => {
    setupBucket([...PROJECT_FILES, 'projects/P2/PDF/map9']);

    const result = await deleteAllProjectStorageData(['P1', 'P2']);

    expect(result.isOK).toBe(true);
    expect(mockDeleteObject).toHaveBeenCalledTimes(PROJECT_FILES.length + 1);
  });
});
