import {
  gpx2Data,
  geoJson2Data,
  generateCSV,
  generateGPX,
  generateTrackGPXWithPhotos,
  generateGeoJson,
  escapeCSVValue,
  hasValidCoordinates,
} from '../Geometry';
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
            { altitude: 141.93, latitude: 42.498248918, longitude: 139.8534992896, timestamp: 1612225718000 },
            { altitude: 127.99, latitude: 42.4982588924, longitude: 139.853411112, timestamp: 1612225720000 },
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
          { altitude: 141.93, latitude: 42.498248918, longitude: 139.8534992896, timestamp: 1612225718000 },
          { altitude: 127.99, latitude: 42.4982588924, longitude: 139.853411112, timestamp: 1612225720000 },
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
          { altitude: undefined, latitude: 0, longitude: 139.8534992896, timestamp: undefined },
          { altitude: undefined, latitude: 0, longitude: 139.853411112, timestamp: undefined },
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
        coords: { altitude: 376.451477, latitude: 38.196045763864404, longitude: 140.88482022285461 },
        field: { cmt: 'コメント', name: 'test1', time: '2022-10-07T13:50:04+09:00' },
      },
      {
        coords: { altitude: 376.451477, latitude: 38.19628422496845, longitude: 140.88485810905695 },
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
      coords: { altitude: undefined, latitude: 38.196045763864404, longitude: 140.88482022285461 },
      field: { cmt: '', name: 'test', time: '' },
    },
    {
      coords: { altitude: undefined, latitude: 0, longitude: 140.88485810905695 },
      field: { cmt: '', name: '', time: '' },
    },
    {
      coords: { altitude: undefined, latitude: 0, longitude: 0 },
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
      '"mizutani","St.1","2020-01-01T09:28:38+09:00","","","POINT(140.71658064854364 38.24715800176878)"',
      '"","St.3","5時","","test.jpg","POINT(140.71548306286388 38.24101016421964)"',
    ];
    expect(generateCSV(point_record, layers[0].field, 'POINT').split(String.fromCharCode(10))).toStrictEqual(expected);
  });
});

describe('hasValidCoordinates', () => {
  it('accepts valid geometries', () => {
    expect(hasValidCoordinates({ type: 'Point', coordinates: [140.7, 38.2] })).toBe(true);
    expect(hasValidCoordinates({ type: 'Point', coordinates: [140.7, 38.2, 120] })).toBe(true);
    expect(
      hasValidCoordinates({
        type: 'LineString',
        coordinates: [
          [140.7, 38.2],
          [140.8, 38.3],
        ],
      })
    ).toBe(true);
    expect(
      hasValidCoordinates({
        type: 'Polygon',
        coordinates: [
          [
            [140.7, 38.2],
            [140.8, 38.3],
            [140.7, 38.2],
          ],
        ],
      })
    ).toBe(true);
  });

  it('accepts a null geometry (attributes only)', () => {
    expect(hasValidCoordinates(null)).toBe(true);
  });

  it('rejects non-numeric coordinates', () => {
    // @ts-expect-error 壊れたファイルを模した入力
    expect(hasValidCoordinates({ type: 'Point', coordinates: ['140.7', '38.2'] })).toBe(false);
    // @ts-expect-error 壊れたファイルを模した入力
    expect(hasValidCoordinates({ type: 'Point', coordinates: [null, null] })).toBe(false);
    expect(hasValidCoordinates({ type: 'Point', coordinates: [NaN, 38.2] })).toBe(false);
  });

  it('rejects out-of-range coordinates', () => {
    expect(hasValidCoordinates({ type: 'Point', coordinates: [181, 38.2] })).toBe(false);
    expect(hasValidCoordinates({ type: 'Point', coordinates: [140.7, 91] })).toBe(false);
  });

  it('rejects malformed structures', () => {
    // Positionは number[] 型なので要素数不足は型エラーにならない。実行時に弾けることを確認する
    expect(hasValidCoordinates({ type: 'Point', coordinates: [140.7] })).toBe(false);
    expect(hasValidCoordinates({ type: 'LineString', coordinates: [] })).toBe(false);
    // @ts-expect-error 壊れたファイルを模した入力
    expect(hasValidCoordinates({ type: 'Unknown', coordinates: [140.7, 38.2] })).toBe(false);
  });
});

describe('escapeCSVValue', () => {
  it('quotes plain values', () => {
    expect(escapeCSVValue('abc')).toBe('"abc"');
    expect(escapeCSVValue('')).toBe('""');
    expect(escapeCSVValue(null)).toBe('""');
    expect(escapeCSVValue(undefined)).toBe('""');
  });

  it('escapes double quotes by doubling them', () => {
    expect(escapeCSVValue('say "hi"')).toBe('"say ""hi"""');
  });

  it('keeps commas and newlines inside quotes', () => {
    expect(escapeCSVValue('rgba(0,0,0,1)')).toBe('"rgba(0,0,0,1)"');
    expect(escapeCSVValue('a\nb')).toBe('"a\nb"');
  });

  it('neutralizes formula injection', () => {
    expect(escapeCSVValue('=1+1')).toBe('"\'=1+1"');
    expect(escapeCSVValue('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(escapeCSVValue('+HYPERLINK("http://evil")')).toBe('"\'+HYPERLINK(""http://evil"")"');
    expect(escapeCSVValue("-2+3+cmd|' /C calc'!A0")).toBe('"\'-2+3+cmd|\' /C calc\'!A0"');
  });

  it('keeps negative numbers usable as numbers', () => {
    expect(escapeCSVValue('-3.5')).toBe('"-3.5"');
    expect(escapeCSVValue(-3.5)).toBe('"-3.5"');
    expect(escapeCSVValue('-1e-3')).toBe('"-1e-3"');
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

describe('generateTrackGPXWithPhotos', () => {
  // UTC固定のタイムスタンプ（toISOString出力なので実行環境のTZに依存しない）
  const T0 = Date.UTC(2026, 7, 28, 1, 0, 0); // 2026-08-28T01:00:00.000Z
  const coords = [
    { latitude: 35.0, longitude: 135.0, altitude: 100, timestamp: T0 },
    { latitude: 35.001, longitude: 135.0, altitude: 110, timestamp: T0 + 10000 },
  ];

  it('写真なしはtrkのみ、trkptはele→timeの正規順・UTC ISO時刻', () => {
    const expected = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="ecoris" version="1.1">
  <trk>
    <name>test track</name>
    <trkseg>
      <trkpt lat="35" lon="135">
        <ele>100</ele>
        <time>2026-08-28T01:00:00.000Z</time>
      </trkpt>
      <trkpt lat="35.001" lon="135">
        <ele>110</ele>
        <time>2026-08-28T01:00:10.000Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;
    expect(generateTrackGPXWithPhotos(coords, 'test track')).toBe(expected);
  });

  it('写真ありはwptがtrkより先、wptの子はtime→name→link順でhref=ファイル名', () => {
    const photos = [
      { filename: 'IMG_0001.jpg', timestamp: T0 + 5000, latitude: 35.0005, longitude: 135.0 },
    ];
    const gpx = generateTrackGPXWithPhotos(coords, 'test track', photos);
    const wptIndex = gpx.indexOf('<wpt');
    const trkIndex = gpx.indexOf('<trk>');
    expect(wptIndex).toBeGreaterThan(-1);
    expect(wptIndex).toBeLessThan(trkIndex);
    expect(gpx).toContain(`  <wpt lat="35.0005" lon="135">
    <time>2026-08-28T01:00:05.000Z</time>
    <name>IMG_0001.jpg</name>
    <link href="IMG_0001.jpg"></link>
  </wpt>`);
  });

  it('altitude・timestampがない点は要素を省略する', () => {
    const mixed = [
      { latitude: 35.0, longitude: 135.0, altitude: null, timestamp: T0 },
      { latitude: 35.001, longitude: 135.0 },
    ];
    const gpx = generateTrackGPXWithPhotos(mixed, 'test track');
    expect(gpx).toContain(`<trkpt lat="35" lon="135">
        <time>2026-08-28T01:00:00.000Z</time>
      </trkpt>`);
    expect(gpx).toContain('<trkpt lat="35.001" lon="135"></trkpt>');
    expect(gpx).not.toContain('<ele>');
  });
});
