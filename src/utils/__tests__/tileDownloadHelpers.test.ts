import { TileMapType, TileRegionType } from '../../types';
import {
  boundsFromCoords,
  countDownloadTiles,
  countTilesForRegion,
  downloadBoundsForZoom,
  downloadTileGrid,
  DOWNLOAD_TILE_COUNT_LIMIT,
  estimateDownloadTileCount,
  getTileType,
  getZoomRange,
  listExistingTiles,
  markRegionsPaused,
  removeIncompleteRegions,
  toCompletedRegion,
} from '../tileDownloadHelpers';
import { tileGridForRegion } from '../Tile';
import * as FileSystem from 'expo-file-system/legacy';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/',
  readDirectoryAsync: jest.fn(),
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

  it('可視領域用の疑似地図ID(dem_viewshed)はdem', () => {
    expect(getTileType({ ...baseMap, id: 'dem_viewshed', url: 'https://example.com/{z}/{x}/{y}.png' })).toBe('dem');
  });

  it('それ以外はpng', () => {
    expect(getTileType(baseMap)).toBe('png');
  });
});

describe('getZoomRange', () => {
  it('pngはminZoom=0、maxZoomはoverzoomThresholdと16の小さい方', () => {
    expect(getZoomRange('png', baseMap, 11)).toEqual({ minZoom: 0, maxZoom: 16 });
    expect(getZoomRange('png', { ...baseMap, overzoomThreshold: 14 }, 11)).toEqual({ minZoom: 0, maxZoom: 14 });
  });

  it('ベクタタイルはminZoom=開始ズーム、maxZoom=18', () => {
    expect(getZoomRange('pbf', { ...baseMap, isVector: true }, 11)).toEqual({ minZoom: 11, maxZoom: 18 });
  });

  it('非ベクタのpmtilesはmaxZoomがoverzoomThresholdと16の小さい方', () => {
    expect(getZoomRange('pmtiles', baseMap, 11)).toEqual({ minZoom: 11, maxZoom: 16 });
  });

  it('可視領域用demはselectDemZoomの返域と同じz8-14固定', () => {
    expect(getZoomRange('dem', baseMap, 11)).toEqual({ minZoom: 8, maxZoom: 14 });
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
    const count = estimateDownloadTileCount(wideBounds, [gebco], 5);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(DOWNLOAD_TILE_COUNT_LIMIT);
  });

  it('z16まで取得するラスタ地図（地理院相当）は広域だと上限を超える', () => {
    const count = estimateDownloadTileCount(wideBounds, [baseMap], 5);
    expect(count).toBeGreaterThan(DOWNLOAD_TILE_COUNT_LIMIT);
  });

  it('複数地図は枚数を合算する', () => {
    const bounds = boundsFromCoords(baseRegion.coords);
    const single = estimateDownloadTileCount(bounds, [baseMap], 11);
    expect(estimateDownloadTileCount(bounds, [baseMap, baseMap], 11)).toBe(single * 2);
  });

  it('ベクタ地図は現在ズームからz18までを見積もる', () => {
    const vector = { ...baseMap, url: 'https://example.com/{z}/{x}/{y}.pbf', isVector: true };
    const bounds = boundsFromCoords(baseRegion.coords);
    expect(estimateDownloadTileCount(bounds, [vector], 11)).toBe(countTilesForRegion(bounds, 11, 18));
  });

  it('対象地図がなければ0', () => {
    expect(estimateDownloadTileCount(boundsFromCoords(baseRegion.coords), [], 11)).toBe(0);
  });
});

describe('DEMダウンロードの3D遠景用周辺幅', () => {
  // 蔵王付近の約2km四方
  const small = { minLon: 140.43, minLat: 38.13, maxLon: 140.45, maxLat: 38.15 };

  it('z8は指定範囲の外側150km前後まで広げる', () => {
    const b = downloadBoundsForZoom('dem', small, 8);
    expect(small.minLat - b.minLat).toBeCloseTo(150 / 111.32, 3);
    expect(b.maxLon - small.maxLon).toBeGreaterThan(150 / 111.32);
  });

  it('周辺幅はズーム1段ごとに半分になり、z12以上は広げない', () => {
    const w8 = small.minLat - downloadBoundsForZoom('dem', small, 8).minLat;
    const w11 = small.minLat - downloadBoundsForZoom('dem', small, 11).minLat;
    expect(w11).toBeCloseTo(w8 / 8, 6);
    expect(downloadBoundsForZoom('dem', small, 12)).toBe(small);
  });

  it('dem以外の地図は広げない', () => {
    expect(downloadBoundsForZoom('png', small, 8)).toBe(small);
  });

  it('追加は各段数十枚に収まり、指定範囲のタイルはすべて含む', () => {
    const tiles = downloadTileGrid('dem', small, 8, 14);
    const keys = new Set(tiles.map((t) => `${t.z}/${t.x}/${t.y}`));
    for (const t of tileGridForRegion(small, 8, 14)) expect(keys.has(`${t.z}/${t.x}/${t.y}`)).toBe(true);
    for (let z = 8; z <= 11; z++) {
      expect(tiles.filter((t) => t.z === z).length).toBeLessThanOrEqual(36);
    }
  });

  it('枚数の見積もりは実列挙と一致する', () => {
    expect(countDownloadTiles('dem', small, 8, 14)).toBe(downloadTileGrid('dem', small, 8, 14).length);
    const dem = { ...baseMap, id: 'dem_viewshed' };
    expect(estimateDownloadTileCount(small, [dem], 14)).toBe(downloadTileGrid('dem', small, 8, 14).length);
  });

  it('日付変更線・高緯度でも範囲外に出ない', () => {
    const b = downloadBoundsForZoom('dem', { minLon: 179.5, minLat: 84, maxLon: 179.9, maxLat: 84.5 }, 8);
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
      if (path.endsWith('/M1/10/5')) return Promise.resolve(['1.pbf', '2.png', '3', 'junk.txt']);
      return Promise.reject(new Error('not found'));
    });

    const existing = await listExistingTiles('M1');
    expect(existing).toEqual(new Set(['10/5/1', '10/5/2', '10/5/3']));
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
