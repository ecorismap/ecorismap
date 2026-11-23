// タイル監査 M-M2: flipY の地図の旧規約キャッシュを、両 OS で一度だけ片付けて保存範囲の記録も外す
import * as FileSystem from 'expo-file-system/legacy';
import { TILE_FOLDER } from '../../constants/AppConstants';
import { TileMapType, TileRegionType } from '../../types';
import {
  JS_XYZ_MARKER,
  migrateFlipYTileCaches,
  NATIVE_XYZ_MARKER,
  needsFlipYMigration,
  startFlipYTileCacheMigration,
} from '../flipYTileCacheMigration';

let mockFiles: Set<string>;
let mockDirs: Record<string, string[]>;

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/',
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(async (path: string) => ({ exists: mockFiles.has(path) })),
  readDirectoryAsync: jest.fn(async (path: string) => {
    const entries = mockDirs[path];
    if (entries === undefined) throw new Error('not found');
    return entries;
  }),
  deleteAsync: jest.fn(async () => undefined),
  makeDirectoryAsync: jest.fn(async () => undefined),
  writeAsStringAsync: jest.fn(async (path: string) => {
    mockFiles.add(path);
  }),
}));

const mockedFS = FileSystem as jest.Mocked<typeof FileSystem>;
const deletedPaths = () => mockedFS.deleteAsync.mock.calls.map(([p]) => String(p));

const map = (extra: Partial<TileMapType>): TileMapType =>
  ({
    id: 'TMS',
    name: 'TMS',
    url: 'https://example.com/{z}/{x}/{y}.png',
    attribution: '',
    maptype: 'none',
    visible: false,
    transparency: 0,
    overzoomThreshold: 18,
    highResolutionEnabled: false,
    minimumZ: 0,
    maximumZ: 22,
    flipY: true,
    ...extra,
  } as TileMapType);

const region = (id: string, tileMapId: string) => ({ id, tileMapId } as TileRegionType);

const makeStore = (tileMaps: TileMapType[], tileRegions: TileRegionType[]) => {
  let state = { tileMaps, settings: { tileRegions } };
  const listeners: (() => void)[] = [];
  return {
    getState: () => state as never,
    dispatch: jest.fn((action: { payload: { tileRegions?: TileRegionType[] } }) => {
      state = { ...state, settings: { ...state.settings, ...action.payload } };
      return action;
    }),
    subscribe: (listener: () => void) => {
      listeners.push(listener);
      return () => undefined;
    },
    setTileMaps: (next: TileMapType[]) => {
      state = { ...state, tileMaps: next };
      listeners.forEach((l) => l());
    },
    regions: () => state.settings.tileRegions,
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles = new Set();
  mockDirs = {};
});

describe('needsFlipYMigration', () => {
  it('flipY の XYZ 地図だけが対象。PMTiles・pbf・PDF・グループは対象外', () => {
    expect(needsFlipYMigration(map({}))).toBe(true);
    expect(needsFlipYMigration(map({ flipY: false }))).toBe(false);
    expect(needsFlipYMigration(map({ url: 'pmtiles://https://example.com/a.pmtiles' }))).toBe(false);
    expect(needsFlipYMigration(map({ url: 'https://example.com/{z}/{x}/{y}.pbf' }))).toBe(false);
    expect(needsFlipYMigration(map({ url: 'file://scan' }))).toBe(false);
    expect(needsFlipYMigration(map({ isGroup: true }))).toBe(false);
  });
});

describe('migrateFlipYTileCaches', () => {
  it('旧規約のタイルを消し、両方の印を置き、保存範囲の記録を外す（style.json などは残す）', async () => {
    mockDirs[`${TILE_FOLDER}/TMS`] = ['14', '15', 'style.json'];
    const store = makeStore([map({})], [region('R1', 'TMS'), region('R2', 'OTHER')]);
    await migrateFlipYTileCaches(store, [map({})]);

    expect(deletedPaths()).toEqual(expect.arrayContaining([`${TILE_FOLDER}/TMS/14`, `${TILE_FOLDER}/TMS/15`]));
    expect(deletedPaths()).not.toContain(`${TILE_FOLDER}/TMS/style.json`);
    expect(mockFiles.has(`${TILE_FOLDER}/TMS/${NATIVE_XYZ_MARKER}`)).toBe(true);
    expect(mockFiles.has(`${TILE_FOLDER}/TMS/${JS_XYZ_MARKER}`)).toBe(true);
    expect(store.regions().map(({ id }) => id)).toEqual(['R2']);
  });

  it('済んでいる地図（JS の印がある）は、新しく保存したタイルも記録も触らない', async () => {
    mockFiles.add(`${TILE_FOLDER}/TMS/${JS_XYZ_MARKER}`);
    mockDirs[`${TILE_FOLDER}/TMS`] = ['14'];
    const store = makeStore([map({})], [region('R1', 'TMS')]);
    await migrateFlipYTileCaches(store, [map({})]);
    expect(mockedFS.deleteAsync).not.toHaveBeenCalled();
    expect(store.regions()).toHaveLength(1);
  });

  it('iOS のネイティブが先に消していても（ネイティブの印だけある）、記録は外す', async () => {
    mockFiles.add(`${TILE_FOLDER}/TMS/${NATIVE_XYZ_MARKER}`);
    const store = makeStore([map({})], [region('R1', 'TMS')]);
    await migrateFlipYTileCaches(store, [map({})]);
    expect(store.regions()).toHaveLength(0);
  });
});

describe('migrateFlipYTileCaches の途中終了（設定監査 S-L5）', () => {
  it('印を書く前にその地図の保存範囲の記録を外す（後の地図の処理中に終了しても先の地図の記録は残らない）', async () => {
    const store = makeStore([map({ id: 'A' }), map({ id: 'B' })], [region('RA', 'A'), region('RB', 'B')]);
    const regionsAtMark: Record<string, string[]> = {};
    mockedFS.writeAsStringAsync.mockImplementation(async (path: string) => {
      if (path.endsWith(JS_XYZ_MARKER)) regionsAtMark[path] = store.regions().map(({ id }) => id);
      mockFiles.add(path);
    });
    await migrateFlipYTileCaches(store, [map({ id: 'A' }), map({ id: 'B' })]);
    expect(regionsAtMark[`${TILE_FOLDER}/A/${JS_XYZ_MARKER}`]).toEqual(['RB']);
    expect(regionsAtMark[`${TILE_FOLDER}/B/${JS_XYZ_MARKER}`]).toEqual([]);
  });

  it('タイルの削除に失敗した地図は記録を外さない', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockDirs[`${TILE_FOLDER}/A`] = ['14'];
    mockedFS.deleteAsync.mockRejectedValueOnce(new Error('io'));
    const store = makeStore([map({ id: 'A' })], [region('RA', 'A')]);
    await migrateFlipYTileCaches(store, [map({ id: 'A' })]);
    expect(store.regions().map(({ id }) => id)).toEqual(['RA']);
    expect(mockFiles.has(`${TILE_FOLDER}/A/${JS_XYZ_MARKER}`)).toBe(false);
    warn.mockRestore();
  });
});

describe('startFlipYTileCacheMigration', () => {
  it('起動時の一覧と、後から一覧に現れた地図を移行する', async () => {
    const store = makeStore([map({ id: 'A' })], []);
    startFlipYTileCacheMigration(store);
    store.setTileMaps([map({ id: 'A' }), map({ id: 'B' }), map({ id: 'C', flipY: false })]);
    // 直列に処理されるので、後から積んだ処理を待てば先の移行も終わっている
    await migrateFlipYTileCaches(store, [map({ id: 'Z' })]);
    expect(mockFiles.has(`${TILE_FOLDER}/A/${JS_XYZ_MARKER}`)).toBe(true);
    expect(mockFiles.has(`${TILE_FOLDER}/B/${JS_XYZ_MARKER}`)).toBe(true);
    expect(mockFiles.has(`${TILE_FOLDER}/C/${JS_XYZ_MARKER}`)).toBe(false);
  });
});
