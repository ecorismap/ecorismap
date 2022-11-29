import {
  decimal2dms,
  dms2decimal,
  isPoint,
  toLatLonDMS,
  pointsToSvg,
  computeMovingAverage,
  pointsToLocation,
  locationToPoints,
} from '../../utils/Coords';

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
    expect(pointsToSvg([[0, 0]])).toBe('M 0,0 L 0,0');
    expect(
      pointsToSvg([
        [0, 0],
        [1, 1],
      ])
    ).toBe('M 0,0 L 0,0 L 1,1');
  });
});

describe('computeMovingAverage', () => {
  it('return SVG value from points', () => {
    expect(
      computeMovingAverage(
        [
          [0, 0],
          [10, 10],
          [20, 20],
          [30, 30],
        ],
        2
      )
    ).toStrictEqual([
      [5, 5],
      [15, 15],
      [25, 25],
      [30, 30],
    ]);
  });
});

describe('pointsToLocation', () => {
  it('return location from screen points', () => {
    expect(
      pointsToLocation(
        [
          [0, 0],
          [10, 10],
          [20, 20],
          [30, 30],
        ],
        {
          width: 100,
          height: 200,
          latitude: 35,
          longitude: 135,
          latitudeDelta: 0.00922,
          longitudeDelta: 0.00922,
        }
      )
    ).toStrictEqual([
      { latitude: 35.00461, longitude: 134.99539 },
      { latitude: 35.004149, longitude: 134.996312 },
      { latitude: 35.003688, longitude: 134.997234 },
      { latitude: 35.003227, longitude: 134.998156 },
    ]);
  });
});

describe('locationToPoints', () => {
  it('return screen points from location', () => {
    expect(
      locationToPoints(
        [
          { latitude: 35, longitude: 135 },
          { latitude: 35.05, longitude: 135.05 },
          { latitude: 34.95, longitude: 134.95 },
          { latitude: 35.01, longitude: 135.01 },
        ],
        { width: 100, height: 200, latitude: 35, longitude: 135, latitudeDelta: 0.1, longitudeDelta: 0.1 }
      )
    ).toStrictEqual([
      [50, 100],
      [100, 0],
      [0, 200],
      [60, 80],
    ]);
  });
});
