import { buildTileGeometry } from '../demMeshBuilder';
import { tileSizeMeters, tileToMercator } from '../coords';

const SEG = 4;
const side = SEG + 1;

const flatGrid = (h: number): Float32Array => new Float32Array(side * side).fill(h);

describe('buildTileGeometry', () => {
  const tile = { z: 12, x: 3626, y: 1617 };
  const origin = tileToMercator(tile.z, tile.x, tile.y);

  it('頂点数=本体+スカート、インデックス数=本体+スカートの三角形', () => {
    const geo = buildTileGeometry(flatGrid(100), tile, origin, 1, SEG);
    const bodyCount = side * side;
    const skirtCount = side * 4;
    expect(geo.positions.length).toBe((bodyCount + skirtCount) * 3);
    expect(geo.uvs.length).toBe((bodyCount + skirtCount) * 2);
    expect(geo.normals.length).toBe((bodyCount + skirtCount) * 3);
    expect(geo.indices.length).toBe((SEG * SEG + SEG * 4) * 6);
  });

  it('平坦地形の本体高さはh*elevScale、スカートは下がる', () => {
    const geo = buildTileGeometry(flatGrid(100), tile, origin, 2, SEG);
    const bodyCount = side * side;
    for (let i = 0; i < bodyCount; i++) {
      expect(geo.positions[i * 3 + 1]).toBeCloseTo(200);
    }
    // スカートは min - max(30, range*0.3) = 100-30=70 → ×2=140
    for (let i = bodyCount; i < bodyCount + side * 4; i++) {
      expect(geo.positions[i * 3 + 1]).toBeCloseTo(140);
    }
  });

  it('原点=タイル左上のときローカル座標はタイル一辺に収まる', () => {
    const geo = buildTileGeometry(flatGrid(0), tile, origin, 1, SEG);
    const size = tileSizeMeters(tile.z);
    // 左上頂点(row0,col0)は(0,0)、右下頂点は(size, size)
    expect(geo.positions[0]).toBeCloseTo(0);
    expect(geo.positions[2]).toBeCloseTo(0);
    const last = (side * side - 1) * 3;
    // positionsはfloat32のため精度はmm程度
    expect(geo.positions[last]).toBeCloseTo(size, 2);
    expect(geo.positions[last + 2]).toBeCloseTo(size, 2);
  });

  it('平坦地形の法線は真上', () => {
    const geo = buildTileGeometry(flatGrid(50), tile, origin, 1.5, SEG);
    for (let i = 0; i < side * side; i++) {
      expect(geo.normals[i * 3 + 0]).toBeCloseTo(0);
      expect(geo.normals[i * 3 + 1]).toBeCloseTo(1);
      expect(geo.normals[i * 3 + 2]).toBeCloseTo(0);
    }
  });

  it('東上がりの斜面では法線が西へ傾く', () => {
    const grid = new Float32Array(side * side);
    const size = tileSizeMeters(tile.z);
    const step = size / SEG;
    for (let row = 0; row < side; row++) {
      for (let col = 0; col < side; col++) {
        grid[row * side + col] = col * step; // 45度斜面
      }
    }
    const geo = buildTileGeometry(grid, tile, origin, 1, SEG);
    // 中央頂点: dh/dx=1 → n ∝ (-1, 1, 0)
    const center = (2 * side + 2) * 3;
    expect(geo.normals[center]).toBeCloseTo(-Math.SQRT1_2, 5);
    expect(geo.normals[center + 1]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(geo.normals[center + 2]).toBeCloseTo(0);
  });

  it('NaN(NoData)は最小標高で埋められる', () => {
    const grid = flatGrid(100);
    grid[0] = NaN;
    const geo = buildTileGeometry(grid, tile, origin, 1, SEG);
    expect(geo.positions[1]).toBeCloseTo(100);
  });

  it('UVは北西角(0,0)→南東角(1,1)（生アップロードは画像上端がv=0）', () => {
    const geo = buildTileGeometry(flatGrid(0), tile, origin, 1, SEG);
    expect(geo.uvs[0]).toBeCloseTo(0);
    expect(geo.uvs[1]).toBeCloseTo(0);
    const last = (side * side - 1) * 2;
    expect(geo.uvs[last]).toBeCloseTo(1);
    expect(geo.uvs[last + 1]).toBeCloseTo(1);
  });
});
