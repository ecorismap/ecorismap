// 軌跡の GeoJSON 書き出し→取り込みで点ごとの属性が戻ること（軌跡監査 T-M7）
import { FeatureCollection, Geometry, GeoJsonProperties, LineString } from 'geojson';
import { geoJson2Data, generateGeoJson, createLayerFromGeoJson } from '../Geometry';
import { FieldType, LayerType, LocationType, RecordType } from '../../types';

let mockUlidCounter = 0;
jest.mock('ulid', () => ({ ulid: () => `ID${++mockUlidCounter}` }));

const fields: FieldType[] = [{ id: 'f1', name: 'name', format: 'STRING' }];

const layer: LayerType = {
  id: 'L1',
  name: 'track',
  type: 'LINE',
  permission: 'PRIVATE',
  colorStyle: {
    colorType: 'SINGLE',
    transparency: 0.8,
    color: '#ff0000',
    fieldName: '',
    customFieldValue: '',
    colorRamp: 'RANDOM',
    colorList: [],
    lineWidth: 1.5,
  },
  label: '',
  visible: true,
  active: false,
  field: fields,
};

const record = (coords: LocationType[]): RecordType => ({
  id: 'R1',
  userId: 'u',
  displayName: 'n',
  visible: true,
  redraw: false,
  coords,
  field: { name: 'trk' },
});

type Collection = FeatureCollection<Geometry | null, GeoJsonProperties>;

const exportTrack = (coords: LocationType[], trackPointAttributes = true): Collection =>
  JSON.parse(
    JSON.stringify(generateGeoJson([record(coords)], fields, 'LINE', 'track', 'PRIVATE', undefined, { trackPointAttributes }))
  );

const roundTrip = (coords: LocationType[]): LocationType[] => {
  const records = geoJson2Data(exportTrack(coords), layer, 'LINE', 'u', 'n');
  expect(records).toHaveLength(1);
  return records![0].coords as LocationType[];
};

const internalPoint = (i: number): LocationType => ({
  latitude: 35 + i * 0.001,
  longitude: 139 + i * 0.001,
  altitude: 100 + i,
  accuracy: 5 + i,
  speed: 1.5,
  timestamp: 1_700_000_000_000 + i * 1000,
});

const gnssPoint = (i: number, fixQuality: number): LocationType => ({
  ...internalPoint(i),
  fixQuality,
  ellipsoidHeight: 140.123 + i,
});

describe('軌跡の GeoJSON 往復', () => {
  test('時刻・標高・精度・速度・測位品質・楕円体高が点ごとに戻る', () => {
    const coords = [gnssPoint(0, 4), gnssPoint(1, 5), internalPoint(2), gnssPoint(3, 4)];
    expect(roundTrip(coords)).toEqual(coords);
  });

  test('全点に標高があれば座標の3番目に書き、_altitudes は出さない', () => {
    const geojson = exportTrack([internalPoint(0), internalPoint(1)]);
    const feature = geojson.features[0];
    expect((feature.geometry as LineString).coordinates[0]).toEqual([139, 35, 100]);
    expect(feature.properties?._altitudes).toBeUndefined();
    expect(feature.properties?._timestamps).toEqual([1_700_000_000_000, 1_700_000_001_000]);
    // 外部GNSSの点が無ければ品質・楕円体高の配列は出さない
    expect(feature.properties?._fixQualities).toBeUndefined();
    expect(feature.properties?._ellipsoidHeights).toBeUndefined();
  });

  test('海抜0mは自前の書き出しなら0のまま戻る', () => {
    const coords = [
      { ...internalPoint(0), altitude: 0 },
      { ...internalPoint(1), altitude: 0 },
    ];
    expect(roundTrip(coords).map((c) => c.altitude)).toEqual([0, 0]);
  });

  test('標高の無い点が混じると2次元座標＋_altitudes(null)で書き、無い点は標高なしで戻る', () => {
    const coords: LocationType[] = [gnssPoint(0, 4), { ...internalPoint(1), altitude: null }, { ...gnssPoint(2, 4), altitude: 0 }];
    const geojson = exportTrack(coords);
    const feature = geojson.features[0];
    expect((feature.geometry as LineString).coordinates[0]).toEqual([139, 35]);
    expect(feature.properties?._altitudes).toEqual([100, null, 0]);

    const restored = roundTrip(coords);
    expect(restored[0].altitude).toBe(100);
    expect(restored[1].altitude).toBeUndefined();
    expect(restored[2].altitude).toBe(0);
    // 内蔵GPSの点には fixQuality を付けない（cleanupLine が外部の点と区別するため）
    expect(restored[1].fixQuality).toBeUndefined();
    expect(restored[2].fixQuality).toBe(4);
  });

  test('点ごとの属性が無い線は従来どおり2次元で、配列も出さない', () => {
    const coords = [
      { latitude: 35, longitude: 139 },
      { latitude: 35.001, longitude: 139.001 },
    ];
    const geojson = exportTrack(coords);
    const feature = geojson.features[0];
    expect((feature.geometry as LineString).coordinates).toEqual([
      [139, 35],
      [139.001, 35.001],
    ]);
    expect(Object.keys(feature.properties ?? {}).filter((k) => k.startsWith('_') && k.endsWith('s'))).toEqual([]);
    expect(roundTrip(coords)).toEqual(coords);
  });

  test('地図表示用（オプションなし）は従来どおり2次元・配列なし', () => {
    const geojson = exportTrack([gnssPoint(0, 4), gnssPoint(1, 4)], false);
    const feature = geojson.features[0];
    expect((feature.geometry as LineString).coordinates[0]).toEqual([139, 35]);
    expect(feature.properties?._timestamps).toBeUndefined();
  });

  test('1点の線（Point で書き出される）も属性が戻る', () => {
    const coords = [gnssPoint(0, 4)];
    expect(roundTrip(coords)).toEqual(coords);
  });

  test('長さが点の数と違う配列・数値でない要素は使わない', () => {
    const geojson = exportTrack([internalPoint(0), internalPoint(1)]);
    const properties = geojson.features[0].properties!;
    properties._timestamps = [1];
    properties._accuracies = ['x', 3];
    const coords = geoJson2Data(geojson, layer, 'LINE', 'u', 'n')![0].coords as LocationType[];
    expect(coords[0].timestamp).toBeUndefined();
    expect(coords[0].accuracy).toBeUndefined();
    expect(coords[1].accuracy).toBe(3);
  });

  test('外部ファイル（_id なし）は同名の配列や3番目の0を点の属性に戻さない', () => {
    const geojson: Collection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'a', _timestamps: [1, 2] },
          geometry: {
            type: 'LineString',
            coordinates: [
              [139, 35, 0],
              [139.001, 35.001, 0],
            ],
          },
        },
      ],
    };
    const coords = geoJson2Data(geojson, layer, 'LINE', 'u', 'n')![0].coords as LocationType[];
    expect(coords).toEqual([
      { latitude: 35, longitude: 139 },
      { latitude: 35.001, longitude: 139.001 },
    ]);
  });

  test('自前の書き出しの GeoJSON を単体で取り込むとき、点ごとの配列は項目にしない', () => {
    const geojson = exportTrack([gnssPoint(0, 4), { ...internalPoint(1), altitude: null }]);
    const names = createLayerFromGeoJson(geojson, 'track', 'LINE').field.map((f) => f.name);
    expect(names).toContain('name');
    expect(names.filter((n) => ['_timestamps', '_accuracies', '_speeds', '_fixQualities', '_ellipsoidHeights', '_altitudes'].includes(n))).toEqual([]);
  });
});
