import { renderHook, act } from '@testing-library/react-hooks';
import { useEcorisMapFile } from '../useEcorismapFile';
import { settingsInitialState } from '../../modules/settings';
import { RegionType } from '../../types';

//描いていた場所（初期位置とは別の場所）
const currentRegion: RegionType = {
  latitude: 43.06,
  longitude: 141.35,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
  zoom: 15,
};

const mockDispatch = jest.fn();
const mockState = {
  settings: {
    ...settingsInitialState,
    mapRegion: currentRegion,
    agreedTermsVersion: '1',
    isOffline: true,
    gpsAccuracy: 'LOW',
    externalGnss: { baudRate: 115200, antennaHeight: 1.5, autoConnect: true, ntrip: { enabled: false } },
    proximityAlert: { enabled: true, targetLayerIds: ['layer-now'], distanceThreshold: 30 },
    tileRegions: [{ id: 'r1', tileMapId: 'standard', coords: [], centroid: { latitude: 0, longitude: 0 } }],
  },
  layers: [],
  tileMaps: [],
  dataSet: [],
  user: {},
  projects: [],
  dataSync: {},
};

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: unknown) => unknown) => selector(mockState),
  useStore: () => ({ getState: () => mockState }),
  shallowEqual: jest.fn(),
}));
jest.mock('../../utils/SQLite', () => ({ deleteDatabase: jest.fn(), importDictionary: jest.fn() }));
jest.mock('../useRepository', () => ({ useRepository: () => ({}) }));
jest.mock('../useGeoFile', () => ({ useGeoFile: () => ({}) }));
jest.mock('../useDynamicDictionaryInput', () => ({ clearAllDynamicDictionaries: jest.fn() }));
jest.mock('../useData', () => ({ clearAllVisibilitySnapshots: jest.fn() }));
jest.mock('../../utils/projectBackup', () => ({
  saveProjectBackup: jest.fn(),
  saveProjectBackupWithResult: jest.fn(() => 'saved'),
}));
const mockBackupBeforeReplace = jest.fn(async (_state: unknown, _trigger: string) => true);
jest.mock('../../utils/backupBeforeReplace', () => ({
  backupBeforeReplace: (state: unknown, trigger: string) => mockBackupBeforeReplace(state, trigger),
}));
const mockUnzipFromUri = jest.fn();
jest.mock('../../utils/Zip', () => ({
  ...jest.requireActual('../../utils/Zip'),
  unzipFromUri: (uri: string) => mockUnzipFromUri(uri),
}));
// 書き出した時点で、置き換えの dispatch がどこまで済んでいたかを控える
const mockDispatchedAtFlush: string[][] = [];
jest.mock('../../utils/persistFlush', () => ({
  flushPersistence: () => {
    mockDispatchedAtFlush.push(mockDispatch.mock.calls.map(([a]) => a?.type));
    return Promise.resolve();
  },
}));

describe('clearEcorisMap', () => {
  beforeEach(() => mockDispatch.mockClear());

  it('地図の表示位置は初期値に戻さない（表示とずれて描画位置が飛ぶため）', async () => {
    const { result } = renderHook(() => useEcorisMapFile());
    await act(async () => {
      await result.current.clearEcorisMap();
    });

    const settingsPayload = mockDispatch.mock.calls
      .map((c) => c[0])
      .find((action) => action?.type === 'settings/setSettingsAction')?.payload;
    expect(settingsPayload).toBeDefined();
    //クリアしても地図は動かないので、状態の位置も今の表示のままにする
    expect(settingsPayload.mapRegion).toEqual(currentRegion);
    //利用規約の同意とチュートリアルの状況も引き継ぐ
    expect(settingsPayload.agreedTermsVersion).toBe('1');
    //それ以外は初期値に戻る
    expect(settingsPayload.mapType).toBe(settingsInitialState.mapType);
    expect(settingsPayload.projectId).toBeUndefined();
  });

  it('端末ローカルの設定（外部GNSS・GPS精度・オフライン・保存範囲・接近通知）は引き継ぐ（永続化監査 S-M2）', async () => {
    const { result } = renderHook(() => useEcorisMapFile());
    await act(async () => {
      await result.current.clearEcorisMap();
    });
    const settingsPayload = mockDispatch.mock.calls
      .map((c) => c[0])
      .find((action) => action?.type === 'settings/setSettingsAction')?.payload;
    expect(settingsPayload.externalGnss.antennaHeight).toBe(1.5);
    expect(settingsPayload.externalGnss.autoConnect).toBe(true);
    expect(settingsPayload.gpsAccuracy).toBe('LOW');
    expect(settingsPayload.isOffline).toBe(true);
    expect(settingsPayload.tileRegions).toHaveLength(1);
    //対象レイヤはレイヤごと消えるので空にし、有効・距離は残す
    expect(settingsPayload.proximityAlert).toEqual({ enabled: true, targetLayerIds: [], distanceThreshold: 30 });
    //位置共有はクリアで切れる
    expect(settingsPayload.isSynced).toBe(false);
  });

  it('置き換えたスライスがすべて揃ってから永続化の書き込み待ちを書き出す（設定監査 S-L3）', async () => {
    mockDispatchedAtFlush.length = 0;
    const { result } = renderHook(() => useEcorisMapFile());
    await act(async () => {
      await result.current.clearEcorisMap();
    });
    expect(mockDispatchedAtFlush).toHaveLength(1);
    expect(mockDispatchedAtFlush[0]).toEqual(
      expect.arrayContaining([
        'layers/setLayersAction',
        'dataSet/setDataSetAction',
        'tileMaps/setTileMapsAction',
        'settings/setSettingsAction',
      ])
    );
  });
});

describe('openEcorisMapFile の自動バックアップ（永続化監査 S-L2）', () => {
  beforeEach(() => {
    mockDispatch.mockClear();
    mockUnzipFromUri.mockReset();
    mockBackupBeforeReplace.mockReset();
  });

  it('バックアップを作れず取りやめたら、ZIPを読まない（辞書の取り込み・写真の展開も起きない）し何も置き換えない', async () => {
    mockBackupBeforeReplace.mockResolvedValue(false);
    const { importDictionary } = jest.requireMock('../../utils/SQLite') as { importDictionary: jest.Mock };
    importDictionary.mockClear();
    const { result } = renderHook(() => useEcorisMapFile());
    let ret: { isOK: boolean; message: string } | undefined;
    await act(async () => {
      ret = await result.current.openEcorisMapFile('file:///x.ecorismap');
    });
    expect(ret).toEqual({ isOK: false, message: '' });
    expect(mockBackupBeforeReplace).toHaveBeenCalledWith(mockState, 'fileOpen');
    expect(mockUnzipFromUri).not.toHaveBeenCalled();
    expect(importDictionary).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('続けるなら、バックアップの後でZIPを読む', async () => {
    mockBackupBeforeReplace.mockResolvedValue(true);
    mockUnzipFromUri.mockResolvedValue({ files: {} });
    const { result } = renderHook(() => useEcorisMapFile());
    await act(async () => {
      await result.current.openEcorisMapFile('file:///x.ecorismap');
    });
    expect(mockUnzipFromUri).toHaveBeenCalledWith('file:///x.ecorismap');
    expect(mockBackupBeforeReplace.mock.invocationCallOrder[0]).toBeLessThan(
      mockUnzipFromUri.mock.invocationCallOrder[0]
    );
  });
});
