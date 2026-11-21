// 取り込みの細かな判定（KMLのhtml値・_visible・EPSG:4326のURN・XML数値文字参照・CSV列の対応）
import { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import {
  checkGeoJsonCrs,
  countPolygonVertices,
  csv2Data,
  geoJson2Data,
  gpx2Data,
  unguardCSVValue,
  escapeCSVValue,
  generateCSV,
} from '../Geometry';
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

// 約100m四方の外周を細かく（直線上に）歩いた形。直線上の中間点は簡略化で消える
const finePolygon = (perSide: number) => {
  const ring: number[][] = [];
  const corners = [
    [139, 35],
    [139.001, 35],
    [139.001, 35.001],
    [139, 35.001],
  ];
  for (let c = 0; c < 4; c++) {
    const [x0, y0] = corners[c];
    const [x1, y1] = corners[(c + 1) % 4];
    for (let i = 0; i < perSide; i++) ring.push([x0 + ((x1 - x0) * i) / perSide, y0 + ((y1 - y0) * i) / perSide]);
  }
  ring.push(ring[0]);
  return ring;
};

describe('ポリゴンの簡略化（M17）', () => {
  const layerPolygon = makeLayer('POLYGON', [{ id: 'f1', name: 'name', format: 'STRING' }]);
  const polygonCollection = (ring: number[][]) =>
    ({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { name: 'a' }, geometry: { type: 'Polygon', coordinates: [ring] } }],
    }) as unknown as FeatureCollection<Geometry | null, GeoJsonProperties>;

  it('既定では頂点を間引かない', () => {
    const ring = finePolygon(50);
    const records = geoJson2Data(polygonCollection(ring), layerPolygon, 'POLYGON', undefined, null);
    expect(records?.[0].coords).toHaveLength(ring.length);
  });

  it('simplifyPolygons を指定したときだけ間引く', () => {
    const ring = finePolygon(50);
    const records = geoJson2Data(polygonCollection(ring), layerPolygon, 'POLYGON', undefined, null, {
      simplifyPolygons: true,
    });
    const coords = records?.[0].coords as unknown[];
    expect(coords.length).toBeLessThan(ring.length);
    expect(coords.length).toBeGreaterThanOrEqual(4);
  });

  it('countPolygonVertices は Polygon と MultiPolygon の全リング（穴を含む）を数え、他の型や壊れた値は数えない', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [finePolygon(1), finePolygon(1)] } },
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'MultiPolygon', coordinates: [[finePolygon(2)], [finePolygon(1)]] },
        },
        { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } },
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: 'broken' } },
        { type: 'Feature', properties: {}, geometry: null },
        null,
      ],
    } as unknown as FeatureCollection<Geometry | null, GeoJsonProperties>;
    expect(countPolygonVertices(geojson)).toBe(5 + 5 + 9 + 5);
  });
});

describe('CSVの数式対策の \' を取り込み時に外す（L14）', () => {
  it('書き出しで付けた \' だけを外す', () => {
    expect(unguardCSVValue("'=1+1")).toBe('=1+1');
    expect(unguardCSVValue("'-abc")).toBe('-abc');
    expect(unguardCSVValue("'@user")).toBe('@user');
    expect(unguardCSVValue("'-1.5–2")).toBe('-1.5–2');
    expect(unguardCSVValue("'\tx")).toBe('\tx');
  });

  it('書き出しでは付けない形（数値・数式の開始文字以外・\' だけ）はそのまま残す', () => {
    expect(unguardCSVValue("'-3.5")).toBe("'-3.5");
    expect(unguardCSVValue("'abc")).toBe("'abc");
    expect(unguardCSVValue("'")).toBe("'");
    expect(unguardCSVValue('=x')).toBe('=x');
  });

  it('利用者が \' + 数式の開始文字で入力した値・項目名も、書き出し→取り込みで元に戻る', () => {
    for (const value of ["'=A1", "'-メモ", "''@x", "'", "'abc", '=1+1', '-3.5', "'-3.5"]) {
      const written = escapeCSVValue(value);
      expect(unguardCSVValue(written.slice(1, -1).replace(/""/g, '"'))).toBe(value);
    }
    const fields: FieldType[] = [{ id: 'f1', name: "'=x", format: 'STRING' }];
    const csv = generateCSV(
      [{ id: 'R1', userId: undefined, displayName: null, visible: true, redraw: false, coords: undefined, field: { "'=x": "'-メモ" } }],
      fields,
      'NONE'
    );
    const result = csv2Data(csv, 'a.csv', undefined, null);
    expect(result?.layer.field.map((f) => f.name)).toEqual(["'=x"]);
    expect(result?.recordSet[0].field).toEqual({ "'=x": "'-メモ" });
  });

  it('レイヤ設定なしの単体CSVでも、値と項目名の \' を外す', () => {
    const csv = `"'=name",geometry\n"'-abc",POINT(139 35)\n`;
    const result = csv2Data(csv, 'a.csv', undefined, null);
    expect(result?.layer.field.map((f) => f.name)).toEqual(['=name']);
    expect(result?.recordSet[0].field).toEqual({ '=name': '-abc' });
  });
});
