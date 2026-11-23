// タイル監査 M-H2: 「キャッシュをクリア」とダウンロード画面の削除は、取り直せるタイルだけを消す
import * as FileSystem from 'expo-file-system/legacy';
import { TILE_FOLDER } from '../../constants/AppConstants';
import {
  clearRefetchableTileCache,
  clearWebTileCache,
  hasIrreplaceableTiles,
  isRefetchableTileCacheEntry,
  isTileCacheEntry,
  regionsAfterTileCacheClear,
  removeTileCacheEntries,
} from '../tileCacheCleanup';
import { TileRegionType } from '../../types';

type PMTilesRecord = { mapId: string; blob: Blob | undefined; boundary: string; style: string | undefined };
type GeoTiffRecord = { mapId: string; blob: Blob; boundary: string; pdf: string };

const mockPmtiles = new Map<string, PMTilesRecord>();
const mockGeotiff = new Map<string, GeoTiffRecord>();

jest.mock('../db', () => ({
  db: {
    pmtiles: {
      toArray: jest.fn(async () => Array.from(mockPmtiles.values())),
      delete: jest.fn(async (id: string) => {
        mockPmtiles.delete(id);
      }),
    },
    geotiff: {
      toArray: jest.fn(async () => Array.from(mockGeotiff.values())),
      delete: jest.fn(async (id: string) => {
        mockGeotiff.delete(id);
      }),
    },
  },
}));

// 端末内のフォルダ構成を {フォルダ: 中身} で再現する
let mockDirs: Record<string, string[]> = {};

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/',
  readDirectoryAsync: jest.fn(async (path: string) => {
    const entries = mockDirs[path];
    if (entries === undefined) throw new Error('not found');
    return entries;
  }),
  deleteAsync: jest.fn(async () => undefined),
}));

const mockedFS = FileSystem as jest.Mocked<typeof FileSystem>;
const deletedPaths = () => mockedFS.deleteAsync.mock.calls.map(([p]) => String(p));

beforeEach(() => {
  mockPmtiles.clear();
  mockGeotiff.clear();
  mockDirs = {};
  jest.clearAllMocks();
});

describe('isTileCacheEntry / isRefetchableTileCacheEntry', () => {
  it('タイルはズームの数字ディレクトリと .pbf', () => {
    expect(isTileCacheEntry('14')).toBe(true);
    expect(isTileCacheEntry('a.pbf')).toBe(true);
    expect(isTileCacheEntry('style.json')).toBe(false);
  });

  it('取り直せるのはタイルと metadata.json。style.json・boundary.json・取り込んだ本体は含まない', () => {
    expect(isRefetchableTileCacheEntry('0')).toBe(true);
    expect(isRefetchableTileCacheEntry('metadata.json')).toBe(true);
    expect(isRefetchableTileCacheEntry('style.json')).toBe(false);
    expect(isRefetchableTileCacheEntry('boundary.json')).toBe(false);
    expect(isRefetchableTileCacheEntry('area.pmtiles')).toBe(false);
  });
});

describe('hasIrreplaceableTiles', () => {
  it('PDF 地図（file:// / .pdf / pdf://）は取り直す経路が無い', () => {
    expect(hasIrreplaceableTiles({ url: 'file://map.pdf' })).toBe(true);
    expect(hasIrreplaceableTiles({ url: 'file://地形図' })).toBe(true);
    expect(hasIrreplaceableTiles({ url: 'https://example.com/map.pdf' })).toBe(true);
    expect(hasIrreplaceableTiles({ url: 'pdf://https://storage/map' })).toBe(true);
  });

  it('配信元のある地図は取り直せる', () => {
    expect(hasIrreplaceableTiles({ url: 'https://example.com/{z}/{x}/{y}.png' })).toBe(false);
    expect(hasIrreplaceableTiles({ url: 'pmtiles://https://example.com/a.pmtiles' })).toBe(false);
    expect(hasIrreplaceableTiles({ url: 'https://example.com/{z}/{x}/{y}.pbf' })).toBe(false);
  });
});

describe('removeTileCacheEntries', () => {
  it('数字のズームディレクトリ・.pbf・metadata.json だけを消し、style.json と boundary.json は残す', async () => {
    mockDirs[`${TILE_FOLDER}/M1`] = ['12', '13', 'metadata.json', 'style.json', 'boundary.json', 'x.pbf'];
    await removeTileCacheEntries('M1');
    expect(deletedPaths().sort()).toEqual(
      [`${TILE_FOLDER}/M1/12`, `${TILE_FOLDER}/M1/13`, `${TILE_FOLDER}/M1/metadata.json`, `${TILE_FOLDER}/M1/x.pbf`].sort()
    );
  });

  it('フォルダが無ければ何もしない', async () => {
    await expect(removeTileCacheEntries('none')).resolves.toBeUndefined();
    expect(mockedFS.deleteAsync).not.toHaveBeenCalled();
  });
});

describe('clearRefetchableTileCache', () => {
  it('PDF 地図のフォルダは丸ごと残し、ほかの地図と疑似地図はタイルだけを消す。フォルダごとは消さない', async () => {
    mockDirs[TILE_FOLDER] = ['M1', 'PDF1', 'dem_mapterhorn', 'dem_viewshed'];
    mockDirs[`${TILE_FOLDER}/M1`] = ['10', 'style.json', 'boundary.json'];
    mockDirs[`${TILE_FOLDER}/PDF1`] = ['3', '4', 'boundary.json'];
    mockDirs[`${TILE_FOLDER}/dem_mapterhorn`] = ['7'];
    mockDirs[`${TILE_FOLDER}/dem_viewshed`] = ['9'];

    const cleared = await clearRefetchableTileCache([
      { id: 'M1', url: 'https://example.com/{z}/{x}/{y}.pbf' },
      { id: 'PDF1', url: 'file://map.pdf' },
    ]);

    expect(cleared.sort()).toEqual(['M1', 'dem_mapterhorn', 'dem_viewshed'].sort());
    expect(deletedPaths().sort()).toEqual(
      [`${TILE_FOLDER}/M1/10`, `${TILE_FOLDER}/dem_mapterhorn/7`, `${TILE_FOLDER}/dem_viewshed/9`].sort()
    );
    expect(deletedPaths()).not.toContain(TILE_FOLDER);
  });

  // プロジェクトを開いている間は個人の PDF 地図が一覧から外れる。中身（数字ディレクトリだけ）からは
  // PDF 地図と見分けられないので、一覧に無いフォルダは触らない（バックアップを戻したとき白紙にしない）
  it('今の一覧に無いフォルダは触らない', async () => {
    mockDirs[TILE_FOLDER] = ['M1', 'personalPdf'];
    mockDirs[`${TILE_FOLDER}/M1`] = ['10'];
    mockDirs[`${TILE_FOLDER}/personalPdf`] = ['3', '4', 'boundary.json'];

    const cleared = await clearRefetchableTileCache([{ id: 'M1', url: 'https://example.com/{z}/{x}/{y}.png' }]);

    expect(cleared).toEqual(['M1']);
    expect(deletedPaths()).toEqual([`${TILE_FOLDER}/M1/10`]);
  });

  it('タイルのフォルダがまだ無くても失敗しない', async () => {
    await expect(clearRefetchableTileCache([])).resolves.toEqual([]);
  });
});

describe('clearWebTileCache', () => {
  const blob = new Blob(['body']);

  it('取り込んだ PMTiles 本体・スタイルと PDF の行は残し、boundary だけの行を消す', async () => {
    mockPmtiles.set('withBlob', { mapId: 'withBlob', blob, boundary: '{}', style: undefined });
    mockPmtiles.set('withStyle', { mapId: 'withStyle', blob: undefined, boundary: '', style: '{"version":8}' });
    mockPmtiles.set('boundaryOnly', { mapId: 'boundaryOnly', blob: undefined, boundary: '{}', style: undefined });
    mockGeotiff.set('pdfLocal', { mapId: 'pdfLocal', blob, boundary: '{}', pdf: 'data:application/pdf;base64,' });
    mockGeotiff.set('pdfUrl', { mapId: 'pdfUrl', blob, boundary: '{}', pdf: 'https://example.com/a.pdf' });

    await clearWebTileCache();

    expect(Array.from(mockPmtiles.keys()).sort()).toEqual(['withBlob', 'withStyle']);
    expect(Array.from(mockGeotiff.keys()).sort()).toEqual(['pdfLocal', 'pdfUrl']);
  });
});

describe('regionsAfterTileCacheClear', () => {
  const region = (id: string, tileMapId: string): TileRegionType => ({
    id,
    tileMapId,
    coords: [
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 0 },
      { latitude: 1, longitude: 1 },
      { latitude: 0, longitude: 1 },
    ],
    centroid: { latitude: 0.5, longitude: 0.5 },
  });

  it('タイルを消した地図の保存範囲を外し、触らなかった地図の記録は残す', () => {
    const regions = [region('a', 'M1'), region('b', 'PDF1'), region('c', 'dem_mapterhorn'), region('d', 'other')];
    expect(regionsAfterTileCacheClear(regions, ['M1', 'dem_mapterhorn']).map((r) => r.id)).toEqual(['b', 'd']);
  });
});
