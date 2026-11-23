// タイル監査 M-H6: 地図の取得内容が変わったら、同じ ID の旧ソースのタイル・保存範囲・3D テクスチャを捨てる
import * as FileSystem from 'expo-file-system/legacy';
import { TILE_FOLDER } from '../../constants/AppConstants';
import { TileMapType, TileRegionType } from '../../types';
import { dropTileRegions, findTileSourceChanges, getTileSourceCleanup, stripTileSignature } from '../tileSourceChange';
import { discardStaleTileSources } from '../tileSourceCleanup';
import { removeTerrainTextureCacheForMap, TERRAIN_TEXTURE_CACHE_DIR } from '../terrain3d/textureDiskCache';

type PMTilesRecord = { mapId: string; blob: Blob | undefined; boundary: string; style: string | undefined };
const mockPmtiles = new Map<string, PMTilesRecord>();

jest.mock('../db', () => ({
  db: {
    pmtiles: {
      get: jest.fn(async (id: string) => mockPmtiles.get(id)),
      update: jest.fn(async (id: string, changes: Partial<PMTilesRecord>) => {
        const current = mockPmtiles.get(id);
        if (current === undefined) return 0;
        mockPmtiles.set(id, { ...current, ...changes });
        return 1;
      }),
      delete: jest.fn(async (id: string) => {
        mockPmtiles.delete(id);
      }),
    },
  },
}));

// 端末内のフォルダ構成を {フォルダ: 中身} で再現する
let mockDirs: Record<string, string[]> = {};

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/',
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(async (path: string) => ({ exists: mockDirs[path] !== undefined, isDirectory: true })),
  readDirectoryAsync: jest.fn(async (path: string) => {
    const entries = mockDirs[path];
    if (entries === undefined) throw new Error('not found');
    return entries;
  }),
  deleteAsync: jest.fn(async () => undefined),
}));

const platform = (require('react-native') as { Platform: { OS: string } }).Platform;
const mockedFS = FileSystem as jest.Mocked<typeof FileSystem>;
const deletedPaths = () => mockedFS.deleteAsync.mock.calls.map(([p]) => String(p));

const tileMap = (id: string, url: string, extra: Partial<TileMapType> = {}): TileMapType => ({
  id,
  name: id,
  url,
  attribution: '',
  maptype: 'none',
  visible: true,
  transparency: 0,
  overzoomThreshold: 18,
  highResolutionEnabled: false,
  minimumZ: 0,
  maximumZ: 22,
  flipY: false,
  ...extra,
});

const region = (id: string, tileMapId: string): TileRegionType =>
  ({ id, tileMapId, coords: [], centroid: { latitude: 0, longitude: 0 } }) as unknown as TileRegionType;

/** reducer を持たない簡易 store。editSettingsAction だけを反映する */
const createStore = (tileMaps: TileMapType[], tileRegions: TileRegionType[]) => {
  const state = { tileMaps, settings: { tileRegions } };
  const dispatch = jest.fn((action: { type: string; payload: unknown }) => {
    if (action.type.endsWith('editSettingsAction')) {
      state.settings = { ...state.settings, ...(action.payload as object) } as typeof state.settings;
    }
    return action;
  });
  return { store: { getState: () => state as never, dispatch }, state, dispatch };
};

const V2023 = 'https://example.com/veg2023/{z}/{x}/{y}.png';
const V2024 = 'https://example.com/veg2024/{z}/{x}/{y}.png';
const PM = 'https://example.com/a.pmtiles';

beforeEach(() => {
  mockPmtiles.clear();
  mockDirs = {};
  platform.OS = 'ios';
  jest.clearAllMocks();
});

describe('stripTileSignature', () => {
  it('署名（expires・sig）だけを外し、ほかのクエリとフラグメントは残す', () => {
    expect(stripTileSignature('https://a/{z}/{x}/{y}.png?expires=1&sig=x')).toBe('https://a/{z}/{x}/{y}.png');
    expect(stripTileSignature('https://a/{z}.png?key=k&expires=1&sig=x')).toBe('https://a/{z}.png?key=k');
    expect(stripTileSignature('hillshade://https://a/{z}.png?expires=1&sig=x#azimuth=315')).toBe(
      'hillshade://https://a/{z}.png#azimuth=315'
    );
    expect(stripTileSignature(V2023)).toBe(V2023);
  });
});

describe('getTileSourceCleanup', () => {
  it('URL・flipY・tileSize の変更はタイルを捨てる', () => {
    const base = tileMap('m', V2023);
    expect(getTileSourceCleanup(base, { ...base, url: V2024 }).source).toBe(true);
    expect(getTileSourceCleanup(base, { ...base, flipY: true }).source).toBe(true);
    expect(getTileSourceCleanup(base, { ...base, tileSize: 512 }).source).toBe(true);
  });

  it('署名の付け外し・名前や透過度などの変更では捨てない', () => {
    const base = tileMap('m', V2023);
    const none = { source: false, renderedTiles: false, style: false };
    expect(getTileSourceCleanup(base, { ...base, url: `${V2023}?expires=1&sig=x` })).toEqual(none);
    const renamed: TileMapType = { ...base, name: 'x', transparency: 0.5, overzoomThreshold: 16 };
    expect(getTileSourceCleanup(base, renamed)).toEqual(none);
    expect(getTileSourceCleanup(base, { ...base, tileSize: 256 })).toEqual(none);
  });

  it('PMTiles のスタイルだけの変更は描画済み画像だけを捨てる（.pbf と保存範囲は残す）', () => {
    const base = tileMap('m', PM, { styleURL: 'https://example.com/s1.json' });
    expect(getTileSourceCleanup(base, { ...base, styleURL: 'https://example.com/s2.json' })).toEqual({
      source: false,
      renderedTiles: true,
      style: false,
    });
    expect(getTileSourceCleanup(base, { ...base, styleURL: '' })).toEqual({
      source: false,
      renderedTiles: true,
      style: true,
    });
  });

  it('PMTiles 以外の styleURL は描画に使わないので無視する', () => {
    const base = tileMap('m', V2023, { styleURL: 'a' });
    expect(getTileSourceCleanup(base, { ...base, styleURL: 'b' }).renderedTiles).toBe(false);
  });

  it('PDF 由来の地図はタイルが唯一の実体なので触らない', () => {
    const pdf = tileMap('m', 'file:///doc/map.pdf');
    expect(getTileSourceCleanup(pdf, { ...pdf, url: 'pdf://other.pdf' }).source).toBe(false);
    expect(getTileSourceCleanup(tileMap('m', V2023), { ...pdf }).source).toBe(false);
  });

  it('Web の blob URL は起動ごとに変わるので、blob 同士は同じ取得元とみなす', () => {
    const a = tileMap('m', 'pmtiles://blob:http://localhost/aaa');
    expect(getTileSourceCleanup(a, { ...a, url: 'pmtiles://blob:http://localhost/bbb' }).source).toBe(false);
    expect(getTileSourceCleanup(a, { ...a, url: `pmtiles://${PM}` }).source).toBe(true);
  });

  it('新規の地図・グループは対象外', () => {
    expect(getTileSourceCleanup(undefined, tileMap('m', V2024)).source).toBe(false);
    const group = tileMap('g', '', { isGroup: true });
    expect(getTileSourceCleanup(group, { ...group, url: V2024 }).source).toBe(false);
  });
});

describe('findTileSourceChanges / dropTileRegions', () => {
  it('同じ ID で取得元が変わった地図だけを拾う', () => {
    const prev = [tileMap('a', V2023), tileMap('b', V2023), tileMap('c', V2023)];
    const next = [tileMap('a', V2024), { ...prev[1], name: 'renamed' }, tileMap('d', V2024)];
    expect(findTileSourceChanges(prev, next).map(({ id }) => id)).toEqual(['a']);
  });

  it('指定した地図の保存範囲だけを外し、無ければ dispatch しない', () => {
    const { store, state, dispatch } = createStore([], [region('r1', 'a'), region('r2', 'b')]);
    dropTileRegions(store, ['a']);
    expect(state.settings.tileRegions.map(({ id }) => id)).toEqual(['r2']);
    dispatch.mockClear();
    dropTileRegions(store, ['zzz']);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('discardStaleTileSources', () => {
  it('URL を替えた地図のタイル・boundary・保存範囲・3D テクスチャを捨て、style.json は残す', async () => {
    const { store, state } = createStore(
      [tileMap('a', V2023), tileMap('b', V2023)],
      [region('r1', 'a'), region('r2', 'b')]
    );
    mockDirs[`${TILE_FOLDER}/a`] = ['14', '15', 'style.json', 'boundary.json', 'metadata.json'];
    mockDirs[TERRAIN_TEXTURE_CACHE_DIR] = ['a_14_1_2.png', 'a_15_3_4.jpg', 'ab_14_1_2.png', 'b_14_1_2.png'];

    const changes = await discardStaleTileSources(store, [tileMap('a', V2024), tileMap('b', V2023)]);

    expect(changes.map(({ id }) => id)).toEqual(['a']);
    expect(state.settings.tileRegions.map(({ id }) => id)).toEqual(['r2']);
    const deleted = deletedPaths();
    expect(deleted).toEqual(
      expect.arrayContaining([
        `${TILE_FOLDER}/a/14`,
        `${TILE_FOLDER}/a/15`,
        `${TILE_FOLDER}/a/metadata.json`,
        `${TILE_FOLDER}/a/boundary.json`,
        `${TERRAIN_TEXTURE_CACHE_DIR}/a_14_1_2.png`,
        `${TERRAIN_TEXTURE_CACHE_DIR}/a_15_3_4.jpg`,
      ])
    );
    expect(deleted).not.toContain(`${TILE_FOLDER}/a/style.json`);
    expect(deleted).not.toContain(`${TILE_FOLDER}/a`);
    expect(deleted).not.toContain(`${TERRAIN_TEXTURE_CACHE_DIR}/ab_14_1_2.png`);
    expect(deleted.some((p) => p.startsWith(`${TILE_FOLDER}/b/`) || p.includes('/b_'))).toBe(false);
  });

  it('手元が移行済みの陰影起伏で、入ってくる地図が旧形式のURLなら取得元の変更とみなさない（設定監査 S-M3）', async () => {
    const MAPTERHORN = 'hillshade://https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';
    const GSJ = 'hillshade://https://tiles.gsj.jp/tiles/elev/mixed/{z}/{y}/{x}.png';
    const { store, state, dispatch } = createStore([tileMap('h', MAPTERHORN)], [region('r1', 'h')]);
    mockDirs[`${TILE_FOLDER}/h`] = ['14'];

    const changes = await discardStaleTileSources(store, [tileMap('h', GSJ)]);

    expect(changes).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
    expect(state.settings.tileRegions.map(({ id }) => id)).toEqual(['r1']);
    expect(mockedFS.deleteAsync).not.toHaveBeenCalled();
  });

  it('署名の付け外しだけなら何も消さない', async () => {
    const { store, dispatch } = createStore([tileMap('a', V2023)], [region('r1', 'a')]);
    const changes = await discardStaleTileSources(store, [tileMap('a', `${V2023}?expires=1&sig=x`)]);
    expect(changes).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
    expect(mockedFS.deleteAsync).not.toHaveBeenCalled();
  });

  it('PMTiles のスタイル変更は描画済み画像だけを捨て、保存範囲は残す', async () => {
    const before = tileMap('p', PM, { styleURL: 'https://example.com/s1.json' });
    const { store, state } = createStore([before], [region('r1', 'p')]);
    mockDirs[`${TILE_FOLDER}/p`] = ['14', 'style.json'];
    mockDirs[`${TILE_FOLDER}/p/14`] = ['100'];
    mockDirs[`${TILE_FOLDER}/p/14/100`] = ['200', '200.pbf'];

    await discardStaleTileSources(store, [{ ...before, styleURL: 'https://example.com/s2.json' }]);

    expect(state.settings.tileRegions.map(({ id }) => id)).toEqual(['r1']);
    const deleted = deletedPaths();
    expect(deleted).toContain(`${TILE_FOLDER}/p/14/100/200`);
    expect(deleted).not.toContain(`${TILE_FOLDER}/p/14/100/200.pbf`);
  });

  it('Web は取り込んだ本体を配信元の変更で捨て、style は残す（3D のディスクキャッシュは無い）', async () => {
    platform.OS = 'web';
    const before = tileMap('w', 'pmtiles://blob:http://localhost/aaa');
    mockPmtiles.set('w', { mapId: 'w', blob: new Blob(['x']), boundary: '{}', style: '{"version":8}' });
    const { store } = createStore([before], []);

    await discardStaleTileSources(store, [{ ...before, url: `pmtiles://${PM}` }]);

    expect(mockPmtiles.get('w')).toEqual({ mapId: 'w', blob: undefined, boundary: '', style: '{"version":8}' });
    expect(mockedFS.readDirectoryAsync).not.toHaveBeenCalledWith(TERRAIN_TEXTURE_CACHE_DIR);
  });
});

describe('removeTerrainTextureCacheForMap', () => {
  it('キャッシュのフォルダが無くても失敗しない', async () => {
    await expect(removeTerrainTextureCacheForMap('a')).resolves.toBeUndefined();
    expect(mockedFS.deleteAsync).not.toHaveBeenCalled();
  });
});
