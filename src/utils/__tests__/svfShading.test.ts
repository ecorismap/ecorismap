import { computeSvfShading, decodeElevation, metersPerPixel, SvfOptions } from '../svfShading';

const OPTIONS: SvfOptions = { numDirections: 8, searchRadius: 16, svfMin: 0.55 };

const SIZE = 64;
const HALO = 32;
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

/** 袖付きバッファを180度回転する */
function rotate180(buffer: Float32Array): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) out[i] = buffer[buffer.length - 1 - i];
  return out;
}

/** 袖付きバッファを90度回転する */
function rotate90(buffer: Float32Array): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let y = 0; y < BUFFER; y++) {
    for (let x = 0; x < BUFFER; x++) {
      out[x * BUFFER + (BUFFER - 1 - y)] = buffer[y * BUFFER + x];
    }
  }
  return out;
}

function alphaChannel(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4 + 3];
  return out;
}

function shade(buffer: Float32Array): Uint8Array {
  return alphaChannel(computeSvfShading(buffer, BUFFER, HALO, SIZE, 10, OPTIONS));
}

function rotateAlpha180(alpha: Uint8Array): Uint8Array {
  const out = new Uint8Array(alpha.length);
  for (let i = 0; i < alpha.length; i++) out[i] = alpha[alpha.length - 1 - i];
  return out;
}

function rotateAlpha90(alpha: Uint8Array): Uint8Array {
  const out = new Uint8Array(alpha.length);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      out[x * SIZE + (SIZE - 1 - y)] = alpha[y * SIZE + x];
    }
  }
  return out;
}

describe('decodeElevation', () => {
  it('国土地理院方式でデコードする', () => {
    // 標高100.00m = 10000 (0.01m単位) → R=0, G=39, B=16
    expect(decodeElevation(0, 39, 16)).toBeCloseTo(100.0, 5);
    expect(decodeElevation(0, 0, 0)).toBe(0);
  });

  it('負の標高を扱える', () => {
    // -1.00m = -100 → 2^24 - 100 = 16777116
    const x = 16777216 - 100;
    expect(decodeElevation((x >> 16) & 255, (x >> 8) & 255, x & 255)).toBeCloseTo(-1.0, 5);
  });

  it('NoData(2^23)はNaNを返す', () => {
    expect(decodeElevation(128, 0, 0)).toBeNaN();
  });
});

describe('metersPerPixel', () => {
  it('赤道のz=0で約156km', () => {
    // 2^0 * 256画素で地球一周
    expect(metersPerPixel(0, 0)).toBeCloseTo(40075017 / 256, 0);
  });

  it('日本付近のz=14で約9m', () => {
    expect(metersPerPixel(14, 6414)).toBeGreaterThan(8.9);
    expect(metersPerPixel(14, 6414)).toBeLessThan(9.2);
  });
});

describe('computeSvfShading', () => {
  it('平坦地は完全に透明になる', () => {
    const alpha = shade(makeBuffer(() => 100));
    expect(Math.max(...alpha)).toBe(0);
  });

  it('一様な斜面には偽の凹凸を作らず、濃度が一定になる', () => {
    // 斜面上では登り方向の空が実際に遮られるのでα>0になる。
    // 重要なのは場所によらず一定であること（＝勾配だけで明暗差を作らないこと）。
    const alpha = shade(makeBuffer((x) => x * 3));
    expect(Math.min(...alpha)).toBe(Math.max(...alpha));
    expect(alpha[0]).toBeGreaterThan(0);
  });

  it('斜面が急なほど濃くなる（量感が自然に出る）', () => {
    const gentle = shade(makeBuffer((x) => x * 1));
    const steep = shade(makeBuffer((x) => x * 5));
    expect(steep[0]).toBeGreaterThan(gentle[0]);
  });

  it('窪地は不透明になり、周囲の尾根は透明のまま', () => {
    // 中央に深い円錐状の窪み
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const alpha = shade(
      makeBuffer((x, y) => {
        const r = Math.hypot(x - cx, y - cy);
        return r < 20 ? (r - 20) * 5 : 0;
      })
    );
    const center = alpha[cy * SIZE + cx];
    const corner = alpha[0];
    expect(center).toBeGreaterThan(100);
    expect(corner).toBe(0);
  });

  it('NoDataは透明にする', () => {
    const alpha = shade(makeBuffer(() => NaN));
    expect(Math.max(...alpha)).toBe(0);
  });

  // 本方式の要件そのもの。従来の陰影図はここで失敗する
  it('地形を180度回すと陰影も同じだけ回る（光源方位に依存しない）', () => {
    const buffer = makeBuffer((x, y) => 50 * Math.sin(x / 7) + 30 * Math.cos(y / 5) + 0.4 * x);
    const expected = rotateAlpha180(shade(buffer));
    const actual = shade(rotate180(buffer));
    expect(Array.from(actual)).toEqual(Array.from(expected));
  });

  it('地形を90度回すと陰影も同じだけ回る', () => {
    const buffer = makeBuffer((x, y) => 50 * Math.sin(x / 7) + 30 * Math.cos(y / 5) + 0.4 * x);
    const expected = rotateAlpha90(shade(buffer));
    const actual = shade(rotate90(buffer));
    expect(Array.from(actual)).toEqual(Array.from(expected));
  });

  it('色は黒でαだけが変化する', () => {
    const cx = SIZE / 2;
    const rgba = computeSvfShading(
      makeBuffer((x, y) => (Math.hypot(x - cx, y - cx) < 20 ? -50 : 0)),
      BUFFER,
      HALO,
      SIZE,
      10,
      OPTIONS
    );
    for (let i = 0; i < rgba.length; i += 4) {
      expect(rgba[i]).toBe(0);
      expect(rgba[i + 1]).toBe(0);
      expect(rgba[i + 2]).toBe(0);
    }
  });
});
