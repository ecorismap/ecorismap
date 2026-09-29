import { TileMapType } from '../../../types';
import {
  VECTOR_CHUNK_PADDING,
  VECTOR_CHUNK_SIZE,
  buildAttributionText,
  getVectorChunkView,
  isVectorPmtilesMap,
  buildTileUrl,
  getPdfMapNotices,
  getPrintableTileMaps,
  getUnprintableReason,
  listPdfTiles,
  buildTileMapHTML,
} from '../tiles';

const map = (props: Partial<TileMapType>): TileMapType => ({
  id: 'm',
  name: 'map',
  url: 'https://example.com/{z}/{x}/{y}.png',
  attribution: '',
  transparency: 0,
  overzoomThreshold: 18,
  highResolutionEnabled: false,
  minimumZ: 0,
  maximumZ: 22,
  flipY: false,
  maptype: 'none',
  visible: true,
  ...props,
});

describe('buildTileUrl', () => {
  it('XYZはそのまま置換する', () => {
    expect(buildTileUrl(map({}), 10, 900, 400)).toBe('https://example.com/10/900/400.png');
  });
  it('flipYの地図はYを反転する（地図表示と同じ位置のタイル）', () => {
    expect(buildTileUrl(map({ flipY: true }), 10, 900, 400)).toBe('https://example.com/10/900/623.png');
  });
  it('{-y}テンプレートはTMSのYで置換する', () => {
    expect(buildTileUrl(map({ url: 'https://example.com/{z}/{x}/{-y}.png' }), 10, 900, 400)).toBe(
      'https://example.com/10/900/623.png'
    );
  });
});

describe('getUnprintableReason', () => {
  it.each([
    [map({ id: 'standard' }), false, 'basemap'],
    [map({ id: 'hybrid' }), false, 'basemap'],
    [map({ url: 'hillshade://https://example.com/{z}/{x}/{y}.png' }), false, 'terrain'],
    [map({ url: 'relief://https://tiles.gsj.jp/{z}/{y}/{x}.png#style=gebco' }), false, 'terrain'],
    [map({ url: 'pmtiles://file:///a.pmtiles' }), true, 'local'],
    [map({ url: 'blob:http://localhost/abc' }), true, 'local'],
    [map({ url: 'pdf://abc' }), true, 'local'],
  ])('%#: 載らない理由を返す', (m, isWeb, reason) => {
    expect(getUnprintableReason(m, isWeb)).toBe(reason);
  });

  it('端末内の地図はモバイルでは載せられる（タイルフォルダから取り出す）', () => {
    expect(getUnprintableReason(map({ url: 'pmtiles://file:///a.pmtiles' }), false)).toBeUndefined();
  });

  it('isVectorが付いていてもラスタのURLなら載せられる（地理院写真のプリセット等）', () => {
    const photo = map({ url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', isVector: true });
    expect(getUnprintableReason(photo, false)).toBeUndefined();
    expect(getUnprintableReason(photo, true)).toBeUndefined();
  });

  it.each([
    [map({ url: 'pmtiles://https://example.com/a.pmtiles', isVector: true }), false],
    [map({ url: 'pmtiles://https://example.com/a.pmtiles', isVector: true }), true],
    [map({ url: 'https://example.com/a.pmtiles' }), true],
    [map({ url: 'https://example.com/{z}/{x}/{y}.pbf' }), true],
    [map({ url: 'https://example.com/{z}/{x}/{y}.pbf' }), false],
    //Webで取り込んだPMTiles（IndexedDBのblob）
    [map({ url: 'pmtiles://blob:http://localhost/abc', isVector: true }), true],
  ])('%#: PMTiles・pbfはベクタもラスタも載せられる', (m, isWeb) => {
    expect(getUnprintableReason(m, isWeb)).toBeUndefined();
  });

  it('通常のラスタタイルは載せられる', () => {
    expect(getUnprintableReason(map({}), true)).toBeUndefined();
  });
});

describe('getPrintableTileMaps', () => {
  it('表示中のラスタ地図だけを、一覧の逆順（下の地図から）で返す', () => {
    const maps = [
      map({ id: 'top' }),
      map({ id: 'hidden', visible: false }),
      map({ id: 'group', isGroup: true }),
      map({ id: 'standard' }),
      map({ id: 'bottom' }),
    ];
    expect(getPrintableTileMaps(maps, false).map((m) => m.id)).toEqual(['bottom', 'top']);
  });
});

describe('getPdfMapNotices', () => {
  it('ほかに載る地図があれば標準地図は知らせない', () => {
    const maps = [map({ id: 'gsi', name: '地理院' }), map({ id: 'standard', name: '標準' })];
    expect(getPdfMapNotices(maps, false)).toEqual([]);
  });
  it('載る地図が無い（白紙になる）ときは標準地図も知らせる', () => {
    const maps = [map({ id: 'standard', name: '標準' })];
    expect(getPdfMapNotices(maps, false)).toEqual([{ name: '標準', reason: 'basemap' }]);
  });
  it('陰影起伏などは常に知らせる', () => {
    const maps = [map({ id: 'gsi' }), map({ id: 'hs', name: '陰影', url: 'hillshade://x/{z}/{x}/{y}.png' })];
    expect(getPdfMapNotices(maps, false)).toEqual([{ name: '陰影', reason: 'terrain' }]);
  });
});

describe('buildAttributionText', () => {
  it('HTMLタグを除き、重複を除いて並べる', () => {
    const maps = [
      map({ attribution: '<a href="https://maps.gsi.go.jp">国土地理院</a>' }),
      map({ attribution: '国土地理院' }),
      map({ attribution: '' }),
    ];
    expect(buildAttributionText(maps)).toBe('国土地理院, EcorisMap');
  });
});

describe('listPdfTiles / buildTileMapHTML', () => {
  const region = { minLon: 135.0, minLat: 35.0, maxLon: 135.01, maxLat: 35.01 };

  it('範囲を覆うタイルを下の地図から順に並べる', () => {
    const tiles = listPdfTiles([map({ id: 'top' }), map({ id: 'bottom' })], region, 16, false);
    const ids = tiles.map((t) => t.map.id);
    expect(ids.indexOf('bottom')).toBe(0);
    expect(ids.lastIndexOf('bottom')).toBeLessThan(ids.indexOf('top'));
    expect(tiles.filter((t) => t.map.id === 'top').length).toBe(ids.length / 2);
  });

  it('overzoomThresholdを超えるズームは親タイルを拡大して貼る', () => {
    const tiles = listPdfTiles([map({ overzoomThreshold: 15 })], region, 16, false);
    expect(tiles.every((t) => t.z === 15 && t.width === 512 && t.height === 512)).toBe(true);
  });

  it('取得できなかったタイルは出さず、地図ごとの重ね順は保つ', () => {
    const tiles = listPdfTiles([map({ id: 'a' }), map({ id: 'b' })], region, 16, false);
    const html = buildTileMapHTML(
      tiles,
      tiles.map((t, i) => (i === 0 ? undefined : `${t.map.id}-${i}`))
    );
    expect((html.match(/<img/g) ?? []).length).toBe(tiles.length - 1);
    expect((html.match(/<div/g) ?? []).length).toBe(2);
    expect(html.indexOf('b-')).toBeLessThan(html.indexOf('a-'));
  });
});

describe('isVectorPmtilesMap', () => {
  it.each([
    [map({ url: 'pmtiles://https://example.com/a.pmtiles', isVector: true }), true],
    [map({ url: 'pmtiles://https://example.com/a.pmtiles', isVector: false }), false],
    [map({ url: 'https://example.com/{z}/{x}/{y}.pbf' }), true],
    //地理院写真のプリセット等、isVectorが付いたラスタ
    [map({ url: 'https://example.com/{z}/{x}/{y}.jpg', isVector: true }), false],
  ])('%#', (m, expected) => {
    expect(isVectorPmtilesMap(m)).toBe(expected);
  });
});

describe('listPdfTiles（PMTiles）', () => {
  const region = { minLon: 135.0, minLat: 35.0, maxLon: 135.01, maxLat: 35.01 };
  const vector = map({ url: 'pmtiles://https://example.com/a.pmtiles', isVector: true, overzoomThreshold: 14 });
  const raster = map({ url: 'pmtiles://https://example.com/a.pmtiles', overzoomThreshold: 14 });

  it('モバイルのPMTilesは親タイルにせず、表示ズームのタイルをネイティブで描く', () => {
    const tiles = listPdfTiles([vector], region, 16, false);
    expect(tiles.every((t) => t.z === 16 && t.width === 256 && t.opacity === 1)).toBe(true);
  });

  it('WebのラスタPMTilesは通常のタイルと同じく親タイルを拡大する', () => {
    const tiles = listPdfTiles([raster], region, 16, true);
    expect(tiles.every((t) => t.z === 14 && t.width === 1024)).toBe(true);
  });

  it('Webのベクタはタイル範囲を分割した画像にし、透過はスタイル側に任せる', () => {
    const transparent = { ...vector, transparency: 0.5 };
    const tiles = listPdfTiles([transparent], region, 19, true);
    const rasterTiles = listPdfTiles([map({ overzoomThreshold: 22 })], region, 19, true);
    const frameWidth = Math.max(...rasterTiles.map((t) => t.left + t.width));
    const frameHeight = Math.max(...rasterTiles.map((t) => t.top + t.height));
    expect(frameWidth).toBeGreaterThan(VECTOR_CHUNK_SIZE);
    expect(tiles.length).toBe(Math.ceil(frameWidth / VECTOR_CHUNK_SIZE) * Math.ceil(frameHeight / VECTOR_CHUNK_SIZE));
    //分割は隙間なく範囲を覆う
    const area = tiles.reduce((sum, t) => sum + t.width * t.height, 0);
    expect(area).toBe(frameWidth * frameHeight);
    expect(tiles.every((t) => t.width <= VECTOR_CHUNK_SIZE && t.height <= VECTOR_CHUNK_SIZE)).toBe(true);
    expect(tiles.every((t) => t.opacity === 1)).toBe(true);
  });
});

describe('getVectorChunkView', () => {
  const chunk = (left: number, top: number) => ({
    map: map({}),
    z: 2,
    x: 0,
    y: 0,
    left,
    top,
    width: VECTOR_CHUNK_SIZE,
    height: VECTOR_CHUNK_SIZE,
    opacity: 1,
  });

  it('余白込みの描画範囲の中心を、512pxタイル基準のズーム（z-1）で描く', () => {
    //z2の世界は1024px。中心(512,512)が経緯度(0,0)になるよう原点をずらす
    const size = VECTOR_CHUNK_SIZE + 2 * VECTOR_CHUNK_PADDING;
    const origin = { x: 512 - size / 2 + VECTOR_CHUNK_PADDING, y: 512 - size / 2 + VECTOR_CHUNK_PADDING };
    const view = getVectorChunkView(chunk(0, 0), origin);
    expect(view.zoom).toBe(1);
    expect(view.size).toBe(size);
    expect(view.center[0]).toBeCloseTo(0);
    expect(view.center[1]).toBeCloseTo(0);
    expect(view.crop).toEqual({
      left: VECTOR_CHUNK_PADDING,
      top: VECTOR_CHUNK_PADDING,
      width: VECTOR_CHUNK_SIZE,
      height: VECTOR_CHUNK_SIZE,
    });
  });

  it('右の分割は分割幅だけ東を描く', () => {
    const a = getVectorChunkView(chunk(0, 0), { x: 0, y: 0 });
    const b = getVectorChunkView(chunk(VECTOR_CHUNK_SIZE, 0), { x: 0, y: 0 });
    expect(b.center[0] - a.center[0]).toBeCloseTo((VECTOR_CHUNK_SIZE / 1024) * 360);
    expect(b.center[1]).toBeCloseTo(a.center[1]);
  });
});
