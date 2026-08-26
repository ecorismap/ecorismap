import {
  COLOR_RELIEF_RAMP,
  CONTOUR_INTERVALS,
  CONTOUR_MAJOR_FACTOR,
  CONTOUR_MINOR_FACTOR,
  GEBCO_RELIEF_RAMP,
  RELIEF_SHADE_MIN,
  computeColorRelief,
  computeGebcoRelief,
  contourIntervalsForZoom,
  exponentialInterpolationFactor,
  gebcoReliefColor,
  reliefColor,
  reliefStyleFromUrl,
} from '../colorRelief';
import { computeShadeField, metersPerPixel, requiredHalo } from '../terrainShading';

const SIZE = 64;
const HALO = requiredHalo();
const BUFFER = SIZE + 2 * HALO;

/** 袖付きバッファを生成する。fnは(x, y)を中央領域基準の座標として標高を返す */
function makeBuffer(fn: (x: number, y: number) => number): Float32Array {
  const buffer = new Float32Array(BUFFER * BUFFER);
  for (let y = 0; y < BUFFER; y++) {
    for (let x = 0; x < BUFFER; x++) {
      buffer[y * BUFFER + x] = fn(x - HALO, y - HALO);
    }
  }
  return buffer;
}

describe('reliefColor', () => {
  it('折れ点上の標高はテーブルの色そのもの', () => {
    for (const [elev, r, g, b] of COLOR_RELIEF_RAMP) {
      expect(reliefColor(elev)).toEqual([r, g, b]);
    }
  });

  it('折れ点間は線形補間する', () => {
    // -1000: [74,130,185] と -500: [88,155,200] の中点
    expect(reliefColor(-750)).toEqual([81, 142.5, 192.5]);
  });

  it('両端はクランプする', () => {
    expect(reliefColor(-12000)).toEqual([30, 48, 110]);
    expect(reliefColor(9000)).toEqual([155, 110, 55]);
  });

  it('0mに不連続がある（海岸を際立たせる）', () => {
    expect(reliefColor(-0.01)).toEqual([160, 240, 238]);
    expect(reliefColor(0)).toEqual([140, 200, 120]);
  });

  it('GEBCO配色は折れ点上の値・クランプ・指数補間(0.8)が効く', () => {
    for (const [elev, r, g, b] of GEBCO_RELIEF_RAMP) {
      const c = gebcoReliefColor(elev);
      expect(c[0]).toBeCloseTo(r, 6);
      expect(c[1]).toBeCloseTo(g, 6);
      expect(c[2]).toBeCloseTo(b, 6);
    }
    expect(gebcoReliefColor(-12000)).toEqual([5, 5, 40]);
    expect(gebcoReliefColor(9000)).toEqual([155, 110, 55]);
    // -1500: -2000(0,100,190)と-1000(0,125,205)の間をmaplibreと同じ指数補間で
    const t = exponentialInterpolationFactor(-1500, 0.8, -2000, -1000);
    expect(gebcoReliefColor(-1500)).toEqual([0, 100 + 25 * t, 190 + 15 * t]);
    // base<1では区間下端付近で急速に上端の色に寄る（デモの深海強調の性質）
    expect(exponentialInterpolationFactor(-1990, 0.8, -2000, -1000)).toBeGreaterThan(0.85);
  });
});

describe('reliefStyleFromUrl', () => {
  it('#style=gebco を読み取る', () => {
    expect(reliefStyleFromUrl('relief://https://e/{z}/{y}/{x}.png#style=gebco')).toBe('gebco');
    expect(reliefStyleFromUrl('relief://https://e/{z}/{y}/{x}.png#a=1&style=gebco')).toBe('gebco');
  });

  it('フラグメントが無い・別値ならdefault', () => {
    expect(reliefStyleFromUrl('relief://https://e/{z}/{y}/{x}.png')).toBe('default');
    expect(reliefStyleFromUrl('relief://https://e/{z}/{y}/{x}.png#style=other')).toBe('default');
    expect(reliefStyleFromUrl('relief://https://e/{z}/{y}/{x}.png#gebco')).toBe('default');
  });
});

describe('contourIntervalsForZoom', () => {
  it('テーブルの値を返す', () => {
    for (const [zoom, minor, major] of CONTOUR_INTERVALS) {
      expect(contourIntervalsForZoom(zoom)).toEqual([minor, major]);
    }
  });

  it('z4未満は等深線を引かない', () => {
    expect(contourIntervalsForZoom(3)).toBeNull();
    expect(contourIntervalsForZoom(0)).toBeNull();
  });

  it('テーブル超はz11の値にクランプ', () => {
    expect(contourIntervalsForZoom(12)).toEqual([20, 100]);
    expect(contourIntervalsForZoom(15)).toEqual([20, 100]);
  });
});

describe('computeColorRelief', () => {
  const MPP = metersPerPixel(9, 200);
  /** 陰影係数の下限緩和（実装と同じ式） */
  const lift = (shade: number) => RELIEF_SHADE_MIN + (1 - RELIEF_SHADE_MIN) * shade;

  it('平坦な海は段彩色そのまま（shade=1）で等深線なし', () => {
    const buffer = makeBuffer(() => -100);
    const out = computeColorRelief(buffer, BUFFER, HALO, SIZE, MPP, 9);
    // -100m: [118,198,221]
    expect(out[0]).toBe(118);
    expect(out[1]).toBe(198);
    expect(out[2]).toBe(221);
    expect(out[3]).toBe(255);
  });

  it('平坦な陸は陸の段彩色になる', () => {
    const buffer = makeBuffer(() => 500);
    const out = computeColorRelief(buffer, BUFFER, HALO, SIZE, MPP, 9);
    expect([out[0], out[1], out[2], out[3]]).toEqual([168, 188, 98, 255]);
  });

  it('computeGebcoReliefは平坦地でGEBCO配色×白0.15混合になり陸も描画される', () => {
    // 平坦なら陰影シェーダのderivが0でfrag=0、等値線もなし → 段彩×白混合そのもの
    for (const elev of [-100, 500]) {
      const buffer = makeBuffer(() => elev);
      const out = computeGebcoRelief(buffer, BUFFER, HALO, SIZE, 9);
      const color = gebcoReliefColor(elev);
      expect(out[0]).toBe(Math.round(0.85 * color[0] + 0.15 * 255));
      expect(out[1]).toBe(Math.round(0.85 * color[1] + 0.15 * 255));
      expect(out[2]).toBe(Math.round(0.85 * color[2] + 0.15 * 255));
      expect(out[3]).toBe(255);
    }
  });

  it('computeGebcoReliefは陸にも等値線を引く（デモのmlcontour相当）', () => {
    // 50mの倍数をまたぐ陸の斜面に線が出る
    const buffer = makeBuffer((x) => 105 + 10 * x);
    const out = computeGebcoRelief(buffer, BUFFER, HALO, SIZE, 9);
    let darker = 0;
    for (let x = 1; x < SIZE - 1; x++) {
      const i = (10 * SIZE + x) * 4;
      const iPrev = (10 * SIZE + x - 1) * 4;
      if (out[i] < out[iPrev] - 20) darker++;
    }
    expect(darker).toBeGreaterThan(3);
  });

  it('海岸優先: 海に接する陸画素（斜め隣接含む）だけが透明になる', () => {
    // x<32が海(-60m)、x>=32が陸(+40m)
    const buffer = makeBuffer((x) => (x < 32 ? -60 : 40));
    const out = computeColorRelief(buffer, BUFFER, HALO, SIZE, MPP, 9);
    // 境界の陸画素(x=32)は海に接するので透明
    expect(out[(10 * SIZE + 32) * 4 + 3]).toBe(0);
    // その内側(x=33)は斜め含め海に接しないので陸の段彩色
    expect(out[(10 * SIZE + 33) * 4 + 3]).toBe(255);
    // 海側(x=31)は海の段彩色のまま
    expect(out[(10 * SIZE + 31) * 4 + 3]).toBe(255);
  });

  it('NoDataは透明', () => {
    const buffer = makeBuffer(() => -100);
    buffer[(HALO + 10) * BUFFER + (HALO + 10)] = NaN;
    const out = computeColorRelief(buffer, BUFFER, HALO, SIZE, MPP, 9);
    expect(out[(10 * SIZE + 10) * 4 + 3]).toBe(0);
  });

  it('海の斜面に等深線が焼き込まれ、色は段彩×shade×線係数と一致する', () => {
    // x方向に10m/pxで深くなる斜面。z9の細線間隔50mなら5pxごとに横断が起きる
    const elev = (x: number) => -105 - 10 * x;
    const buffer = makeBuffer((x) => elev(x));
    const out = computeColorRelief(buffer, BUFFER, HALO, SIZE, MPP, 9);
    const shade = computeShadeField(buffer, BUFFER, HALO, SIZE, MPP);
    const [minor, major] = contourIntervalsForZoom(9)!;

    let contourCount = 0;
    for (let x = 0; x < SIZE; x++) {
      const i = 10 * SIZE + x; // 任意の行で検証
      const e0 = elev(x);
      const eR = elev(x + 1);
      let factor = lift(shade[i]);
      if (Math.floor(e0 / major) !== Math.floor(eR / major)) {
        factor *= CONTOUR_MAJOR_FACTOR;
        contourCount++;
      } else if (Math.floor(e0 / minor) !== Math.floor(eR / minor)) {
        factor *= CONTOUR_MINOR_FACTOR;
        contourCount++;
      }
      const color = reliefColor(e0);
      expect(out[i * 4]).toBe(Math.round(color[0] * factor));
      expect(out[i * 4 + 1]).toBe(Math.round(color[1] * factor));
      expect(out[i * 4 + 2]).toBe(Math.round(color[2] * factor));
    }
    expect(contourCount).toBeGreaterThan(5); // 実際に線が引かれていること
  });

  it('太線間隔の横断は細線より優先される', () => {
    // -195〜-205をまたぐ画素: 細線50と太線200の両方を横断する
    const buffer = makeBuffer((x) => (x < 32 ? -195 : -205));
    const out = computeColorRelief(buffer, BUFFER, HALO, SIZE, MPP, 9);
    const shade = computeShadeField(buffer, BUFFER, HALO, SIZE, MPP);
    const i = 10 * SIZE + 31; // 段差の直前の画素
    const color = reliefColor(-195);
    expect(out[i * 4]).toBe(Math.round(color[0] * lift(shade[i]) * CONTOUR_MAJOR_FACTOR));
  });

  it('陸には等深線を引かない', () => {
    // 陸の斜面（50mの倍数をまたぐ）でも線が出ない
    const elev = (x: number) => 105 + 10 * x;
    const buffer = makeBuffer((x) => elev(x));
    const out = computeColorRelief(buffer, BUFFER, HALO, SIZE, MPP, 9);
    const shade = computeShadeField(buffer, BUFFER, HALO, SIZE, MPP);
    for (let x = 0; x < SIZE; x++) {
      const i = 10 * SIZE + x;
      const color = reliefColor(elev(x));
      expect(out[i * 4]).toBe(Math.round(color[0] * lift(shade[i])));
    }
  });

  it('海岸をまたぐ画素（隣が陸）には線を引かない', () => {
    // x=31までが海(-60m)、x=32からが陸(+40m)。floor(-60/50)!=floor(40/50)だが線は出ない
    const buffer = makeBuffer((x) => (x < 32 ? -60 : 40));
    const out = computeColorRelief(buffer, BUFFER, HALO, SIZE, MPP, 9);
    const shade = computeShadeField(buffer, BUFFER, HALO, SIZE, MPP);
    const i = 10 * SIZE + 31;
    const color = reliefColor(-60);
    expect(out[i * 4]).toBe(Math.round(color[0] * lift(shade[i])));
    // 陸側は透明
    expect(out[(10 * SIZE + 32) * 4 + 3]).toBe(0);
  });

  it('sourceZoomが4未満なら等深線を引かない', () => {
    const elev = (x: number) => -105 - 10 * x;
    const buffer = makeBuffer((x) => elev(x));
    const out = computeColorRelief(buffer, BUFFER, HALO, SIZE, MPP, 3);
    const shade = computeShadeField(buffer, BUFFER, HALO, SIZE, MPP);
    for (let x = 0; x < SIZE; x++) {
      const i = 10 * SIZE + x;
      const color = reliefColor(elev(x));
      expect(out[i * 4]).toBe(Math.round(color[0] * lift(shade[i])));
    }
  });
});

// ネイティブ2実装（パッチ内のJava/ObjC）の定数がTSと一致することを機械検証する。
// 値を変えるときは3実装（TS・Java・ObjC）を揃え、パッチを再生成してから通すこと。
describe('ネイティブ実装との定数整合（パッチ検証）', () => {
  const fs = require('fs');
  const path = require('path');
  const patch = fs.readFileSync(
    path.resolve(__dirname, '../../../patches/react-native-maps+1.27.2.patch'),
    'utf8'
  ) as string;

  /** パッチから「識別子の定義〜};」の間の数値行列を抽出する */
  function extractRows(identifier: string): number[][] {
    const start = patch.indexOf(identifier);
    expect(start).toBeGreaterThan(-1);
    const block = patch.slice(start, patch.indexOf('};', start));
    const rows: number[][] = [];
    for (const m of block.matchAll(/\{\s*(-?[\d.]+(?:\s*,\s*-?[\d.]+)+)\s*\}/g)) {
      rows.push(m[1].split(',').map((v) => parseFloat(v.trim())));
    }
    return rows;
  }

  /** パッチから「識別子 = 数値」を抽出する */
  function extractScalar(identifier: string): number {
    const m = patch.match(new RegExp(identifier + '\\s*=\\s*(-?[\\d.]+)'));
    expect(m).not.toBeNull();
    return parseFloat(m![1]);
  }

  it.each([
    ['Android', 'RELIEF_RAMP', 'CONTOUR_INTERVALS', 'CONTOUR_MINOR_FACTOR', 'CONTOUR_MAJOR_FACTOR', 'RELIEF_SHADE_MIN', 'GEBCO_RELIEF_RAMP'],
    ['iOS', 'kReliefRamp', 'kContourIntervals', 'kContourMinorFactor', 'kContourMajorFactor', 'kReliefShadeMin', 'kGebcoReliefRamp'],
  ])(
    '%s の段彩・等深線テーブルがTSと一致する',
    (_platform, rampId, intervalsId, minorId, majorId, shadeMinId, gebcoRampId) => {
      expect(extractRows(rampId)).toEqual(COLOR_RELIEF_RAMP.map((r) => [...r]));
      expect(extractRows(intervalsId)).toEqual(CONTOUR_INTERVALS.map((r) => [...r]));
      expect(extractScalar(minorId)).toBe(CONTOUR_MINOR_FACTOR);
      expect(extractScalar(majorId)).toBe(CONTOUR_MAJOR_FACTOR);
      expect(extractScalar(shadeMinId)).toBe(RELIEF_SHADE_MIN);
      expect(extractRows(gebcoRampId)).toEqual(GEBCO_RELIEF_RAMP.map((r) => [...r]));
    }
  );

  it.each([
    ['Android', (name: string) => 'GEBCO_' + name],
    ['iOS', (name: string) => 'kGebco' + name.toLowerCase().replace(/(^|_)([a-z])/g, (_m, _p, c) => c.toUpperCase())],
  ])('%s のGEBCOスタイル定数がTSと一致する', (_platform, toId) => {
     
    const colorReliefModule = require('../colorRelief');
    const names = [
      'EXP_BASE',
      'BASE_MIX',
      'HILLSHADE_EXAGGERATION',
      'ILLUMINATION_DEG',
      'SHADOW_ALPHA',
      'HIGHLIGHT_ALPHA',
      'ACCENT_ALPHA',
      'DERIV_EXP',
      'CONTOUR_MAJOR_FACTOR',
      'CONTOUR_MINOR_FACTOR',
    ];
    for (const name of names) {
      const tsValue = colorReliefModule['GEBCO_' + name];
      expect(typeof tsValue).toBe('number');
      expect(extractScalar(toId(name))).toBe(tsValue);
    }
  });
});
