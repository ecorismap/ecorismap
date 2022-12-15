import { Gpx2Data, GeoJson2Data, generateCSV, generateGPX, generateGeoJson, getArrowDeg } from '../../utils/Geometry';
import { geojson } from '../resources/geojson';
import track_gpx from '../resources/track_gpx';
import invalid_track_gpx from '../resources/invalid_track_gpx';
import point_gpx from '../resources/point_gpx';
import invalid_point_gpx from '../resources/invalid_point_gpx';
import { layers } from '../resources/layer';
import { expectedLineGpx, expectedPointGpx, line_record, point_record } from '../resources/record';
jest.mock('uuid', () => ({ v4: () => '1234' }));

describe('Gpx2Data', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('return data from gpx', () => {
    jest.useFakeTimers('modern').setSystemTime(new Date('2022-06-02 12:00:00'));

    expect(Gpx2Data(track_gpx, 'LINE', 'test.gpx', '34-56', 'user1')).toStrictEqual({
      layer: {
        active: false,
        colorStyle: {
          color: '#ff0000',
          colorList: [],
          colorRamp: 'RANDOM',
          colorType: 'SINGLE',
          fieldName: '',
          transparency: 0.8,
        },
        field: [
          { format: 'STRING', id: '1234', name: 'name' },
          { format: 'DATETIME', id: '1234', name: 'time' },
          { format: 'STRING', id: '1234', name: 'cmt' },
        ],
        id: '1234',
        label: 'name',
        name: 'test.gpx',
        permission: 'PRIVATE',
        type: 'LINE',
        visible: true,
      },
      recordSet: [
        {
          centroid: { ele: 127.99, latitude: 42.4982588924, longitude: 139.853411112, timestamp: 1612225720000 },
          coords: [
            { ele: 141.93, latitude: 42.498248918, longitude: 139.8534992896, timestamp: 1612225718000 },
            { ele: 127.99, latitude: 42.4982588924, longitude: 139.853411112, timestamp: 1612225720000 },
          ],
          displayName: 'user1',
          field: { cmt: '', name: 'test', time: '2020-01-01T09:28:38+09:00' },
          id: '1234',
          redraw: false,
          userId: '34-56',
          visible: true,
        },
      ],
    });
  });

  it('return track from valid gpx', () => {
    jest.useFakeTimers('modern').setSystemTime(new Date('2022-06-02 12:00:00'));
    const data = Gpx2Data(track_gpx, 'LINE', 'test.gpx', '34-56', 'user1');
    const checkValue = data.recordSet.map(({ coords, field }) => ({ coords, field }));
    expect(checkValue).toStrictEqual([
      {
        coords: [
          { ele: 141.93, latitude: 42.498248918, longitude: 139.8534992896, timestamp: 1612225718000 },
          { ele: 127.99, latitude: 42.4982588924, longitude: 139.853411112, timestamp: 1612225720000 },
        ],
        field: { cmt: '', name: 'test', time: '2020-01-01T09:28:38+09:00' },
      },
    ]);
  });

  it('return track from invalid gpx', () => {
    jest.useFakeTimers('modern').setSystemTime(new Date('2022-06-02 12:00:00'));
    const data = Gpx2Data(invalid_track_gpx, 'LINE', 'test.gpx', '34-56', 'user1');
    const checkValue = data.recordSet.map(({ coords, field }) => ({ coords, field }));
    expect(checkValue).toStrictEqual([
      {
        coords: [
          { ele: undefined, latitude: 0, longitude: 139.8534992896, timestamp: undefined },
          { ele: undefined, latitude: 0, longitude: 139.853411112, timestamp: undefined },
        ],
        field: { cmt: '', name: '', time: '' },
      },
    ]);
  });

  it('return point from valid gpx', () => {
    jest.useFakeTimers('modern').setSystemTime(new Date('2022-06-02 12:00:00'));
    const data = Gpx2Data(point_gpx, 'POINT', 'test.gpx', '34-56', 'user1');
    const checkValue = data.recordSet.map(({ coords, field }) => ({ coords, field }));
    expect(checkValue).toStrictEqual([
      {
        coords: { ele: 376.451477, latitude: 38.196045763864404, longitude: 140.88482022285461 },
        field: { cmt: 'コメント', name: 'test1', time: '2022-10-07T13:50:04+09:00' },
      },
      {
        coords: { ele: 376.451477, latitude: 38.19628422496845, longitude: 140.88485810905695 },
        field: { cmt: '', name: 'test2', time: '2022-10-07T13:50:04+09:00' },
      },
    ]);
  });
});

it('return  point from invalid gpx', () => {
  jest.useFakeTimers('modern').setSystemTime(new Date('2022-06-02 12:00:00'));
  const data = Gpx2Data(invalid_point_gpx, 'POINT', 'test.gpx', '34-56', 'user1');
  const checkValue = data.recordSet.map(({ coords, field }) => ({ coords, field }));
  expect(checkValue).toStrictEqual([
    {
      coords: { ele: undefined, latitude: 38.196045763864404, longitude: 140.88482022285461 },
      field: { cmt: '', name: 'test', time: '' },
    },
    {
      coords: { ele: undefined, latitude: 0, longitude: 140.88485810905695 },
      field: { cmt: '', name: '', time: '' },
    },
    {
      coords: { ele: undefined, latitude: 0, longitude: 0 },
      field: { cmt: '', name: '', time: '2022-06-02T12:00:00+09:00' },
    },
  ]);
});

describe('GeoJson2Data', () => {
  it('return data from geojson', () => {
    expect(GeoJson2Data(geojson, 'POINT', 'test.geojson', '34-56', 'user1')).toStrictEqual({
      recordSet: [
        {
          coords: { latitude: 38.24715800176878, longitude: 140.71658064854364 },
          field: { name: 'St.1' },
          id: '1234',
          userId: '34-56',
          displayName: 'user1',
          redraw: false,
          visible: true,
        },
        {
          coords: { latitude: 38.24101016421964, longitude: 140.71548306286388 },
          field: { name: 'St.3' },
          id: '1234',
          userId: '34-56',
          displayName: 'user1',
          redraw: false,
          visible: true,
        },
      ],
      layer: {
        active: false,
        colorStyle: {
          color: '#ff0000',
          colorList: [],
          colorRamp: 'RANDOM',
          colorType: 'SINGLE',
          fieldName: '',
          transparency: 0.8,
        },
        field: [{ format: 'STRING', id: '1234', name: 'name' }],
        id: '1234',
        label: '',
        name: 'test.geojson',
        permission: 'PRIVATE',
        type: 'POINT',
        visible: true,
      },
    });
  });
});

describe('generateCSV', () => {
  it('return csv from data', () => {
    const expected = [
      'name,time,cmt,photo,geometry',
      'St.1,2020-01-01T09:28:38+09:00,,,POINT(140.71658064854364 38.24715800176878)',
      'St.3,,,,POINT(140.71548306286388 38.24101016421964)',
    ].join(String.fromCharCode(10));
    expect(generateCSV(point_record, layers[0].field, 'POINT')).toBe(expected);
  });
});

describe('generateGPX', () => {
  it('return point gpx from data', () => {
    expect(generateGPX(point_record, 'POINT')).toBe(expectedPointGpx);
  });
  it('return line gpx from data', () => {
    expect(generateGPX(line_record, 'LINE')).toBe(expectedLineGpx);
  });
});

describe('generateGeoJson', () => {
  it('return geojson from data', () => {
    expect(generateGeoJson(point_record, layers[1].field, 'POINT', 'test')).toStrictEqual({
      crs: { properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' }, type: 'name' },
      features: [
        {
          geometry: { coordinates: [140.71658064854364, 38.24715800176878], type: 'Point' },
          properties: { _id: '1234', _visible: true, cmt: undefined, name: 'St.1', time: '2020-01-01T09:28:38+09:00' },
          type: 'Feature',
        },
        {
          geometry: { coordinates: [140.71548306286388, 38.24101016421964], type: 'Point' },
          properties: { _id: '1234', _visible: true, cmt: undefined, name: 'St.3', time: undefined },
          type: 'Feature',
        },
      ],
      name: 'test',
      type: 'FeatureCollection',
    });
  });
});

describe('getArrowDeg', () => {
  it('return arrow degree from line record', () => {
    expect(getArrowDeg(line_record[0])).toBe(-58.63939584351132);
  });
});
