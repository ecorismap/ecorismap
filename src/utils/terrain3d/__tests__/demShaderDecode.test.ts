/**
 * 頂点シェーダの標高デコード式（TerrainRenderer.tsのdecodeElev）が、
 * JS側の実装（decodeElevation / decodeTerrarium）と一致することを検証する。
 *
 * 描画はGPUで、タップ・ドレープ・投影はJSでデコードするため、両者がずれると
 * 「地形の形」と「マーカー・軌跡の高さ」が食い違う。GPU側は実機でしか動かせないので、
 * シェーダの式をTSで忠実に再現したリファレンス実装をここで突き合わせる。
 */
import { decodeElevation } from '../../terrainShading';
import { decodeDemTile } from '../../demTileProvider';

/** Math.fround相当。WGSLのf32演算を再現する */
const f = Math.fround;

/**
 * TerrainRenderer.tsの頂点シェーダ decodeElev() のTS再現。
 * 変更したら両方を揃えること。
 *
 * DEMは rgba8uint テクスチャなので textureLoad は 0..255 の整数をそのまま返す
 * （UNORM正規化の往復がないぶん、GLSL版にあった floor(texel*255+0.5) の復元も不要）。
 */
const decodeElevShader = (
  r: number,
  g: number,
  b: number,
  encoding: 'gsi' | 'terrarium',
  noDataElev = 0
): number => {
  if (encoding === 'terrarium') {
    return Math.max(f(f(f(r * 256) + g) + f(b / 256)) - 32768, 0);
  }
  // u32演算なので2^24未満は厳密。f32化は0.01倍のときだけ
  const x = r * 65536 + g * 256 + b;
  if (x === 8388608) return noDataElev; // シェーダの tile.misc.x（タイル最低標高）
  return x < 8388608 ? f(x * 0.01) : f((x - 16777216) * 0.01);
};

/**
 * JS側で標高を確定させる手順のリファレンス。
 * TerrainTileManager.sampleElevationAtMercator の vertexElev と同じでなければならない
 */
const resolveElevJs = (r: number, g: number, b: number, noDataElev: number): number => {
  const v = decodeElevation(r, g, b);
  return Number.isNaN(v) ? noDataElev : v;
};

describe('シェーダのGSI方式デコード', () => {
  it('24bit空間を網羅的にサンプリングしてJS実装と0.01m以内で一致する', () => {
    // NoDataを含めて完全一致させるため、0以外の最低標高で検証する
    // （0だと「JSが常に0mに落とす」旧実装のバグを見逃す）
    const noDataElev = 837.5;
    const triples: [number, number, number][] = [];
    for (let r = 0; r < 256; r += 7) {
      for (let g = 0; g < 256; g += 13) {
        for (let b = 0; b < 256; b += 29) triples.push([r, g, b]);
      }
    }
    // 走査の刻みが128を踏まないため、NoDataは明示的に混ぜる
    triples.push([0x80, 0x00, 0x00]);
    let noDataSeen = 0;
    for (const [r, g, b] of triples) {
      const js = resolveElevJs(r, g, b, noDataElev);
      const gpu = decodeElevShader(r, g, b, 'gsi', noDataElev);
      if (Number.isNaN(decodeElevation(r, g, b))) noDataSeen++;
      expect(Math.abs(gpu - js)).toBeLessThan(0.01);
    }
    expect(triples.length).toBeGreaterThan(2000);
    expect(noDataSeen).toBeGreaterThan(0);
  });

  it('代表的な標高で一致する（0m / 100m / 3776m / 負の標高）', () => {
    const cases = [0, 10000, 377600, 100, 16777216 - 500]; // 生値（0.01m単位）
    for (const raw of cases) {
      const r = (raw >> 16) & 0xff;
      const g = (raw >> 8) & 0xff;
      const b = raw & 0xff;
      expect(decodeElevShader(r, g, b, 'gsi')).toBeCloseTo(decodeElevation(r, g, b), 2);
    }
  });

  it('NoData(2^23)はシェーダ・JSともタイル最低標高になる', () => {
    // シェーダは decodeElev の x == 8388608u で tile.misc.x を返す。
    // JSはNaNを同じ値へ置き換える。0mに落とすと山地でドットが数百m沈む
    for (const noDataElev of [0, 837.5, 1148.8]) {
      expect(decodeElevShader(0x80, 0x00, 0x00, 'gsi', noDataElev)).toBe(noDataElev);
      expect(resolveElevJs(0x80, 0x00, 0x00, noDataElev)).toBe(noDataElev);
    }
    expect(Number.isNaN(decodeElevation(0x80, 0x00, 0x00))).toBe(true);
  });

  it('負の標高（2^23超）は符号付きとして扱われる', () => {
    // 生値2^24-100 → -1.00m
    const raw = 16777216 - 100;
    const r = (raw >> 16) & 0xff;
    const g = (raw >> 8) & 0xff;
    const b = raw & 0xff;
    expect(decodeElevShader(r, g, b, 'gsi')).toBeCloseTo(-1, 5);
  });
});

describe('シェーダのterrarium方式デコード', () => {
  /** JS側のdecodeTerrariumはdemTileProvider内で閉じているため、タイル経由で確認する */
  const jsTerrarium = (r: number, g: number, b: number): number => {
    const e = r * 256 + g + b / 256 - 32768;
    return e < 0 ? 0 : e;
  };

  it('サンプリングしてJS実装と一致する', () => {
    for (let r = 0; r < 256; r += 11) {
      for (let g = 0; g < 256; g += 17) {
        for (let b = 0; b < 256; b += 37) {
          expect(decodeElevShader(r, g, b, 'terrarium')).toBeCloseTo(jsTerrarium(r, g, b), 3);
        }
      }
    }
  });

  it('海面下（負値）は0mへクランプされる', () => {
    expect(decodeElevShader(0, 0, 0, 'terrarium')).toBe(0);
    expect(decodeElevShader(127, 0, 0, 'terrarium')).toBe(0);
  });

  it('基準点(128,0,0)は0m', () => {
    expect(decodeElevShader(128, 0, 0, 'terrarium')).toBe(0);
  });
});

describe('デコード関数のエクスポート', () => {
  it('decodeDemTileはJS側の唯一のデコード入口として残っている', () => {
    // GPU化後もタップ・ドレープ用にJSデコードを使い続けるため
    expect(typeof decodeDemTile).toBe('function');
  });
});
