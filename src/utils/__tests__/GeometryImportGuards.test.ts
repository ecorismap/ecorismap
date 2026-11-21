// 取り込みの細かな判定（KMLのhtml値・_visible・EPSG:4326のURN・XML数値文字参照・CSV列の対応）
import { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import { checkGeoJsonCrs, csv2Data, geoJson2Data, gpx2Data } from '../Geometry';
import { FieldType, LayerType } from '../../types';

let mockUlidCounter = 0;
jest.mock('ulid', () => ({ ulid: () => `ID${++mockUlidCounter}` }));

const makeLayer = (type: LayerType['type'], field: FieldType[]): LayerType => ({
  id: 'L1',
  name: 'layer',
  type,
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
  field,
});

const pointCollection = (properties: GeoJsonProperties, crs?: unknown) =>
  ({
    type: 'FeatureCollection',
    ...(crs !== undefined && { crs }),
    features: [{ type: 'Feature', properties, geometry: { type: 'Point', coordinates: [139, 35] } }],
  }) as unknown as FeatureCollection<Geometry | null, GeoJsonProperties>;

const layerP = makeLayer('POINT', [{ id: 'f1', name: 'name', format: 'STRING' }]);

describe('KMLのhtml値の取り出し', () => {
  it('@type が html のときだけ value を文字列として取り出す', () => {
    const [record] = geoJson2Data(pointCollection({ name: { '@type': 'html', value: '<b>x</b>' } }), layerP, 'POINT', 'u', 'n')!;
    expect(record.field.name).toBe('<b>x</b>');
  });

  it('value キーを持つだけの入れ子オブジェクトは JSON 文字列のまま', () => {
    const [record] = geoJson2Data(pointCollection({ name: { value: 'x', unit: 'm' } }), layerP, 'POINT', 'u', 'n')!;
    expect(record.field.name).toBe(JSON.stringify({ value: 'x', unit: 'm' }));
  });
});

describe('_visible の復元', () => {
  it('自前の書き出し（_id あり）の _visible:false は非表示で戻す', () => {
    const [record] = geoJson2Data(pointCollection({ name: 'a', _id: 'r1', _visible: false }), layerP, 'POINT', 'u', 'n')!;
    expect(record.visible).toBe(false);
  });

  it('外部ファイル（_id なし）の _visible:false では非表示にしない', () => {
    const [record] = geoJson2Data(pointCollection({ name: 'a', _visible: false }), layerP, 'POINT', 'u', 'n')!;
    expect(record.visible).toBe(true);
  });
});

describe('EPSG:4326 の URN', () => {
  const check = (name: string) => checkGeoJsonCrs(pointCollection({}, { type: 'name', properties: { name } }));

  it.each(['urn:ogc:def:crs:EPSG::4326', 'urn:ogc:def:crs:EPSG:4326', 'urn:ogc:def:crs:EPSG:6.6:4326', 'urn:ogc:def:crs:OGC:1.3:CRS84', 'CRS84'])(
    '%s は取り込める',
    (name) => {
      expect(check(name).ok).toBe(true);
    }
  );

  it.each(['urn:ogc:def:crs:EPSG::3857', 'urn:ogc:def:crs:EPSG:43264', 'urn:ogc:def:crs:EPSG:x:4326'])('%s は取り込まない', (name) => {
    expect(check(name).ok).toBe(false);
  });
});

describe('XMLの数値文字参照', () => {
  const nameOf = (text: string) =>
    gpx2Data(
      `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><wpt lat="1" lon="1"><name>${text}</name></wpt></gpx>`,
      'POINT',
      't.gpx',
      'u',
      'n'
    )!.recordSet[0].field.name;

  it('XMLのCharの範囲内は復号する', () => {
    expect(nameOf('a&#9;b&#x1F600;&#xE000;')).toBe('a\tb\u{1F600}');
  });

  it('範囲外（制御文字・サロゲート・FFFE/FFFF）は復号せずそのまま残す', () => {
    expect(nameOf('&#0;&#x1;&#xD800;&#xFFFE;&#xFFFF;&#x110000;')).toBe('&#0;&#x1;&#xD800;&#xFFFE;&#xFFFF;&#x110000;');
  });
});

describe('CSV（レイヤ設定あり）の列の対応', () => {
  it('displayName 列・geometry 列と同名の項目はそこから拾わない', () => {
    const layer = makeLayer('POINT', [
      { id: 'f1', name: 'displayName', format: 'STRING' },
      { id: 'f2', name: 'geometry', format: 'STRING' },
    ]);
    const csv = 'displayName,a,b,geometry\nuser1,A,B,POINT(139 35)\n';
    const result = csv2Data(csv, 't.csv', 'u', 'n', layer)!;
    expect(result.recordSet[0].field.displayName).toBe('A');
    expect(result.recordSet[0].field.geometry).toBe('B');
  });
});
