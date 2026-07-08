let mockDispatch = jest.fn();
let mockSelector = jest.fn();
let mockGenerateEcorisMapData = jest.fn();
let mockOpenEcorisMapFile = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => mockSelector(),
}));

jest.mock('../useEcorismapFile', () => ({
  useEcorisMapFile: () => ({
    generateEcorisMapData: (...args: unknown[]) => mockGenerateEcorisMapData(...args),
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
}));

import { renderHook, act } from '@testing-library/react-hooks';
import { useGoogleDriveProjects } from '../useGoogleDriveProjects';
import { signInGoogleDrive, trySilentSignIn } from '../../lib/googledrive/auth';
import {
  deleteDriveProject,
  downloadDriveProject,
  listDriveProjects,
  uploadDriveProject,
} from '../../lib/googledrive/driveProjectStore';
import { generateEcorisMapZip } from '../../utils/File';
import { DriveProjectItem } from '../../lib/googledrive/types';

const mockSignIn = signInGoogleDrive as jest.MockedFunction<typeof signInGoogleDrive>;
const mockTrySilent = trySilentSignIn as jest.MockedFunction<typeof trySilentSignIn>;
const mockList = listDriveProjects as jest.MockedFunction<typeof listDriveProjects>;
const mockUpload = uploadDriveProject as jest.MockedFunction<typeof uploadDriveProject>;
const mockDownload = downloadDriveProject as jest.MockedFunction<typeof downloadDriveProject>;
const mockDelete = deleteDriveProject as jest.MockedFunction<typeof deleteDriveProject>;
const mockGenerateZip = generateEcorisMapZip as jest.MockedFunction<typeof generateEcorisMapZip>;

const item: DriveProjectItem = {
  fileId: 'f1',
  name: 'test',
  projectId: 'P1',
  updatedAt: '2026-07-08T00:00:00Z',
  size: 100,
  headRevisionId: 'r1',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDispatch = jest.fn();
  mockSelector = jest.fn().mockReturnValue([]);
  mockGenerateEcorisMapData = jest.fn().mockResolvedValue([]);
  mockOpenEcorisMapFile = jest.fn();
});

describe('useGoogleDriveProjects', () => {
  test('connect成功で接続状態と一覧を更新する', async () => {
    mockSignIn.mockResolvedValue({ isOK: true, message: '', email: 'a@example.com' });
    mockList.mockResolvedValue([item]);

    const { result } = renderHook(() => useGoogleDriveProjects());
    await act(async () => {
      const ret = await result.current.connect();
      expect(ret.isOK).toBe(true);
    });
    expect(result.current.isConnected).toBe(true);
    expect(result.current.connectedEmail).toBe('a@example.com');
    expect(result.current.driveProjects).toEqual([item]);
    expect(mockDispatch).toHaveBeenCalled();
  });

  test('connectキャンセルはメッセージなしで失敗を返す', async () => {
    mockSignIn.mockResolvedValue({ isOK: false, message: 'cancelled' });
    const { result } = renderHook(() => useGoogleDriveProjects());
    await act(async () => {
      const ret = await result.current.connect();
      expect(ret).toEqual({ isOK: false, message: '' });
    });
    expect(result.current.isConnected).toBe(false);
  });

  test('initializeはサイレント接続に成功したときだけ一覧を取得する', async () => {
    mockTrySilent.mockResolvedValue({ isOK: false, message: 'not-connected' });
    const { result } = renderHook(() => useGoogleDriveProjects());
    await act(async () => {
      await result.current.initialize();
    });
    expect(result.current.isConnected).toBe(false);
    expect(mockList).not.toHaveBeenCalled();
  });

  test('saveToDriveはzipを生成してアップロードしlastSyncを記録する', async () => {
    mockGenerateZip.mockResolvedValue({ source: '/tmp/test.ecorismap', size: 100 });
    mockUpload.mockResolvedValue(item);

    const { result } = renderHook(() => useGoogleDriveProjects());
    await act(async () => {
      const ret = await result.current.saveToDrive('test');
      expect(ret.isOK).toBe(true);
    });
    expect(mockGenerateEcorisMapData).toHaveBeenCalled();
    expect(mockUpload.mock.calls[0][0].name).toBe('test');
    const dispatched = mockDispatch.mock.calls.map((c) => c[0]);
    expect(dispatched.some((a) => a.type === 'googleDrive/setGoogleDriveLastSyncAction')).toBe(true);
    expect(result.current.driveProjects[0]).toEqual(item);
  });

  test('saveToDriveはzip生成失敗でエラーメッセージを返す', async () => {
    mockGenerateZip.mockResolvedValue(undefined);
    const { result } = renderHook(() => useGoogleDriveProjects());
    await act(async () => {
      const ret = await result.current.saveToDrive('test');
      expect(ret.isOK).toBe(false);
      expect(ret.message).not.toBe('');
    });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  test('loadFromDriveはダウンロードして読み込みlastSyncを記録する', async () => {
    mockDownload.mockResolvedValue('file:///tmp/drive_f1.ecorismap');
    mockOpenEcorisMapFile.mockResolvedValue({ isOK: true, message: '', region: { latitude: 35 } });

    const { result } = renderHook(() => useGoogleDriveProjects());
    let ret;
    await act(async () => {
      ret = await result.current.loadFromDrive(item);
    });
    expect(mockOpenEcorisMapFile).toHaveBeenCalledWith('file:///tmp/drive_f1.ecorismap');
    expect(ret).toEqual({ isOK: true, message: '', region: { latitude: 35 } });
    const dispatched = mockDispatch.mock.calls.map((c) => c[0]);
    expect(dispatched.some((a) => a.type === 'googleDrive/setGoogleDriveLastSyncAction')).toBe(true);
  });

  test('removeFromDriveは削除して一覧とlastSyncから除く', async () => {
    mockSignIn.mockResolvedValue({ isOK: true, message: '', email: 'a@example.com' });
    mockList.mockResolvedValue([item]);
    mockDelete.mockResolvedValue();

    const { result } = renderHook(() => useGoogleDriveProjects());
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      const ret = await result.current.removeFromDrive(item);
      expect(ret.isOK).toBe(true);
    });
    expect(mockDelete).toHaveBeenCalledWith('f1');
    expect(result.current.driveProjects).toEqual([]);
    const dispatched = mockDispatch.mock.calls.map((c) => c[0]);
    expect(dispatched.some((a) => a.type === 'googleDrive/deleteGoogleDriveLastSyncAction')).toBe(true);
  });
});
