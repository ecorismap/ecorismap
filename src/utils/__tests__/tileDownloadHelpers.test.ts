import { TileMapType, TileRegionType } from '../../types';
import {
  boundsFromCoords,
  countDownloadTiles,
  countTilesForRegion,
  createStopSignal,
  downloadBoundsForZoom,
  downloadFileIfOk,
  downloadOneTile,
  downloadStyleJson,
  downloadTileGrid,
  DOWNLOAD_TILE_COUNT_LIMIT,
  estimateDownloadTileCount,
  getTileType,
  getUrlPathExt,
  getZoomRange,
  isDownloadableTileMap,
  listExistingTiles,
  markRegionsPaused,
  rasterPmtileTilePath,
  removeIncompleteRegions,
  waitForBatchOrStop,
  removeLegacyRasterPmtilePngs,
  readPmtileHeaderIsVector,
  readPmtileZoomRange,
  resolvePmtileIsVector,
  tileMapsForDownloadScreen,
  toCompletedRegion,
  writeRasterPmtileTile,
} from '../tileDownloadHelpers';
import { tileGridForRegion } from '../Tile';
import * as FileSystem from 'expo-file-system/legacy';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/',
  cacheDirectory: 'file:///cache/',
  downloadAsync: jest.fn(),
  moveAsync: jest.fn(() => Promise.resolve()),
  readDirectoryAsync: jest.fn(),
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: false })),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  deleteAsync: jest.fn(() => Promise.resolve()),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));

const baseMap: TileMapType = {
  id: 'M1',
  name: 'Map 1',
  url: 'https://example.com/tiles/{z}/{x}/{y}.png',
  attribution: '',
  maptype: 'none',
  visible: true,
  transparency: 0,
  overzoomThreshold: 18,
  highResolutionEnabled: false,
  minimumZ: 0,
  maximumZ: 18,
  flipY: false,
};

const baseRegion: TileRegionType = {
  id: 'R1',
  tileMapId: 'M1',
  coords: [
    { latitude: 34.0, longitude: 134.0 },
    { latitude: 34.1, longitude: 134.0 },
    { latitude: 34.1, longitude: 134.1 },
    { latitude: 34.0, longitude: 134.1 },
  ],
  centroid: { latitude: 34.05, longitude: 134.05 },
};

describe('getTileType', () => {
  it('pbf拡張子はpbf', () => {
    expect(getTileType({ ...baseMap, url: 'https://example.com/{z}/{x}/{y}.pbf' })).toBe('pbf');
  });

  it('pmtiles://スキームはpmtiles', () => {
    expect(getTileType({ ...baseMap, url: 'pmtiles://https://example.com/map.pmtiles' })).toBe('pmtiles');
  });

  it('pmtiles拡張子はpmtiles', () => {
    expect(getTileType({ ...baseMap, url: 'https://example.com/map.pmtiles' })).toBe('pmtiles');
  });

  it('hillshade://スキームはhillshade', () => {
    expect(getTileType({ ...baseMap, url: 'hillshade://https://example.com/{z}/{x}/{y}.png' })).toBe('hillshade');
  });

  it('relief://スキームもhillshade扱い（生DEMを保存する点で同じ）', () => {
    expect(getTileType({ ...baseMap, url: 'relief://https://example.com/{z}/{x}/{y}.png' })).toBe('hillshade');
  });

  it('標高タイルの疑似地図ID(dem_mapterhorn)はdem', () => {
    expect(getTileType({ ...baseMap, id: 'dem_mapterhorn', url: 'https://example.com/{z}/{x}/{y}.webp' })).toBe('dem');
  });

  it('それ以外はpng', () => {
    expect(getTileType(baseMap)).toBe('png');
  });

  it('クエリや # が付いた pbf も pbf（M-L6）', () => {
    expect(getTileType({ ...baseMap, url: 'https://example.com/{z}/{x}/{y}.pbf?key=abc.def' })).toBe('pbf');
    expect(getTileType({ ...baseMap, url: 'https://example.com/{z}/{x}/{y}.PBF#v=1.2' })).toBe('pbf');
    expect(getTileType({ ...baseMap, url: 'https://example.com/map.pmtiles?key=abc' })).toBe('pmtiles');
    expect(getTileType({ ...baseMap, url: 'https://example.com/{z}/{x}/{y}.png?key=x.pbf' })).toBe('png');
  });
});

describe('getUrlPathExt', () => {
  it('クエリとフラグメントを除いたパスの拡張子を小文字で返す', () => {
    expect(getUrlPathExt('https://example.com/{z}/{x}/{y}.pbf?key=a.b')).toBe('pbf');
    expect(getUrlPathExt('https://example.com/a/b.PDF#page=2')).toBe('pdf');
    expect(getUrlPathExt('https://example.com/{z}/{x}/{y}.png')).toBe('png');
    expect(getUrlPathExt('noext')).toBe('');
  });
});

describe('downloadStyleJson', () => {
  const originalFetch = global.fetch;
  const mockWrite = FileSystem.writeAsStringAsync as jest.Mock;
  const mockInfo = FileSystem.getInfoAsync as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('style:// は取得せず、端末の style.json があれば local（M-L15）', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    mockInfo.mockResolvedValueOnce({ exists: true });
    expect(await downloadStyleJson('V1', 'style://style.json', 'style://style.json')).toBe('local');
    expect(mockInfo).toHaveBeenCalledWith('file:///test/tiles/V1/style.json');
    mockInfo.mockResolvedValueOnce({ exists: true });
    expect(
      await downloadStyleJson('V1', 'style://https://example.com/s.json', 'style://https://example.com/s.json')
    ).toBe('local');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  test('style:// で端末に style.json が無ければ failed', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    mockInfo.mockResolvedValueOnce({ exists: false });
    expect(await downloadStyleJson('V1', 'style://style.json', 'style://style.json')).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('http のスタイルは取得して保存し、エラー応答や通信例外では書かない', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '{"version":8}',
    })) as unknown as typeof fetch;
    expect(await downloadStyleJson('V1', 'https://example.com/s.json', 'https://example.com/s.json?sig=1')).toBe(
      'saved'
    );
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/s.json?sig=1');
    expect(mockWrite).toHaveBeenCalledWith('file:///test/tiles/V1/style.json', '{"version":8}', { encoding: 'utf8' });

    mockWrite.mockClear();
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => '<html>',
    })) as unknown as typeof fetch;
    expect(await downloadStyleJson('V1', 'https://example.com/s.json', 'https://example.com/s.json')).toBe('failed');
    global.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await downloadStyleJson('V1', 'https://example.com/s.json', 'https://example.com/s.json')).toBe('failed');
    expect(mockWrite).not.toHaveBeenCalled();
  });
});

describe('getZoomRange', () => {
  it('pngはminZoom=0、maxZoomはoverzoomThresholdと16の小さい方', () => {
    expect(getZoomRange('png', baseMap)).toEqual({ minZoom: 0, maxZoom: 16 });
    expect(getZoomRange('png', { ...baseMap, overzoomThreshold: 14 })).toEqual({ minZoom: 0, maxZoom: 14 });
  });

  // タイル監査 M-H3: 表示中のズームから取ると、縮小したオフライン表示で粗い段が無く白紙になる
  it('pbfは表示中のズームに依らずz0から、maxZoomはoverzoomThresholdと18の小さい方', () => {
    expect(getZoomRange('pbf', { ...baseMap, isVector: true })).toEqual({ minZoom: 0, maxZoom: 18 });
    expect(getZoomRange('pbf', { ...baseMap, overzoomThreshold: 14 })).toEqual({ minZoom: 0, maxZoom: 14 });
    expect(getZoomRange('pbf', { ...baseMap, overzoomThreshold: 22 })).toEqual({ minZoom: 0, maxZoom: 18 });
  });

  it('ヘッダーを読めないpmtilesはz0から、ラスタはoverzoomThresholdと16、ベクタは18の小さい方まで', () => {
    expect(getZoomRange('pmtiles', baseMap)).toEqual({ minZoom: 0, maxZoom: 16 });
    expect(getZoomRange('pmtiles', { ...baseMap, isVector: true, overzoomThreshold: 20 })).toEqual({
      minZoom: 0,
      maxZoom: 18,
    });
    expect(getZoomRange('pmtiles', { ...baseMap, isVector: true, overzoomThreshold: 15 })).toEqual({
      minZoom: 0,
      maxZoom: 15,
    });
  });

  it('pmtilesはヘッダーのズーム範囲の中だけを取る（範囲外を数えると見積もりが膨らみ、1枚も保存されない）', () => {
    const contour = { ...baseMap, isVector: true, overzoomThreshold: 13 };
    expect(getZoomRange('pmtiles', contour, { minZoom: 12, maxZoom: 13 })).toEqual({ minZoom: 12, maxZoom: 13 });
    const plant = { ...baseMap, isVector: true, overzoomThreshold: 18 };
    expect(getZoomRange('pmtiles', plant, { minZoom: 5, maxZoom: 15 })).toEqual({ minZoom: 5, maxZoom: 15 });
    // overzoomThreshold より細かい段はオフラインで描かれないので取らない
    expect(getZoomRange('pmtiles', { ...plant, overzoomThreshold: 12 }, { minZoom: 5, maxZoom: 15 })).toEqual({
      minZoom: 5,
      maxZoom: 12,
    });
  });

  it('terrariumの陰影起伏は1段粗い標高タイルから描くので最も細かい段は取らない', () => {
    const relief = {
      ...baseMap,
      url: 'hillshade://https://tiles.mapterhorn.com/{z}/{x}/{y}.webp',
      overzoomThreshold: 15,
    };
    expect(getZoomRange('hillshade', relief)).toEqual({ minZoom: 0, maxZoom: 14 });
    const gebco = { ...baseMap, url: 'relief://https://example.com/{z}/{y}/{x}.png#style=gebco', overzoomThreshold: 9 };
    expect(getZoomRange('hillshade', gebco)).toEqual({ minZoom: 0, maxZoom: 9 });
  });

  it('標高タイルは可視領域・3Dの参照範囲と同じz7-13固定（512px）', () => {
    expect(getZoomRange('dem', baseMap)).toEqual({ minZoom: 7, maxZoom: 13 });
  });
});

describe('countTilesForRegion', () => {
  it('tileGridForRegionの実列挙と同じ枚数になる', () => {
    const bounds = boundsFromCoords(baseRegion.coords);
    expect(countTilesForRegion(bounds, 0, 12)).toBe(tileGridForRegion(bounds, 0, 12).length);
    expect(countTilesForRegion(bounds, 5, 9)).toBe(tileGridForRegion(bounds, 5, 9).length);
  });
});

describe('estimateDownloadTileCount', () => {
  // 日本近海の広域（約20度四方、z5相当の表示範囲）
  const wideBounds = { minLon: 125, minLat: 25, maxLon: 145, maxLat: 45 };

  it('最大z9の地図（GEBCO相当）は広域でも上限以下になる', () => {
    const gebco = { ...baseMap, url: 'relief://https://example.com/{z}/{x}/{y}.png', overzoomThreshold: 9 };
    const count = estimateDownloadTileCount(wideBounds, [gebco]);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(DOWNLOAD_TILE_COUNT_LIMIT);
  });

  it('z16まで取得するラスタ地図（地理院相当）は広域だと上限を超える', () => {
    const count = estimateDownloadTileCount(wideBounds, [baseMap]);
    expect(count).toBeGreaterThan(DOWNLOAD_TILE_COUNT_LIMIT);
  });

  it('複数地図は枚数を合算する', () => {
    const bounds = boundsFromCoords(baseRegion.coords);
    const single = estimateDownloadTileCount(bounds, [baseMap]);
    expect(estimateDownloadTileCount(bounds, [baseMap, baseMap])).toBe(single * 2);
  });

  it('ベクタ地図はz0からz18までを見積もる', () => {
    const vector = { ...baseMap, url: 'https://example.com/{z}/{x}/{y}.pbf', isVector: true };
    const bounds = boundsFromCoords(baseRegion.coords);
    expect(estimateDownloadTileCount(bounds, [vector])).toBe(countTilesForRegion(bounds, 0, 18));
  });

  it('PMTilesはヘッダーのズーム範囲で見積もり、ダウンロードと同じ枚数になる', () => {
    const pm = { ...baseMap, id: 'PM', url: 'https://example.com/contour.pmtiles', isVector: true };
    const bounds = boundsFromCoords(baseRegion.coords);
    const archiveZoom = { minZoom: 12, maxZoom: 13 };
    const count = estimateDownloadTileCount(bounds, [pm], { PM: archiveZoom });
    expect(count).toBe(countTilesForRegion(bounds, 12, 13));
    const { minZoom, maxZoom } = getZoomRange('pmtiles', pm, archiveZoom);
    expect(count).toBe(downloadTileGrid('pmtiles', bounds, minZoom, maxZoom).length);
    // ヘッダー未取得なら z0〜18 で数える
    expect(estimateDownloadTileCount(bounds, [pm])).toBe(countTilesForRegion(bounds, 0, 18));
  });

  // ダウンロード（useTiles）はヘッダーの種別で isVector を決め直してから上限を決める。
  // 見積もりが保存済みの isVector のままだと、ベクタの付け忘れで上限（z16）が低く数えられ、
  // 実際は z17〜18 まで取って DOWNLOAD_TILE_COUNT_LIMIT を素通りしてしまう
  it('PMTilesはヘッダーの種別でベクタ/ラスタを決め、ダウンロードと同じ枚数になる', async () => {
    const bounds = boundsFromCoords(baseRegion.coords);
    const archiveZoom = { minZoom: 0, maxZoom: 18 };
    const cases = [
      { isVector: false, headerTileType: 1 },
      { isVector: undefined, headerTileType: 1 },
      { isVector: true, headerTileType: 2 },
    ];
    for (const { isVector, headerTileType } of cases) {
      const pm: TileMapType = {
        ...baseMap,
        id: 'PM',
        url: 'https://example.com/a.pmtiles',
        isVector,
        overzoomThreshold: 18,
      };
      const header = { getHeader: jest.fn(() => Promise.resolve({ tileType: headerTileType })) };
      const downloadIsVector = await resolvePmtileIsVector(header, pm.isVector === true);
      const { minZoom, maxZoom } = getZoomRange('pmtiles', { ...pm, isVector: downloadIsVector }, archiveZoom);
      const headerIsVector = await readPmtileHeaderIsVector(header);
      const isVectors: Record<string, boolean> = headerIsVector === undefined ? {} : { PM: headerIsVector };
      const count = estimateDownloadTileCount(bounds, [pm], { PM: archiveZoom }, isVectors);
      expect(count).toBe(downloadTileGrid('pmtiles', bounds, minZoom, maxZoom).length);
    }
    // ベクタの付け忘れ: ヘッダーが MVT なら z18 まで数える
    const forgot: TileMapType = {
      ...baseMap,
      id: 'PM',
      url: 'https://example.com/a.pmtiles',
      isVector: false,
      overzoomThreshold: 18,
    };
    expect(estimateDownloadTileCount(bounds, [forgot], { PM: archiveZoom }, { PM: true })).toBe(
      countTilesForRegion(bounds, 0, 18)
    );
    expect(estimateDownloadTileCount(bounds, [forgot], { PM: archiveZoom })).toBe(countTilesForRegion(bounds, 0, 16));
  });

  it('対象地図がなければ0', () => {
    expect(estimateDownloadTileCount(boundsFromCoords(baseRegion.coords), [])).toBe(0);
  });
});

describe('DEMダウンロードの3D遠景用周辺幅', () => {
  // 蔵王付近の約2km四方
  const small = { minLon: 140.43, minLat: 38.13, maxLon: 140.45, maxLat: 38.15 };

  it('z7は指定範囲の外側150km前後まで広げる', () => {
    const b = downloadBoundsForZoom('dem', small, 7);
    expect(small.minLat - b.minLat).toBeCloseTo(150 / 111.32, 3);
    expect(b.maxLon - small.maxLon).toBeGreaterThan(150 / 111.32);
  });

  it('周辺幅はズーム1段ごとに半分になり、z11以上は広げない', () => {
    const w7 = small.minLat - downloadBoundsForZoom('dem', small, 7).minLat;
    const w10 = small.minLat - downloadBoundsForZoom('dem', small, 10).minLat;
    expect(w10).toBeCloseTo(w7 / 8, 6);
    expect(downloadBoundsForZoom('dem', small, 11)).toBe(small);
  });

  it('dem以外の地図は広げない', () => {
    expect(downloadBoundsForZoom('png', small, 8)).toBe(small);
  });

  it('追加は各段数十枚に収まり、指定範囲のタイルはすべて含む', () => {
    const tiles = downloadTileGrid('dem', small, 7, 13);
    const keys = new Set(tiles.map((t) => `${t.z}/${t.x}/${t.y}`));
    for (const t of tileGridForRegion(small, 7, 13)) expect(keys.has(`${t.z}/${t.x}/${t.y}`)).toBe(true);
    for (let z = 7; z <= 10; z++) {
      expect(tiles.filter((t) => t.z === z).length).toBeLessThanOrEqual(36);
    }
  });

  it('枚数の見積もりは実列挙と一致する', () => {
    expect(countDownloadTiles('dem', small, 7, 13)).toBe(downloadTileGrid('dem', small, 7, 13).length);
    const dem = { ...baseMap, id: 'dem_mapterhorn' };
    expect(estimateDownloadTileCount(small, [dem])).toBe(downloadTileGrid('dem', small, 7, 13).length);
  });

  it('日付変更線・高緯度でも範囲外に出ない', () => {
    const b = downloadBoundsForZoom('dem', { minLon: 179.5, minLat: 84, maxLon: 179.9, maxLat: 84.5 }, 7);
    expect(b.maxLon).toBeLessThan(180);
    expect(b.maxLat).toBeLessThanOrEqual(85);
  });
});

describe('boundsFromCoords', () => {
  it('4隅座標から範囲を復元する', () => {
    expect(boundsFromCoords(baseRegion.coords)).toEqual({
      minLon: 134.0,
      minLat: 34.0,
      maxLon: 134.1,
      maxLat: 34.1,
    });
  });

  it('頂点の順序に依存しない', () => {
    const shuffled: TileRegionType['coords'] = [
      { latitude: 34.1, longitude: 134.1 },
      { latitude: 34.0, longitude: 134.0 },
      { latitude: 34.0, longitude: 134.1 },
      { latitude: 34.1, longitude: 134.0 },
    ];
    expect(boundsFromCoords(shuffled)).toEqual({
      minLon: 134.0,
      minLat: 34.0,
      maxLon: 134.1,
      maxLat: 34.1,
    });
  });
});

describe('listExistingTiles', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('保存済みタイルをz/x/yキーのSetで返す（拡張子は正規化、非数値エントリは除外）', async () => {
    (FileSystem.readDirectoryAsync as jest.Mock).mockImplementation((path: string) => {
      if (path.endsWith('/M1')) return Promise.resolve(['10', 'metadata.json', 'style.json']);
      if (path.endsWith('/M1/10')) return Promise.resolve(['5']);
      if (path.endsWith('/M1/10/5')) return Promise.resolve(['1.pbf', '3', '4.webp', 'junk.txt']);
      return Promise.reject(new Error('not found'));
    });

    const existing = await listExistingTiles('M1');
    expect(existing).toEqual(new Set(['10/5/1', '10/5/3', '10/5/4']));
  });

  it('旧版のラスタPMTilesが書いた{y}.pngは保存済みとみなさない（ネイティブが読まないため取り直す）', async () => {
    (FileSystem.readDirectoryAsync as jest.Mock).mockImplementation((path: string) => {
      if (path.endsWith('/M1')) return Promise.resolve(['10']);
      if (path.endsWith('/M1/10')) return Promise.resolve(['5']);
      if (path.endsWith('/M1/10/5')) return Promise.resolve(['1.png', '2']);
      return Promise.reject(new Error('not found'));
    });

    const existing = await listExistingTiles('M1');
    expect(existing).toEqual(new Set(['10/5/2']));
  });

  it('フォルダが存在しない場合は空のSetを返す', async () => {
    (FileSystem.readDirectoryAsync as jest.Mock).mockRejectedValue(new Error('not found'));
    const existing = await listExistingTiles('M1');
    expect(existing.size).toBe(0);
  });
});

describe('region状態のヘルパー', () => {
  const downloading: TileRegionType = { ...baseRegion, id: 'A', status: 'downloading', zoom: 11 };
  const completed: TileRegionType = { ...baseRegion, id: 'B' };

  it('toCompletedRegionはstatus/zoomキー自体を除去する', () => {
    const result = toCompletedRegion(downloading);
    expect(result).toEqual({ id: 'A', tileMapId: 'M1', coords: baseRegion.coords, centroid: baseRegion.centroid });
    expect('status' in result).toBe(false);
    expect('zoom' in result).toBe(false);
  });

  it('markRegionsPausedは対象の未完了regionのみpausedにする', () => {
    const result = markRegionsPaused([downloading, completed], ['A', 'B']);
    expect(result[0].status).toBe('paused');
    // 完了済み（statusなし）は変更しない
    expect(result[1].status).toBeUndefined();
  });

  it('removeIncompleteRegionsは対象の未完了regionのみ削除する', () => {
    const result = removeIncompleteRegions([downloading, completed], ['A', 'B']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('B');
  });
});

describe('isDownloadableTileMap', () => {
  it('通常のタイル地図・PMTiles・pbfは対象', () => {
    expect(isDownloadableTileMap(baseMap)).toBe(true);
    expect(isDownloadableTileMap({ ...baseMap, url: 'https://example.com/a.pmtiles' })).toBe(true);
    expect(isDownloadableTileMap({ ...baseMap, url: 'pmtiles://https://example.com/a.pmtiles' })).toBe(true);
    expect(isDownloadableTileMap({ ...baseMap, url: 'https://example.com/{z}/{x}/{y}.pbf' })).toBe(true);
  });

  it('グループ・Google地図・山名は対象外', () => {
    expect(isDownloadableTileMap({ ...baseMap, isGroup: true })).toBe(false);
    expect(isDownloadableTileMap({ ...baseMap, id: 'standard' })).toBe(false);
    expect(isDownloadableTileMap({ ...baseMap, id: 'hybrid' })).toBe(false);
    expect(isDownloadableTileMap({ ...baseMap, url: 'peaks://gsi' })).toBe(false);
  });

  it('PDF地図と端末内・blobの取り込み地図は対象外', () => {
    expect(isDownloadableTileMap({ ...baseMap, url: 'https://example.com/map.pdf' })).toBe(false);
    expect(isDownloadableTileMap({ ...baseMap, url: 'https://example.com/map.PDF' })).toBe(false);
    expect(isDownloadableTileMap({ ...baseMap, url: 'pdf://map' })).toBe(false);
    expect(isDownloadableTileMap({ ...baseMap, url: 'file://map.pdf' })).toBe(false);
    expect(isDownloadableTileMap({ ...baseMap, url: 'file://page2' })).toBe(false);
    expect(isDownloadableTileMap({ ...baseMap, url: 'pmtiles://blob:http://localhost/abc' })).toBe(false);
  });
});

describe('ラスタPMTilesの保存', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('拡張子なしの{z}/{x}/{y}に、Base64エンコーディングで生バイトとして書く', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    await writeRasterPmtileTile('M1', { z: 10, x: 5, y: 3 }, bytes.buffer);

    const path = rasterPmtileTilePath('M1', { z: 10, x: 5, y: 3 });
    expect(path).toMatch(/\/M1\/10\/5\/3$/);
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(path, 'iVBORw==', { encoding: 'base64' });
  });

  it('書き込み失敗は呼び出し元へ伝わる（errorCountに数えるため）', async () => {
    (FileSystem.writeAsStringAsync as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await expect(writeRasterPmtileTile('M1', { z: 1, x: 0, y: 0 }, new Uint8Array([1]).buffer)).rejects.toThrow(
      'disk full'
    );
  });

  it('旧版の{y}.pngだけを消し、正しいタイル・style.json等は残す', async () => {
    (FileSystem.readDirectoryAsync as jest.Mock).mockImplementation((path: string) => {
      if (path.endsWith('/M1')) return Promise.resolve(['10', 'style.json', 'boundary.json']);
      if (path.endsWith('/M1/10')) return Promise.resolve(['5']);
      if (path.endsWith('/M1/10/5')) return Promise.resolve(['1.png', '2', '3.pbf']);
      return Promise.reject(new Error('not found'));
    });

    await removeLegacyRasterPmtilePngs('M1');

    const deleted = (FileSystem.deleteAsync as jest.Mock).mock.calls.map(([p]) => p);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toMatch(/\/M1\/10\/5\/1\.png$/);
  });

  it('フォルダが無くても例外を投げない', async () => {
    (FileSystem.readDirectoryAsync as jest.Mock).mockRejectedValue(new Error('not found'));
    await expect(removeLegacyRasterPmtilePngs('M1')).resolves.toBeUndefined();
    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  });
});

describe('tileMapsForDownloadScreen', () => {
  const dem: TileMapType = {
    ...baseMap,
    id: 'dem_mapterhorn',
    name: 'DEM',
    url: 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp',
  };
  const pdfUrl: TileMapType = { ...baseMap, id: 'P1', url: 'https://example.com/map.pdf' };
  const pdfLocal: TileMapType = { ...baseMap, id: 'P2', url: 'file://map.pdf' };
  const group: TileMapType = { ...baseMap, id: 'G1', url: '', isGroup: true };
  const peaks: TileMapType = { ...baseMap, id: 'K1', url: 'peaks://gsi' };
  const standard: TileMapType = { ...baseMap, id: 'standard', url: '' };
  const all = [baseMap, pdfUrl, pdfLocal, group, peaks, standard];

  it('「すべての地図」では選択画面に出る地図と標高タイルだけを対象にする（PDF地図を含めない）', () => {
    expect(tileMapsForDownloadScreen(all, [], dem).map((m) => m.id)).toEqual(['M1', 'dem_mapterhorn']);
  });

  it('個別選択でもダウンロード対象外の地図は除く', () => {
    expect(tileMapsForDownloadScreen(all, ['M1', 'P1'], dem).map((m) => m.id)).toEqual(['M1']);
  });

  it('標高タイルは明示選択されたときだけ足す', () => {
    expect(tileMapsForDownloadScreen(all, ['dem_mapterhorn'], dem).map((m) => m.id)).toEqual(['dem_mapterhorn']);
  });

  it('見積もりにPDF地図の枚数を含めない', () => {
    const bounds = { minLon: 139.7, minLat: 35.6, maxLon: 139.71, maxLat: 35.61 };
    const withPdf = estimateDownloadTileCount(bounds, tileMapsForDownloadScreen([baseMap, pdfUrl], [], dem));
    const withoutPdf = estimateDownloadTileCount(bounds, tileMapsForDownloadScreen([baseMap], [], dem));
    expect(withPdf).toBe(withoutPdf);
  });
});

describe('readPmtileHeaderIsVector', () => {
  const withType = (tileType: number) => ({ getHeader: jest.fn(() => Promise.resolve({ tileType })) });

  test('MVT はベクタ、画像はラスタ、種別不明や読めないときは undefined', async () => {
    expect(await readPmtileHeaderIsVector(withType(1))).toBe(true);
    expect(await readPmtileHeaderIsVector(withType(2))).toBe(false);
    expect(await readPmtileHeaderIsVector(withType(0))).toBeUndefined();
    const failing = { getHeader: jest.fn(() => Promise.reject(new Error('offline'))) };
    expect(await readPmtileHeaderIsVector(failing)).toBeUndefined();
  });
});

describe('resolvePmtileIsVector', () => {
  const withType = (tileType: number) => ({ getHeader: jest.fn(() => Promise.resolve({ tileType })) });

  test('ヘッダーが MVT なら isVector の付け忘れでもベクタとして扱う', async () => {
    expect(await resolvePmtileIsVector(withType(1), false)).toBe(true);
  });

  test('ヘッダーが画像（PNG/JPEG/WebP/AVIF）ならラスタとして扱う', async () => {
    for (const type of [2, 3, 4, 5]) {
      expect(await resolvePmtileIsVector(withType(type), true)).toBe(false);
    }
  });

  test('種別不明やヘッダー取得の失敗では地図の isVector に従う', async () => {
    expect(await resolvePmtileIsVector(withType(0), true)).toBe(true);
    const failing = { getHeader: jest.fn(() => Promise.reject(new Error('offline'))) };
    expect(await resolvePmtileIsVector(failing, false)).toBe(false);
    expect(await resolvePmtileIsVector(failing, true)).toBe(true);
  });
});

describe('readPmtileZoomRange', () => {
  const withZoom = (minZoom: number, maxZoom: number) => ({
    getHeader: jest.fn(() => Promise.resolve({ minZoom, maxZoom })),
  });

  test('ヘッダーの min/maxZoom を返す', async () => {
    expect(await readPmtileZoomRange(withZoom(12, 13))).toEqual({ minZoom: 12, maxZoom: 13 });
  });

  test('読めない・値が壊れているときは undefined（既定の範囲で取る）', async () => {
    const failing = { getHeader: jest.fn(() => Promise.reject(new Error('offline'))) };
    expect(await readPmtileZoomRange(failing)).toBeUndefined();
    expect(await readPmtileZoomRange(withZoom(14, 12))).toBeUndefined();
    expect(await readPmtileZoomRange(withZoom(-1, 12))).toBeUndefined();
  });
});

describe('downloadFileIfOk', () => {
  const mockDownload = FileSystem.downloadAsync as jest.Mock;
  const mockMove = FileSystem.moveAsync as jest.Mock;
  const mockDelete = FileSystem.deleteAsync as jest.Mock;
  const DEST = 'file:///test/tiles/M1/10/5/7';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('200は一時ファイルに落としてから保存先を置き換える', async () => {
    mockDownload.mockImplementation(async (_url: string, uri: string) => ({ uri, status: 200 }));
    expect(await downloadFileIfOk('https://example.com/t', DEST)).toBe('saved');
    const temp = mockDownload.mock.calls[0][1];
    expect(temp).not.toBe(DEST);
    expect(temp.startsWith('file:///cache/')).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith(DEST, { idempotent: true });
    expect(mockMove).toHaveBeenCalledWith({ from: temp, to: DEST });
  });

  test('一時的なエラー（503）では保存済みのタイルを消さず failed を返す', async () => {
    mockDownload.mockImplementation(async (_url: string, uri: string) => ({ uri, status: 503 }));
    expect(await downloadFileIfOk('https://example.com/t', DEST)).toBe('failed');
    expect(mockDelete).not.toHaveBeenCalledWith(DEST, expect.anything());
    expect(mockMove).not.toHaveBeenCalled();
  });

  test('404 は missing（失敗に数えない）', async () => {
    mockDownload.mockImplementation(async (_url: string, uri: string) => ({ uri, status: 404 }));
    expect(await downloadFileIfOk('https://example.com/t', DEST)).toBe('missing');
    expect(mockMove).not.toHaveBeenCalled();
  });

  test('通信例外・移動の失敗は failed', async () => {
    mockDownload.mockRejectedValueOnce(new Error('offline'));
    expect(await downloadFileIfOk('https://example.com/t', DEST)).toBe('failed');
    mockDownload.mockImplementation(async (_url: string, uri: string) => ({ uri, status: 200 }));
    mockMove.mockRejectedValueOnce(new Error('disk full'));
    expect(await downloadFileIfOk('https://example.com/t', DEST)).toBe('failed');
  });
});

describe('downloadOneTile', () => {
  const mockDownload = FileSystem.downloadAsync as jest.Mock;
  const mockMove = FileSystem.moveAsync as jest.Mock;
  const mockWrite = FileSystem.writeAsStringAsync as jest.Mock;
  const originalFetch = global.fetch;
  const tile = { z: 10, x: 900, y: 400 };
  const common = { tileMapId: 'M1', flipY: false, pmtileIsVector: false, tile };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDownload.mockImplementation(async (_url: string, uri: string) => ({ uri, status: 200 }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('flipY（TMS）の地図は URL の {y} だけ反転し、保存先は XYZ の y', async () => {
    const result = await downloadOneTile({
      ...common,
      tileType: 'png',
      urlTemplate: 'https://example.com/{z}/{x}/{y}.png?sig=1',
      flipY: true,
    });
    expect(result).toBe('saved');
    expect(mockDownload.mock.calls[0][0]).toBe('https://example.com/10/900/623.png?sig=1');
    expect(mockMove.mock.calls[0][0].to).toBe('file:///test/tiles/M1/10/900/400');
  });

  test('flipY でない地図はそのままの y で取る', async () => {
    await downloadOneTile({ ...common, tileType: 'hillshade', urlTemplate: 'https://example.com/{z}/{x}/{y}.png' });
    expect(mockDownload.mock.calls[0][0]).toBe('https://example.com/10/900/400.png');
  });

  test('pbf: 404 は missing、5xx と通信例外は failed、書き込み失敗も failed', async () => {
    const pbf = { ...common, tileType: 'pbf' as const, urlTemplate: 'https://example.com/{z}/{x}/{y}.pbf' };
    global.fetch = jest.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
    expect(await downloadOneTile(pbf)).toBe('missing');
    global.fetch = jest.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    expect(await downloadOneTile(pbf)).toBe('failed');
    global.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await downloadOneTile(pbf)).toBe('failed');
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
    })) as unknown as typeof fetch;
    mockWrite.mockRejectedValueOnce(new Error('disk full'));
    expect(await downloadOneTile(pbf)).toBe('failed');
    expect(await downloadOneTile(pbf)).toBe('saved');
    expect(mockWrite).toHaveBeenLastCalledWith('file:///test/tiles/M1/10/900/400.pbf', 'AQI=', { encoding: 'utf8' });
  });

  test('PMTiles: 範囲外（undefined）は missing、例外と書き込み失敗は failed', async () => {
    const pm = { ...common, tileType: 'pmtiles' as const, urlTemplate: '', pmtileIsVector: true };
    const outOfRange = { getZxy: jest.fn(async () => undefined) };
    expect(await downloadOneTile({ ...pm, pmtile: outOfRange })).toBe('missing');
    const throwing = {
      getZxy: jest.fn(async (): Promise<{ data: ArrayBuffer } | undefined> => {
        throw new Error('range request failed');
      }),
    };
    expect(await downloadOneTile({ ...pm, pmtile: throwing })).toBe('failed');
    const ok = { getZxy: jest.fn(async () => ({ data: new Uint8Array([1, 2]).buffer })) };
    mockWrite.mockRejectedValueOnce(new Error('disk full'));
    expect(await downloadOneTile({ ...pm, pmtile: ok })).toBe('failed');
    expect(await downloadOneTile({ ...pm, pmtile: ok })).toBe('saved');
    expect(await downloadOneTile({ ...pm, pmtile: undefined })).toBe('failed');
  });

  test('停止で中断したときに打ち切れるよう、pbf の fetch と PMTiles の getZxy に signal を渡す', async () => {
    const controller = new AbortController();
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await downloadOneTile({
      ...common,
      tileType: 'pbf',
      urlTemplate: 'https://example.com/{z}/{x}/{y}.pbf',
      signal: controller.signal,
    });
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/10/900/400.pbf', { signal: controller.signal });

    const pmtile = { getZxy: jest.fn(async () => ({ data: new Uint8Array([1]).buffer })) };
    await downloadOneTile({
      ...common,
      tileType: 'pmtiles',
      urlTemplate: '',
      pmtile,
      signal: controller.signal,
    });
    expect(pmtile.getZxy).toHaveBeenCalledWith(10, 900, 400, controller.signal);
  });
});

describe('waitForBatchOrStop', () => {
  test('停止の合図が来たら、取得中のタイルを待たずに stopped を返す', async () => {
    const stop = createStopSignal();
    const pending = new Promise<void>(() => undefined);
    const waiting = waitForBatchOrStop([pending], stop.promise);
    stop.trigger();
    await expect(waiting).resolves.toBe('stopped');
  });

  test('合図が来なければバッチの完了を待って done を返す', async () => {
    const stop = createStopSignal();
    let release: () => void = () => undefined;
    const tile = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waiting = waitForBatchOrStop([tile, Promise.resolve()], stop.promise);
    release();
    await expect(waiting).resolves.toBe('done');
  });
});
