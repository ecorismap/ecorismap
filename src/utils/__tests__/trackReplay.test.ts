import { bearingBetween, interpolateProfileAt } from '../trackReplay';
import { ElevationProfilePoint } from '../trackStatistics';

// 東へ等間隔に進む軌跡（累積距離は0/1/2km）
const eastward: ElevationProfilePoint[] = [
  { distanceKm: 0, altitude: 100, latitude: 35, longitude: 138 },
  { distanceKm: 1, altitude: 200, latitude: 35, longitude: 138.011 },
  { distanceKm: 2, altitude: 300, latitude: 35, longitude: 138.022 },
];

describe('bearingBetween', () => {
  it('北・東・南・西が0/90/180/270度になる', () => {
    const origin = { latitude: 35, longitude: 138 };
    expect(bearingBetween(origin, { latitude: 35.01, longitude: 138 })).toBeCloseTo(0, 5);
    expect(bearingBetween(origin, { latitude: 35, longitude: 138.01 })).toBeCloseTo(90, 5);
    expect(bearingBetween(origin, { latitude: 34.99, longitude: 138 })).toBeCloseTo(180, 5);
    expect(bearingBetween(origin, { latitude: 35, longitude: 137.99 })).toBeCloseTo(270, 5);
  });

  it('同じ点なら0を返す（NaNにしない）', () => {
    const p = { latitude: 35, longitude: 138 };
    expect(bearingBetween(p, p)).toBe(0);
  });

  it('北東は45度付近（経度差は緯度で縮むので補正される）', () => {
    const from = { latitude: 35, longitude: 138 };
    // 緯度35度では経度1度の東西距離が cos(35)≒0.819 倍になる
    const to = { latitude: 35.01, longitude: 138 + 0.01 / Math.cos((35 * Math.PI) / 180) };
    expect(bearingBetween(from, to)).toBeCloseTo(45, 1);
  });
});

describe('interpolateProfileAt', () => {
  it('progress=0は始点、1は終点', () => {
    const start = interpolateProfileAt(eastward, 0);
    const end = interpolateProfileAt(eastward, 1);
    expect(start?.longitude).toBeCloseTo(138, 6);
    expect(start?.index).toBe(0);
    expect(end?.longitude).toBeCloseTo(138.022, 6);
    expect(end?.index).toBe(2);
  });

  it('中間は距離に比例した位置になる（点の上でなくても補間される）', () => {
    const quarter = interpolateProfileAt(eastward, 0.25);
    // 全長2kmの25%＝0.5km地点＝1点目と2点目の中間
    expect(quarter?.longitude).toBeCloseTo(138.0055, 6);
    expect(quarter?.altitude).toBeCloseTo(150, 6);
  });

  it('進行方位が区間の向きになる', () => {
    expect(interpolateProfileAt(eastward, 0.3)?.bearing).toBeCloseTo(90, 3);
  });

  it('カーソルのindexは近い方の点に寄る', () => {
    expect(interpolateProfileAt(eastward, 0.2)?.index).toBe(0); // 0.4km→0km寄り
    expect(interpolateProfileAt(eastward, 0.3)?.index).toBe(1); // 0.6km→1km寄り
  });

  it('範囲外のprogressは端にクランプされる', () => {
    expect(interpolateProfileAt(eastward, -1)?.longitude).toBeCloseTo(138, 6);
    expect(interpolateProfileAt(eastward, 2)?.longitude).toBeCloseTo(138.022, 6);
  });

  it('点が2つ未満、または全長0ならnull', () => {
    expect(interpolateProfileAt([], 0.5)).toBeNull();
    expect(interpolateProfileAt([eastward[0]], 0.5)).toBeNull();
    const still: ElevationProfilePoint[] = [
      { distanceKm: 0, altitude: 100, latitude: 35, longitude: 138 },
      { distanceKm: 0, altitude: 100, latitude: 35, longitude: 138 },
    ];
    expect(interpolateProfileAt(still, 0.5)).toBeNull();
  });
});
