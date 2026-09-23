import { mat4LookAt, mat4Multiply, mat4Perspective, mat4TransformPoint, orbitEye, orbitUp } from '../matrices';

describe('mat4Perspective + mat4LookAt + mat4TransformPoint', () => {
  it('視線先の点はNDC中央に射影される', () => {
    const proj = mat4Perspective(Math.PI / 3, 1, 1, 1000);
    const view = mat4LookAt([0, 0, 10], [0, 0, 0], [0, 1, 0]);
    const vp = mat4Multiply(proj, view);
    const ndc = mat4TransformPoint(vp, [0, 0, 0]);
    expect(ndc[0]).toBeCloseTo(0);
    expect(ndc[1]).toBeCloseTo(0);
    expect(ndc[2]).toBeGreaterThan(-1);
    expect(ndc[2]).toBeLessThan(1);
  });

  it('視点の右側の点はNDCで+x', () => {
    const proj = mat4Perspective(Math.PI / 3, 1, 1, 1000);
    const view = mat4LookAt([0, 0, 10], [0, 0, 0], [0, 1, 0]);
    const vp = mat4Multiply(proj, view);
    const ndc = mat4TransformPoint(vp, [2, 0, 0]);
    expect(ndc[0]).toBeGreaterThan(0);
  });

  it('カメラより上の点はNDCで+y', () => {
    const proj = mat4Perspective(Math.PI / 3, 1, 1, 1000);
    const view = mat4LookAt([0, 0, 10], [0, 0, 0], [0, 1, 0]);
    const vp = mat4Multiply(proj, view);
    const ndc = mat4TransformPoint(vp, [0, 2, 0]);
    expect(ndc[1]).toBeGreaterThan(0);
  });
});

describe('orbitEye / orbitUp', () => {
  it('pitch=0は真上、pitch=90は水平・南側(heading=0)', () => {
    const top = orbitEye([0, 100, 0], 1000, 0, 0);
    expect(top[0]).toBeCloseTo(0);
    expect(top[1]).toBeCloseTo(1100);
    expect(top[2]).toBeCloseTo(0);
    const horizontal = orbitEye([0, 0, 0], 1000, 0, 90);
    expect(horizontal[0]).toBeCloseTo(0);
    expect(horizontal[1]).toBeCloseTo(0, 5);
    expect(horizontal[2]).toBeCloseTo(1000); // 南(+z)側から北を見る
  });

  it('heading=90（東向き）ではカメラは西側', () => {
    const eye = orbitEye([0, 0, 0], 1000, 90, 90);
    expect(eye[0]).toBeCloseTo(-1000);
    expect(eye[2]).toBeCloseTo(0, 5);
  });

  it('orbitUpは視線と直交する', () => {
    for (const [h, p] of [
      [0, 0],
      [45, 30],
      [230, 75],
    ]) {
      const eye = orbitEye([0, 0, 0], 1, h, p);
      const dir = [-eye[0], -eye[1], -eye[2]];
      const up = orbitUp(h, p);
      const dot = dir[0] * up[0] + dir[1] * up[1] + dir[2] * up[2];
      expect(Math.abs(dot)).toBeLessThan(1e-6);
    }
  });

  it('真俯瞰(pitch=0)のupは進行方向（北）', () => {
    const up = orbitUp(0, 0);
    expect(up[0]).toBeCloseTo(0);
    expect(up[1]).toBeCloseTo(0);
    expect(up[2]).toBeCloseTo(-1); // 北=-z
  });
});
