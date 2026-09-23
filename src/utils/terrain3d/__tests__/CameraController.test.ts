import { CameraController, normalizeAngleDelta } from '../CameraController';
import { MAX_PITCH_DEG } from '../constants';

const initial = { latitude: 35.36, longitude: 138.73, zoom: 13, heading: 0, pitch: 60 };

describe('normalizeAngleDelta', () => {
  it('最短方向の差分に正規化する', () => {
    expect(normalizeAngleDelta(350)).toBe(-10);
    expect(normalizeAngleDelta(-350)).toBe(10);
    expect(normalizeAngleDelta(180)).toBe(180);
    expect(normalizeAngleDelta(10)).toBe(10);
  });
});

describe('CameraController', () => {
  it('ピンチでズームがlog2(scale)だけ変わる', () => {
    const c = new CameraController(initial, 800);
    c.zoomByScale(2);
    expect(c.getState().zoom).toBeCloseTo(14);
    c.zoomByScale(0.5);
    expect(c.getState().zoom).toBeCloseTo(13);
  });

  it('回転は0-360に正規化される', () => {
    const c = new CameraController(initial, 800);
    c.rotateBy(-90);
    expect(c.getState().heading).toBe(270);
    c.rotateBy(180);
    expect(c.getState().heading).toBe(90);
  });

  it('ピッチは範囲内にクランプされる', () => {
    const c = new CameraController(initial, 800);
    c.pitchBy(1000);
    expect(c.getState().pitch).toBe(MAX_PITCH_DEG);
    c.pitchBy(-1000);
    expect(c.getState().pitch).toBe(0);
  });

  it('heading=0で下ドラッグすると北へ進む（地図が手前に付いてくる）', () => {
    const c = new CameraController(initial, 800);
    const before = c.getState();
    c.panByScreenDelta(0, 100); // 指を下へ
    const after = c.getState();
    expect(after.latitude).toBeGreaterThan(before.latitude);
    expect(after.longitude).toBeCloseTo(before.longitude, 10);
  });

  it('heading=90（東向き）で下ドラッグすると東へ進む', () => {
    const c = new CameraController({ ...initial, heading: 90 }, 800);
    const before = c.getState();
    c.panByScreenDelta(0, 100);
    const after = c.getState();
    expect(after.longitude).toBeGreaterThan(before.longitude);
    expect(after.latitude).toBeCloseTo(before.latitude, 6);
  });

  it('animateToでcenter/heading/zoomが目標値へ収束する', () => {
    const c = new CameraController(initial, 800);
    c.animateTo({ center: { latitude: 35.5, longitude: 139.0 }, heading: 350, zoom: 14 }, 200, 1000);
    // 途中経過ではまだ到達していない
    c.update(1100);
    const mid = c.getState();
    expect(mid.latitude).toBeGreaterThan(35.36);
    expect(mid.latitude).toBeLessThan(35.5);
    // headingは最短方向（0→350は-10度側）
    expect(mid.heading).toBeGreaterThan(300);
    // 完了
    const active = c.update(1300);
    expect(active).toBe(false);
    const end = c.getState();
    expect(end.latitude).toBeCloseTo(35.5, 6);
    expect(end.longitude).toBeCloseTo(139.0, 6);
    expect(end.heading).toBeCloseTo(350, 4);
    expect(end.zoom).toBeCloseTo(14, 6);
  });

  it('duration=0のanimateToは即時反映', () => {
    const c = new CameraController(initial, 800);
    c.animateTo({ heading: 123 }, 0, 0);
    expect(c.getState().heading).toBeCloseTo(123);
  });

  it('慣性は減衰してやがて止まる', () => {
    const c = new CameraController(initial, 800);
    c.update(0);
    c.startPanInertia(0, 1); // 下方向の初速
    let now = 0;
    let active = true;
    let iterations = 0;
    while (active && iterations < 300) {
      now += 16;
      active = c.update(now);
      iterations++;
    }
    expect(active).toBe(false);
    expect(iterations).toBeGreaterThan(3);
    expect(c.getState().latitude).toBeGreaterThan(initial.latitude);
  });
});
