import { gpx2Data, geoJson2Data, generateCSV, generateGPX, generateGeoJson } from '../Geometry';
import { geoJsonString } from '../../__tests__/resources/geojson';
import track_gpx from '../../__tests__/resources/track_gpx';
import invalid_track_gpx from '../../__tests__/resources/invalid_track_gpx';
import point_gpx from '../../__tests__/resources/point_gpx';
import invalid_point_gpx from '../../__tests__/resources/invalid_point_gpx';
import { layers } from '../../__tests__/resources/layer';
import { expectedLineGpx, expectedPointGpx, line_record, point_record } from '../../__tests__/resources/record';
import { LayerType } from '../../types';
//@ts-ignore
import MockDate from 'mockdate';
jest.mock('ulid', () => ({ ulid: () => '1234' }));
MockDate.set('2000-01-01');

// Mock FUNC_LOGIN to be true for these tests
jest.mock('../../constants/AppConstants', () => ({
  ...jest.requireActual('../../constants/AppConstants'),
  FUNC_LOGIN: true,
}));

describe('gpx2Data', () => {
  it('return data from gpx', () => {
    expect(gpx2Data(track_gpx, 'LINE', 'test.gpx', '34-56', 'user1')).toStrictEqual({
      layer: {
        active: false,
        colorStyle: {
          color: '#ff0000',
          colorList: [],
          colorRamp: 'RANDOM',
          colorType: 'SINGLE',
          fieldName: '',
          lineWidth: 1.5,
          customFieldValue: '',
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
        permission: 'COMMON',
        type: 'LINE',
        visible: true,
      },
      recordSet: [
        {
          centroid: { latitude: 42.49825390520844, longitude: 139.85345520080352 },
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

  it('return undefined from invalid gpx', () => {
    expect(gpx2Data('invalid gpx', 'LINE', 'test.gpx', '34-56', 'user1')).toStrictEqual(undefined);
  });

  it('return track from valid gpx', () => {
    const data = gpx2Data(track_gpx, 'LINE', 'test.gpx', '34-56', 'user1');
    const checkValue = data!.recordSet.map(({ coords, field }) => ({ coords, field }));
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
    const data = gpx2Data(invalid_track_gpx, 'LINE', 'test.gpx', '34-56', 'user1');
    const checkValue = data!.recordSet.map(({ coords, field }) => ({ coords, field }));
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
    //jest.useFakeTimers('modern').setSystemTime(new Date('2022-06-02 12:00:00'));
    const data = gpx2Data(point_gpx, 'POINT', 'test.gpx', '34-56', 'user1');
    const checkValue = data!.recordSet.map(({ coords, field }) => ({ coords, field }));
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
  const data = gpx2Data(invalid_point_gpx, 'POINT', 'test.gpx', '34-56', 'user1');
  const checkValue = data!.recordSet.map(({ coords, field }) => ({ coords, field }));
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
      field: { cmt: '', name: '', time: '2000-01-01T09:00:00+09:00' },
    },
  ]);
});

describe('geoJson2Data', () => {
  const layer: LayerType = {
    active: false,
    colorStyle: {
      color: '#ff0000',
      colorList: [],
      colorRamp: 'RANDOM',
      colorType: 'SINGLE',
      customFieldValue: '',
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
  };
  it('return data from geojson', () => {
    const geojson = JSON.parse(geoJsonString);

    expect(geoJson2Data(geojson, layer, 'POINT', '34-56', 'user1')).toStrictEqual([
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
    ]);
  });

  it('return undefine from invalid geojson', () => {
    const geojson = JSON.parse('{ "features": "invalid geojson" }');
    expect(geoJson2Data(geojson, layer, 'POINT', '34-56', 'user1')).toStrictEqual(undefined);
  });
});

describe('generateCSV', () => {
  it('return csv from data', () => {
    const expected = [
      '\ufeff' + 'displayName,name,time,cmt,photo,geometry',
      'mizutani,"St.1","2020-01-01T09:28:38+09:00","","","POINT(140.71658064854364 38.24715800176878)"',
      ',"St.3","5時","","test.jpg","POINT(140.71548306286388 38.24101016421964)"',
    ];
    expect(generateCSV(point_record, layers[0].field, 'POINT').split(String.fromCharCode(10))).toStrictEqual(expected);
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
          properties: {
            _id: '1234',
            _visible: true,
            cmt: '',
            displayName: 'mizutani',
            name: 'St.1',
            time: '2020-01-01T09:28:38+09:00',
          },
          type: 'Feature',
        },
        {
          geometry: { coordinates: [140.71548306286388, 38.24101016421964], type: 'Point' },
          properties: { _id: '1234', _visible: true, cmt: '', displayName: null, name: 'St.3', time: '5時' },
          type: 'Feature',
        },
      ],
      name: 'test',
      type: 'FeatureCollection',
    });
  });
});
