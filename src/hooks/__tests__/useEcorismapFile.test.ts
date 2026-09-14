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
  settings: { ...settingsInitialState, mapRegion: currentRegion, agreedTermsVersion: '1' },
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
jest.mock('../../utils/projectBackup', () => ({ saveProjectBackup: jest.fn() }));

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
});
