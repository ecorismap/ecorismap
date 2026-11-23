import React from 'react';
import { act, render } from '@testing-library/react-native';
import { SettingsContext } from '../../contexts/Settings';

// 「新規」で自動バックアップを作れず、続けるのを取りやめたら何も消さない（永続化監査 S-L2）

const mockClearTileCache = jest.fn(async () => undefined);
const mockClearEcorisMap = jest.fn(async () => ({ isOK: true, message: '' }));
const mockBackupBeforeReplace = jest.fn(async (_state: unknown, _trigger: string) => true);
const mockCaptured: { ctx?: React.ContextType<typeof SettingsContext> } = {};

jest.mock('../../components/pages/Settings', () => {
  const { useContext: useCtx } = jest.requireActual('react');
  const { SettingsContext: Ctx } = jest.requireActual('../../contexts/Settings');
  return function MockSettings() {
    mockCaptured.ctx = useCtx(Ctx);
    return null;
  };
});
jest.mock('../../components/molecules/AlertAsync', () => ({
  AlertAsync: jest.fn(async () => undefined),
  ConfirmAsync: jest.fn(async () => true),
  waitForModalTransition: jest.fn(async () => undefined),
}));
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(async (uri: string) => ({ exists: true, uri })),
  deleteAsync: jest.fn(async () => undefined),
  documentDirectory: 'file:///doc/',
  cacheDirectory: 'file:///cache/',
}));
jest.mock('../../contexts/BottomSheetNavigationContext', () => ({
  useBottomSheetNavigation: () => ({ navigate: jest.fn(), navigateToHome: jest.fn() }),
}));
jest.mock('react-redux', () => ({
  useDispatch: () => jest.fn(),
  useSelector: (selector: (s: unknown) => unknown) =>
    selector({ layers: [], dataSet: [], tileMaps: [], settings: {}, user: {} }),
  useStore: () => ({ getState: () => ({}) }),
}));
jest.mock('../../modules/selectors', () => ({ selectNonDeletedDataSet: () => [] }));
jest.mock('../../hooks/useMaps', () => ({
  useMaps: () => ({ mapListURL: '', saveMapListURL: jest.fn(), clearTileCache: mockClearTileCache }),
}));
jest.mock('../../hooks/useProjectBackup', () => ({
  useProjectBackup: () => ({
    backupList: [],
    refreshBackupList: jest.fn(),
    canRestoreBackup: jest.fn(),
    restoreBackup: jest.fn(),
    deleteBackup: jest.fn(),
    clearAllBackups: jest.fn(),
  }),
}));
jest.mock('../../hooks/useEcorismapFile', () => ({
  useEcorisMapFile: () => ({
    clearEcorisMap: () => mockClearEcorisMap(),
    generateEcorisMapData: jest.fn(),
    openEcorisMapFile: jest.fn(),
    createExportSettings: jest.fn(),
  }),
}));
jest.mock('../../hooks/usePermission', () => ({ usePermission: () => ({ isRunningProject: false }) }));
jest.mock('../../utils/projectBackup', () => ({ saveProjectBackup: jest.fn() }));
jest.mock('../../utils/File', () => ({ exportGeoFile: jest.fn() }));
jest.mock('../../utils/appLanguage', () => ({ getStoredLanguage: jest.fn(), setStoredLanguage: jest.fn() }));
jest.mock('../../utils/trackingLeaveGuard', () => ({
  replaceDataWithTrackingGuard: async (
    _kind: string,
    confirm: () => Promise<true | undefined>,
    action: () => Promise<void>
  ) => {
    if ((await confirm()) === undefined) return;
    await action();
  },
}));
jest.mock('../../utils/backupBeforeReplace', () => ({
  backupBeforeReplace: (state: unknown, trigger: string) => mockBackupBeforeReplace(state, trigger),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('../../components/organisms/SettingsModalBackupSelect', () => ({ SettingsModalBackupSelect: () => null }));
jest.mock('../../components/organisms/SettingsModalMapListURL', () => ({ SettingsModalMapListURL: () => null }));
jest.mock('../../components/organisms/SettingsModalProximityAlert', () => ({
  SettingsModalProximityAlert: () => null,
}));
jest.mock('../../components/organisms/SettingsModalStorageSelect', () => ({
  SettingsModalStorageSelect: () => null,
}));
jest.mock('../../components/organisms/SettingsModalLanguageSelect', () => ({
  SettingsModalLanguageSelect: () => null,
}));

import SettingsContainers from '../Settings';

describe('新規の前の自動バックアップ（永続化監査 S-L2）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCaptured.ctx = undefined;
  });

  it('作れず取りやめたら、データを消さない', async () => {
    mockBackupBeforeReplace.mockResolvedValueOnce(false);
    await render(<SettingsContainers />);
    await act(async () => {
      await mockCaptured.ctx!.pressClearData();
    });
    expect(mockBackupBeforeReplace).toHaveBeenCalledWith(expect.anything(), 'fileNew');
    expect(mockClearEcorisMap).not.toHaveBeenCalled();
  });

  it('続けるなら消す', async () => {
    await render(<SettingsContainers />);
    await act(async () => {
      await mockCaptured.ctx!.pressClearData();
    });
    expect(mockClearEcorisMap).toHaveBeenCalledTimes(1);
  });
});
