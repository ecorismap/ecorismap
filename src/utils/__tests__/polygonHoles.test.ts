import { Position } from 'geojson';
import { followHolesToRigidRingTransform } from '../polygonHoles';

const ring: Position[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
  [0, 0],
];
const hole: Position[] = [
  [40, 40],
  [60, 40],
  [60, 60],
  [40, 40],
];

describe('followHolesToRigidRingTransform', () => {
  it('外周の平行移動に穴も追従する', () => {
    const moved = ring.map(([x, y]) => [x + 30, y - 10]);
    const result = followHolesToRigidRingTransform(ring, moved, [hole]);
    expect(result).toBeDefined();
    result![0].forEach((p, i) => {
      expect(p[0]).toBeCloseTo(hole[i][0] + 30, 9);
      expect(p[1]).toBeCloseTo(hole[i][1] - 10, 9);
    });
  });

  it('外周の回転に穴も追従する（外周の中心まわり）', () => {
    //中心(40,40)まわりに90度回転（外周の頂点平均は閉じ点を含むので(40,40)）
    const rotate = ([x, y]: Position): Position => [40 - (y - 40), 40 + (x - 40)];
    const moved = ring.map(rotate);
    const result = followHolesToRigidRingTransform(ring, moved, [hole]);
    expect(result).toBeDefined();
    result![0].forEach((p, i) => {
      const expected = rotate(hole[i]);
      expect(p[0]).toBeCloseTo(expected[0], 9);
      expect(p[1]).toBeCloseTo(expected[1], 9);
    });
  });

  it('頂点を個別に動かした（剛体変換でない）ときは穴を動かさない', () => {
    const moved = ring.map((p) => [...p]);
    moved[2] = [150, 150];
    expect(followHolesToRigidRingTransform(ring, moved, [hole])).toBeUndefined();
  });

  it('頂点数が変わった・動いていないときは穴を動かさない', () => {
    expect(followHolesToRigidRingTransform(ring, ring.slice(1), [hole])).toBeUndefined();
    expect(followHolesToRigidRingTransform(ring, ring, [hole])).toBeUndefined();
  });
});
