/** A-L12 ゴミ箱の上書き先は新規作成に切り替える / A-L13 今のデータに対応する Drive ファイルを記録する */
let mockDispatch = jest.fn();
let mockOpenEcorisMapFile = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => [],
}));
jest.mock('../useEcorismapFile', () => ({
  useEcorisMapFile: () => ({
    generateEcorisMapData: jest.fn().mockResolvedValue([]),
    openEcorisMapFile: (...args: unknown[]) => mockOpenEcorisMapFile(...args),
    createExportSettings: () => ({}),
  }),
}));
jest.mock('../../utils/File', () => ({
  generateEcorisMapZip: jest.fn(),
  unlink: jest.fn(),
}));
jest.mock('../../lib/googledrive/auth', () => ({
  signInGoogleDrive: jest.fn(),
  signOutGoogleDrive: jest.fn(),
  trySilentSignIn: jest.fn(),
  getAccessToken: jest.fn(),
  getConnectedEmail: jest.fn(),
}));
jest.mock('../../lib/googledrive/driveApi', () => ({
  clearAppFolderCache: jest.fn(),
}));
jest.mock('../../lib/googledrive/driveProjectStore', () => ({
  listDriveProjects: jest.fn(),
  uploadDriveProject: jest.fn(),
  downloadDriveProject: jest.fn(),
  deleteDriveProject: jest.fn(),
  isOverwritableDriveProject: jest.fn(),
}));

import { renderHook, act } from '@testing-library/react-hooks';
import { useGoogleDriveProjects } from '../useGoogleDriveProjects';
import { signInGoogleDrive } from '../../lib/googledrive/auth';
import {
  downloadDriveProject,
  isOverwritableDriveProject,
  listDriveProjects,
  uploadDriveProject,
} from '../../lib/googledrive/driveProjectStore';
import { generateEcorisMapZip } from '../../utils/File';
import { DriveProjectItem } from '../../lib/googledrive/types';
import { setGoogleDriveCurrentFileAction } from '../../modules/googleDrive';

const mockSignIn = signInGoogleDrive as jest.MockedFunction<typeof signInGoogleDrive>;
const mockList = listDriveProjects as jest.MockedFunction<typeof listDriveProjects>;
const mockUpload = uploadDriveProject as jest.MockedFunction<typeof uploadDriveProject>;
const mockDownload = downloadDriveProject as jest.MockedFunction<typeof downloadDriveProject>;
const mockOverwritable = isOverwritableDriveProject as jest.MockedFunction<typeof isOverwritableDriveProject>;
const mockGenerateZip = generateEcorisMapZip as jest.MockedFunction<typeof generateEcorisMapZip>;

const trashedItem: DriveProjectItem = {
  fileId: 'f-trashed',
  name: 'survey',
  projectId: 'P1',
  updatedAt: '2026-07-08T00:00:00Z',
  size: 100,
  headRevisionId: 'r1',
};
const newItem: DriveProjectItem = { ...trashedItem, fileId: 'f-new', headRevisionId: 'r2' };

beforeEach(() => {
  jest.clearAllMocks();
  mockDispatch = jest.fn();
  mockOpenEcorisMapFile = jest.fn();
  mockGenerateZip.mockResolvedValue({ source: '/tmp/survey.zip', size: 100 });
});

const dispatchedTypes = () => mockDispatch.mock.calls.map((c) => c[0]);

describe('A-L12: ゴミ箱に入った上書き先', () => {
  test('ゴミ箱なら上書きせず projectId を引き継いで新しく作り、一覧から古い項目を外す', async () => {
    mockSignIn.mockResolvedValue({ isOK: true, message: '', email: 'a@example.com' });
    mockList.mockResolvedValue([trashedItem]);
    mockOverwritable.mockResolvedValue(false);
    mockUpload.mockResolvedValue(newItem);

    const { result } = renderHook(() => useGoogleDriveProjects());
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      const ret = await result.current.saveToDrive('survey', trashedItem);
      expect(ret.isOK).toBe(true);
    });
    expect(mockOverwritable).toHaveBeenCalledWith('f-trashed');
    expect(mockUpload.mock.calls[0][0].existingFileId).toBeUndefined();
    expect(mockUpload.mock.calls[0][0].projectId).toBe('P1');
    expect(result.current.driveProjects).toEqual([newItem]);
    expect(dispatchedTypes()).toContainEqual(setGoogleDriveCurrentFileAction('f-new'));
  });

  test('使えるファイルならそのまま上書きする', async () => {
    mockOverwritable.mockResolvedValue(true);
    mockUpload.mockResolvedValue(trashedItem);
    const { result } = renderHook(() => useGoogleDriveProjects());
    await act(async () => {
      await result.current.saveToDrive('survey', trashedItem);
    });
    expect(mockUpload.mock.calls[0][0].existingFileId).toBe('f-trashed');
  });

  test('新規保存では確認の照会をしない', async () => {
    mockUpload.mockResolvedValue(newItem);
    const { result } = renderHook(() => useGoogleDriveProjects());
    await act(async () => {
      await result.current.saveToDrive('survey');
    });
    expect(mockOverwritable).not.toHaveBeenCalled();
  });
});

describe('A-L13: 今のデータに対応する Drive ファイル', () => {
  test('読み込みに成功したら、データの置き換えの後で対応を記録する', async () => {
    mockDownload.mockResolvedValue('file:///tmp/drive.zip');
    mockOpenEcorisMapFile.mockImplementation(async () => {
      mockDispatch({ type: 'dataSet/setDataSetAction', payload: [] });
      return { isOK: true, message: '' };
    });
    const { result } = renderHook(() => useGoogleDriveProjects());
    await act(async () => {
      await result.current.loadFromDrive(trashedItem);
    });
    const types = dispatchedTypes().map((a) => a.type);
    const setDataIdx = types.indexOf('dataSet/setDataSetAction');
    const currentIdx = types.indexOf('googleDrive/setGoogleDriveCurrentFileAction');
    expect(currentIdx).toBeGreaterThan(setDataIdx);
    expect(dispatchedTypes()[currentIdx]).toEqual(setGoogleDriveCurrentFileAction('f-trashed'));
  });

  test('読み込みに失敗したら記録しない', async () => {
    mockDownload.mockResolvedValue('file:///tmp/drive.zip');
    mockOpenEcorisMapFile.mockResolvedValue({ isOK: false, message: 'error' });
    const { result } = renderHook(() => useGoogleDriveProjects());
    await act(async () => {
      await result.current.loadFromDrive(trashedItem);
    });
    expect(dispatchedTypes().map((a) => a.type)).not.toContain('googleDrive/setGoogleDriveCurrentFileAction');
  });
});
