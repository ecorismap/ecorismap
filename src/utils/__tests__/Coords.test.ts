import { decimal2dms, dms2decimal, toLatLonDMS, pointsToSvg, calcCentroid, isNearWithPlot, cleanupLine } from '../Coords';
import { LocationType } from '../../types';

describe('decimal2dms', () => {
  it('return dms value from decimal', () => {
    expect(decimal2dms(38.016666666666666).deg).toBe('38');
    expect(decimal2dms(38.016666666666666).min).toBe('1');
    expect(decimal2dms(38.016666666666666).sec).toBe('0');
    expect(decimal2dms(38.99999999999999).deg).toBe('39');
    expect(decimal2dms(38.99999999999999).min).toBe('0');
    expect(decimal2dms(38.999999999999999).sec).toBe('0');
    expect(decimal2dms(135.00280860811472).deg).toBe('135');
    expect(decimal2dms(135.00280860811472).min).toBe('0');
    expect(decimal2dms(-35.000067805271881).deg).toBe('-35');
    expect(decimal2dms(-35.000067805271881).min).toBe('0');
    expect(decimal2dms(-35.000067805271881).sec).toBe('0.244');
  });
});

describe('dms2decimal', () => {
  it('return decimal value from dms', () => {
    expect(dms2decimal(38, 1, 0)).toBe(38.016666666666666);
    expect(dms2decimal(135, 0, 0)).toBe(135.0);
    expect(dms2decimal(-135, 0, 0)).toBe(-135.0);
    expect(dms2decimal(35, 0, 0)).toBe(35.0);
  });
});

describe('toLatLonDMS', () => {
  it('return LatLonDMS type from Location type', () => {
    expect(toLatLonDMS({ latitude: 35.5, longitude: 135.5 })).toStrictEqual({
      latitude: { decimal: '35.5', deg: '35', min: '30', sec: '0' },
      longitude: { decimal: '135.5', deg: '135', min: '30', sec: '0' },
    });
  });
});

describe('pointsToSvg', () => {
  it('return SVG value from points', () => {
    expect(pointsToSvg([[0, 0]])).toBe('M 0,0 ');
    expect(
      pointsToSvg([
        [0, 0],
        [1, 1],
      ])
    ).toBe('M 0,0 L 1,1');
  });
});

describe('calcCentroid', () => {
  it('return centroid', () => {
    expect(
      calcCentroid([
        { latitude: 35, longitude: 135 },
        { latitude: 35.05, longitude: 135.05 },
        { latitude: 34.95, longitude: 134.95 },
        { latitude: 35.01, longitude: 135.01 },
      ])
    ).toStrictEqual({ latitude: 35.0025, longitude: 135.0025 });
  });
});

describe('isNearWithPlot', () => {
  const xyPoint = [10, 5];
  const xyPlot1 = [11, 6]; // Should be true
  const xyPlot2 = [9, 4]; // Should be true
  const xyPlot3 = [1000, 1000]; // Should be false

  it('returns true when two points are near each other given a buffer of 500', () => {
    const result1 = isNearWithPlot(xyPoint, xyPlot1);
    const result2 = isNearWithPlot(xyPoint, xyPlot2);
    const result3 = isNearWithPlot(xyPoint, xyPlot3);
    expect(result1).toBe(true);
    expect(result2).toBe(true);
    expect(result3).toBe(false);
  });
});

describe('cleanupLine', () => {
  // 蛇行する軌跡を生成（turf.simplifyが多数の頂点を保持するよう正弦波状にする）
  const makeWigglyLine = (n: number): LocationType[] =>
    Array.from({ length: n }, (_, i) => ({
      latitude: 35 + 0.001 * Math.sin(i / 5),
      longitude: 135 + i * 0.0001,
      timestamp: 1_600_000_000_000 + i * 1000,
      accuracy: 10,
      altitude: 100 + i,
      speed: 1,
      heading: 90,
    }));

  it('returns input unchanged when fewer than 10 points', () => {
    const line = makeWigglyLine(5);
    expect(cleanupLine(line)).toBe(line);
  });

  it('restores timestamp/properties from original points and preserves order', () => {
    const line = makeWigglyLine(2000);
    const inputTimestamps = new Set(line.map((p) => p.timestamp));

    const result = cleanupLine(line);

    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.length).toBeLessThanOrEqual(line.length);

    // 全ての出力点は元の点のtimestampを持つ（最近傍ではなく座標一致で復元できている）
    for (const point of result) {
      expect(inputTimestamps.has(point.timestamp)).toBe(true);
      expect(point.altitude).toBeDefined();
      expect(point.accuracy).toBeDefined();
    }

    // timestampは昇順（順序が保たれている）
    for (let i = 1; i < result.length; i++) {
      expect(result[i].timestamp!).toBeGreaterThanOrEqual(result[i - 1].timestamp!);
    }
  });

  it('handles large tracks without O(N^2) blowup (regression guard)', () => {
    const line = makeWigglyLine(20000);
    const start = Date.now();
    const result = cleanupLine(line);
    const elapsed = Date.now() - start;

    expect(result.length).toBeGreaterThan(2);
    // 旧実装(O(N^2))では数秒〜かかっていた。O(N)化により十分高速に完了する。
    expect(elapsed).toBeLessThan(5000);
  });
});
