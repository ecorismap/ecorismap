import { getPmtileKey, getUrlTileKey } from '../pmtileKey';
import { withTileSignature } from '../TileSignature';

const URL = 'https://example.com/a.pmtiles';
const STYLE = 'https://example.com/style.json';

describe('getPmtileKey', () => {
  const tileMap = { id: 'map1' };

  it('オンライン/オフラインで key が変わる（作り直してオンライン復帰で読み込ませる）', () => {
    expect(getPmtileKey(tileMap, URL, STYLE, true)).not.toBe(getPmtileKey(tileMap, URL, STYLE, false));
  });

  // タイル監査 M-H6: ネイティブの setUrlTemplate は新しい URL を反映しないので作り直させる
  it('渡す URL が変わると key が変わる（署名の取得・失効も含む）', () => {
    expect(getPmtileKey(tileMap, `${URL}?expires=1&sig=x`, STYLE, false)).not.toBe(
      getPmtileKey(tileMap, URL, STYLE, false)
    );
    expect(getPmtileKey(tileMap, 'https://example.com/b.pmtiles', STYLE, false)).not.toBe(
      getPmtileKey(tileMap, URL, STYLE, false)
    );
  });

  it('styleURL の変更で key が変わる', () => {
    expect(getPmtileKey(tileMap, URL, 'https://example.com/style2.json', false)).not.toBe(
      getPmtileKey(tileMap, URL, STYLE, false)
    );
  });

  it('同じ URL の別の地図とは key が重ならない', () => {
    expect(getPmtileKey({ id: 'map2' }, URL, STYLE, false)).not.toBe(getPmtileKey(tileMap, URL, STYLE, false));
  });

  it('入力が同じなら key は同じ（無駄に作り直さない）', () => {
    expect(getPmtileKey(tileMap, URL, undefined, false)).toBe(getPmtileKey({ id: 'map1' }, URL, undefined, false));
  });
});

describe('getUrlTileKey', () => {
  const tileMap = { id: 'map1', flipY: false, tileSize: 256, redraw: undefined };
  const TILE = 'https://example.com/{z}/{x}/{y}.png';

  it('Android・iOS とも、渡す URL（署名込み）が変わると key が変わる', () => {
    const signed = withTileSignature(TILE, {
      [TILE]: { status: 'signed', query: 'expires=1&sig=x', expires: 1, checkedAt: 0 },
    });
    for (const os of ['android', 'ios']) {
      expect(getUrlTileKey(tileMap, signed, false, os)).not.toBe(getUrlTileKey(tileMap, TILE, false, os));
    }
  });

  it('flipY・tileSize の変更で key が変わる', () => {
    expect(getUrlTileKey({ ...tileMap, flipY: true }, TILE, false, 'android')).not.toBe(
      getUrlTileKey(tileMap, TILE, false, 'android')
    );
    expect(getUrlTileKey({ ...tileMap, tileSize: 512 }, TILE, false, 'android')).not.toBe(
      getUrlTileKey(tileMap, TILE, false, 'android')
    );
  });

  it('tileSize 未指定は 256 と同じ扱い', () => {
    expect(getUrlTileKey({ ...tileMap, tileSize: undefined }, TILE, false, 'android')).toBe(
      getUrlTileKey(tileMap, TILE, false, 'android')
    );
  });

  it('iOS はオンライン/オフラインで作り直し、Android は従来どおり作り直さない', () => {
    expect(getUrlTileKey(tileMap, TILE, true, 'ios')).not.toBe(getUrlTileKey(tileMap, TILE, false, 'ios'));
    expect(getUrlTileKey(tileMap, TILE, true, 'android')).toBe(getUrlTileKey(tileMap, TILE, false, 'android'));
  });

  it('Android・iOS とも、redraw（同じ ID での PDF 再ダウンロード）で作り直す', () => {
    for (const os of ['android', 'ios']) {
      expect(getUrlTileKey({ ...tileMap, redraw: true }, TILE, false, os)).not.toBe(
        getUrlTileKey({ ...tileMap, redraw: false }, TILE, false, os)
      );
    }
  });
});
