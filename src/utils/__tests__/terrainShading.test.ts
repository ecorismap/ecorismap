import {
  computeShading,
  decodeElevation,
  metersPerPixel,
  requiredHalo,
  isReliefUrl,
  toDemUrl,
  RELIEF_URL_PREFIX,
  DEFAULT_SHADING_OPTIONS,
} from '../terrainShading';

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

function rotate180(buffer: Float32Array): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) out[i] = buffer[buffer.length - 1 - i];
  return out;
}

function rotate90(buffer: Float32Array): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let y = 0; y < BUFFER; y++) {
    for (let x = 0; x < BUFFER; x++) out[x * BUFFER + (BUFFER - 1 - y)] = buffer[y * BUFFER + x];
  }
  return out;
}

const shade = (buffer: Float32Array) => computeShading(buffer, BUFFER, HALO, SIZE, 10);

/** RGBAを180度回す（画素単位で入れ替える） */
function rotateRgba180(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const n = rgba.length / 4;
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < n; i++) out.set(rgba.subarray((n - 1 - i) * 4, (n - 1 - i) * 4 + 4), i * 4);
  return out;
}

function rotateRgba90(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const src = (y * SIZE + x) * 4;
      out.set(rgba.subarray(src, src + 4), (x * SIZE + (SIZE - 1 - y)) * 4);
    }
  }
  return out;
}

function maxDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

const grayAt = (rgba: Uint8ClampedArray, x: number, y: number) => rgba[(y * SIZE + x) * 4];

/** 起伏に富んだ試験地形 */
const TEST_TERRAIN = (x: number, y: number) =>
  50 * Math.sin(x / 7) + 30 * Math.cos(y / 5) + 0.4 * x + 12 * Math.sin((x + y) / 11);

const CX = SIZE / 2;

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

  it('z=14の探索半径16pxはMPI-RRIMの推奨値150mに近い', () => {
    const radius = DEFAULT_SHADING_OPTIONS.searchRadius * metersPerPixel(14, 6414);
    expect(radius).toBeGreaterThan(120);
    expect(radius).toBeLessThan(180);
  });
});

describe('地図URLの判定', () => {
  const DEM = 'https://e/{z}/{x}/{y}.png';

  it('relief:// を立体図として扱う', () => {
    expect(isReliefUrl(RELIEF_URL_PREFIX + DEM)).toBe(true);
    expect(toDemUrl(RELIEF_URL_PREFIX + DEM)).toBe(DEM);
  });

  // 旧プレフィックス。ユーザーが追加済みの地図や共有プロジェクトの設定に残っている
  it('旧来の hillshade:// も受け付ける', () => {
    expect(isReliefUrl('hillshade://' + DEM)).toBe(true);
    expect(toDemUrl('hillshade://' + DEM)).toBe(DEM);
  });

  it('通常のタイルURLは立体図として扱わない', () => {
    expect(isReliefUrl(DEM)).toBe(false);
    expect(isReliefUrl(undefined)).toBe(false);
    expect(isReliefUrl('')).toBe(false);
  });

  it('動作確認時の方式指定フラグメントが残っていても落とす', () => {
    expect(toDemUrl('hillshade://' + DEM + '#mpi-gray')).toBe(DEM);
  });
});

// 本方式の存在理由そのもの。光源を使う従来の陰影図はここで失敗する
describe('方向非依存性', () => {
  it('地形を180度回すと陰影も同じだけ回る', () => {
    const buffer = makeBuffer(TEST_TERRAIN);
    expect(maxDiff(shade(rotate180(buffer)), rotateRgba180(shade(buffer)))).toBe(0);
  });

  it('地形を90度回すと陰影も同じだけ回る', () => {
    const buffer = makeBuffer(TEST_TERRAIN);
    expect(maxDiff(shade(rotate90(buffer)), rotateRgba90(shade(buffer)))).toBe(0);
  });
});

describe('computeShading', () => {
  it('平坦地は白になり、乗算で重ねても下地を変えない', () => {
    const rgba = shade(makeBuffer(() => 100));
    for (let i = 0; i < rgba.length; i += 4) {
      expect([rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]).toEqual([255, 255, 255, 255]);
    }
  });

  it('NoDataは透明にする', () => {
    const rgba = shade(makeBuffer(() => NaN));
    for (let i = 0; i < rgba.length; i += 4) expect(rgba[i + 3]).toBe(0);
  });

  it('無彩色になる（R=G=B）', () => {
    const rgba = shade(makeBuffer(TEST_TERRAIN));
    for (let i = 0; i < rgba.length; i += 4) {
      expect(rgba[i]).toBe(rgba[i + 1]);
      expect(rgba[i + 1]).toBe(rgba[i + 2]);
    }
  });

  it('窪地は暗く、周囲の平坦地は白のまま', () => {
    const rgba = shade(
      makeBuffer((x, y) => {
        const r = Math.hypot(x - CX, y - CX);
        return r < 20 ? (r - 20) * 5 : 0;
      })
    );
    expect(grayAt(rgba, CX, CX)).toBeLessThan(120);
    expect(grayAt(rgba, 0, 0)).toBe(255);
  });

  it('尾根は平坦地と同じく明るい（MPIが負になり暗さに寄与しない）', () => {
    const ridge = shade(makeBuffer((x, y) => Math.max(0, 200 - 8 * Math.abs(y - CX))));
    // 稜線上は傾斜も0なのでどちらの暗さも効かない
    expect(grayAt(ridge, CX, CX)).toBe(255);
  });

  it('一様な斜面は傾斜のぶんだけ一様に暗くなる', () => {
    const gentle = shade(makeBuffer((x) => x * 1));
    const steep = shade(makeBuffer((x) => x * 5));
    expect(grayAt(steep, CX, CX)).toBeLessThan(grayAt(gentle, CX, CX));
    // 一様なので場所によらず同じ濃さ（偽の凹凸を作らない）
    expect(grayAt(steep, 5, 5)).toBe(grayAt(steep, CX, CX));
  });

  it('急峻な谷は傾斜と窪みの両方が効いて最も暗くなる', () => {
    const buffer = makeBuffer((x, y) => {
      const r = Math.hypot(x - CX, y - CX);
      return r < 20 ? (r - 20) * 5 : 0;
    });
    const valleyWall = grayAt(shade(buffer), CX + 12, CX);
    const uniformSlope = grayAt(shade(makeBuffer((x) => x * 5)), CX, CX);
    expect(valleyWall).toBeLessThan(uniformSlope);
  });

  it('ガンマを下げると谷が濃くなる', () => {
    // 深い谷は既に飽和しているので浅い窪みで確かめる
    const buffer = makeBuffer((x, y) => {
      const r = Math.hypot(x - CX, y - CX);
      return r < 20 ? (r - 20) * 0.5 : 0;
    });
    const base = computeShading(buffer, BUFFER, HALO, SIZE, 10);
    const strong = computeShading(buffer, BUFFER, HALO, SIZE, 10, {
      ...DEFAULT_SHADING_OPTIONS,
      mpiGamma: 0.5,
    });
    expect(grayAt(strong, CX, CX)).toBeLessThan(grayAt(base, CX, CX));
  });
});
