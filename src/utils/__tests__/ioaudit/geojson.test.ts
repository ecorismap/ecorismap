/**
 * インポート/エクスポート監査: GeoJSON
 * geoJson2Data / createLayerFromGeoJson / detectGeoJsonType / generateGeoJson
 * 期待値は「あるべき挙動」。赤になったケースは不具合の候補。
 */
import { geoJson2Data, createLayerFromGeoJson, detectGeoJsonType, generateGeoJson } from '../../Geometry';
import { FieldType, FormatType, LayerType, LocationType, PhotoType, RecordType } from '../../../types';

let mockUlidCounter = 0;
jest.mock('ulid', () => ({ ulid: () => `ID${++mockUlidCounter}` }));

const ALL_FORMATS: FormatType[] = [
  'STRING',
  'STRING_MULTI',
  'STRING_DICTIONARY',
  'STRING_DYNAMIC',
  'SERIAL',
  'DATETIME',
  'DATESTRING',
  'TIMESTRING',
  'TIMERANGE',
  'INTEGER',
  'DECIMAL',
  'NUMBERRANGE',
  'LIST',
  'RADIO',
  'CHECK',
  'PHOTO',
  'TABLE',
  'LISTTABLE',
  'REFERENCE',
];

const makeLayer = (type: LayerType['type'], field: FieldType[], permission: LayerType['permission'] = 'PRIVATE'): LayerType => ({
  id: 'L1',
  name: 'layer',
  type,
  permission,
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
  field,
});

const fields: FieldType[] = ALL_FORMATS.map((format) => ({ id: `f_${format}`, name: format, format }));

const photo = (name: string): PhotoType => ({
  id: `p_${name}`,
  name,
  uri: `file:///photos/${name}`,
  url: null,
  key: null,
  width: 100,
  height: 80,
  thumbnail: 'data:image/jpeg;base64,xxx',
});

const tricky = '日本語😀\n改行\tタブ,カンマ"引用"<tag>&amp;';

const fullFieldValues = (): RecordType['field'] => ({
  STRING: tricky,
  STRING_MULTI: '1行目\n2行目',
  STRING_DICTIONARY: 'ブナ',
  STRING_DYNAMIC: 'dyn',
  SERIAL: 12,
  DATETIME: '2026-11-21T09:30:00+09:00',
  DATESTRING: '2026-11-21',
  TIMESTRING: '09:30',
  TIMERANGE: '09:30-10:45',
  INTEGER: -42,
  DECIMAL: 3.14159,
  NUMBERRANGE: '1-5',
  LIST: '選択肢A',
  RADIO: 'R1',
  CHECK: 'a,b',
  PHOTO: [photo('a.jpg'), photo('b.jpg')],
  TABLE: '',
  LISTTABLE: '',
  REFERENCE: '',
});

const pointRecord = (id: string, coords: LocationType | undefined, field = fullFieldValues()): RecordType => ({
  id,
  userId: 'u1',
  displayName: 'user1',
  visible: true,
  redraw: false,
  coords,
  field,
});

const roundTrip = (records: RecordType[], layer: LayerType) => {
  const exported = generateGeoJson(records, layer.field, layer.type as 'POINT' | 'LINE' | 'POLYGON', layer.name, layer.permission);
  // 実際のファイル経由と同じく文字列化してからparseする
  const parsed = JSON.parse(JSON.stringify(exported));
  return geoJson2Data(parsed, layer, layer.type as 'POINT' | 'LINE' | 'POLYGON', 'u2', 'user2');
};

beforeEach(() => {
  mockUlidCounter = 0;
});

describe('正常系の往復（回帰防止）', () => {
  it('POINT: 写真以外の全型の値が往復で保持される', () => {
    const layer = makeLayer('POINT', fields);
    const rec = pointRecord('r1', { latitude: 35.123456789, longitude: 139.987654321 });
    const result = roundTrip([rec], layer)!;
    expect(result).toHaveLength(1);
    expect(result[0].coords).toEqual({ latitude: 35.123456789, longitude: 139.987654321 });
    const { PHOTO: _p, ...expected } = rec.field;
    const { PHOTO: _q, ...actual } = result[0].field;
    expect(actual).toEqual(expected);
  });

  it('POINT: 位置なしレコード（coords undefined）は位置なしのまま戻る', () => {
    const layer = makeLayer('POINT', [{ id: 'f1', name: 'name', format: 'STRING' }]);
    const result = roundTrip([pointRecord('r1', undefined, { name: 'x' })], layer)!;
    expect(result).toHaveLength(1);
    expect(result[0].coords).toBeUndefined();
    expect(result[0].field.name).toBe('x');
  });

  it('LINE: 座標列が往復で保持される', () => {
    const layer = makeLayer('LINE', [{ id: 'f1', name: 'name', format: 'STRING' }]);
    const coords = [
      { latitude: 35, longitude: 139 },
      { latitude: 35.001, longitude: 139.001 },
      { latitude: 35.002, longitude: 139.0005 },
    ];
    const result = roundTrip([{ ...pointRecord('r1', undefined, { name: 'l' }), coords }], layer)!;
    expect(result).toHaveLength(1);
    expect(result[0].coords).toEqual(coords);
  });

  it('POLYGON: 単純な四角＋穴が往復で保持される', () => {
    const layer = makeLayer('POLYGON', [{ id: 'f1', name: 'name', format: 'STRING' }]);
    const outer = [
      { latitude: 35, longitude: 139 },
      { latitude: 35, longitude: 139.01 },
      { latitude: 35.01, longitude: 139.01 },
      { latitude: 35.01, longitude: 139 },
      { latitude: 35, longitude: 139 },
    ];
    const hole = [
      { latitude: 35.004, longitude: 139.004 },
      { latitude: 35.006, longitude: 139.004 },
      { latitude: 35.006, longitude: 139.006 },
      { latitude: 35.004, longitude: 139.006 },
      { latitude: 35.004, longitude: 139.004 },
    ];
    const rec = { ...pointRecord('r1', undefined, { name: 'pg' }), coords: outer, holes: { hole0: hole } };
    const result = roundTrip([rec], layer)!;
    expect(result).toHaveLength(1);
    expect(result[0].coords).toEqual(outer);
    expect(result[0].holes).toEqual({ hole0: hole });
  });

  it('displayNameという名前のフィールドがあっても値が衝突しない', () => {
    const layer = makeLayer('POINT', [{ id: 'f1', name: 'displayName', format: 'STRING' }]);
    const gj = generateGeoJson(
      [pointRecord('r1', { latitude: 35, longitude: 139 }, { displayName: '項目値' })],
      layer.field,
      'POINT',
      'x',
      'PRIVATE'
    ) as any;
    expect(gj.features[0].properties.displayName).toBe('項目値');
    expect(gj.features[0].properties.displayName_).toBe('user1');
  });
});

describe('detectGeoJsonType', () => {
  it('各ジオメトリ型を判定する', () => {
    const fc = (geometry: any) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry }] }) as any;
    expect(detectGeoJsonType(fc({ type: 'Point', coordinates: [0, 0] }))).toBe('POINT');
    expect(detectGeoJsonType(fc({ type: 'MultiPoint', coordinates: [[0, 0]] }))).toBe('MULTIPOINT');
    expect(detectGeoJsonType(fc({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }))).toBe('LINE');
    expect(detectGeoJsonType(fc({ type: 'MultiLineString', coordinates: [] }))).toBe('MULTILINE');
    expect(detectGeoJsonType(fc({ type: 'Polygon', coordinates: [] }))).toBe('POLYGON');
    expect(detectGeoJsonType(fc({ type: 'MultiPolygon', coordinates: [] }))).toBe('MULTIPOLYGON');
    expect(detectGeoJsonType(fc({ type: 'GeometryCollection', geometries: [] }))).toBe('NONE');
  });

  it('featuresが空の FeatureCollection で例外を投げない', () => {
    expect(() => detectGeoJsonType({ type: 'FeatureCollection', features: [] } as any)).not.toThrow();
  });

  it('FeatureCollectionでない単体Feature / Geometry単体で例外を投げない', () => {
    expect(() =>
      detectGeoJsonType({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [139, 35] } } as any)
    ).not.toThrow();
    expect(() => detectGeoJsonType({ type: 'Point', coordinates: [139, 35] } as any)).not.toThrow();
  });

  it('先頭要素がnullでも例外を投げない', () => {
    expect(() =>
      detectGeoJsonType({
        type: 'FeatureCollection',
        features: [null, { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [139, 35] } }],
      } as any)
    ).not.toThrow();
  });

  it('先頭フィーチャーのgeometryがnullでも、後続のPointからPOINTと判定する', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { a: 1 }, geometry: null },
        { type: 'Feature', properties: { a: 2 }, geometry: { type: 'Point', coordinates: [139, 35] } },
      ],
    } as any;
    expect(detectGeoJsonType(geojson)).toBe('POINT');
  });
});

describe('単体ファイル取り込みのパイプライン（loadGeojsonと同じ detect→createLayer→geoJson2Data）', () => {
  const importPipeline = (geojson: any) => {
    const type = detectGeoJsonType(geojson);
    const layer = createLayerFromGeoJson(geojson, 'file.geojson', type);
    return { type, layer, records: geoJson2Data(geojson, layer, type, 'u', 'n') };
  };

  // 混在した型は useGeoFile が型ごとにレイヤを分けて取り込む（M10）。geoJson2Data 単体を1つの型で通すこのテストの組み立てでは表せない。
  // 実際の取り込み経路は src/hooks/__tests__/useGeoFile.importNotices.test.ts の「点と線が混在」で確かめている
  it.skip('Point と Polygon が混在したファイルで、Polygonが黙って捨てられない', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { name: 'p' }, geometry: { type: 'Point', coordinates: [139, 35] } },
        {
          type: 'Feature',
          properties: { name: 'pg' },
          geometry: { type: 'Polygon', coordinates: [[[139, 35], [139.1, 35], [139.1, 35.1], [139, 35]]] },
        },
      ],
    };
    const { records } = importPipeline(geojson);
    // 取り込めた件数がファイルの件数と一致すべき（もしくは取り込めない旨が分かるべき）
    expect(records!.length).toBe(2);
  });

  // 上と同じ理由（型ごとのレイヤ分けは useGeoFile 側。M10）
  it.skip('LineString と MultiLineString が混在（QGIS出力で頻出）しても全線が取り込まれる', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { n: 1 }, geometry: { type: 'LineString', coordinates: [[139, 35], [139.1, 35.1]] } },
        {
          type: 'Feature',
          properties: { n: 2 },
          geometry: { type: 'MultiLineString', coordinates: [[[139, 35], [139.2, 35.2]]] },
        },
      ],
    };
    const { records } = importPipeline(geojson);
    expect(records!.length).toBe(2);
  });

  it('2件目以降のフィーチャーにしかない属性キーも項目として作られる', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { a: 'x' }, geometry: { type: 'Point', coordinates: [139, 35] } },
        { type: 'Feature', properties: { a: 'y', b: 'only2nd' }, geometry: { type: 'Point', coordinates: [139, 35] } },
      ],
    };
    const { layer, records } = importPipeline(geojson);
    expect(layer.field.map((f) => f.name)).toEqual(['a', 'b']);
    expect(records![1].field.b).toBe('only2nd');
  });

  it('先頭フィーチャーのpropertiesがnullでも、後続の属性が項目になる', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: null, geometry: { type: 'Point', coordinates: [139, 35] } },
        { type: 'Feature', properties: { a: 'y' }, geometry: { type: 'Point', coordinates: [139, 35] } },
      ],
    };
    const { layer } = importPipeline(geojson);
    expect(layer.field.map((f) => f.name)).toEqual(['a']);
  });

  it('全フィーチャーのgeometryがnull（属性のみ）でも件数ぶん取り込まれる', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { a: '1' }, geometry: null },
        { type: 'Feature', properties: { a: '2' }, geometry: null },
      ],
    };
    const { records } = importPipeline(geojson);
    expect(records!.length).toBe(2);
  });
});

describe('geoJson2Data: 入力の形と境界', () => {
  const layerP = makeLayer('POINT', [{ id: 'f1', name: 'name', format: 'STRING' }]);

  it('FeatureCollectionでない単体Featureは例外なくundefinedを返す', () => {
    expect(
      geoJson2Data({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [139, 35] } } as any, layerP, 'POINT', 'u', 'n')
    ).toBeUndefined();
  });

  it('null / 配列 / 文字列のトップレベルで例外を投げない', () => {
    expect(geoJson2Data(null as any, layerP, 'POINT', 'u', 'n')).toBeUndefined();
    expect(geoJson2Data([] as any, layerP, 'POINT', 'u', 'n')).toBeUndefined();
    expect(geoJson2Data('x' as any, layerP, 'POINT', 'u', 'n')).toBeUndefined();
  });

  it('features内のnull、GeometryCollection、範囲外・非数値の座標は除外されクラッシュしない', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        null,
        { type: 'Feature', properties: { name: 'gc' }, geometry: { type: 'GeometryCollection', geometries: [] } },
        { type: 'Feature', properties: { name: 'bad' }, geometry: { type: 'Point', coordinates: ['139', '35'] } },
        { type: 'Feature', properties: { name: 'out' }, geometry: { type: 'Point', coordinates: [200, 95] } },
        { type: 'Feature', properties: { name: 'empty' }, geometry: { type: 'Point', coordinates: [] } },
        { type: 'Feature', properties: { name: 'ok' }, geometry: { type: 'Point', coordinates: [139, 35] } },
      ],
    } as any;
    const r = geoJson2Data(geojson, layerP, 'POINT', 'u', 'n')!;
    expect(r.map((x) => x.field.name)).toEqual(['ok']);
  });

  it('id・bbox・foreign memberがあっても取り込める', () => {
    const geojson = {
      type: 'FeatureCollection',
      bbox: [139, 35, 140, 36],
      features: [
        { type: 'Feature', id: 7, bbox: [139, 35, 139, 35], foo: 'bar', properties: { name: 'a' }, geometry: { type: 'Point', coordinates: [139, 35] } },
      ],
    } as any;
    expect(geoJson2Data(geojson, layerP, 'POINT', 'u', 'n')!).toHaveLength(1);
  });

  it('3次元座標の標高（3番目の値）が保持される', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { name: 'a' }, geometry: { type: 'Point', coordinates: [139, 35, 1234.5] } }],
    } as any;
    const r = geoJson2Data(geojson, layerP, 'POINT', 'u', 'n')!;
    expect((r[0].coords as LocationType).altitude).toBe(1234.5);
  });

  it('MultiPoint / MultiLineString / MultiPolygon はパートごとのレコードになり属性が複製される', () => {
    const mp = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { name: 'm' }, geometry: { type: 'MultiPoint', coordinates: [[139, 35], [139.1, 35.1]] } }],
    } as any;
    const r1 = geoJson2Data(mp, layerP, 'MULTIPOINT', 'u', 'n')!;
    expect(r1.map((r) => r.field.name)).toEqual(['m', 'm']);
    expect(new Set(r1.map((r) => r.id)).size).toBe(2);

    const ml = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { name: 'l' }, geometry: { type: 'MultiLineString', coordinates: [[[139, 35], [139.1, 35]], [[139, 36], [139.1, 36]]] } },
      ],
    } as any;
    expect(geoJson2Data(ml, makeLayer('LINE', layerP.field), 'MULTILINE', 'u', 'n')!).toHaveLength(2);

    const mpg = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'g' },
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [[[139, 35], [139.01, 35], [139.01, 35.01], [139, 35]]],
              [[[140, 35], [140.01, 35], [140.01, 35.01], [140, 35]]],
            ],
          },
        },
      ],
    } as any;
    expect(geoJson2Data(mpg, makeLayer('POLYGON', layerP.field), 'MULTIPOLYGON', 'u', 'n')!).toHaveLength(2);
  });

  it('LINE: geometryがnullのフィーチャーが1件混ざっても、他の線は取り込まれる', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { name: 'a' }, geometry: { type: 'LineString', coordinates: [[139, 35], [139.1, 35.1]] } },
        { type: 'Feature', properties: { name: 'b' }, geometry: null },
      ],
    } as any;
    const r = geoJson2Data(geojson, makeLayer('LINE', layerP.field), 'LINE', 'u', 'n');
    expect(r).toBeDefined();
    expect(r!.map((x) => x.field.name)).toContain('a');
  });

  it('POLYGON: geometryがnullのフィーチャーが1件混ざっても、他の面は取り込まれる', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'a' },
          geometry: { type: 'Polygon', coordinates: [[[139, 35], [139.01, 35], [139.01, 35.01], [139, 35]]] },
        },
        { type: 'Feature', properties: { name: 'b' }, geometry: null },
      ],
    } as any;
    const r = geoJson2Data(geojson, makeLayer('POLYGON', layerP.field), 'POLYGON', 'u', 'n');
    expect(r).toBeDefined();
    expect(r!.map((x) => x.field.name)).toContain('a');
  });

  it('POLYGON: 閉じていないリングが1件あっても、他の面は取り込まれる', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'ok' },
          geometry: { type: 'Polygon', coordinates: [[[139, 35], [139.01, 35], [139.01, 35.01], [139, 35]]] },
        },
        {
          type: 'Feature',
          properties: { name: 'open' },
          geometry: { type: 'Polygon', coordinates: [[[139, 35], [139.01, 35], [139.01, 35.01], [139, 35.01]]] },
        },
      ],
    } as any;
    const r = geoJson2Data(geojson, makeLayer('POLYGON', layerP.field), 'POLYGON', 'u', 'n');
    expect(r).toBeDefined();
    expect(r!.map((x) => x.field.name)).toContain('ok');
  });

  it('POLYGON: 頂点が3点未満のリング（退化ポリゴン）でも全体が失敗しない', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'ok' },
          geometry: { type: 'Polygon', coordinates: [[[139, 35], [139.01, 35], [139.01, 35.01], [139, 35]]] },
        },
        { type: 'Feature', properties: { name: 'tiny' }, geometry: { type: 'Polygon', coordinates: [[[139, 35], [139, 35]]] } },
      ],
    } as any;
    const r = geoJson2Data(geojson, makeLayer('POLYGON', layerP.field), 'POLYGON', 'u', 'n');
    expect(r).toBeDefined();
    expect(r!.map((x) => x.field.name)).toContain('ok');
  });

  it('巨大座標数（20万点のLineString）でも取り込める', () => {
    const coords: number[][] = [];
    for (let i = 0; i < 200000; i++) coords.push([139 + i * 1e-6, 35 + (i % 2) * 1e-6]);
    const geojson = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { name: 'big' }, geometry: { type: 'LineString', coordinates: coords } }],
    } as any;
    const t = Date.now();
    const r = geoJson2Data(geojson, makeLayer('LINE', layerP.field), 'LINE', 'u', 'n')!;
    expect(r).toHaveLength(1);
    expect((r[0].coords as LocationType[]).length).toBe(200000);
    expect(Date.now() - t).toBeLessThan(10000);
  });
});

describe('geoJson2Data: CRS', () => {
  const layerP = makeLayer('POINT', [{ id: 'f1', name: 'name', format: 'STRING' }]);
  const fc = (crs: any) =>
    ({
      type: 'FeatureCollection',
      crs,
      features: [{ type: 'Feature', properties: { name: 'a' }, geometry: { type: 'Point', coordinates: [139, 35] } }],
    }) as any;

  it('CRS84 / EPSG:4326 / crsなし は取り込める', () => {
    expect(geoJson2Data(fc(undefined), layerP, 'POINT', 'u', 'n')).toHaveLength(1);
    expect(geoJson2Data(fc({ type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } }), layerP, 'POINT', 'u', 'n')).toHaveLength(1);
    expect(geoJson2Data(fc({ type: 'name', properties: { name: 'EPSG:4326' } }), layerP, 'POINT', 'u', 'n')).toHaveLength(1);
  });

  it('URN形式の urn:ogc:def:crs:EPSG::4326 も WGS84 として取り込める', () => {
    expect(geoJson2Data(fc({ type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } }), layerP, 'POINT', 'u', 'n')).toHaveLength(1);
  });

  it('投影座標系（EPSG:3857）は取り込まない', () => {
    expect(geoJson2Data(fc({ type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::3857' } }), layerP, 'POINT', 'u', 'n')).toBeUndefined();
  });

  it('crs.propertiesが欠けていても例外を投げない', () => {
    expect(() => geoJson2Data(fc({ type: 'name' }), layerP, 'POINT', 'u', 'n')).not.toThrow();
  });
});

describe('geoJson2Data: 属性値', () => {
  const mk = (props: any) =>
    ({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [139, 35] } }],
    }) as any;

  it('日本語・絵文字・改行・タブ・カンマ・引用符・<>&、負数・小数・巨大数はそのまま保持される', () => {
    const layer = makeLayer('POINT', [
      { id: 'f1', name: 's', format: 'STRING' },
      { id: 'f2', name: 'neg', format: 'INTEGER' },
      { id: 'f3', name: 'dec', format: 'DECIMAL' },
      { id: 'f4', name: 'big', format: 'DECIMAL' },
    ]);
    const r = geoJson2Data(mk({ s: tricky, neg: -5, dec: 0.000123, big: 1e21 }), layer, 'POINT', 'u', 'n')!;
    expect(r[0].field).toEqual({ s: tricky, neg: -5, dec: 0.000123, big: 1e21 });
  });

  it('数値0は空文字にならず0のまま保持される', () => {
    const layer = makeLayer('POINT', [
      { id: 'f1', name: 'i', format: 'INTEGER' },
      { id: 'f2', name: 'd', format: 'DECIMAL' },
      { id: 'f3', name: 's', format: 'SERIAL' },
    ]);
    const r = geoJson2Data(mk({ i: 0, d: 0, s: 0 }), layer, 'POINT', 'u', 'n')!;
    expect(r[0].field).toEqual({ i: 0, d: 0, s: 0 });
  });

  it('null / 欠落は空文字になる', () => {
    const layer = makeLayer('POINT', [
      { id: 'f1', name: 'a', format: 'STRING' },
      { id: 'f2', name: 'b', format: 'STRING' },
    ]);
    const r = geoJson2Data(mk({ a: null }), layer, 'POINT', 'u', 'n')!;
    expect(r[0].field).toEqual({ a: '', b: '' });
  });

  it('入れ子オブジェクト・配列・真偽値の属性は string|number に正規化される（RecordTypeの型を守る）', () => {
    const layer = makeLayer('POINT', [
      { id: 'f1', name: 'obj', format: 'STRING' },
      { id: 'f2', name: 'arr', format: 'STRING' },
      { id: 'f3', name: 'flag', format: 'STRING' },
    ]);
    const r = geoJson2Data(mk({ obj: { k: 'v' }, arr: [1, 2], flag: true }), layer, 'POINT', 'u', 'n')!;
    for (const v of Object.values(r[0].field)) {
      expect(['string', 'number']).toContain(typeof v);
    }
  });

  it('"__proto__" という属性名でもプロトタイプが書き換わらず値が保持される', () => {
    const geojson = JSON.parse(
      '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"__proto__":{"polluted":"yes"},"name":"a"},"geometry":{"type":"Point","coordinates":[139,35]}}]}'
    );
    const layer = createLayerFromGeoJson(geojson, 'x', 'POINT');
    const r = geoJson2Data(geojson, layer, 'POINT', 'u', 'n')!;
    expect(({} as any).polluted).toBeUndefined();
    expect((r[0].field as any).polluted).toBeUndefined();
  });
});

describe('ZIP往復（レイヤ設定jsonのfieldで取り込む経路）での保持', () => {
  // 写真は ZIP 取り込み時に useGeoFile（restorePhotosFromZip）が同梱ファイルと照合して戻す設計（M3）。
  // geoJson2Data 単体で名前だけの写真を作るとリンク切れが残るため PHOTO は [] のまま。経路の確認は ecorismap-zip.test.ts の写真の往復テスト
  it.skip('PHOTO: 写真の参照（ファイル名）が往復で失われない', () => {
    const layer = makeLayer('POINT', fields);
    const rec = pointRecord('r1', { latitude: 35, longitude: 139 });
    const exported = generateGeoJson([rec], layer.field, 'POINT', 'x', 'PRIVATE') as any;
    expect(exported.features[0].properties.PHOTO).toBe('a.jpg,b.jpg');
    const result = roundTrip([rec], layer)!;
    expect((result[0].field.PHOTO as PhotoType[]).map((p) => p.name)).toEqual(['a.jpg', 'b.jpg']);
  });

  it('非表示（visible=false）のレコードは非表示のまま戻る', () => {
    const layer = makeLayer('POINT', [{ id: 'f1', name: 'name', format: 'STRING' }]);
    const result = roundTrip([{ ...pointRecord('r1', { latitude: 35, longitude: 139 }, { name: 'h' }), visible: false }], layer)!;
    expect(result[0].visible).toBe(false);
  });

  it('LINE: 位置なしレコード（geometry null で書き出される）が混ざっても取り込みが全体失敗しない', () => {
    const layer = makeLayer('LINE', [{ id: 'f1', name: 'name', format: 'STRING' }]);
    const line = {
      ...pointRecord('r1', undefined, { name: 'line' }),
      coords: [
        { latitude: 35, longitude: 139 },
        { latitude: 35.1, longitude: 139.1 },
      ],
    };
    const noGeom = pointRecord('r2', undefined, { name: 'nogeom' });
    const result = roundTrip([line, noGeom], layer);
    expect(result).toBeDefined();
    expect(result!.map((r) => r.field.name)).toContain('line');
  });

  it('POLYGON: 位置なしレコードが混ざっても取り込みが全体失敗しない', () => {
    const layer = makeLayer('POLYGON', [{ id: 'f1', name: 'name', format: 'STRING' }]);
    const pg = {
      ...pointRecord('r1', undefined, { name: 'pg' }),
      coords: [
        { latitude: 35, longitude: 139 },
        { latitude: 35, longitude: 139.01 },
        { latitude: 35.01, longitude: 139.01 },
        { latitude: 35, longitude: 139 },
      ],
    };
    const result = roundTrip([pg, pointRecord('r2', undefined, { name: 'nogeom' })], layer);
    expect(result).toBeDefined();
    expect(result!.map((r) => r.field.name)).toContain('pg');
  });

  it('POLYGON: 細かい頂点（GPSで歩いた外周など）が往復で間引かれない', () => {
    const layer = makeLayer('POLYGON', [{ id: 'f1', name: 'name', format: 'STRING' }]);
    // 半径約50mの円を360頂点で表したポリゴン
    const ring: LocationType[] = [];
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * 2 * Math.PI;
      ring.push({ latitude: 35 + 0.00045 * Math.sin(a), longitude: 139 + 0.00055 * Math.cos(a) });
    }
    ring.push({ ...ring[0] });
    const result = roundTrip([{ ...pointRecord('r1', undefined, { name: 'circle' }), coords: ring }], layer)!;
    expect((result[0].coords as LocationType[]).length).toBe(ring.length);
  });

  it('手書き（マップメモ）レイヤ: ストロークの色・太さ（_strokeColor等）が往復で保持される', () => {
    // _strokeColor等はレイヤのfieldに含まれない（属性一覧に出さない内部項目）
    const layer = makeLayer('LINE', [{ id: 'f1', name: 'name', format: 'STRING' }]);
    const rec: RecordType = {
      ...pointRecord('r1', undefined, { name: 'memo', _strokeColor: 'rgba(0,0,255,1)', _strokeWidth: 4, _strokeStyle: '' }),
      coords: [
        { latitude: 35, longitude: 139 },
        { latitude: 35.1, longitude: 139.1 },
      ],
    };
    const result = roundTrip([rec], layer)!;
    expect(result[0].field._strokeColor).toBe('rgba(0,0,255,1)');
    expect(result[0].field._strokeWidth).toBe(4);
  });

  it('LINEレイヤの1点だけのレコード（スタンプ、Pointで書き出される）が往復で消えない', () => {
    const layer = makeLayer('LINE', [{ id: 'f1', name: 'name', format: 'STRING' }]);
    const line: RecordType = {
      ...pointRecord('r1', undefined, { name: 'line', _strokeColor: 'rgba(0,0,0,1)' }),
      coords: [
        { latitude: 35, longitude: 139 },
        { latitude: 35.1, longitude: 139.1 },
      ],
    };
    const stamp: RecordType = {
      ...pointRecord('r2', undefined, { name: 'stamp', _strokeColor: 'rgba(0,0,0,1)', _stamp: 'CIRCLE' }),
      coords: [{ latitude: 35.05, longitude: 139.05 }],
    };
    const exported = generateGeoJson([line, stamp], layer.field, 'LINE', 'x') as any;
    expect(exported.features[1].geometry.type).toBe('Point');
    const result = roundTrip([line, stamp], layer)!;
    expect(result.map((r) => r.field.name)).toEqual(['line', 'stamp']);
  });
});

describe('ZIP取り込みのMULTIフォールバック込み（useGeoFile.loadZipと同じ: 失敗/0件ならMULTI型で再試行）', () => {
  const zipImport = (geojson: any, layer: LayerType) => {
    const type = layer.type as 'LINE' | 'POLYGON';
    const r = geoJson2Data(geojson, layer, type, 'u', 'n');
    if (r && r.length > 0) return r;
    return geoJson2Data(geojson, layer, `MULTI${type}` as any, 'u', 'n');
  };

  it('LINEレイヤ: 線＋位置なしレコードのZIPを取り込むと、線が失われず位置なしだけが残る、ということが起きない', () => {
    const layer = makeLayer('LINE', [{ id: 'f1', name: 'name', format: 'STRING' }]);
    const line = {
      ...pointRecord('r1', undefined, { name: 'line' }),
      coords: [
        { latitude: 35, longitude: 139 },
        { latitude: 35.1, longitude: 139.1 },
      ],
    };
    const exported = JSON.parse(
      JSON.stringify(generateGeoJson([line, pointRecord('r2', undefined, { name: 'nogeom' })], layer.field, 'LINE', 'x'))
    );
    const r = zipImport(exported, layer);
    expect(r!.map((x) => x.field.name)).toContain('line');
  });
});
