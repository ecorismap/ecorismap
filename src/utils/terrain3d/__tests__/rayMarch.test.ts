import { marchRayToTerrain, Vec3 } from '../rayMarch';

// 水平に近い視線（眺望）: 目の高さ1.7m、わずかに下向き
const eye: Vec3 = [0, 1.7, 0];
const dirTo = (dx: number, dy: number): Vec3 => {
  const len = Math.hypot(dx, dy);
  return [dx / len, dy / len, 0];
};

describe('marchRayToTerrain（V-M6）', () => {
  it('近い範囲の交点は従来どおり求まる', () => {
    const t = marchRayToTerrain(eye, dirTo(100, -1.7), () => 0, 2000, 2000);
    expect(t).not.toBeNull();
    expect(t as number).toBeCloseTo(Math.hypot(100, 1.7), 0);
  });

  it('ズーム由来の範囲より先でも、ファー面までの地形に当たる', () => {
    // 20km先から高さ500mの尾根
    const ridge = (x: number): number => (x >= 20000 ? 500 : 0);
    const dir = dirTo(1, 0.001);
    expect(marchRayToTerrain(eye, dir, (x) => ridge(x), 2000, 2000)).toBeNull();
    const t = marchRayToTerrain(eye, dir, (x) => ridge(x), 2000, 300000);
    expect(t).not.toBeNull();
    expect(t as number).toBeGreaterThan(19000);
    expect(t as number).toBeLessThan(21000);
  });

  it('近い範囲の外では、地形の無い（描いていない）場所を当たりにしない', () => {
    const dir = dirTo(1, -0.0001);
    // 近い範囲(100m)の先は地形なし。0mとみなすと約17km先で海面に当たってしまう
    const t = marchRayToTerrain(eye, dir, (x) => (x < 100 ? 0 : null), 100, 300000);
    expect(t).toBeNull();
  });

  it('上向きの視線は当たらない', () => {
    expect(marchRayToTerrain(eye, dirTo(1, 0.5), () => 0, 2000, 300000)).toBeNull();
  });
});
