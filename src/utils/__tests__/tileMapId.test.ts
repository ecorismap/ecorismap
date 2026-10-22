import { dropUnsafeTileMaps, isSafeTileMapId } from '../tileMapId';
import { isTileMapType } from '../Map';

const baseMap = {
  name: '背景図',
  url: 'https://example.com/{z}/{x}/{y}.png',
  attribution: '',
  maptype: 'none',
  visible: true,
  transparency: 0,
  overzoomThreshold: 18,
  highResolutionEnabled: false,
  minimumZ: 0,
  maximumZ: 22,
  flipY: false,
};

// アプリが採番するULID・固定ID、および区切りにならない文字だけのID
const SAFE_IDS = ['01HZY3K8Q4V9XWJ2M5N7P0R6ST', 'standard', 'hybrid', 'dem_mapterhorn', '地図A', 'my map', 'a.b', '...'];

// TILE_FOLDER自身・親を指す、または区切り・パーセントデコード・クエリ/フラグメントでフォルダの外を指しうるID
const UNSAFE_IDS = [
  '',
  '.',
  '..',
  '../SQLite',
  '../SQLite?',
  '..?x',
  '..#x',
  '..;x',
  '%2e%2e',
  '..%2fSQLite',
  'a/b',
  '..\\SQLite',
  'a\u0000b',
  'a\nb',
];

describe('isSafeTileMapId', () => {
  test.each(SAFE_IDS)('フォルダ名として安全なID %p は受け付ける', (id) => {
    expect(isSafeTileMapId(id)).toBe(true);
  });

  test.each(UNSAFE_IDS)('TILE_FOLDERの外を指しうるID %p は拒否する', (id) => {
    expect(isSafeTileMapId(id)).toBe(false);
  });

  test.each([undefined, null, 1, {}])('文字列でないID %p は拒否する', (id) => {
    expect(isSafeTileMapId(id)).toBe(false);
  });
});

describe('dropUnsafeTileMaps', () => {
  test('安全でないIDの地図だけを取り除き、順序を保つ', () => {
    const maps = [
      { ...baseMap, id: 'standard' },
      { ...baseMap, id: '../SQLite' },
      { ...baseMap, id: '01HZY3K8Q4V9XWJ2M5N7P0R6ST' },
      { ...baseMap, id: '../projects?' },
    ];
    expect(dropUnsafeTileMaps(maps).map((m) => m.id)).toEqual(['standard', '01HZY3K8Q4V9XWJ2M5N7P0R6ST']);
  });

  test('すべて安全なら内容は変わらない', () => {
    const maps = [
      { ...baseMap, id: 'standard' },
      { ...baseMap, id: 'hybrid' },
    ];
    expect(dropUnsafeTileMaps(maps)).toEqual(maps);
  });

  test('配列でなければそのまま返す', () => {
    expect(dropUnsafeTileMaps(undefined as unknown as { id: string }[])).toBeUndefined();
  });
});

describe('isTileMapType', () => {
  test('安全なIDの地図設定は受け付ける', () => {
    expect(isTileMapType({ ...baseMap, id: '01HZY3K8Q4V9XWJ2M5N7P0R6ST' })).toBe(true);
  });

  test('TILE_FOLDERの外を指すIDの地図設定は拒否する', () => {
    expect(isTileMapType({ ...baseMap, id: '../SQLite' })).toBe(false);
    expect(isTileMapType({ ...baseMap, id: '../SQLite?' })).toBe(false);
  });
});
