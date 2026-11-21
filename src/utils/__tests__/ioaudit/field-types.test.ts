/**
 * 監査: 項目型ごとの書き出し→取り込みの往復（CSV/GeoJSON/KML/GPX/レイヤZIP）
 *
 * レイヤZIP（generateExportGeoData→loadZip）の取り込み経路は
 *   POINT/LINE/POLYGON: JSON(レイヤ設定) + GeoJSON → geoJson2Data(geojson, layer, type)
 *   NONE:              JSON(レイヤ設定) + CSV     → csv2Data(csv, name, uid, dn, layer)
 * なので、ここではその関数の組み合わせで再現する（useGeoFile.loadZip と同じ呼び方）。
 * 単体ファイルの取り込み（.csv/.geojson/.kml/.gpx）はレイヤ設定が無い経路として扱う。
 *
 * 「あるべき挙動」を期待値にしているため、赤のテストは不具合候補。
 */
import {
  csv2Data,
  gpx2Data,
  geoJson2Data,
  generateCSV,
  generateKML,
  generateGPX,
  generateGeoJson,
  createLayerFromGeoJson,
  detectGeoJsonType,
} from '../../Geometry';
import { LayerType, RecordType, PhotoType, FieldType, FormatType } from '../../../types';
import { kml as kml2geojson } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';
import dayjs from '../../../i18n/dayjs';

let mockIdCounter = 0;
jest.mock('ulid', () => ({ ulid: () => `ulid-${++mockIdCounter}` }));

const NDASH = '–';

const photo = (name: string): PhotoType => ({
  id: `p-${name}`,
  name,
  uri: `file:///photos/${name}`,
  url: null,
  key: null,
  width: 100,
  height: 80,
  thumbnail: 'data:image/jpeg;base64,AAAA',
});

const f = (name: string, format: FormatType, extra: Partial<FieldType> = {}): FieldType => ({
  id: `fid-${name}`,
  name,
  format,
  ...extra,
});

// 全項目型を持つレイヤ
const FIELDS: FieldType[] = [
  f('str', 'STRING'),
  f('multi', 'STRING_MULTI'),
  f('dict', 'STRING_DICTIONARY'),
  f('serial', 'SERIAL'),
  f('dt', 'DATETIME'),
  f('ds', 'DATESTRING'),
  f('ts', 'TIMESTRING'),
  f('tr', 'TIMERANGE'),
  f('int', 'INTEGER'),
  f('dec', 'DECIMAL'),
  f('nr', 'NUMBERRANGE'),
  f('list', 'LIST', { list: [{ value: 'A', isOther: false, customFieldValue: '' }] }),
  f('radio', 'RADIO', { list: [{ value: 'X', isOther: false, customFieldValue: '' }] }),
  f('check', 'CHECK', {
    list: [
      { value: 'a', isOther: false, customFieldValue: '' },
      { value: 'b', isOther: false, customFieldValue: '' },
    ],
  }),
  f('photo', 'PHOTO'),
  f('table', 'TABLE'),
  f('ltable', 'LISTTABLE'),
  f('ref', 'REFERENCE'),
];

const makeLayer = (type: LayerType['type'], fields: FieldType[] = FIELDS): LayerType => ({
  id: 'layer-1',
  name: 'audit',
  type,
  permission: 'PRIVATE',
  colorStyle: {
    colorType: 'SINGLE',
    transparency: 0.2,
    color: 'rgba(255,0,0,0.7)',
    fieldName: 'str',
    customFieldValue: '',
    colorRamp: 'RANDOM',
    colorList: [],
    lineWidth: 1.5,
  },
  label: 'str',
  visible: true,
  active: false,
  field: fields,
});

// 典型的な入力済みの値（アプリが実際に保存する型で持つ: 数値はnumber、CHECK/TABLEはカンマ連結文字列）
const typicalField = (): RecordType['field'] => ({
  str: '日本語😀 <a&b> "q", tab\there',
  multi: '1行目\n2行目',
  dict: 'ヤマザクラ',
  serial: 3,
  dt: '2026-11-21T10:20:30+09:00',
  ds: '2026/11/21',
  ts: '10:20',
  tr: `10:20${NDASH}11:30`,
  int: -42,
  dec: 3.14159,
  nr: `1.5${NDASH}2.5`,
  list: 'A',
  radio: 'X',
  check: 'a,b',
  photo: [photo('IMG_0001.jpg'), photo('IMG_0002.jpg')],
  table: 'a|1,b|2',
  ltable: 'A|1,B|2',
  ref: 'parent-key-1',
});

const pointRecord = (field: RecordType['field'], extra: Partial<RecordType> = {}): RecordType => ({
  id: 'rec-1',
  userId: 'u1',
  displayName: 'user1',
  visible: true,
  redraw: false,
  coords: { latitude: 35.123456789, longitude: 139.987654321 },
  field,
  ...extra,
});

// ---- 経路ヘルパー --------------------------------------------------------
/** レイヤZIP（GeoJSON経路）: generateExportGeoData → loadZip と同じ呼び方 */
const zipGeoJsonRoundTrip = (records: RecordType[], layer: LayerType) => {
  const type = layer.type as 'POINT' | 'LINE' | 'POLYGON';
  const json = JSON.stringify(generateGeoJson(records, layer.field, type, layer.name, layer.permission));
  const layerJson = JSON.parse(JSON.stringify(layer)) as LayerType;
  const result = geoJson2Data(JSON.parse(json), layerJson, type, 'u2', 'user2');
  if (result === undefined) throw new Error('geoJson2Data returned undefined');
  return result;
};

/** レイヤZIP（NONEレイヤ=CSV経路） */
const zipCsvRoundTrip = (records: RecordType[], layer: LayerType) => {
  const csv = generateCSV(records, layer.field, layer.type);
  const result = csv2Data(csv, 'audit.zip', 'u2', 'user2', JSON.parse(JSON.stringify(layer)));
  if (result === undefined) throw new Error('csv2Data returned undefined');
  return result.recordSet;
};

/** 単体.geojsonファイル（レイヤ設定なし） */
const standaloneGeoJson = (records: RecordType[], layer: LayerType) => {
  const type = layer.type as 'POINT' | 'LINE' | 'POLYGON';
  const geojson = JSON.parse(JSON.stringify(generateGeoJson(records, layer.field, type, layer.name, layer.permission)));
  const detected = detectGeoJsonType(geojson);
  const newLayer = createLayerFromGeoJson(geojson, 'audit.geojson', detected);
  return { layer: newLayer, records: geoJson2Data(geojson, newLayer, detected, 'u2', 'user2')! };
};

/** 単体.kml（useGeoFile.loadKml と同じ: togeojson → createLayerFromGeoJson → geoJson2Data） */
const standaloneKml = (records: RecordType[], layer: LayerType) => {
  const kmlString = generateKML(records, layer);
  const xml = new DOMParser().parseFromString(kmlString, 'text/xml');
  //@ts-ignore
  const geojson = kml2geojson(xml);
  const detected = detectGeoJsonType(geojson);
  const newLayer = createLayerFromGeoJson(geojson, 'audit.kml', detected);
  return { kmlString, geojson, layer: newLayer, records: geoJson2Data(geojson, newLayer, detected, 'u2', 'user2')! };
};

beforeEach(() => {
  mockIdCounter = 0;
});

// =========================================================================
// 1. レイヤZIP（GeoJSON経路）: 自分で書き出したものを同じアプリで取り込み直す
// =========================================================================
describe('レイヤZIP(GeoJSON経路)の往復', () => {
  const layer = makeLayer('POINT');

  it('[回帰] 文字列系・日時系・選択系・範囲系・数値(非0)は値も型もそのまま戻る', () => {
    const original = typicalField();
    const [imported] = zipGeoJsonRoundTrip([pointRecord(original)], layer);
    const expectSame: (keyof typeof original)[] = [
      'str',
      'multi',
      'dict',
      'serial',
      'dt',
      'ds',
      'ts',
      'tr',
      'int',
      'dec',
      'nr',
      'list',
      'radio',
      'check',
      'table',
      'ltable',
      'ref',
    ];
    for (const k of expectSame) {
      expect({ k, v: imported.field[k] }).toEqual({ k, v: original[k] });
    }
  });

  it('[回帰] 巨大数・負の小数・指数表記の数値は数値のまま戻る', () => {
    const [imported] = zipGeoJsonRoundTrip(
      [pointRecord({ ...typicalField(), int: Number.MAX_SAFE_INTEGER, dec: -0.000123 })],
      layer
    );
    expect(imported.field.int).toBe(Number.MAX_SAFE_INTEGER);
    expect(imported.field.dec).toBe(-0.000123);
  });

  it('[回帰] 空文字は空文字のまま戻る', () => {
    const empty = Object.fromEntries(FIELDS.map((x) => [x.name, x.format === 'PHOTO' ? [] : '']));
    const [imported] = zipGeoJsonRoundTrip([pointRecord(empty)], layer);
    for (const x of FIELDS) {
      expect(imported.field[x.name]).toEqual(x.format === 'PHOTO' ? [] : '');
    }
  });

  it('INTEGER/DECIMALの0は0のまま戻る（空と0を区別する）', () => {
    const [imported] = zipGeoJsonRoundTrip([pointRecord({ ...typicalField(), int: 0, dec: 0 })], layer);
    expect(imported.field.int).toBe(0);
    expect(imported.field.dec).toBe(0);
  });

  // geojson.test.ts の同名テストと同じ理由（写真は useGeoFile が ZIP から戻す。M3）
  it.skip('PHOTOの写真参照（ファイル名）が戻る', () => {
    const [imported] = zipGeoJsonRoundTrip([pointRecord(typicalField())], layer);
    const photos = imported.field.photo as PhotoType[];
    expect(Array.isArray(photos)).toBe(true);
    expect(photos.map((p) => p.name)).toEqual(['IMG_0001.jpg', 'IMG_0002.jpg']);
  });

  it('非表示(visible=false)にしていたレコードは非表示のまま戻る（_visibleは書き出している）', () => {
    const [imported] = zipGeoJsonRoundTrip([pointRecord(typicalField(), { visible: false })], layer);
    expect(imported.visible).toBe(false);
  });

  it('グループの子レコード（_group=親id）は親子関係が保たれる', () => {
    const parent = pointRecord(typicalField(), { id: 'parent' });
    const child = pointRecord({ ...typicalField(), _group: 'parent' }, { id: 'child' });
    const imported = zipGeoJsonRoundTrip([parent, child], layer);
    const importedParent = imported[0];
    const importedChild = imported[1];
    // 親のidが変わるのは構わないが、子の_groupは新しい親idを指していなければならない
    expect(importedChild.field._group).toBe(importedParent.id);
  });

  it('REFERENCE(主キー=_id)で子が持つ親idが、取り込み後の親レコードidと一致する', () => {
    // 参照元レイヤの主キーが_idのとき、子レコードのref列には親のrecord.idが入る（DataEditReference）
    const parent = pointRecord(typicalField(), { id: '01PARENTID' });
    const imported = zipGeoJsonRoundTrip([parent], layer);
    expect(imported[0].id).toBe('01PARENTID');
  });

  it('マップメモ（LINE）の線の色・太さ・スタイルが戻る', () => {
    const memoLayer = makeLayer('LINE', [f('str', 'STRING')]);
    const memo: RecordType = {
      id: 'm1',
      userId: 'u1',
      displayName: 'user1',
      visible: true,
      redraw: false,
      coords: [
        { latitude: 35, longitude: 139 },
        { latitude: 35.001, longitude: 139.001 },
      ],
      field: {
        str: 'memo',
        _strokeColor: 'rgba(0,0,255,1)',
        _strokeWidth: 4,
        _strokeStyle: 'DASH',
        _stamp: '',
        _zoom: 15,
        _group: '',
      },
    };
    const [imported] = zipGeoJsonRoundTrip([memo], memoLayer);
    expect(imported.field._strokeColor).toBe('rgba(0,0,255,1)');
    expect(imported.field._strokeWidth).toBe(4);
    expect(imported.field._strokeStyle).toBe('DASH');
  });

  it('マップメモ（LINE）のスタンプ（1点=Pointで書き出される）がレイヤZIPの取り込みで消えない', () => {
    const memoLayer = makeLayer('LINE', [f('str', 'STRING')]);
    const base = { userId: 'u1', displayName: 'user1', visible: true, redraw: false };
    const line: RecordType = {
      ...base,
      id: 'l1',
      coords: [
        { latitude: 35, longitude: 139 },
        { latitude: 35.001, longitude: 139.001 },
      ],
      field: { str: 'line', _strokeColor: 'rgba(0,0,0,1)', _strokeWidth: 2, _stamp: '' },
    };
    const stamp: RecordType = {
      ...base,
      id: 's1',
      coords: [{ latitude: 35.002, longitude: 139.002 }],
      field: { str: 'stamp', _strokeColor: 'rgba(0,0,0,1)', _strokeWidth: 2, _stamp: 'CIRCLE' },
    };
    const imported = zipGeoJsonRoundTrip([line, stamp], memoLayer);
    expect(imported.map((r) => r.field.str)).toEqual(['line', 'stamp']);
  });

  it('外部GNSSで測ったポイントの標高・測位品質が戻る（書き出しでは_altitude/_gnssFixを出している）', () => {
    const rec = pointRecord(typicalField(), {
      coords: {
        latitude: 35,
        longitude: 139,
        altitude: 123.456,
        accuracy: 0.012,
        //@ts-ignore 監査用の最小限のgnss
        gnss: { fixQuality: 4, satellites: 20, hdop: 0.6, ellipsoidHeight: 163.4, diffAge: null },
      },
    });
    const [imported] = zipGeoJsonRoundTrip([rec], layer);
    //@ts-ignore
    expect(imported.coords.altitude).toBe(123.456);
  });
});

// =========================================================================
// 2. レイヤZIP（NONEレイヤ=CSV経路）
// =========================================================================
describe('レイヤZIP(NONEレイヤ=CSV経路)の往復', () => {
  const layer = makeLayer('NONE');
  const noneRecord = (field: RecordType['field']): RecordType => ({ ...pointRecord(field), coords: undefined });

  it('[回帰] 日本語・絵文字・カンマ・ダブルクォート・< > & を含む文字列が戻る', () => {
    const [imported] = zipCsvRoundTrip([noneRecord({ ...typicalField(), multi: '' })], layer);
    expect(imported.field.str).toBe('日本語😀 <a&b> "q", tab\there');
    expect(imported.field.check).toBe('a,b');
    expect(imported.field.table).toBe('a|1,b|2');
    expect(imported.field.tr).toBe(`10:20${NDASH}11:30`);
    expect(imported.field.dt).toBe('2026-11-21T10:20:30+09:00');
  });

  it('改行を含むSTRING_MULTIの値で、レコードが分割されずに戻る', () => {
    const imported = zipCsvRoundTrip([noneRecord(typicalField())], layer);
    expect(imported).toHaveLength(1);
    expect(imported[0].field.multi).toBe('1行目\n2行目');
  });

  it('INTEGER/DECIMAL/SERIALは数値型で戻る（文字列に落ちない）', () => {
    const [imported] = zipCsvRoundTrip([noneRecord({ ...typicalField(), multi: '' })], layer);
    expect(imported.field.int).toBe(-42);
    expect(imported.field.dec).toBe(3.14159);
    expect(imported.field.serial).toBe(3);
  });

  it('PHOTO列は写真の配列で戻る（文字列にならない）', () => {
    const [imported] = zipCsvRoundTrip([noneRecord({ ...typicalField(), multi: '' })], layer);
    expect(Array.isArray(imported.field.photo)).toBe(true);
  });

  it('前後の空白を含む文字列が削られずに戻る', () => {
    const [imported] = zipCsvRoundTrip([noneRecord({ ...typicalField(), multi: '', str: '  前後に空白  ' })], layer);
    expect(imported.field.str).toBe('  前後に空白  ');
  });

  it('[制約の確認] 数式注入対策で先頭が = + - @ の非数値文字列には \' が付いて戻る（意図的な変化）', () => {
    const [imported] = zipCsvRoundTrip(
      [noneRecord({ ...typicalField(), multi: '', str: '=SUM(A1)', dict: '-abc', ref: '@x' })],
      layer
    );
    expect(imported.field.str).toBe("'=SUM(A1)");
    expect(imported.field.dict).toBe("'-abc");
    expect(imported.field.ref).toBe("'@x");
  });

  it('[回帰] 負数は数式注入対策の対象外で、そのまま戻る', () => {
    const [imported] = zipCsvRoundTrip([noneRecord({ ...typicalField(), multi: '', int: -5 })], layer);
    expect(String(imported.field.int)).toBe('-5');
  });
});

// =========================================================================
// 3. 単体CSV（レイヤ設定なし。他アプリ/Excel経由の再取り込みを想定）
// =========================================================================
describe('単体CSVの往復（レイヤ設定なし）', () => {
  const layer = makeLayer('POINT', [f('str', 'STRING'), f('int', 'INTEGER'), f('dt', 'DATETIME')]);
  const rec = pointRecord({ str: 'abc', int: 7, dt: '2026-11-21T10:20:30+09:00' });

  it('項目名が書き出し時の項目名と一致する（BOM付きdisplayNameやgeometry列が項目にならない）', () => {
    const csv = generateCSV([rec], layer.field, 'POINT');
    const data = csv2Data(csv, 'audit.csv', 'u2', 'user2')!;
    const names = data.layer.field.map((x) => x.name);
    expect(names).toEqual(expect.arrayContaining(['str', 'int', 'dt']));
    expect(names.some((n) => n.includes('﻿'))).toBe(false);
    expect(names).not.toContain('geometry');
  });

  it('各項目の値が列ずれせずに対応する項目へ入る', () => {
    const csv = generateCSV([rec], layer.field, 'POINT');
    const data = csv2Data(csv, 'audit.csv', 'u2', 'user2')!;
    const field = data.recordSet[0].field;
    expect(field.str).toBe('abc');
    expect(field.int).toBe('7'); // レイヤ設定が無いので文字列になるのは仕様上やむを得ない
    expect(field.dt).toBe('2026-11-21T10:20:30+09:00');
  });

  it('[回帰] 座標は書き出した値で戻る', () => {
    const csv = generateCSV([rec], layer.field, 'POINT');
    const data = csv2Data(csv, 'audit.csv', 'u2', 'user2')!;
    expect(data.recordSet[0].coords).toEqual({ latitude: 35.123456789, longitude: 139.987654321 });
  });
});

// =========================================================================
// 4. 単体GeoJSON（レイヤ設定なし）
// =========================================================================
describe('単体GeoJSONの往復（レイヤ設定なし）', () => {
  const layer = makeLayer('POINT');

  it('INTEGER/DECIMALの0が空文字にならない', () => {
    const { records } = standaloneGeoJson([pointRecord({ ...typicalField(), int: 0, dec: 0 })], layer);
    expect(records[0].field.int).toBe(0);
    expect(records[0].field.dec).toBe(0);
  });

  it('[制約の確認] 項目型はすべてSTRINGになる（GeoJSONに型情報が無いため）が、値は書き出した値で戻る', () => {
    const { layer: newLayer, records } = standaloneGeoJson([pointRecord(typicalField())], layer);
    expect(newLayer.field.every((x) => x.format === 'STRING')).toBe(true);
    expect(records[0].field.int).toBe(-42);
    expect(records[0].field.photo).toBe('IMG_0001.jpg,IMG_0002.jpg');
  });
});

// =========================================================================
// 5. KML
// =========================================================================
describe('KMLの往復', () => {
  const layer = makeLayer('POINT', [f('str', 'STRING'), f('int', 'INTEGER'), f('check', 'CHECK')]);
  const rec = pointRecord({ str: '<a&b> "q"', int: 12, check: 'a,b' });

  it('[回帰] < > & " を含む値がXMLとして壊れずに名前・説明へ戻る', () => {
    const { records, layer: newLayer } = standaloneKml([rec], layer);
    expect(records).toHaveLength(1);
    expect(newLayer.field.map((x) => x.name)).toEqual(expect.arrayContaining(['name', 'description']));
    expect(records[0].field.name).toBe('<a&b> "q"');
    expect(String(records[0].field.description)).toContain('str: <a&b> "q"');
  });

  it('各項目が項目として戻る（descriptionの1つの文字列に潰れない: ExtendedData等）', () => {
    const { records } = standaloneKml([rec], layer);
    expect(records[0].field.str).toBe('<a&b> "q"');
    expect(String(records[0].field.int)).toBe('12');
    expect(records[0].field.check).toBe('a,b');
  });

  it('値の無い項目が "undefined" という文字列で書き出されない', () => {
    const kmlString = generateKML([pointRecord({ str: 'x' })], layer);
    expect(kmlString).not.toContain('undefined');
  });
});

// =========================================================================
// 6. GPX
// =========================================================================
describe('GPXの往復', () => {
  const gpxPoint = (field: RecordType['field']) => pointRecord(field);
  const roundTrip = (records: RecordType[], type: 'POINT' | 'LINE') =>
    gpx2Data(generateGPX(records, type), type, 'audit.gpx', 'u2', 'user2')!;

  it('[回帰] DATETIME(time)は表記がUTC→端末ローカルに変わるが、同じ時刻を指す', () => {
    const data = roundTrip([gpxPoint({ name: 'a', time: '2026-11-21T10:20:30+09:00', cmt: '' })], 'POINT');
    expect(dayjs(data.recordSet[0].field.time as string).valueOf()).toBe(
      dayjs('2026-11-21T10:20:30+09:00').valueOf()
    );
  });

  it('[回帰] 日本語・絵文字のnameが戻る', () => {
    const data = roundTrip([gpxPoint({ name: '地点😀', time: '', cmt: 'コメント' })], 'POINT');
    expect(data.recordSet[0].field.name).toBe('地点😀');
    expect(data.recordSet[0].field.cmt).toBe('コメント');
  });

  it('& < > を含むname/cmtが実体参照のまま残らない', () => {
    const data = roundTrip([gpxPoint({ name: 'A&B <c>', time: '', cmt: 'x>y' })], 'POINT');
    expect(data.recordSet[0].field.name).toBe('A&B <c>');
    expect(data.recordSet[0].field.cmt).toBe('x>y');
  });

  it('数字だけのnameが数値に化けない（"007"や"1e3"、"0x1F"）', () => {
    const data = roundTrip(
      [
        gpxPoint({ name: '007', time: '', cmt: '' }),
        gpxPoint({ name: '1e3', time: '', cmt: '' }),
        gpxPoint({ name: '0x1F', time: '', cmt: '' }),
      ],
      'POINT'
    );
    expect(data.recordSet.map((r) => r.field.name)).toEqual(['007', '1e3', '0x1F']);
  });

  it('nameが"0"の地点の名前が空にならない', () => {
    const data = roundTrip([gpxPoint({ name: '0', time: '', cmt: '' })], 'POINT');
    expect(String(data.recordSet[0].field.name)).toBe('0');
  });

  it('時刻の無い軌跡でも、ラインのtime(DATETIME)が戻る', () => {
    const line: RecordType = {
      ...pointRecord({ name: 'trk', time: '2026-11-21T10:20:30+09:00', cmt: '' }),
      coords: [
        { latitude: 35, longitude: 139 },
        { latitude: 35.001, longitude: 139.001 },
      ],
    };
    const data = roundTrip([line], 'LINE');
    const time = data.recordSet[0].field.time as string;
    expect(time).not.toBe('');
    expect(dayjs(time).valueOf()).toBe(dayjs('2026-11-21T10:20:30+09:00').valueOf());
  });

  it('[制約の確認] name/time/cmt以外の項目はdesc項目（文字列）として戻り、型は戻らない（GPXの項目構造の制約）', () => {
    const layer2 = makeLayer('POINT', [f('name', 'STRING'), f('int', 'INTEGER')]);
    const gpx = generateGPX([pointRecord({ name: 'a', int: 5 })], 'POINT');
    expect(gpx).toContain('<desc>');
    const data = gpx2Data(gpx, 'POINT', 'audit.gpx', 'u2', 'user2')!;
    expect(Object.keys(data.recordSet[0].field).sort()).toEqual(['cmt', 'desc', 'name', 'time']);
    expect(typeof data.recordSet[0].field.desc).toBe('string');
    expect(layer2.field).toHaveLength(2);
  });
});
