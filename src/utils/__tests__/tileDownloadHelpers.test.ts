import { TileMapType, TileRegionType } from '../../types';
import {
  boundsFromCoords,
  getTileType,
  getZoomRange,
  listExistingTiles,
  markRegionsPaused,
  removeIncompleteRegions,
  toCompletedRegion,
} from '../tileDownloadHelpers';
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
