import { renderHook, act } from '@testing-library/react-hooks';
import { TileMapType, TileRegionType } from '../../types';
import { useTiles } from '../useTiles';
import { getDemViewshedTileMap } from '../../utils/demTileDownload';
import * as FileSystem from 'expo-file-system/legacy';
import { ResumeDownloadConfirmAsync, StopDownloadConfirmAsync } from '../../components/molecules/AlertAsync';

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
// useStore().getState()用（非同期ループ中のstore直接読み取りに対応）
let mockTileRegions: TileRegionType[] = [];

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => mockSelector(),
  useStore: () => ({
    getState: () => ({ settings: { tileRegions: mockTileRegions }, tileMaps: [] }),
  }),
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
  documentDirectory: 'file:///test/',
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  downloadAsync: jest.fn(() => Promise.resolve({ uri: 'file://tile', status: 200 })),
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: false })),
  readDirectoryAsync: jest.fn(() => Promise.reject(new Error('not found'))),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  deleteAsync: jest.fn(() => Promise.resolve()),
  EncodingType: { UTF8: 'utf8' },
}));

// 進捗文字列の検証のため、補間パラメータを含めて返すようにモックする
jest.mock('../../i18n/config', () => ({
  t: jest.fn((key: string, options?: Record<string, unknown>) =>
    options
      ? `${key}:${Object.entries(options)
          .map(([k, v]) => `${k}=${v}`)
          .join(',')}`
      : key
  ),
}));

jest.mock('../../components/molecules/AlertAsync', () => ({
  AlertAsync: jest.fn(() => Promise.resolve(true)),
  ConfirmAsync: jest.fn(() => Promise.resolve(true)),
  StopDownloadConfirmAsync: jest.fn(() => Promise.resolve('discard')),
  ResumeDownloadConfirmAsync: jest.fn(() => Promise.resolve('later')),
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
    mockTileRegions = [];
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
      mockTileRegions = [existingRegion];

      const { result } = renderHook(() => useTiles(undefined, [], tileMaps));

      await act(async () => {
        await result.current.downloadMultipleTiles(11, tileMaps);
      });

      const dispatched = getDispatchedTileRegions();
      const finalTileRegions = dispatched[dispatched.length - 1];
      expect(finalTileRegions).toHaveLength(3);
      expect(finalTileRegions.map((r) => r.tileMapId).sort()).toEqual(['M0', 'M1', 'M2']);
    });

    test('開始時に全地図の記録がstatus=downloadingとzoom付きで作成される', async () => {
      const { result } = renderHook(() => useTiles(undefined, [], tileMaps));

      await act(async () => {
        await result.current.downloadMultipleTiles(11, tileMaps);
      });

      const dispatched = getDispatchedTileRegions();
      // 最初のdispatchで全地図分が'downloading'として保存される（強制終了時の再開検出用）
      const initialTileRegions = dispatched[0];
      expect(initialTileRegions).toHaveLength(2);
      initialTileRegions.forEach((r) => {
        expect(r.status).toBe('downloading');
        expect(r.zoom).toBe(11);
      });
    });

    test('完了時にstatus/zoomが除去される', async () => {
      const { result } = renderHook(() => useTiles(undefined, [], tileMaps));

      await act(async () => {
        await result.current.downloadMultipleTiles(11, tileMaps);
      });

      const dispatched = getDispatchedTileRegions();
      const finalTileRegions = dispatched[dispatched.length - 1];
      finalTileRegions.forEach((r) => {
        expect(r.status).toBeUndefined();
        expect(r.zoom).toBeUndefined();
      });
    });

    test('中断して一時停止を選ぶと記録がpausedで保持される', async () => {
      (StopDownloadConfirmAsync as jest.Mock).mockResolvedValue('pause');
      const { result } = renderHook(() => useTiles(undefined, [], tileMaps));

      await act(async () => {
        result.current.stopDownloadTiles();
        await result.current.downloadMultipleTiles(11, tileMaps);
      });

      const dispatched = getDispatchedTileRegions();
      const finalTileRegions = dispatched[dispatched.length - 1];
      expect(finalTileRegions).toHaveLength(2);
      finalTileRegions.forEach((r) => {
        expect(r.status).toBe('paused');
      });
      // 一時停止ではタイルのダウンロードは行われない
      expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
    });

    test('中断して破棄を選ぶと未完了の記録が削除される', async () => {
      (StopDownloadConfirmAsync as jest.Mock).mockResolvedValue('discard');
      const { result } = renderHook(() => useTiles(undefined, [], tileMaps));

      await act(async () => {
        result.current.stopDownloadTiles();
        await result.current.downloadMultipleTiles(11, tileMaps);
      });

      const dispatched = getDispatchedTileRegions();
      const finalTileRegions = dispatched[dispatched.length - 1];
      expect(finalTileRegions).toHaveLength(0);
    });

    test('再開時は保存済みタイルをスキップして残りだけダウンロードする', async () => {
      const pausedRegion: TileRegionType = {
        id: 'R1',
        tileMapId: 'M1',
        coords: [
          { latitude: 34.9975, longitude: 134.9975 },
          { latitude: 35.0025, longitude: 134.9975 },
          { latitude: 35.0025, longitude: 135.0025 },
          { latitude: 34.9975, longitude: 135.0025 },
        ],
        centroid: { latitude: 35.0, longitude: 135.0 },
        status: 'paused',
        zoom: 11,
      };
      mockSelector = jest.fn().mockReturnValue([pausedRegion]);
      mockTileRegions = [pausedRegion];
      // タイル0/0/0が既に保存されている状態
      (FileSystem.readDirectoryAsync as jest.Mock).mockImplementation((path: string) => {
        if (path.endsWith('/M1')) return Promise.resolve(['0', 'style.json']);
        if (path.endsWith('/M1/0')) return Promise.resolve(['0']);
        if (path.endsWith('/M1/0/0')) return Promise.resolve(['0']);
        return Promise.reject(new Error('not found'));
      });

      const { result } = renderHook(() => useTiles(undefined, [], tileMaps));

      await act(async () => {
        await result.current.downloadMultipleTiles(11, [tileMaps[0]], [pausedRegion]);
      });

      // 全タイル（1枚）が保存済みなのでダウンロードは発生しない
      expect(FileSystem.downloadAsync).not.toHaveBeenCalled();

      // 記録は既存IDのまま完了扱いになる
      const dispatched = getDispatchedTileRegions();
      const finalTileRegions = dispatched[dispatched.length - 1];
      expect(finalTileRegions).toHaveLength(1);
      expect(finalTileRegions[0].id).toBe('R1');
      expect(finalTileRegions[0].status).toBeUndefined();
    });

    test('再開時の進捗はスキップ済みタイルを含めた割合から始まる', async () => {
      const pausedRegion: TileRegionType = {
        id: 'R1',
        tileMapId: 'M1',
        coords: [
          { latitude: 34.9975, longitude: 134.9975 },
          { latitude: 35.0025, longitude: 134.9975 },
          { latitude: 35.0025, longitude: 135.0025 },
          { latitude: 34.9975, longitude: 135.0025 },
        ],
        centroid: { latitude: 35.0, longitude: 135.0 },
        status: 'paused',
        zoom: 11,
      };
      mockSelector = jest.fn().mockReturnValue([pausedRegion]);
      mockTileRegions = [pausedRegion];
      // 全12タイル中10タイルが保存済みの状態
      const { tileGridForRegion } = jest.requireMock('../../utils/Tile');
      tileGridForRegion.mockReturnValueOnce(Array.from({ length: 12 }, (_, k) => ({ x: 5, y: k + 1, z: 10 })));
      (FileSystem.readDirectoryAsync as jest.Mock).mockImplementation((path: string) => {
        if (path.endsWith('/M1')) return Promise.resolve(['10']);
        if (path.endsWith('/M1/10')) return Promise.resolve(['5']);
        if (path.endsWith('/M1/10/5')) return Promise.resolve(Array.from({ length: 10 }, (_, k) => `${k + 1}`));
        return Promise.reject(new Error('not found'));
      });

      const { result } = renderHook(() => useTiles(undefined, [], tileMaps));

      await act(async () => {
        await result.current.downloadMultipleTiles(11, [tileMaps[0]], [pausedRegion]);
      });

      // 残り2タイルのみダウンロードされる
      expect(FileSystem.downloadAsync).toHaveBeenCalledTimes(2);
      // 進捗表示は10/12=83%から始まる（0%に戻らない）
      expect(result.current.downloadProgress).toContain('progress=83');
    });

    describe('可視領域用DEM（疑似地図）', () => {
      afterEach(() => {
        // 後続テストのためにdownloadAsyncのデフォルト実装（status 200）へ戻す
        (FileSystem.downloadAsync as jest.Mock).mockImplementation(() =>
          Promise.resolve({ uri: 'file://tile', status: 200 })
        );
      });

      test('GSIが404のタイルはterrariumへフォールバックし0バイトマーカーを書く', async () => {
        (FileSystem.downloadAsync as jest.Mock).mockImplementation(async (url: string, uri: string) =>
          url.includes('cyberjapandata') ? { uri, status: 404 } : { uri, status: 200 }
        );
        const demMap = getDemViewshedTileMap();
        const { result } = renderHook(() => useTiles(undefined, [demMap.id], tileMaps));

        await act(async () => {
          await result.current.downloadMultipleTiles(11, [demMap]);
        });

        const urls = (FileSystem.downloadAsync as jest.Mock).mock.calls.map((call) => call[0]);
        expect(urls.some((url) => url.includes('cyberjapandata'))).toBe(true);
        expect(urls.some((url) => url.includes('elevation-tiles-prod'))).toBe(true);
        expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(expect.stringContaining('dem_viewshed/gsi/'), '');

        // 完了記録がdem_viewshed名義で保存される
        const dispatched = getDispatchedTileRegions();
        const finalTileRegions = dispatched[dispatched.length - 1];
        const demRegion = finalTileRegions.find((r) => r.tileMapId === demMap.id);
        expect(demRegion).toBeDefined();
        expect(demRegion?.status).toBeUndefined();
      });

      test('再開時にdem_viewshedのregionがorphan破棄されず再開される', async () => {
        const demRegion: TileRegionType = {
          id: 'RD',
          tileMapId: 'dem_viewshed',
          coords: [
            { latitude: 34.0, longitude: 134.0 },
            { latitude: 34.1, longitude: 134.0 },
            { latitude: 34.1, longitude: 134.1 },
            { latitude: 34.0, longitude: 134.1 },
          ],
          centroid: { latitude: 34.05, longitude: 134.05 },
          status: 'paused',
          zoom: 11,
        };
        mockSelector = jest.fn().mockReturnValue([demRegion]);
        mockTileRegions = [demRegion];

        const { result } = renderHook(() => useTiles(undefined, [], tileMaps));

        await act(async () => {
          await result.current.resumeDownloadTiles();
        });

        // Redux tileMapsに存在しない疑似地図でもダウンロードが実行され、完了記録になる
        expect(FileSystem.downloadAsync).toHaveBeenCalled();
        const dispatched = getDispatchedTileRegions();
        const finalTileRegions = dispatched[dispatched.length - 1];
        const resumed = finalTileRegions.find((r) => r.tileMapId === 'dem_viewshed');
        expect(resumed).toBeDefined();
        expect(resumed?.status).toBeUndefined();
      });
    });
  });

  describe('起動時の未完了ダウンロード検出', () => {
    const pausedRegion: TileRegionType = {
      id: 'R1',
      tileMapId: 'M1',
      coords: [
        { latitude: 34.0, longitude: 134.0 },
        { latitude: 34.1, longitude: 134.0 },
        { latitude: 34.1, longitude: 134.1 },
        { latitude: 34.0, longitude: 134.1 },
      ],
      centroid: { latitude: 34.05, longitude: 134.05 },
      status: 'paused',
      zoom: 11,
    };

    test('破棄を選ぶと未完了の記録が削除され、以後は確認されない', async () => {
      mockSelector = jest.fn().mockReturnValue([pausedRegion]);
      mockTileRegions = [pausedRegion];
      (ResumeDownloadConfirmAsync as jest.Mock).mockResolvedValueOnce('discard');

      renderHook(() => useTiles(undefined, [], tileMaps));
      // 起動時effectの非同期処理をフラッシュ
      await act(async () => {});

      const dispatched = getDispatchedTileRegions();
      expect(dispatched.length).toBeGreaterThan(0);
      expect(dispatched[dispatched.length - 1]).toHaveLength(0);
    });

    test('後でを選ぶと記録はpausedのまま保持される', async () => {
      mockSelector = jest.fn().mockReturnValue([pausedRegion]);
      mockTileRegions = [pausedRegion];
      (ResumeDownloadConfirmAsync as jest.Mock).mockResolvedValueOnce('later');

      renderHook(() => useTiles(undefined, [], tileMaps));
      await act(async () => {});

      // 記録の変更もダウンロードも発生しない
      expect(getDispatchedTileRegions()).toHaveLength(0);
      expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
    });
  });

  describe('hasIncompleteDownload', () => {
    test('status付きの記録があるとtrueになる', () => {
      const pausedRegion: TileRegionType = {
        id: 'R1',
        tileMapId: 'M1',
        coords: [
          { latitude: 34.0, longitude: 134.0 },
          { latitude: 34.1, longitude: 134.0 },
          { latitude: 34.1, longitude: 134.1 },
          { latitude: 34.0, longitude: 134.1 },
        ],
        centroid: { latitude: 34.05, longitude: 134.05 },
        status: 'paused',
        zoom: 11,
      };
      mockSelector = jest.fn().mockReturnValue([pausedRegion]);
      mockTileRegions = [pausedRegion];

      const { result } = renderHook(() => useTiles(undefined, [], tileMaps));
      expect(result.current.hasIncompleteDownload).toBe(true);
    });

    test('status付きの記録がないとfalseになる', () => {
      const { result } = renderHook(() => useTiles(undefined, [], tileMaps));
      expect(result.current.hasIncompleteDownload).toBe(false);
    });
  });
});
