import {
  computeShading,
  decodeElevation,
  metersPerPixel,
  requiredHalo,
  DEFAULT_SHADING_OPTIONS,
  SHADING_METHODS,
  ShadingMethod,
  ShadingOptions,
} from '../terrainShading';

const SIZE = 64;
/** 全方式で足りる袖（multiscaleが最大の128を要求する） */
const HALO = 128;
const BUFFER = SIZE + 2 * HALO;

const optionsFor = (method: ShadingMethod): ShadingOptions => ({ ...DEFAULT_SHADING_OPTIONS, method });

/** 陰影を焼き込んだ不透明な図として出力する方式（αに逃がさない） */
const OPAQUE_METHODS: ShadingMethod[] = ['mpi-rrim', 'mpi-blue'];

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

function rotate180(buffer: Float32Array): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) out[i] = buffer[buffer.length - 1 - i];
  return out;
}

function rotate90(buffer: Float32Array, width: number): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) out[x * width + (width - 1 - y)] = buffer[y * width + x];
  }
  return out;
}

function shade(buffer: Float32Array, method: ShadingMethod): Uint8ClampedArray {
  return computeShading(buffer, BUFFER, HALO, SIZE, 10, optionsFor(method));
}

/** RGBAを180度回す（画素単位で入れ替える） */
function rotateRgba180(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const n = rgba.length / 4;
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < n; i++) {
    const src = (n - 1 - i) * 4;
    out.set(rgba.subarray(src, src + 4), i * 4);
  }
  return out;
}

function rotateRgba90(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const src = (y * SIZE + x) * 4;
      const dst = (x * SIZE + (SIZE - 1 - y)) * 4;
      out.set(rgba.subarray(src, src + 4), dst);
    }
  }
  return out;
}

function maxDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

const alphaOf = (rgba: Uint8ClampedArray) => {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4 + 3];
  return out;
};

/** 起伏に富んだ試験地形 */
const TEST_TERRAIN = (x: number, y: number) =>
  50 * Math.sin(x / 7) + 30 * Math.cos(y / 5) + 0.4 * x + 12 * Math.sin((x + y) / 11);

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
    expect(metersPerPixel(0, 0)).toBeCloseTo(40075017 / 256, 0);
  });

  it('日本付近のz=14で約9m', () => {
    expect(metersPerPixel(14, 6414)).toBeGreaterThan(8.9);
    expect(metersPerPixel(14, 6414)).toBeLessThan(9.2);
  });
});

describe('requiredHalo', () => {
  it('マルチスケールは粗い層のぶん広い袖を要求する', () => {
    expect(requiredHalo(optionsFor('multiscale'))).toBe(128);
  });

  it('単一スケールは探索半径+1で足りる', () => {
    expect(requiredHalo(optionsFor('svf'))).toBe(DEFAULT_SHADING_OPTIONS.searchRadius + 1);
  });
});

// 本方式の存在理由そのもの。従来の陰影図はここで失敗する
describe.each(SHADING_METHODS)('方向非依存性 (%s)', (method) => {
  // 単一スケールの方式はバイト単位で完全一致する。
  // multiscaleだけは縮小・拡大の浮動小数演算で丸めが1階調ずれることがある。
  // 方位バイアスではないので1階調まで許容する（光源依存なら数十階調ずれる）。
  const tolerance = method === 'multiscale' ? 1 : 0;

  it('地形を180度回すと陰影も同じだけ回る', () => {
    const buffer = makeBuffer(TEST_TERRAIN);
    const expected = rotateRgba180(shade(buffer, method));
    expect(maxDiff(shade(rotate180(buffer), method), expected)).toBeLessThanOrEqual(tolerance);
  });

  it('地形を90度回すと陰影も同じだけ回る', () => {
    const buffer = makeBuffer(TEST_TERRAIN);
    const expected = rotateRgba90(shade(buffer, method));
    expect(maxDiff(shade(rotate90(buffer, BUFFER), method), expected)).toBeLessThanOrEqual(tolerance);
  });

  it('NoDataは透明にする', () => {
    expect(Math.max(...alphaOf(shade(makeBuffer(() => NaN), method)))).toBe(0);
  });

  it('平坦地は下の地図を隠さない', () => {
    const rgba = shade(makeBuffer(() => 100), method);
    if (OPAQUE_METHODS.includes(method)) {
      // MPI-RRIM系は不透明な図なので、平坦地は真っ白（乗算で下地を変えない色）になる
      for (let i = 0; i < rgba.length; i += 4) {
        expect([rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]).toEqual([255, 255, 255, 255]);
      }
    } else {
      expect(Math.max(...alphaOf(rgba))).toBe(0);
    }
  });
});

describe('svf', () => {
  it('窪地は不透明になり、平坦な周囲は透明のまま', () => {
    const cx = SIZE / 2;
    const alpha = alphaOf(
      shade(
        makeBuffer((x, y) => {
          const r = Math.hypot(x - cx, y - cx);
          return r < 20 ? (r - 20) * 5 : 0;
        }),
        'svf'
      )
    );
    expect(alpha[cx * SIZE + cx]).toBeGreaterThan(100);
    expect(alpha[0]).toBe(0);
  });

  it('一様な斜面には偽の凹凸を作らず、濃度が一定になる', () => {
    // 斜面上では登り方向の空が実際に遮られるのでα>0になる。
    // 重要なのは場所によらず一定であること（＝勾配だけで明暗差を作らないこと）。
    const alpha = alphaOf(shade(makeBuffer((x) => x * 3), 'svf'));
    expect(Math.min(...alpha)).toBe(Math.max(...alpha));
    expect(alpha[0]).toBeGreaterThan(0);
  });

  it('斜面が急なほど濃くなる（量感が自然に出る）', () => {
    const gentle = alphaOf(shade(makeBuffer((x) => x * 1), 'svf'));
    const steep = alphaOf(shade(makeBuffer((x) => x * 5), 'svf'));
    expect(steep[0]).toBeGreaterThan(gentle[0]);
  });

  it('色は黒でαだけが変化する', () => {
    const cx = SIZE / 2;
    const rgba = shade(makeBuffer((x, y) => (Math.hypot(x - cx, y - cx) < 20 ? -50 : 0)), 'svf');
    for (let i = 0; i < rgba.length; i += 4) {
      expect(rgba[i]).toBe(0);
      expect(rgba[i + 1]).toBe(0);
      expect(rgba[i + 2]).toBe(0);
    }
  });
});

describe('opendiff', () => {
  it('凸部は明るく、凹部は暗くなる', () => {
    const cx = SIZE / 2;
    // 中央に円錐状の丘、その周りに環状の窪み
    const rgba = shade(
      makeBuffer((x, y) => {
        const r = Math.hypot(x - cx, y - cx);
        return r < 15 ? (15 - r) * 4 : r < 25 ? -(25 - r) * 3 : 0;
      }),
      'opendiff'
    );
    const grayAt = (x: number, y: number) => rgba[(y * SIZE + x) * 4];
    // 丘の肩（凸）と窪みの底（凹）を比べる
    expect(grayAt(cx + 13, cx)).toBeGreaterThan(grayAt(cx + 22, cx));
  });

  it('一様な斜面はほぼ透明のまま（凹凸がないので描かない）', () => {
    const alpha = alphaOf(shade(makeBuffer((x) => x * 3), 'opendiff'));
    expect(Math.max(...alpha)).toBeLessThan(8);
  });
});

describe('opendiff-slope', () => {
  it('一様な斜面にも濃度が乗る（opendiffとの違い）', () => {
    const both = alphaOf(shade(makeBuffer((x) => x * 3), 'opendiff'));
    const slopeOnly = alphaOf(shade(makeBuffer((x) => x * 3), 'opendiff-slope'));
    expect(Math.max(...slopeOnly)).toBeGreaterThan(Math.max(...both));
  });
});

describe('mpi-rrim / mpi-blue', () => {
  const cx = SIZE / 2;
  /** 中央に円錐状の窪み（谷）、周囲は平坦 */
  const pit = () =>
    makeBuffer((x, y) => {
      const r = Math.hypot(x - cx, y - cx);
      return r < 20 ? (r - 20) * 5 : 0;
    });

  it('窪地はシアンに寄る（R成分だけが落ちる）', () => {
    const rgba = shade(pit(), 'mpi-rrim');
    const p = (cx * SIZE + cx) * 4;
    expect(rgba[p]).toBeLessThan(rgba[p + 1]);
    expect(rgba[p + 1]).toBe(rgba[p + 2]);
  });

  it('急斜面はmpi-rrimでは赤に、mpi-blueでは黒に寄る', () => {
    // 一様な急斜面。MPIは一定なので傾斜の層の違いだけが出る
    const slope = makeBuffer((x) => x * 8);
    const red = shade(slope, 'mpi-rrim');
    const blue = shade(slope, 'mpi-blue');
    // mpi-rrimはR成分を落とさない（赤が残る）が、mpi-blueは3成分とも落とす
    expect(red[0]).toBeGreaterThan(blue[0]);
    expect(red[1]).toBe(blue[1]);
  });

  it('ガンマを下げると谷が濃くなる', () => {
    // 深い谷は既にR=0まで飽和していてガンマの効果が見えないので、浅い窪みで確かめる
    const buffer = makeBuffer((x, y) => {
      const r = Math.hypot(x - cx, y - cx);
      return r < 20 ? (r - 20) * 0.5 : 0;
    });
    const base = computeShading(buffer, BUFFER, HALO, SIZE, 10, {
      ...DEFAULT_SHADING_OPTIONS,
      method: 'mpi-rrim',
    });
    const strong = computeShading(buffer, BUFFER, HALO, SIZE, 10, {
      ...DEFAULT_SHADING_OPTIONS,
      method: 'mpi-rrim',
      mpiGamma: 0.5,
    });
    const p = (cx * SIZE + cx) * 4;
    expect(strong[p]).toBeLessThan(base[p]);
  });
});
