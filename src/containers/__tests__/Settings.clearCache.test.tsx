import React from 'react';
import { act, render } from '@testing-library/react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { SettingsContext } from '../../contexts/Settings';
import { ConfirmAsync, AlertAsync } from '../../components/molecules/AlertAsync';
import ja from '../../i18n/ja/translation.json';
import en from '../../i18n/en/translation.json';

// 設定画面の「キャッシュをクリア」は地図のキャッシュだけを消し、写真フォルダには触れない（写真監査 P-M6）

const mockClearTileCache = jest.fn(async () => undefined);
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
    clearEcorisMap: jest.fn(),
    generateEcorisMapData: jest.fn(),
    openEcorisMapFile: jest.fn(),
    createExportSettings: jest.fn(),
  }),
}));
jest.mock('../../hooks/usePermission', () => ({ usePermission: () => ({ isRunningProject: false }) }));
jest.mock('../../utils/projectBackup', () => ({ saveProjectBackup: jest.fn() }));
jest.mock('../../utils/File', () => ({ exportGeoFile: jest.fn() }));
jest.mock('../../utils/appLanguage', () => ({ getStoredLanguage: jest.fn(), setStoredLanguage: jest.fn() }));
jest.mock('../../utils/trackingLeaveGuard', () => ({ replaceDataWithTrackingGuard: jest.fn() }));
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

describe('設定のキャッシュクリア（P-M6）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCaptured.ctx = undefined;
  });

  it('地図のキャッシュだけを消し、写真フォルダは消さない', async () => {
    await render(<SettingsContainers />);
    expect(mockCaptured.ctx).toBeDefined();
    await act(async () => {
      await mockCaptured.ctx!.pressClearCache();
    });
    expect(ConfirmAsync).toHaveBeenCalledTimes(1);
    expect(mockClearTileCache).toHaveBeenCalledTimes(1);
    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    expect(AlertAsync).toHaveBeenCalledTimes(1);
  });

  it('確認で取り消せば何も消さない', async () => {
    (ConfirmAsync as jest.Mock).mockResolvedValueOnce(false);
    await render(<SettingsContainers />);
    await act(async () => {
      await mockCaptured.ctx!.pressClearCache();
    });
    expect(mockClearTileCache).not.toHaveBeenCalled();
    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  });

  it('写真だけを消す入口（pressClearPhotoCache）はもう無い', async () => {
    await render(<SettingsContainers />);
    expect(mockCaptured.ctx as unknown as Record<string, unknown>).not.toHaveProperty('pressClearPhotoCache');
  });

  it('確認文は写真が消えるとは言わず、写真は残ると伝える', () => {
    expect(ja.Settings.confirm.clearCache).not.toMatch(/地図と写真/);
    expect(ja.Settings.confirm.clearCache).toMatch(/写真/);
    expect(en.Settings.confirm.clearCache).not.toMatch(/maps and photos/);
    expect(en.Settings.confirm.clearCache).toMatch(/Photos/);
  });
});
