/**
 * タイル監査（docs/TILE_AUDIT_2026-11.md）の medium の回帰テスト（地図まわりの純粋関数）。
 * - M-M20: mapTypeFromTileMaps
 * - M-M21: 日本語の初期一覧では標準地図を非表示にする（createInitialTileMaps）
 * - M-M11: isPdfTileMap・findPdfPageMaps
 * - M-M18: pmtilesHeaderZoom
 */
import { mapTypeFromTileMaps } from '../baseMapType';
import { createInitialTileMaps } from '../../constants/Maps';
import { findPdfPageMaps, isPdfTileMap } from '../pdfTileMap';
import { pmtilesHeaderZoom } from '../pmtilesHeaderZoom';
import { TileMapType } from '../../types';

const map = (extra: Partial<TileMapType>): TileMapType => ({
  id: 'X',
  name: 'X',
  url: '',
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

describe('M-M20: mapTypeFromTileMaps', () => {
  test.each([
    [true, false, 'standard'],
    [false, true, 'hybrid'],
    [false, false, 'none'],
  ])('standard=%s hybrid=%s → %s', (standard, hybrid, expected) => {
    expect(
      mapTypeFromTileMaps([
        { id: 'std', visible: true },
        { id: 'hybrid', visible: hybrid },
        { id: 'standard', visible: standard },
      ])
    ).toBe(expected);
  });

  test('どちらの項目も無ければ決めない', () => {
    expect(mapTypeFromTileMaps([{ id: 'std', visible: true }])).toBeUndefined();
  });
});

describe('M-M21: createInitialTileMaps', () => {
  test('日本語では地理院地図を表示し、標準地図（MapTiler/Google）は非表示', () => {
    const maps = createInitialTileMaps('ja-JP');
    expect(maps.find((m) => m.id === 'std')?.visible).toBe(true);
    expect(maps.find((m) => m.id === 'standard')?.visible).toBe(false);
    expect(mapTypeFromTileMaps(maps)).toBe('none');
  });

  test('日本語以外は標準地図を表示したまま', () => {
    const maps = createInitialTileMaps('en');
    expect(maps.map((m) => m.id)).toEqual(['hybrid', 'standard']);
    expect(maps.find((m) => m.id === 'standard')?.visible).toBe(true);
    expect(mapTypeFromTileMaps(maps)).toBe('standard');
  });
});

describe('M-M11: isPdfTileMap', () => {
  test.each([
    ['file://map.pdf', '', true],
    ['file://MAP.PDF', '', true],
    ['https://example.com/a.pdf?sig=1', '環境省', true],
    ['pdf://https://firebase/x', '', true],
    // 複数ページの PDF のページ地図は url が .pdf で終わらない
    ['file://現地植生図', 'PDF', true],
    ['https://example.com/{z}/{x}/{y}.png', '国土地理院', false],
    ['file://現地植生図', '', false],
  ])('%s (%s) → %s', (url, attribution, expected) => {
    expect(isPdfTileMap({ url, attribution })).toBe(expected);
  });
});

describe('M-M11: findPdfPageMaps', () => {
  const source = map({ id: 'SRC', name: '植生図', url: 'https://example.com/veg.pdf' });

  test('pdfSourceId のページと、以前の作り方のページをページ番号で返す', () => {
    const p1 = map({ id: 'P1', name: '別名', url: 'file://植生図', attribution: 'PDF', pdfSourceId: 'SRC', pdfPage: 1 });
    const legacy2 = map({ id: 'L2', name: '植生図_page02', url: 'file://植生図', attribution: 'PDF' });
    const otherSource = map({ id: 'O1', name: '植生図_page01', url: 'file://植生図', attribution: 'PDF', pdfSourceId: 'OTHER', pdfPage: 1 });
    const unrelated = map({ id: 'U', name: '植生図_page03', url: 'https://x/{z}/{x}/{y}.png' });
    const pages = findPdfPageMaps([source, p1, legacy2, otherSource, unrelated], source);
    expect([...pages.entries()].map(([page, m]) => [page, m.id])).toEqual([
      [1, 'P1'],
      [2, 'L2'],
    ]);
  });

  test('同じページ番号なら新しい形式を優先する', () => {
    const legacy1 = map({ id: 'L1', name: '植生図_page01', url: 'file://植生図', attribution: 'PDF' });
    const p1 = map({ id: 'P1', url: 'file://植生図', attribution: 'PDF', pdfSourceId: 'SRC', pdfPage: 1 });
    expect(findPdfPageMaps([legacy1, p1], source).get(1)?.id).toBe('P1');
  });
});

describe('M-M18: pmtilesHeaderZoom', () => {
  test('ズーム範囲はヘッダーに合わせ、固定ズームはヘッダーの最大を超えないようにする', () => {
    expect(pmtilesHeaderZoom({ overzoomThreshold: 18 }, { minZoom: 5, maxZoom: 15 })).toEqual({
      minimumZ: 5,
      maximumZ: 15,
      overzoomThreshold: 15,
    });
  });

  test('利用者が下げた固定ズームは残す', () => {
    expect(pmtilesHeaderZoom({ overzoomThreshold: 12 }, { minZoom: 0, maxZoom: 15 }).overzoomThreshold).toBe(12);
  });
});
