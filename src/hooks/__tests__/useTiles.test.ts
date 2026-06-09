import { renderHook, act } from '@testing-library/react-hooks';
import { TileMapType, TileRegionType } from '../../types';
import { useTiles } from '../useTiles';

// テスト用の地図データ
const tileMaps: TileMapType[] = [
  {
    id: 'M1',
    name: 'Map 1',
    url: 'https://example.com/tiles1/{z}/{x}/{y}.png',
    attribution: 'Test Attribution 1',
    maptype: 'none',
    visible: true,
    transparency: 0,
    overzoomThreshold: 18,
    highResolutionEnabled: false,
    minimumZ: 0,
    maximumZ: 18,
    flipY: false,
  },
  {
    id: 'M2',
    name: 'Map 2',
    url: 'https://example.com/tiles2/{z}/{x}/{y}.png',
    attribution: 'Test Attribution 2',
    maptype: 'none',
    visible: true,
    transparency: 0,
    overzoomThreshold: 18,
    highResolutionEnabled: false,
    minimumZ: 0,
    maximumZ: 18,
    flipY: false,
  },
];

let mockDispatch = jest.fn();
let mockSelector = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => mockSelector(),
  shallowEqual: jest.fn(),
}));

jest.mock('../useWindow', () => ({
  useWindow: () => ({
    mapRegion: {
      latitude: 35.0,
      longitude: 135.0,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
      zoom: 11,
    },
  }),
}));

jest.mock('expo-file-system/legacy', () => ({
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  downloadAsync: jest.fn(() => Promise.resolve({ uri: 'file://tile', status: 200 })),
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: false })),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  deleteAsync: jest.fn(() => Promise.resolve()),
  EncodingType: { UTF8: 'utf8' },
}));

jest.mock('../../components/molecules/AlertAsync', () => ({
  AlertAsync: jest.fn(() => Promise.resolve(true)),
  ConfirmAsync: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('../../utils/Tile', () => ({
  tileGridForRegion: jest.fn(() => [{ x: 0, y: 0, z: 0 }]),
}));

jest.mock('pmtiles', () => ({
  PMTiles: jest.fn(),
}));

// dispatchされたeditSettingsActionからtileRegionsペイロードを取得するヘルパー
const getDispatchedTileRegions = (): TileRegionType[][] => {
  return mockDispatch.mock.calls
    .map((call) => call[0]?.payload?.tileRegions)
    .filter((tileRegions) => tileRegions !== undefined);
};

describe('useTiles', () => {
  beforeEach(() => {
    mockDispatch = jest.fn();
    mockSelector = jest.fn().mockReturnValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('downloadMultipleTiles', () => {
    test('複数地図をダウンロードすると各地図に個別のtileRegionが保存される', async () => {
      const { result } = renderHook(() => useTiles(undefined, [], tileMaps));

      await act(async () => {
        await result.current.downloadMultipleTiles(11, tileMaps);
      });

      const dispatched = getDispatchedTileRegions();
      expect(dispatched.length).toBeGreaterThan(0);

      // 最後にdispatchされたtileRegionsに全地図の記録が含まれる
      const finalTileRegions = dispatched[dispatched.length - 1];
      expect(finalTileRegions).toHaveLength(2);
      expect(finalTileRegions.map((r) => r.tileMapId).sort()).toEqual(['M1', 'M2']);

      // 各記録はユニークなIDを持つ
      const ids = finalTileRegions.map((r) => r.id);
      expect(new Set(ids).size).toBe(2);
    });

    test('既存のtileRegionsがある場合も既存記録が保持される', async () => {
      const existingRegion: TileRegionType = {
        id: 'EXISTING',
        tileMapId: 'M0',
        coords: [
          { latitude: 34.0, longitude: 134.0 },
          { latitude: 34.1, longitude: 134.0 },
          { latitude: 34.1, longitude: 134.1 },
          { latitude: 34.0, longitude: 134.1 },
        ],
        centroid: { latitude: 34.05, longitude: 134.05 },
      };
      mockSelector = jest.fn().mockReturnValue([existingRegion]);

      const { result } = renderHook(() => useTiles(undefined, [], tileMaps));

      await act(async () => {
        await result.current.downloadMultipleTiles(11, tileMaps);
      });

      const dispatched = getDispatchedTileRegions();
      const finalTileRegions = dispatched[dispatched.length - 1];
      expect(finalTileRegions).toHaveLength(3);
      expect(finalTileRegions.map((r) => r.tileMapId).sort()).toEqual(['M0', 'M1', 'M2']);
    });
  });
});
