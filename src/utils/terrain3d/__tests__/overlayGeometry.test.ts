import { buildPolygonFill, buildRibbon } from '../overlayGeometry';
import { lonLatToMercator } from '../coords';
import { parseColorToRgba } from '../colorUtils';

const origin = lonLatToMercator(138.0, 35.0);
const flatSampler = () => 100;

describe('buildRibbon', () => {
  const path = [
    { latitude: 35.0, longitude: 138.0 },
    { latitude: 35.0, longitude: 138.001 },
  ];

  it('2点のラインから4頂点2三角形のリボンを作る', () => {
    const geo = buildRibbon(path, 10, origin, 1, flatSampler);
    expect(geo).not.toBeNull();
    expect(geo!.positions.length).toBe(4 * 3);
    expect(geo!.indices.length).toBe(6);
  });

  it('リボン幅は指定どおり（東西ラインなら南北方向に±width/2）', () => {
    const geo = buildRibbon(path, 10, origin, 1, flatSampler)!;
    // 頂点0と1は同じ経路点の左右オフセット
    const dz = Math.abs(geo.positions[2] - geo.positions[5]);
    expect(dz).toBeCloseTo(10, 4);
  });

  it('高さ=標高+リフト（elevScale適用）', () => {
    const geo = buildRibbon(path, 10, origin, 2, flatSampler)!;
    expect(geo.positions[1]).toBeCloseTo((100 + 3) * 2);
  });

  it('長い区間は分割される', () => {
    const long = [
      { latitude: 35.0, longitude: 138.0 },
      { latitude: 35.0, longitude: 138.01 }, // 約1km
    ];
    const geo = buildRibbon(long, 10, origin, 1, flatSampler)!;
    expect(geo.positions.length / 6).toBeGreaterThan(4);
  });

  it('標高未取得(null)は0m扱い', () => {
    const geo = buildRibbon(path, 10, origin, 1, () => null)!;
    expect(geo.positions[1]).toBeCloseTo(3);
  });

  it('1点以下はnull', () => {
    expect(buildRibbon([path[0]], 10, origin, 1, flatSampler)).toBeNull();
  });
});

describe('buildPolygonFill', () => {
  const square = [
    { latitude: 35.0, longitude: 138.0 },
    { latitude: 35.0, longitude: 138.001 },
    { latitude: 35.001, longitude: 138.001 },
    { latitude: 35.001, longitude: 138.0 },
  ];

  it('四角形は2三角形に分割される', () => {
    const geo = buildPolygonFill(square, undefined, origin, 1, flatSampler);
    expect(geo).not.toBeNull();
    expect(geo!.indices.length).toBe(6);
    expect(geo!.positions.length).toBe(4 * 3);
  });

  it('穴付きポリゴンは穴を避けて分割される', () => {
    const hole = [
      { latitude: 35.0004, longitude: 138.0004 },
      { latitude: 35.0004, longitude: 138.0006 },
      { latitude: 35.0006, longitude: 138.0006 },
      { latitude: 35.0006, longitude: 138.0004 },
    ];
    const geo = buildPolygonFill(square, { h1: hole }, origin, 1, flatSampler)!;
    expect(geo.positions.length).toBe(8 * 3);
    expect(geo.indices.length).toBeGreaterThan(6);
  });

  it('3点未満はnull', () => {
    expect(buildPolygonFill(square.slice(0, 2), undefined, origin, 1, flatSampler)).toBeNull();
  });
});

describe('parseColorToRgba', () => {
  it('各形式をパースできる', () => {
    expect(parseColorToRgba('#ff0000')).toEqual([1, 0, 0, 1]);
    expect(parseColorToRgba('#f00')).toEqual([1, 0, 0, 1]);
    const withAlpha = parseColorToRgba('#00ff0080');
    expect(withAlpha[1]).toBe(1);
    expect(withAlpha[3]).toBeCloseTo(0.5, 1);
    expect(parseColorToRgba('rgba(0,0,255,0.5)')).toEqual([0, 0, 1, 0.5]);
    expect(parseColorToRgba('rgb(255,255,0)')).toEqual([1, 1, 0, 1]);
  });

  it('不正値はフォールバック', () => {
    expect(parseColorToRgba('unknown')).toEqual([0.2, 0.4, 1, 1]);
  });
});
