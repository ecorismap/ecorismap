import { settleOnDrawnTerrain } from '../placeOnTerrain';

const options = { iterations: 4, epsilon: 0.5, maxLastStep: 20 };

/**
 * 断面で再現する。目は (0, eyeY)、点は距離 d の真下に地面 ground(d)。
 * heightAt(y) は目から (d, y) へ向けた視線が最初に当たる地形の高さ
 */
const scene = (eyeY: number, d: number, ground: (s: number) => number) => (y: number) => {
  for (let s = 10; s < 20000; s += 2) {
    if (eyeY + ((y - eyeY) * s) / d <= ground(s)) return ground(s);
  }
  return null;
};

describe('settleOnDrawnTerrain', () => {
  it('見えている点は、JSの標高が低くても描かれた地形の高さへ寄る', () => {
    const ground = () => 120;
    expect(settleOnDrawnTerrain(100, scene(1000, 5000, ground), options)).toBeCloseTo(120, 0);
  });

  it('目に向いた斜面にある点も寄る', () => {
    const ground = (s: number) => 100 + Math.max(0, s - 4000) * 0.3;
    // d=5000 の地面は 400
    expect(Math.abs(settleOnDrawnTerrain(380, scene(1000, 5000, ground), options) - 400)).toBeLessThan(8);
  });

  it('手前の尾根に隠れた点は、尾根の高さへ持ち上げず初期値を返す（2026-11-25 Androidエミュの実例に近い形）', () => {
    // 目1135m。5.2km先に484mの尾根、その奥は谷、6.5km先の点の地面は327m
    const ground = (s: number) => {
      if (s > 5150 && s < 5300) return 484;
      if (s >= 5300 && s < 6800) return 327;
      if (s >= 6800) return 327 + (s - 6800) * 0.11;
      return 250;
    };
    expect(settleOnDrawnTerrain(327, scene(1135, 6540, ground), options)).toBe(327);
  });

  it('行き来して収束しなければ初期値を返す', () => {
    const cycle: Record<number, number> = { 327: 484, 484: 392, 392: 323, 323: 481, 481: 389 };
    expect(settleOnDrawnTerrain(327, (y) => cycle[y] ?? 327, options)).toBe(327);
  });

  it('空に当たったら初期値を返す', () => {
    expect(settleOnDrawnTerrain(327, () => null, options)).toBe(327);
    expect(settleOnDrawnTerrain(327, (y) => (y === 327 ? 500 : null), options)).toBe(327);
  });

  it('寄り切らなくても、残りの動きが小さければ採る', () => {
    expect(settleOnDrawnTerrain(100, (y) => y + (150 - y) * 0.4, options)).toBeGreaterThan(140);
  });
});
