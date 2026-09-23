import { assembleWithHalo, cropAndScale, upsampleHaloBuffer } from '../reliefTileCompose';

describe('assembleWithHalo', () => {
  const size = 4;
  const tileOf = (value: number) => new Float32Array(size * size).fill(value);

  it('中央タイルを袖の内側へ置き、隣接タイルの帯を袖へコピーする', () => {
    // 3x3のタイルにそれぞれ0..8を入れる
    const tiles = Array.from({ length: 9 }, (_, i) => tileOf(i));
    const halo = 1;
    const width = size + 2 * halo;
    const buffer = assembleWithHalo(tiles, halo, size);
    expect(buffer.length).toBe(width * width);
    expect(buffer[0]).toBe(0); // 北西の角
    expect(buffer[1]).toBe(1); // 北
    expect(buffer[width - 1]).toBe(2); // 北東の角
    expect(buffer[width]).toBe(3); // 西
    expect(buffer[width + 1]).toBe(4); // 中央
    expect(buffer[width * 2 - 1]).toBe(5); // 東
    expect(buffer[width * (width - 1)]).toBe(6); // 南西
    expect(buffer[width * width - 1]).toBe(8); // 南東
  });

  it('欠けた隣接タイルの袖はNaNのまま', () => {
    const tiles: (Float32Array | null)[] = Array.from({ length: 9 }, () => null);
    tiles[4] = tileOf(7);
    const buffer = assembleWithHalo(tiles, 1, size);
    expect(buffer[0]).toBeNaN();
    expect(buffer[size + 2 + 1]).toBe(7);
  });
});

describe('cropAndScale', () => {
  it('親タイルの該当区画を切り出してニアレストで拡大する', () => {
    const size = 4;
    // 各画素のRに添字を入れる
    const rgba = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < size * size; i++) rgba[i * 4] = i;
    // shift=1、右下の子（1,1）は親の(2..3, 2..3)
    const out = cropAndScale(rgba, 1, 1, 1, size);
    expect(out[0]).toBe(2 * size + 2);
    expect(out[4]).toBe(2 * size + 2); // 2倍拡大なので隣も同じ画素
    expect(out[(size * size - 1) * 4]).toBe(3 * size + 3);
  });
});

describe('upsampleHaloBuffer', () => {
  const size = 8;
  const halo = 2;
  const width = size + 2 * halo;
  /** 袖込みの東西方向に線形な標高（添字xそのもの） */
  const rampX = () => new Float32Array(width * width).map((_, i) => i % width);

  it('子タイルの範囲をバイリニアで引き伸ばす（線形な面は線形のまま）', () => {
    const out = upsampleHaloBuffer(rampX(), halo, 1, 0, 0, halo, size);
    const outWidth = size + 2 * halo;
    // 子の画素xの中心は親の (x - halo + 0.5)/2 - 0.5 + halo
    for (const x of [halo, halo + 3, halo + 7]) {
      const expected = (x - halo + 0.5) / 2 - 0.5 + halo;
      expect(out[halo * outWidth + x]).toBeCloseTo(expected, 5);
    }
  });

  it('右側の子は親の右半分から引く', () => {
    const left = upsampleHaloBuffer(rampX(), halo, 1, 0, 0, halo, size);
    const right = upsampleHaloBuffer(rampX(), halo, 1, 1, 0, halo, size);
    const outWidth = size + 2 * halo;
    expect(right[halo * outWidth + halo] - left[halo * outWidth + halo]).toBeCloseTo(size / 2, 5);
  });

  it('NaNが混じる箇所は最寄り画素を使い、海岸を滲ませない', () => {
    const src = new Float32Array(width * width).fill(-100);
    for (let i = 0; i < src.length; i++) if (i % width >= width / 2) src[i] = NaN;
    const out = upsampleHaloBuffer(src, halo, 1, 0, 0, halo, size);
    const values = Array.from(out).filter((v) => !Number.isNaN(v));
    expect(values.every((v) => v === -100)).toBe(true);
  });
});
