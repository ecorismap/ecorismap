import React from 'react';
import { act, render } from '@testing-library/react-native';
import { SettingsContext } from '../../contexts/Settings';
import { Platform } from 'react-native';

// Web で言語を変えたら、スロットル待ちの状態を書き終えてから再読み込みする（設定監査 S-L4）

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
jest.mock('../../utils/appLanguage', () => ({ getStoredLanguage: jest.fn(() => 'ja'), setStoredLanguage: jest.fn() }));
const mockEvents: string[] = [];
let mockResolveFlush: (() => void) | undefined;
jest.mock('../../utils/persistFlush', () => ({
  flushPersistence: () => {
    mockEvents.push('flush:start');
    return new Promise<void>((resolve) => {
      mockResolveFlush = () => {
        mockEvents.push('flush:done');
        resolve();
      };
    });
  },
}));
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
const mockLanguageModal: { pressSelect?: (language: 'ja' | 'en' | null) => Promise<void> } = {};
jest.mock('../../components/organisms/SettingsModalLanguageSelect', () => ({
  SettingsModalLanguageSelect: (props: { pressSelect: (language: 'ja' | 'en' | null) => Promise<void> }) => {
    mockLanguageModal.pressSelect = props.pressSelect;
    return null;
  },
}));

import SettingsContainers from '../Settings';

describe('言語の切り替え（Web）', () => {
  const originalOS = Platform.OS;
  const reload = jest.fn(() => {
    mockEvents.push('reload');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockEvents.length = 0;
    mockResolveFlush = undefined;
    Platform.OS = 'web';
    Object.defineProperty(window, 'location', { value: { reload }, configurable: true, writable: true });
  });
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('永続化の書き出しが終わるまで再読み込みしない', async () => {
    await render(<SettingsContainers />);
    let done: Promise<void> | undefined;
    await act(async () => {
      done = mockLanguageModal.pressSelect!('en');
      await Promise.resolve();
    });
    expect(mockEvents).toEqual(['flush:start']);
    expect(reload).not.toHaveBeenCalled();

    await act(async () => {
      mockResolveFlush?.();
      await done;
    });
    expect(mockEvents).toEqual(['flush:start', 'flush:done', 'reload']);
  });

  it('同じ言語を選んだときは書き出しも再読み込みもしない', async () => {
    await render(<SettingsContainers />);
    await act(async () => {
      await mockLanguageModal.pressSelect!('ja');
    });
    expect(mockEvents).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
  });
});
