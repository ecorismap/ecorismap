import { averageFixes } from '../averaging';
import { GnssFix } from '../nmea';

const fix = (overrides: Partial<GnssFix>): GnssFix => ({
  time: '000000.00',
  latitude: 35,
  longitude: 139,
  altitudeMsl: 100,
  geoidSeparation: 39,
  fixQuality: 4,
  satellites: 20,
  hdop: 0.6,
  diffAge: 1,
  speed: null,
  course: null,
  stdLat: null,
  stdLon: null,
  stdAlt: null,
  receivedAt: 1000,
  ...overrides,
});

describe('averageFixes', () => {
  it('空ならnull', () => {
    expect(averageFixes([], 0)).toBeNull();
  });

  it('位置と標高を平均し、アンテナ高を引く', () => {
    const result = averageFixes(
      [fix({ latitude: 35.0, altitudeMsl: 100 }), fix({ latitude: 35.00001, altitudeMsl: 102, receivedAt: 2000 })],
      1.5
    )!;
    expect(result.count).toBe(2);
    expect(result.location.latitude).toBeCloseTo(35.000005, 9);
    expect(result.location.altitude).toBeCloseTo(101 - 1.5, 9);
    expect(result.verticalSpread).toBeCloseTo(1, 9);
    expect(result.location.timestamp).toBe(2000);
    expect(result.location.gnss?.averagedCount).toBe(2);
  });

  it('水平のばらつきをメートルで返し、精度はばらつき以上にする', () => {
    // 緯度0.00001度 ≒ 1.11m。平均から各点は±0.557m
    const result = averageFixes([fix({ latitude: 35.0 }), fix({ latitude: 35.00001 })], 0)!;
    expect(result.horizontalSpread).toBeCloseTo(0.5566, 3);
    expect(result.location.accuracy).toBeCloseTo(0.5566, 3);
  });

  it('ばらつきが小さければ各エポックの精度を使う', () => {
    const result = averageFixes([fix({}), fix({})], 0)!;
    expect(result.horizontalSpread).toBe(0);
    expect(result.location.accuracy).toBe(0.05);
  });

  it('測位品質は混ざったうちで一番悪いもの、衛星数は最小・HDOPと補正経過は最大', () => {
    const result = averageFixes(
      [fix({ fixQuality: 4, satellites: 20, hdop: 0.5, diffAge: 1 }), fix({ fixQuality: 5, satellites: 15, hdop: 0.9, diffAge: 3 })],
      0
    )!;
    expect(result.location.gnss).toEqual({ fixQuality: 5, satellites: 15, hdop: 0.9, diffAge: 3, averagedCount: 2 });
  });
});
