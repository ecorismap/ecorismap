import { Gpx2Data, GeoJson2Data, generateCSV, generateGPX, generateGeoJson, getArrowDeg } from '../../utils/Geometry';
import { geojson } from '../resources/geojson';
import { gpx_track } from '../resources/gpx';
import { layers } from '../resources/layer';
import { record, recordExt } from '../resources/record';
jest.mock('uuid', () => ({ v4: () => '1234' }));

describe('Gpx2Data', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('return data from gpx', () => {
    jest.useFakeTimers('modern').setSystemTime(new Date('2022-06-02 12:00:00'));

    expect(Gpx2Data(gpx_track, 'LINE', 'test.gpx', '34-56', 'user1')).toStrictEqual({
      recordSet: [
        {
          centroid: { latitude: 42.4984620698, longitude: 139.8529901728 },
          coords: [
            { latitude: 42.498248918, longitude: 139.8534992896 },
            { latitude: 42.4982588924, longitude: 139.853411112 },
            { latitude: 42.4982816912, longitude: 139.8532861378 },
            { latitude: 42.4983156379, longitude: 139.853064185 },
            { latitude: 42.4984620698, longitude: 139.8529901728 },
          ],
          field: { cmt: '', name: undefined, time: '2022-06-02T12:00:00+09:00' },
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
          transparency: 0.2,
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
    });
  });
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
          transparency: 0.2,
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
      'displayName,name,time,cmt,photo,geometry',
      'mizutani,St.1,,,,POINT(140.71658064854364 38.24715800176878)',
      'takayuki,St.3,,,,POINT(140.71548306286388 38.24101016421964)',
    ].join(String.fromCharCode(10));
    expect(generateCSV(recordExt, layers[0].field, 'POINT')).toBe(expected);
  });
});

describe('generateGPX', () => {
  it('return gpx from data', () => {
    const expected = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<gpx creator=\"ecoris\" version=\"1.1\">
  <wpt lat=\"38.24715800176878\" lon=\"140.71658064854364\">
    <name>St.1</name>
    <time>1970-01-01T00:00:00.000Z</time>
    <cmt></cmt>
  </wpt>
  <wpt lat=\"38.24101016421964\" lon=\"140.71548306286388\">
    <name>St.3</name>
    <time>1970-01-01T00:00:00.000Z</time>
    <cmt></cmt>
  </wpt>
</gpx>`;

    expect(generateGPX(recordExt, 'POINT')).toBe(expected);
  });
});

describe('generateGeoJson', () => {
  it('return geojson from data', () => {
    expect(generateGeoJson(record, layers[1].field, 'POINT', 'test')).toStrictEqual({
      crs: { properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' }, type: 'name' },
      features: [
        {
          geometry: { coordinates: [undefined, undefined], type: 'Point' },
          properties: { _id: '1234', _visible: true, cmt: '', name: 'mizutani', time: '' },
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
    expect(getArrowDeg(record[0])).toBe(-58.63939584351132);
  });
});
