/**
 * 親タイルのUV部分矩形が、DEMの部分矩形参照（TerrainTileManager.buildPassのdemParams）と
 * 同じ規約であることを確かめる。
 *
 * どちらかだけ式が変わると、地形の起伏とタイル画像が別の場所を指して見た目がずれる。
 * DEM側はテクセル単位（256px基準）、こちらは正規化UVなので、256倍して突き合わせる。
 */
import { DEM_TILE_SIZE } from '../../demTileProvider';
import { IDENTITY_TILE_UV, parentTileKey, parentTileUv } from '../parentTile';

/** TerrainTileManager.buildPass と同じ式（テクセル単位） */
const demStyleRect = (z: number, x: number, y: number, parentZ: number) => {
  const dz = z - parentZ;
  const parentX = x >> dz;
  const parentY = y >> dz;
  const scale = Math.pow(2, dz);
  const span = DEM_TILE_SIZE / scale;
  return { originPx: (x - parentX * scale) * span, originPy: (y - parentY * scale) * span, span };
};

describe('parentTileUv', () => {
  it('同じズームなら等倍', () => {
    expect(parentTileUv(15, 29104, 12903, 15)).toEqual(IDENTITY_TILE_UV);
  });

  it('親が細かい（dz<0）はnull', () => {
    expect(parentTileUv(14, 100, 100, 15)).toBeNull();
  });

  it('DEMの部分矩形計算と一致する（テクセル換算）', () => {
    // 実際に使われる組み合わせ: dz=1..4、四象限すべてを含む座標
    for (const z of [10, 13, 16]) {
      for (const dz of [1, 2, 3, 4]) {
        for (const x of [0, 1, 2, 3, 29104, 29105, 29106, 29107]) {
          for (const y of [0, 1, 12903, 12904, 12905]) {
            const uv = parentTileUv(z, x, y, z - dz);
            expect(uv).not.toBeNull();
            if (uv === null) continue;
            const dem = demStyleRect(z, x, y, z - dz);
            expect(uv.offsetU * DEM_TILE_SIZE).toBeCloseTo(dem.originPx, 6);
            expect(uv.offsetV * DEM_TILE_SIZE).toBeCloseTo(dem.originPy, 6);
            expect(uv.scale * DEM_TILE_SIZE).toBeCloseTo(dem.span, 6);
          }
        }
      }
    }
  });

  it('子4枚が親を四等分して隙間なく覆う', () => {
    const px = 1000;
    const py = 2000;
    const rects = [
      parentTileUv(11, px * 2, py * 2, 10),
      parentTileUv(11, px * 2 + 1, py * 2, 10),
      parentTileUv(11, px * 2, py * 2 + 1, 10),
      parentTileUv(11, px * 2 + 1, py * 2 + 1, 10),
    ];
    expect(rects.map((r) => [r?.offsetU, r?.offsetV, r?.scale])).toEqual([
      [0, 0, 0.5],
      [0.5, 0, 0.5],
      [0, 0.5, 0.5],
      [0.5, 0.5, 0.5],
    ]);
  });

  it('タイル内の相対位置はUV矩形の内側へ写る', () => {
    // 子タイルの中心(0.5,0.5)は、親の矩形の中心に来る
    const uv = parentTileUv(16, 58211, 25807, 14);
    expect(uv).not.toBeNull();
    if (uv === null) return;
    const u = uv.offsetU + 0.5 * uv.scale;
    const v = uv.offsetV + 0.5 * uv.scale;
    expect(u).toBeGreaterThan(uv.offsetU);
    expect(u).toBeLessThan(uv.offsetU + uv.scale);
    expect(v).toBeGreaterThan(uv.offsetV);
    expect(v).toBeLessThan(uv.offsetV + uv.scale);
    expect(uv.scale).toBeCloseTo(0.25);
  });
});

describe('parentTileKey', () => {
  it('DEMのdemX/demYと同じ式', () => {
    for (const dz of [1, 2, 3]) {
      const key = parentTileKey(16, 58211, 25807, 16 - dz);
      expect(key).toEqual({ x: 58211 >> dz, y: 25807 >> dz });
    }
  });
});
