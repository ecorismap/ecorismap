/**
 * タイル監査 M-M20: プロジェクトを閉じて地図一覧を初期状態に戻すとき、背景の地図種別も戻す
 */
import { renderHook, act } from '@testing-library/react-hooks';

const mockDispatch = jest.fn();
let mockState: Record<string, unknown>;
jest.mock('react-redux', () => ({
  shallowEqual: jest.fn(),
  useDispatch: () => mockDispatch,
  useSelector: (selector: (s: unknown) => unknown) => selector(mockState),
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
jest.mock('../../modules/tileMaps', () => ({
  tileMapsInitialState: [
    { id: 'hybrid', visible: false },
    { id: 'standard', visible: true },
  ],
  setTileMapsAction: (p: unknown) => ({ type: 'tileMaps/set', payload: p }) }));
jest.mock('../../modules/layers', () => ({ layersInitialState: [], setLayersAction: (p: unknown) => ({ type: 'layers/set', payload: p }) }));

import { useProject } from '../useProject';

test('衛星写真で閉じても、初期一覧（標準地図を表示）に合わせて mapType を戻す', () => {
  mockState = {
    settings: { projectId: 'p1', isSettingProject: false, isSynced: false, mapType: 'hybrid' },
    projects: [{ id: 'p1', name: 'P', members: [{ uid: 'u1', role: 'OWNER' }] }],
    user: { uid: 'u1', email: 'a@b.c', displayName: 'U' },
    layers: [],
    dataSet: [],
    tileMaps: [],
    dataSync: {},
  };
  const { result } = renderHook(() => useProject());
  act(() => {
    result.current.clearProject();
  });
  const settingsAction = mockDispatch.mock.calls
    .map(([a]) => a)
    .find((a) => a.type === 'settings/editSettingsAction' && 'mapType' in a.payload);
  expect(settingsAction.payload.mapType).toBe('standard');
});
