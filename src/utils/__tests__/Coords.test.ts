import { decimal2dms, dms2decimal, isPoint, toLatLonDMS, pointsToSvg, calcCentroid, isNearWithPlot } from '../Coords';

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

describe('isPoint', () => {
  it('return boolean', () => {
    expect(isPoint({})).toBe(false);
    expect(isPoint({ latitude: 35, longitude: 135 })).toBe(true);
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
