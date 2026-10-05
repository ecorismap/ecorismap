import { computeTileRing } from '../TerrainTileManager';
import { lonToTileXFloat, latToTileYFloat, tileSizeMeters } from '../coords';

const LAT = 35.55;
const LON = 138.81;

/** タイル中心の、視点から見た方位[度]（北=0、東=90） */
const bearingOf = (z: number, x: number, y: number) => {
  const cx = lonToTileXFloat(LON, z);
  const cy = latToTileYFloat(LAT, z);
  return ((Math.atan2(x + 0.5 - cx, -(y + 0.5 - cy)) * 180) / Math.PI + 360) % 360;
};
const distTiles = (z: number, x: number, y: number) =>
  Math.hypot(x + 0.5 - lonToTileXFloat(LON, z), y + 0.5 - latToTileYFloat(LAT, z));

describe('computeTileRing（扇形）', () => {
  const zoom = 15;
  const radius = 20000;
  const cone = { headingDeg: 90, halfAngleDeg: 10 };

  it('足元以外は見ている方向（東±10度＋タイルの見かけの幅）の中だけを取る', () => {
    const tiles = computeTileRing(LAT, LON, 90, zoom, radius, 24, 0, cone);
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) {
      const d = distTiles(t.z, t.x, t.y);
      if (d <= 1.5) continue;
      const diff = Math.abs(((bearingOf(t.z, t.x, t.y) - 90 + 540) % 360) - 180);
      const tileHalfAngle = (Math.atan(0.71 / d) * 180) / Math.PI;
      expect(diff).toBeLessThanOrEqual(10 + tileHalfAngle + 1e-6);
    }
  });

  it('同じ枚数で、円よりずっと遠くまで届く', () => {
    const far = (tiles: { z: number; x: number; y: number }[]) =>
      Math.max(...tiles.map((t) => distTiles(t.z, t.x, t.y))) * tileSizeMeters(zoom);
    const circle = computeTileRing(LAT, LON, 90, zoom, radius, 24, 0);
    const sector = computeTileRing(LAT, LON, 90, zoom, radius, 24, 0, cone);
    expect(far(sector)).toBeGreaterThan(far(circle) * 2);
  });

  it('近い順なので、枚数が足りなくても視点から途切れずに覆う', () => {
    const tiles = computeTileRing(LAT, LON, 90, zoom, radius, 12, 0, cone);
    const dists = tiles.map((t) => distTiles(t.z, t.x, t.y)).sort((a, b) => a - b);
    // 隣り合う距離の差が1タイル超＝途中が抜けている
    for (let i = 1; i < dists.length; i++) expect(dists[i] - dists[i - 1]).toBeLessThanOrEqual(1.5);
  });

  it('足元のタイルは向きに関係なく含める', () => {
    const tiles = computeTileRing(LAT, LON, 90, zoom, radius, 24, 0, cone);
    const cx = Math.floor(lonToTileXFloat(LON, zoom));
    const cy = Math.floor(latToTileYFloat(LAT, zoom));
    expect(tiles.some((t) => t.x === cx && t.y === cy)).toBe(true);
  });
});
