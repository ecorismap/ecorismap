import {
  decimal2dms,
  dms2decimal,
  toLatLonDMS,
  pointsToSvg,
  calcCentroid,
  isNearWithPlot,
  cleanupLine,
  findNearestTrackPoint,
  erasePartialLine,
  simplifyWithTolerance,
  smoothingByBezier,
} from '../Coords';
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

describe('findNearestTrackPoint', () => {
  //経度0.001度 ≒ 91m（緯度35度）。radiusはkm単位
  const track: LocationType[] = [
    { longitude: 138.0, latitude: 35.0, timestamp: 1000, altitude: 100, speed: 1.0 },
    { longitude: 138.001, latitude: 35.0, timestamp: 2000, altitude: 110, speed: 2.0 },
    { longitude: 138.002, latitude: 35.0, timestamp: 3000, altitude: 120, speed: 3.0 },
  ];

  it('returns the nearest vertex when tapped close to it', () => {
    const result = findNearestTrackPoint(track, [138.00095, 35.0], 0.1);
    expect(result).toBeDefined();
    expect(result!.index).toBe(1);
    expect(result!.point.timestamp).toBe(2000);
    expect(result!.point.altitude).toBe(110);
    expect(result!.point.speed).toBe(2.0);
  });

  it('interpolates timestamp at the middle of a segment', () => {
    const result = findNearestTrackPoint(track, [138.0005, 35.0], 0.1);
    expect(result).toBeDefined();
    expect(result!.interpolatedTimestamp).toBeGreaterThan(1400);
    expect(result!.interpolatedTimestamp).toBeLessThan(1600);
  });

  it('returns undefined when tapped outside the radius', () => {
    const result = findNearestTrackPoint(track, [138.001, 35.01], 0.1);
    expect(result).toBeUndefined();
  });

  it('returns undefined for an empty track', () => {
    expect(findNearestTrackPoint([], [138.0, 35.0], 0.1)).toBeUndefined();
  });

  it('handles a single point track with radius check', () => {
    const single = [track[0]];
    const hit = findNearestTrackPoint(single, [138.0001, 35.0], 0.1);
    expect(hit).toBeDefined();
    expect(hit!.index).toBe(0);
    expect(hit!.point.timestamp).toBe(1000);
    expect(findNearestTrackPoint(single, [138.1, 35.0], 0.1)).toBeUndefined();
  });

  it('returns the point without interpolatedTimestamp when timestamps are missing', () => {
    const noTime: LocationType[] = [
      { longitude: 138.0, latitude: 35.0 },
      { longitude: 138.001, latitude: 35.0 },
    ];
    const result = findNearestTrackPoint(noTime, [138.0005, 35.0], 0.1);
    expect(result).toBeDefined();
    expect(result!.interpolatedTimestamp).toBeUndefined();
  });
});

describe('erasePartialLine', () => {
  //経度0.001度 ≒ 111m の東西ライン
  const line: [number, number][] = [
    [0, 0],
    [0.00025, 0],
    [0.0005, 0],
    [0.00075, 0],
    [0.001, 0],
  ];
  const radius = 0.00005; // ≒5.5m

  it('中央を消すと2区間に分割される', () => {
    //中央を南北に横切る消しゴム軌跡
    const eraser: [number, number][] = [
      [0.0005, -0.0002],
      [0.0005, 0.0002],
    ];
    const result = erasePartialLine(line, eraser, radius);
    expect(result.erased).toBe(true);
    expect(result.remainingSegments.length).toBe(2);
    //各区間は消しゴムの左右に分かれている
    const [seg1, seg2] = result.remainingSegments;
    expect(Math.max(...seg1.map((p) => p[0]))).toBeLessThan(0.0005);
    expect(Math.min(...seg2.map((p) => p[0]))).toBeGreaterThan(0.0005);
  });

  it('端を消すと1区間に短縮される', () => {
    const eraser: [number, number][] = [
      [0, -0.0002],
      [0, 0.0002],
    ];
    const result = erasePartialLine(line, eraser, radius);
    expect(result.erased).toBe(true);
    expect(result.remainingSegments.length).toBe(1);
    //始点側が削られている
    expect(result.remainingSegments[0][0][0]).toBeGreaterThan(0);
    //終点は変わらない
    const seg = result.remainingSegments[0];
    expect(seg[seg.length - 1][0]).toBeCloseTo(0.001, 6);
  });

  it('全域を消すと区間が残らない', () => {
    const result = erasePartialLine(line, line, 0.0005);
    expect(result.erased).toBe(true);
    expect(result.remainingSegments.length).toBe(0);
  });

  it('交差しない場合はerased: falseで何も変更しない', () => {
    const eraser: [number, number][] = [
      [0.0005, 0.01],
      [0.0006, 0.01],
    ];
    const result = erasePartialLine(line, eraser, radius);
    expect(result.erased).toBe(false);
    expect(result.remainingSegments.length).toBe(0);
  });

  it('消し残りの微小な切れ端は捨てられる', () => {
    //始点ギリギリ内側を消して極小の切れ端を作る
    const eraser: [number, number][] = [
      [0.00006, -0.0002],
      [0.00006, 0.0002],
    ];
    const result = erasePartialLine(line, eraser, radius);
    expect(result.erased).toBe(true);
    //半径の半分より短い先頭側の切れ端は残らない
    expect(result.remainingSegments.length).toBe(1);
    expect(result.remainingSegments[0][0][0]).toBeGreaterThan(0.0001);
  });

  it('自己交差ラインでも例外を出さず妥当な結果を返す', () => {
    //8の字ライン
    const figureEight: [number, number][] = [
      [0, 0],
      [0.001, 0.001],
      [0.001, 0],
      [0, 0.001],
      [0, 0],
    ];
    const eraser: [number, number][] = [
      [0.0005, 0.0003],
      [0.0005, 0.0007],
    ];
    const result = erasePartialLine(figureEight, eraser, radius);
    expect(typeof result.erased).toBe('boolean');
    expect(Array.isArray(result.remainingSegments)).toBe(true);
  });

  it('1点の消しゴム（タップ）でも消せる', () => {
    const result = erasePartialLine(line, [[0.0005, 0]], radius);
    expect(result.erased).toBe(true);
    expect(result.remainingSegments.length).toBe(2);
  });
});

describe('simplifyWithTolerance', () => {
  it('ほぼ一直線の点列は端点近くまで間引かれる', () => {
    //わずかなノイズを持つ100点の直線
    const points: [number, number][] = Array.from({ length: 100 }, (_, i) => [i * 2, (i % 2) * 0.2]);
    const result = simplifyWithTolerance(points, 1.0);
    expect(result.length).toBeLessThan(10);
    //始点と終点は保持される
    expect(result[0]).toEqual(points[0]);
    expect(result[result.length - 1]).toEqual(points[points.length - 1]);
  });

  it('toleranceより大きな特徴は保持される', () => {
    const points: [number, number][] = [
      [0, 0],
      [50, 0],
      [50, 50],
      [100, 50],
    ];
    const result = simplifyWithTolerance(points, 1.0);
    expect(result.length).toBe(4);
  });

  it('2点以下はそのまま返す', () => {
    const points: [number, number][] = [
      [0, 0],
      [10, 10],
    ];
    expect(simplifyWithTolerance(points, 1.0)).toEqual(points);
  });
});

describe('smoothingByBezier + simplifyWithTolerance（ペン整形パイプライン）', () => {
  it('ギザギザの手描き線が平滑化され、間引き後も点数が爆発しない', () => {
    //ジッタを持つ手描き風の線
    const points: [number, number][] = Array.from({ length: 50 }, (_, i) => [i * 4, 100 + Math.sin(i * 0.3) * 30 + (i % 2) * 3]);
    const smoothed = smoothingByBezier(points);
    const simplified = simplifyWithTolerance(smoothed, 1.0);
    //ベジエ補間で増えた点が間引きで抑えられる
    expect(simplified.length).toBeLessThan(smoothed.length);
    //始点と終点は大きく動かない
    expect(Math.abs(simplified[0][0] - points[0][0])).toBeLessThan(5);
    const lastS = simplified[simplified.length - 1];
    const lastP = points[points.length - 1];
    expect(Math.abs(lastS[0] - lastP[0])).toBeLessThan(5);
  });
});
