/**
 * useProject の同期まわり（docs/SYNC_AUDIT_2026-11.md の S1・S3）
 */
import { renderHook, act } from '@testing-library/react-hooks';

const mockDispatch = jest.fn();
let mockState: any;
jest.mock('react-redux', () => ({
  shallowEqual: jest.fn(),
  useDispatch: () => mockDispatch,
  useSelector: (selector: (s: any) => unknown) => selector(mockState),
  useStore: () => ({ getState: () => mockState }),
}));

const mockRepo = {
  uploadDataToRepository: jest.fn(async () => ({ isOK: true, message: '' })),
  uploadProjectSettings: jest.fn(async () => ({ isOK: true, message: '' })),
  deleteCommonAndTemplateData: jest.fn(async () => ({ isOK: true, message: '' })),
};
jest.mock('../useRepository', () => ({ useRepository: () => mockRepo }));
jest.mock('../../lib/firebase/firestore', () => ({
  downloadCommonData: jest.fn(),
  isSettingsUpdatedAtCurrent: jest.fn(),
  uploadCurrentPosition: jest.fn(),
  deleteCurrentPosition: jest.fn(),
}));
jest.mock('../../utils/projectBackup', () => ({ saveProjectBackup: jest.fn() }));
jest.mock('../useDynamicDictionaryInput', () => ({ clearAllDynamicDictionaries: jest.fn() }));
jest.mock('../useData', () => ({ clearAllVisibilitySnapshots: jest.fn() }));
jest.mock('../../i18n/config', () => ({ t: (key: string) => key }));
jest.mock('../../modules/tileMaps', () => ({ tileMapsInitialState: [], setTileMapsAction: (p: unknown) => ({ type: 'tileMaps/set', payload: p }) }));
jest.mock('../../modules/layers', () => ({ layersInitialState: [], setLayersAction: (p: unknown) => ({ type: 'layers/set', payload: p }) }));

import { useProject } from '../useProject';
import * as projectStore from '../../lib/firebase/firestore';
import { clearDataSyncProjectAction } from '../../modules/dataSync';

beforeEach(() => {
  jest.clearAllMocks();
  mockState = {
    settings: { projectId: 'p1', isSettingProject: true, isSynced: false },
    projects: [{ id: 'p1', name: 'P', members: [{ uid: 'u1', role: 'OWNER' }] }],
    user: { uid: 'u1', email: 'a@b.c', displayName: 'U' },
    layers: [],
    dataSet: [],
    tileMaps: [],
    dataSync: { p1: { l1_PRIVATE: 1 } },
  };
});

test('S1: プロジェクトを閉じて手元を捨てるとき、そのプロジェクトの同期の基準値も捨てる', () => {
  const { result } = renderHook(() => useProject());
  act(() => {
    result.current.clearProject();
  });
  expect(mockDispatch).toHaveBeenCalledWith(clearDataSyncProjectAction('p1'));
});

test('S3: COMMON のレイヤがあれば、クラウドの共通データを取り込んでからまとめて保存する', async () => {
  mockState.layers = [
    { id: 'c1', permission: 'COMMON' },
    { id: 'p1', permission: 'PUBLIC' },
  ];
  mockState.dataSet = [{ layerId: 'c1', userId: 'u1', data: [{ id: 'mine' }] }];
  const cloud = [
    { layerId: 'c1', userId: 'member', data: [{ id: 'm1', field: {} }] },
    { layerId: 'p1', userId: 'member', data: [{ id: 'o1', field: {} }] },
  ];
  (projectStore.downloadCommonData as jest.Mock).mockResolvedValue({ isOK: true, message: '', data: cloud });
  const { result } = renderHook(() => useProject());
  await act(async () => {
    await result.current.saveProjectSetting();
  });
  const options = (mockRepo.uploadDataToRepository as jest.Mock).mock.calls[0][2];
  expect(options.commonAbsorption.extraCommonDataSet).toEqual([
    { layerId: 'c1', userId: 'u1', data: [{ id: 'm1', field: {} }] },
  ]);
  expect(options.commonAbsorption.representedUserIds).toEqual({ c1: ['member'] });
});

test('S3: 共通データの取得に失敗したら、共通データを保存せずに止める', async () => {
  mockState.layers = [{ id: 'c1', permission: 'COMMON' }];
  (projectStore.downloadCommonData as jest.Mock).mockResolvedValue({ isOK: false, message: 'fail' });
  const { result } = renderHook(() => useProject());
  await expect(result.current.saveProjectSetting()).rejects.toThrow('fail');
  expect(mockRepo.uploadDataToRepository).not.toHaveBeenCalled();
});

test('COMMON のレイヤが無ければクラウドから取り込まない', async () => {
  const { result } = renderHook(() => useProject());
  await act(async () => {
    await result.current.saveProjectSetting();
  });
  expect(projectStore.downloadCommonData).not.toHaveBeenCalled();
  expect(mockRepo.uploadDataToRepository).toHaveBeenCalledWith(expect.anything(), 'Common', { commonAbsorption: undefined });
});

describe('M2: 設定モードで開いた後に別の端末で保存されたかを確かめる', () => {
  test('開いたときの更新日時でクラウドの設定と比べる', async () => {
    mockState.settings.updatedAt = '2026-11-22T00:00:00.000Z';
    (projectStore.isSettingsUpdatedAtCurrent as jest.Mock).mockResolvedValue(false);
    const { result } = renderHook(() => useProject());
    await expect(result.current.isProjectSettingCurrent()).resolves.toBe(false);
    expect(projectStore.isSettingsUpdatedAtCurrent).toHaveBeenCalledWith('p1', '2026-11-22T00:00:00.000Z');
  });

  test('確かめられない（通信できない）ときは、別の端末で保存されたかもしれないとして扱う', async () => {
    (projectStore.isSettingsUpdatedAtCurrent as jest.Mock).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useProject());
    await expect(result.current.isProjectSettingCurrent()).resolves.toBe(false);
  });
});
