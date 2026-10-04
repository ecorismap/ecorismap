import { clampVistaFov, stepVistaFov, vistaMagnification, VISTA_MAX_FOV_DEG, VISTA_MIN_FOV_DEG } from '../constants';

describe('stepVistaFov', () => {
  it('望遠（+1）で1段狭め、広角（-1）で1段広げる', () => {
    expect(stepVistaFov(60, 1)).toBe(45);
    expect(stepVistaFov(60, -1)).toBe(75);
  });

  it('端では止まる', () => {
    expect(stepVistaFov(VISTA_MIN_FOV_DEG, 1)).toBe(VISTA_MIN_FOV_DEG);
    expect(stepVistaFov(VISTA_MAX_FOV_DEG, -1)).toBe(VISTA_MAX_FOV_DEG);
  });

  it('ピンチ等で段の途中にあるときは、その向きの次の段へ寄せる', () => {
    expect(stepVistaFov(50, 1)).toBe(45);
    expect(stepVistaFov(50, -1)).toBe(60);
  });
});

describe('clampVistaFov', () => {
  it('範囲外は端に収める', () => {
    expect(clampVistaFov(200)).toBe(VISTA_MAX_FOV_DEG);
    expect(clampVistaFov(1)).toBe(VISTA_MIN_FOV_DEG);
  });
});

describe('vistaMagnification', () => {
  it('標準の画角で1倍、狭めるほど大きく、広げると1未満', () => {
    expect(vistaMagnification(60)).toBeCloseTo(1);
    expect(vistaMagnification(30)).toBeCloseTo(2.15, 2);
    expect(vistaMagnification(75)).toBeLessThan(1);
  });
});
