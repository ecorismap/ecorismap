import { renderHook, act } from '@testing-library/react-hooks';
import { TileMapType, TileRegionType } from '../../types';
import { useTiles } from '../useTiles';
import { getDemTileMap } from '../../utils/demTileDownload';
import * as FileSystem from 'expo-file-system/legacy';
import * as pmtiles from 'pmtiles';
import { downloadTileGrid as mockedDownloadTileGrid } from '../../utils/tileDownloadHelpers';
import {
  AlertAsync,
  ResumeDownloadConfirmAsync,
  StopDownloadConfirmAsync,
} from '../../components/molecules/AlertAsync';

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
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
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

jest.mock('../../utils/tileDownloadHelpers', () => ({
  ...jest.requireActual('../../utils/tileDownloadHelpers'),
  downloadTileGrid: jest.fn(() => [{ x: 0, y: 0, z: 0 }]),
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
      const { downloadTileGrid } = jest.requireMock('../../utils/tileDownloadHelpers');
      downloadTileGrid.mockReturnValueOnce(Array.from({ length: 12 }, (_, k) => ({ x: 5, y: k + 1, z: 10 })));
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

    describe('標高タイル（疑似地図）', () => {
      afterEach(() => {
        // 後続テストのためにdownloadAsyncのデフォルト実装（status 200）へ戻す
        (FileSystem.downloadAsync as jest.Mock).mockImplementation(() =>
          Promise.resolve({ uri: 'file://tile', status: 200 })
        );
      });

      test('Mapterhornのタイルを.webpで保存し、404は0バイトマーカーを書く', async () => {
        let count = 0;
        (FileSystem.downloadAsync as jest.Mock).mockImplementation(async (_url: string, uri: string) =>
          count++ === 0 ? { uri, status: 404 } : { uri, status: 200 }
        );
        const demMap = getDemTileMap();
        const { result } = renderHook(() => useTiles(undefined, [demMap.id], tileMaps));

        await act(async () => {
          await result.current.downloadMultipleTiles(11, [demMap]);
        });

        const calls = (FileSystem.downloadAsync as jest.Mock).mock.calls;
        expect(calls.every(([url]) => url.startsWith('https://tiles.mapterhorn.com/'))).toBe(true);
        expect(calls.every(([, uri]) => /tiles\/dem_mapterhorn\/\d+\/\d+\/\d+\.webp$/.test(uri))).toBe(true);
        expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(expect.stringContaining('dem_mapterhorn/'), '');

        // 完了記録がdem_mapterhorn名義で保存される
        const dispatched = getDispatchedTileRegions();
        const finalTileRegions = dispatched[dispatched.length - 1];
        const demRegion = finalTileRegions.find((r) => r.tileMapId === demMap.id);
        expect(demRegion).toBeDefined();
        expect(demRegion?.status).toBeUndefined();
      });

      test('再開時に標高タイルのregionがorphan破棄されず再開される', async () => {
        const demRegion: TileRegionType = {
          id: 'RD',
          tileMapId: 'dem_mapterhorn',
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
        const resumed = finalTileRegions.find((r) => r.tileMapId === 'dem_mapterhorn');
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

  describe('ラスタPMTilesのダウンロード', () => {
    const rasterPmtilesMap: TileMapType = {
      ...tileMaps[0],
      id: 'RP',
      name: 'Raster PMTiles',
      url: 'https://example.com/raster.pmtiles',
      isVector: false,
    };

    beforeEach(() => {
      (pmtiles.PMTiles as unknown as jest.Mock).mockImplementation(() => ({
        getZxy: jest.fn(() => Promise.resolve({ data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer })),
      }));
    });

    afterEach(() => {
      (FileSystem.readDirectoryAsync as jest.Mock).mockImplementation(() => Promise.reject(new Error('not found')));
      (FileSystem.writeAsStringAsync as jest.Mock).mockImplementation(() => Promise.resolve());
    });

    test('拡張子なしの{z}/{x}/{y}にBase64エンコーディングで書く（ネイティブが読む形式）', async () => {
      const { result } = renderHook(() => useTiles(undefined, ['RP'], [rasterPmtilesMap]));

      await act(async () => {
        await result.current.downloadMultipleTiles(11, [rasterPmtilesMap]);
      });

      const writes = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls.filter(([path]) =>
        String(path).includes('/RP/')
      );
      expect(writes).toHaveLength(1);
      expect(writes[0][0]).toMatch(/\/RP\/0\/0\/0$/);
      expect(writes[0][1]).toBe('iVBORw==');
      expect(writes[0][2]).toEqual({ encoding: 'base64' });
    });

    test('単一地図のダウンロードでも同じ形式で書く', async () => {
      const { result } = renderHook(() => useTiles(rasterPmtilesMap));

      await act(async () => {
        await result.current.downloadTiles(11);
      });

      const writes = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls.filter(([path]) =>
        String(path).includes('/RP/')
      );
      expect(writes).toHaveLength(1);
      expect(writes[0][0]).toMatch(/\/RP\/0\/0\/0$/);
      expect(writes[0][2]).toEqual({ encoding: 'base64' });
      expect(AlertAsync).toHaveBeenLastCalledWith('hooks.alert.completeDownload');
    });

    test('書き込み失敗はエラーとして数え、完了サマリでエラーのあった地図に載る', async () => {
      (FileSystem.writeAsStringAsync as jest.Mock).mockImplementation(() => Promise.reject(new Error('disk full')));
      const { result } = renderHook(() => useTiles(undefined, ['RP'], [rasterPmtilesMap]));

      await act(async () => {
        await result.current.downloadMultipleTiles(11, [rasterPmtilesMap]);
      });

      const message = (AlertAsync as jest.Mock).mock.calls.map(([m]) => String(m)).pop();
      expect(message).toContain('hooks.message.mapsWithError');
      expect(message).toContain('Raster PMTiles');
    });

    test('旧版が書いた{y}.pngは消し、保存済みとみなさず取り直す', async () => {
      (FileSystem.readDirectoryAsync as jest.Mock).mockImplementation((path: string) => {
        if (path.endsWith('/RP')) return Promise.resolve(['0']);
        if (path.endsWith('/RP/0')) return Promise.resolve(['0']);
        if (path.endsWith('/RP/0/0')) return Promise.resolve(['0.png']);
        return Promise.reject(new Error('not found'));
      });
      const pausedRegion: TileRegionType = {
        id: 'RR',
        tileMapId: 'RP',
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
      const { result } = renderHook(() => useTiles(undefined, ['RP'], [rasterPmtilesMap]));

      await act(async () => {
        await result.current.downloadMultipleTiles(11, [rasterPmtilesMap], [pausedRegion]);
      });

      const deleted = (FileSystem.deleteAsync as jest.Mock).mock.calls.map(([p]) => String(p));
      expect(deleted.some((p) => /\/RP\/0\/0\/0\.png$/.test(p))).toBe(true);
      const writes = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls.filter(([path]) =>
        /\/RP\/0\/0\/0$/.test(String(path))
      );
      expect(writes).toHaveLength(1);
    });
  });

  describe('isVector の付け忘れたベクタPMTiles', () => {
    const unflaggedVectorMap: TileMapType = {
      ...tileMaps[0],
      id: 'VP',
      name: 'Vector PMTiles',
      url: 'https://example.com/vector.pmtiles',
      isVector: false,
    };

    beforeEach(() => {
      (pmtiles.PMTiles as unknown as jest.Mock).mockImplementation(() => ({
        getHeader: jest.fn(() => Promise.resolve({ tileType: 1 })),
        getMetadata: jest.fn(() => Promise.resolve(undefined)),
        getZxy: jest.fn(() => Promise.resolve({ data: new Uint8Array([0x1a, 0x02]).buffer })),
      }));
    });

    test('ヘッダーが MVT なら {y}.pbf に書き、画像として読まれる拡張子なしの {y} には書かない', async () => {
      const { result } = renderHook(() => useTiles(undefined, ['VP'], [unflaggedVectorMap]));

      await act(async () => {
        await result.current.downloadMultipleTiles(11, [unflaggedVectorMap]);
      });

      const tilePaths = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls
        .map(([path]) => String(path))
        .filter((path) => /\/VP\/\d+\/\d+\/\d+/.test(path));
      expect(tilePaths.length).toBeGreaterThan(0);
      expect(tilePaths.every((path) => path.endsWith('.pbf'))).toBe(true);
    });

    test('単一地図のダウンロードでも同じ', async () => {
      const { result } = renderHook(() => useTiles(unflaggedVectorMap));

      await act(async () => {
        await result.current.downloadTiles(11);
      });

      const tilePaths = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls
        .map(([path]) => String(path))
        .filter((path) => /\/VP\/\d+\/\d+\/\d+/.test(path));
      expect(tilePaths.length).toBeGreaterThan(0);
      expect(tilePaths.every((path) => path.endsWith('.pbf'))).toBe(true);
    });
  });

  describe('ダウンロード対象外の地図（PDF・取り込み地図）', () => {
    const pdfMap: TileMapType = { ...tileMaps[0], id: 'PDF1', name: 'PDF', url: 'https://example.com/map.pdf' };
    const localPdfMap: TileMapType = { ...tileMaps[0], id: 'PDF2', name: 'Local PDF', url: 'file://map.pdf' };
    const region = (id: string, tileMapId: string): TileRegionType => ({
      id,
      tileMapId,
      coords: [
        { latitude: 34.0, longitude: 134.0 },
        { latitude: 34.1, longitude: 134.0 },
        { latitude: 34.1, longitude: 134.1 },
        { latitude: 34.0, longitude: 134.1 },
      ],
      centroid: { latitude: 34.05, longitude: 134.05 },
    });

    test('「すべての地図」の保存範囲にPDF地図の範囲を含めない', () => {
      const regions = [region('A', 'M1'), region('B', 'PDF1'), region('C', 'PDF2')];
      mockSelector = jest.fn().mockReturnValue(regions);
      mockTileRegions = regions;

      const { result } = renderHook(() => useTiles(undefined, [], [tileMaps[0], pdfMap, localPdfMap]));

      expect(result.current.savedArea.map((r) => r.tileMapId)).toEqual(['M1']);
    });

    test('「すべての地図」の容量集計にPDF地図のフォルダを含めない', async () => {
      renderHook(() => useTiles(undefined, [], [tileMaps[0], pdfMap, localPdfMap]));
      await act(async () => {});

      const checked = (FileSystem.getInfoAsync as jest.Mock).mock.calls.map(([p]) => String(p));
      expect(checked.some((p) => p.endsWith('/M1'))).toBe(true);
      expect(checked.some((p) => p.endsWith('/dem_mapterhorn'))).toBe(true);
      expect(checked.some((p) => p.includes('PDF'))).toBe(false);
    });
  });
  // タイル監査 M-H3: PMTiles はアーカイブのズーム範囲で取り、1枚も保存できなければ完了扱いにしない
  describe('PMTilesのズーム範囲と保存0枚', () => {
    const pmMap: TileMapType = {
      ...tileMaps[0],
      id: 'PM',
      name: 'Contour',
      url: 'https://example.com/contour.pmtiles',
      isVector: true,
      overzoomThreshold: 18,
    };

    const mockArchive = (resp: { data: ArrayBuffer } | undefined) => {
      (pmtiles.PMTiles as unknown as jest.Mock).mockImplementation(() => ({
        getHeader: jest.fn(() => Promise.resolve({ tileType: 1, minZoom: 12, maxZoom: 13 })),
        getMetadata: jest.fn(() => Promise.resolve(undefined)),
        getZxy: jest.fn(() => Promise.resolve(resp)),
      }));
    };

    test('ヘッダーのズーム範囲（z12〜13）だけを取る', async () => {
      mockArchive({ data: new Uint8Array([0x1a]).buffer });
      const { result } = renderHook(() => useTiles(undefined, ['PM'], [pmMap]));

      await act(async () => {
        await result.current.downloadMultipleTiles(16, [pmMap]);
      });

      const calls = (mockedDownloadTileGrid as jest.Mock).mock.calls.filter(([type]) => type === 'pmtiles');
      expect(calls).toHaveLength(1);
      expect(calls[0][2]).toBe(12);
      expect(calls[0][3]).toBe(13);
    });

    test('ヘッダーを読めないときは z0〜min(18, overzoomThreshold)', async () => {
      (pmtiles.PMTiles as unknown as jest.Mock).mockImplementation(() => ({
        getHeader: jest.fn(() => Promise.reject(new Error('offline'))),
        getMetadata: jest.fn(() => Promise.resolve(undefined)),
        getZxy: jest.fn(() => Promise.resolve({ data: new Uint8Array([0x1a]).buffer })),
      }));
      const { result } = renderHook(() => useTiles(undefined, ['PM'], [pmMap]));

      await act(async () => {
        await result.current.downloadMultipleTiles(16, [{ ...pmMap, overzoomThreshold: 15 }]);
      });

      const calls = (mockedDownloadTileGrid as jest.Mock).mock.calls.filter(([type]) => type === 'pmtiles');
      expect(calls[0][2]).toBe(0);
      expect(calls[0][3]).toBe(15);
    });

    test('getZxy がすべて undefined なら完了扱いにせず、保存範囲を残さずに知らせる', async () => {
      mockArchive(undefined);
      const { result } = renderHook(() => useTiles(undefined, ['PM'], [pmMap]));

      await act(async () => {
        await result.current.downloadMultipleTiles(16, [pmMap]);
      });

      const dispatched = getDispatchedTileRegions();
      expect(dispatched[dispatched.length - 1].filter((r) => r.tileMapId === 'PM')).toHaveLength(0);
      const message = String((AlertAsync as jest.Mock).mock.calls.pop()?.[0]);
      expect(message).toContain('total=0');
      expect(message).toContain('Contour (hooks.message.noTilesInRange)');
    });

    test('単一地図のダウンロードでも同じ', async () => {
      mockArchive(undefined);
      const { result } = renderHook(() => useTiles(pmMap));

      await act(async () => {
        await result.current.downloadTiles(16);
      });

      const dispatched = getDispatchedTileRegions();
      expect(dispatched[dispatched.length - 1].filter((r) => r.tileMapId === 'PM')).toHaveLength(0);
      expect(AlertAsync).toHaveBeenLastCalledWith('hooks.message.noTilesInRange');
    });

    test('1枚でも保存できれば従来どおり完了', async () => {
      mockArchive({ data: new Uint8Array([0x1a]).buffer });
      const { result } = renderHook(() => useTiles(pmMap));

      await act(async () => {
        await result.current.downloadTiles(16);
      });

      const dispatched = getDispatchedTileRegions();
      const pm = dispatched[dispatched.length - 1].filter((r) => r.tileMapId === 'PM');
      expect(pm).toHaveLength(1);
      expect(pm[0].status).toBeUndefined();
      expect(AlertAsync).toHaveBeenLastCalledWith('hooks.alert.completeDownload');
    });
  });
});
