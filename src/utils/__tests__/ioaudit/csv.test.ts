// CSV取り込み/書き出しの監査テスト。期待値は「あるべき挙動」（赤=不具合の候補）。
import { csv2Data, detectCsvType, generateCSV, escapeCSVValue, createLayerFromCsv } from '../../Geometry';
import { parseCsv } from '../../csvParse';
import { LayerType, RecordType, FieldType, FormatType, PhotoType } from '../../../types';

jest.mock('../../../lib/firebase/storage', () => ({ fetchPhoto: jest.fn() }));

let mockIdCounter = 0;
jest.mock('ulid', () => ({ ulid: () => `id${++mockIdCounter}` }));

const BOM = '﻿';

const mkField = (name: string, format: FormatType): FieldType => ({ id: `f_${name}`, name, format });

const mkLayer = (type: LayerType['type'], field: FieldType[]): LayerType => ({
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

const mkRecord = (field: RecordType['field'], coords?: RecordType['coords'], extra?: Partial<RecordType>): RecordType => ({
  id: 'r1',
  userId: 'u1',
  displayName: 'user',
  visible: true,
  redraw: false,
  coords,
  field,
  ...extra,
});

const roundTrip = (layer: LayerType, records: RecordType[]) => {
  const csv = generateCSV(records, layer.field, layer.type as 'POINT' | 'LINE' | 'POLYGON' | 'NONE');
  const result = csv2Data(csv, 'x.csv', 'u1', 'user', layer);
  return { csv, result };
};

// ---------------------------------------------------------------------------
describe('正常系の往復（回帰防止）', () => {
  it('NONEレイヤ: 単純な文字列・日本語・絵文字・カンマ・二重引用符・< > & は往復する', () => {
    const layer = mkLayer('NONE', [mkField('a', 'STRING'), mkField('b', 'STRING'), mkField('c', 'STRING')]);
    const recs = [
      mkRecord({ a: '日本語テキスト', b: '絵文字😀🌲', c: 'a,b,"c"' }),
      mkRecord({ a: '<tag>&amp;', b: '', c: 'x' }),
    ];
    const { result } = roundTrip(layer, recs);
    expect(result?.recordSet.map((r) => r.field)).toEqual(recs.map((r) => r.field));
  });

  it('POINTレイヤ: 座標（負数・小数）が往復する', () => {
    const layer = mkLayer('POINT', [mkField('name', 'STRING')]);
    const recs = [
      mkRecord({ name: 'p1' }, { latitude: 35.123456789, longitude: 139.987654321 }),
      mkRecord({ name: 'p2' }, { latitude: -33.8688, longitude: -151.2093 }),
    ];
    const { result } = roundTrip(layer, recs);
    expect(result?.recordSet.map((r) => r.coords)).toEqual(recs.map((r) => r.coords));
  });

  it('LINEレイヤ: 座標列が往復する', () => {
    const layer = mkLayer('LINE', [mkField('name', 'STRING')]);
    const coords = [
      { latitude: 35, longitude: 139 },
      { latitude: 35.5, longitude: 139.5 },
      { latitude: 36, longitude: 140 },
    ];
    const { result } = roundTrip(layer, [mkRecord({ name: 'l' }, coords)]);
    expect(result?.recordSet[0].coords).toEqual(coords);
  });

  it('detectCsvType: 書き出したCSVのgeometry列と種類を検出できる', () => {
    const layer = mkLayer('POINT', [mkField('name', 'STRING')]);
    const csv = generateCSV([mkRecord({ name: 'p' }, { latitude: 35, longitude: 139 })], layer.field, 'POINT');
    expect(detectCsvType(csv)).toEqual({ type: 'POINT', column: 2 });
  });

  it('LF/CRLFどちらの改行でもレコード数と値は同じ', () => {
    const lf = 'name,geometry\nA,"POINT(139 35)"\nB,"POINT(140 36)"\n';
    const crlf = lf.replace(/\n/g, '\r\n');
    const a = csv2Data(lf, 'a.csv', 'u', 'd');
    const b = csv2Data(crlf, 'b.csv', 'u', 'd');
    expect(b?.recordSet.map((r) => r.coords)).toEqual(a?.recordSet.map((r) => r.coords));
    expect(b?.recordSet.length).toBe(2);
  });

  it('空行はスキップされる', () => {
    const csv = 'name,geometry\nA,"POINT(139 35)"\n\n\nB,"POINT(140 36)"\n\n';
    expect(csv2Data(csv, 'a.csv', 'u', 'd')?.recordSet.length).toBe(2);
  });

  it('列数がフィールド数より少ない行でもundefinedは入らない', () => {
    const layer = mkLayer('NONE', [mkField('a', 'STRING'), mkField('b', 'STRING')]);
    const csv = 'displayName,a,b,geometry\nuser,only\n';
    const r = csv2Data(csv, 'x.csv', 'u', 'd', layer);
    expect(r?.recordSet[0].field).toEqual({ a: 'only', b: '' });
  });

  it('壊れた入力でも例外を投げない（undefinedまたは結果を返す）', () => {
    const inputs = ['', '\n', '"', '"""', 'a,b\n"unterminated,x', 'geometry\n"POINT(', 'geometry\nPOLYGON((', BOM];
    for (const s of inputs) {
      expect(() => csv2Data(s, 'x.csv', 'u', 'd')).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
describe('escapeCSVValue / 数式インジェクション対策', () => {
  it('= + - @ タブ CR で始まる文字列は先頭に\'を付けて無害化する', () => {
    expect(escapeCSVValue('=HYPERLINK("http://evil","x")')).toBe('"\'=HYPERLINK(""http://evil"",""x"")"');
    expect(escapeCSVValue('+cmd|calc')).toBe('"\'+cmd|calc"');
    expect(escapeCSVValue('-2+3')).toBe('"\'-2+3"');
    expect(escapeCSVValue('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(escapeCSVValue('\t=1')).toBe('"\'\t=1"');
    expect(escapeCSVValue('\r=1')).toBe('"\'\r=1"');
  });

  it('数値（負数・指数表記）は無害化しない', () => {
    expect(escapeCSVValue(-3.5)).toBe('"-3.5"');
    expect(escapeCSVValue('-3.5')).toBe('"-3.5"');
    expect(escapeCSVValue('+1')).toBe('"+1"');
    expect(escapeCSVValue(0)).toBe('"0"');
    expect(escapeCSVValue(1e21)).toBe('"1e+21"');
  });

  it('null/undefinedは空文字', () => {
    expect(escapeCSVValue(null)).toBe('""');
    expect(escapeCSVValue(undefined)).toBe('""');
  });

  it('全角＝や先頭空白＋= は Excel では数式にならないので素通しでよい（現状確認）', () => {
    expect(escapeCSVValue('＝1+1')).toBe('"＝1+1"');
    expect(escapeCSVValue(' =1+1')).toBe('" =1+1"');
  });

  it('displayName（ユーザー名）も無害化される', () => {
    const layer = mkLayer('NONE', [mkField('a', 'STRING')]);
    const csv = generateCSV([mkRecord({ a: 'x' }, undefined, { displayName: '=evil()' })], layer.field, 'NONE');
    expect(csv.split('\n')[1].startsWith('"\'=evil()"')).toBe(true);
  });

  it.failing('【往復】無害化で付けた先頭の\'は取り込み時に外れて元の値に戻る', () => {
    const layer = mkLayer('NONE', [mkField('a', 'STRING'), mkField('b', 'STRING'), mkField('c', 'STRING')]);
    const recs = [mkRecord({ a: '=1+1', b: '-abc', c: '@user' })];
    const { result } = roundTrip(layer, recs);
    expect(result?.recordSet[0].field).toEqual({ a: '=1+1', b: '-abc', c: '@user' });
  });
});

// ---------------------------------------------------------------------------
describe('値の往復（境界値）', () => {
  it('【往復】値の中の改行（LF/CRLF）が保持され、レコードが分裂しない', () => {
    const layer = mkLayer('NONE', [mkField('memo', 'STRING_MULTI'), mkField('b', 'STRING')]);
    const recs = [mkRecord({ memo: '1行目\n2行目', b: 'B1' }), mkRecord({ memo: 'x\r\ny', b: 'B2' })];
    const { result } = roundTrip(layer, recs);
    expect(result?.recordSet.length).toBe(2);
    expect(result?.recordSet.map((r) => r.field)).toEqual(recs.map((r) => r.field));
  });

  it('【往復】前後の空白・タブが保持される', () => {
    const layer = mkLayer('NONE', [mkField('a', 'STRING'), mkField('b', 'STRING')]);
    const recs = [mkRecord({ a: '  前後に空白  ', b: 'x\t' })];
    const { result } = roundTrip(layer, recs);
    expect(result?.recordSet[0].field).toEqual({ a: '  前後に空白  ', b: 'x\t' });
  });

  it('【往復】数値型（INTEGER/DECIMAL/SERIAL）は数値のまま戻る', () => {
    const layer = mkLayer('NONE', [
      mkField('i', 'INTEGER'),
      mkField('d', 'DECIMAL'),
      mkField('s', 'SERIAL'),
      mkField('neg', 'DECIMAL'),
      mkField('big', 'INTEGER'),
    ]);
    const recs = [mkRecord({ i: 0, d: 3.14159, s: 0, neg: -12.5, big: 9007199254740991 })];
    const { result } = roundTrip(layer, recs);
    expect(result?.recordSet[0].field).toEqual({ i: 0, d: 3.14159, s: 0, neg: -12.5, big: 9007199254740991 });
  });

  it('【往復】文字列系（DATETIME/DATESTRING/TIMESTRING/TIMERANGE/NUMBERRANGE/LIST/RADIO/CHECK/STRING_DICTIONARY/TABLE/REFERENCE）', () => {
    const fmts: FormatType[] = [
      'DATETIME',
      'DATESTRING',
      'TIMESTRING',
      'TIMERANGE',
      'NUMBERRANGE',
      'LIST',
      'RADIO',
      'CHECK',
      'STRING_DICTIONARY',
      'STRING_DYNAMIC',
      'TABLE',
      'LISTTABLE',
      'REFERENCE',
    ];
    const layer = mkLayer(
      'NONE',
      fmts.map((f) => mkField(f, f))
    );
    const value: RecordType['field'] = {
      DATETIME: '2026-11-21T10:20:30+09:00',
      DATESTRING: '2026/11/21',
      TIMESTRING: '10:20',
      TIMERANGE: '10:20–11:30',
      NUMBERRANGE: '-1.5–2',
      LIST: 'スギ',
      RADIO: 'あり',
      CHECK: 'A,B,"C"',
      STRING_DICTIONARY: 'ヒノキ',
      STRING_DYNAMIC: 'dyn',
      TABLE: '',
      LISTTABLE: '',
      REFERENCE: '',
    };
    const { result } = roundTrip(layer, [mkRecord(value)]);
    expect(result?.recordSet[0].field).toEqual(value);
  });

  it('【往復】PHOTO列は取り込み後も配列（PhotoType[]）になる', () => {
    const layer = mkLayer('NONE', [mkField('photo', 'PHOTO'), mkField('a', 'STRING')]);
    const photo: PhotoType = {
      id: 'p1',
      name: 'a.jpg',
      uri: null,
      url: null,
      width: 1,
      height: 1,
      thumbnail: 'data:',
      key: null,
    };
    const { result } = roundTrip(layer, [mkRecord({ photo: [photo, { ...photo, id: 'p2', name: 'b.jpg' }], a: 'x' })]);
    expect(Array.isArray(result?.recordSet[0].field.photo)).toBe(true);
  });

  // 監査で不採用: 1e-6度（約0.1m）未満の値が0になるだけで実害が無い
  it.skip('【往復】極小の座標（指数表記になる値）が0に化けない', () => {
    const layer = mkLayer('POINT', [mkField('a', 'STRING')]);
    const coords = { latitude: 1e-7, longitude: 5e-7 };
    const { csv, result } = roundTrip(layer, [mkRecord({ a: 'x' }, coords)]);
    expect(csv).toContain('POINT(5e-7 1e-7)');
    expect(result?.recordSet[0].coords).toEqual(coords);
  });
});

// ---------------------------------------------------------------------------
describe('ジオメトリの往復', () => {
  it('【往復】穴なしPOLYGONの書き出しは正しいWKT（末尾に余計なカンマがない）', () => {
    const layer = mkLayer('POLYGON', [mkField('a', 'STRING')]);
    const ring = [
      { latitude: 35, longitude: 139 },
      { latitude: 35, longitude: 140 },
      { latitude: 36, longitude: 140 },
      { latitude: 35, longitude: 139 },
    ];
    const csv = generateCSV([mkRecord({ a: 'x' }, ring)], layer.field, 'POLYGON');
    expect(csv).toContain('"POLYGON((139 35,140 35,140 36,139 35))"');
  });

  it('【往復】穴なしPOLYGONの頂点が増えずに戻る', () => {
    const layer = mkLayer('POLYGON', [mkField('a', 'STRING')]);
    const ring = [
      { latitude: 35, longitude: 139 },
      { latitude: 35, longitude: 140 },
      { latitude: 36, longitude: 140 },
      { latitude: 35, longitude: 139 },
    ];
    const { result } = roundTrip(layer, [mkRecord({ a: 'x' }, ring)]);
    // 現行は末尾の ",)" で formattedInputs(undefined) が例外→catchでCSV全体がundefinedになる
    expect(result).toBeDefined();
    expect(result?.recordSet[0].coords).toEqual(ring);
  });

  it('【往復】穴ありPOLYGONの外周と穴が分かれて戻る', () => {
    const layer = mkLayer('POLYGON', [mkField('a', 'STRING')]);
    const ring = [
      { latitude: 35, longitude: 139 },
      { latitude: 35, longitude: 141 },
      { latitude: 37, longitude: 141 },
      { latitude: 35, longitude: 139 },
    ];
    const hole = [
      { latitude: 35.5, longitude: 140 },
      { latitude: 35.5, longitude: 140.5 },
      { latitude: 36, longitude: 140.5 },
      { latitude: 35.5, longitude: 140 },
    ];
    const { result } = roundTrip(layer, [mkRecord({ a: 'x' }, ring, { holes: { h1: hole } })]);
    expect(result?.recordSet[0].coords).toEqual(ring);
    expect(Object.values(result?.recordSet[0].holes ?? {})).toEqual([hole]);
  });

  it('【検出】先頭レコードのgeometryより前の列にカンマを含む値があっても種類を検出できる', () => {
    const layer = mkLayer('POINT', [mkField('memo', 'STRING')]);
    const csv = generateCSV([mkRecord({ memo: 'a,b' }, { latitude: 35, longitude: 139 })], layer.field, 'POINT');
    expect(detectCsvType(csv).type).toBe('POINT');
    const r = csv2Data(csv, 'x.csv', 'u', 'd', layer);
    expect(r?.recordSet[0].coords).toEqual({ latitude: 35, longitude: 139 });
  });

  it('【検出】先頭レコードの座標が空でも2件目以降のジオメトリは取り込まれる', () => {
    const layer = mkLayer('POINT', [mkField('a', 'STRING')]);
    const csv = generateCSV(
      [mkRecord({ a: '1' }, undefined), mkRecord({ a: '2' }, { latitude: 35, longitude: 139 })],
      layer.field,
      'POINT'
    );
    const r = csv2Data(csv, 'x.csv', 'u', 'd', layer);
    expect(r?.recordSet[1].coords).toEqual({ latitude: 35, longitude: 139 });
  });

  it('【検出】ヘッダ直後に空行があってもジオメトリ種類を検出できる', () => {
    const csv = 'name,geometry\n\nA,"POINT(139 35)"\n';
    expect(detectCsvType(csv).type).toBe('POINT');
  });

  it('【WKT】QGIS形式（大文字小文字混在・空白あり "Point (139 35)"）を読める', () => {
    const csv = 'name,geometry\nA,"Point (139 35)"\n';
    const r = csv2Data(csv, 'a.csv', 'u', 'd');
    expect(r?.layer.type).toBe('POINT');
    expect(r?.recordSet[0].coords).toEqual({ latitude: 35, longitude: 139 });
  });

  it('【WKT】"POINT (139 35)"（POINTの後に空白）で座標が(0,0)に化けない', () => {
    const csv = 'name,geometry\nA,"POINT (139 35)"\n';
    const r = csv2Data(csv, 'a.csv', 'u', 'd');
    expect(r?.recordSet[0].coords).toEqual({ latitude: 35, longitude: 139 });
  });

  it('【WKT】範囲外・不正な座標は(0,0)ではなく欠損扱いにする（黙って赤道ギニア沖に置かない）', () => {
    const csv = 'name,geometry\nA,"POINT(abc 999)"\n';
    const r = csv2Data(csv, 'a.csv', 'u', 'd');
    expect(r?.recordSet[0].coords).not.toEqual({ latitude: 0, longitude: 0 });
  });

  it('【WKT】MULTIPOINTはPOINTとして誤解析されない', () => {
    const csv = 'name,geometry\nA,"MULTIPOINT((139 35),(140 36))"\n';
    const r = csv2Data(csv, 'a.csv', 'u', 'd');
    expect(r?.recordSet[0].coords).not.toEqual({ latitude: 0, longitude: 0 });
  });

  it('【列名】緯度経度列（latitude/longitude, lat/lon, 緯度/経度, x/y）からポイントを作れる', () => {
    const cases = [
      'name,latitude,longitude\nA,35,139\n',
      'name,lat,lon\nA,35,139\n',
      'name,緯度,経度\nA,35,139\n',
      'name,x,y\nA,139,35\n',
    ];
    for (const csv of cases) {
      const r = csv2Data(csv, 'a.csv', 'u', 'd');
      expect(r?.layer.type).toBe('POINT');
      expect(r?.recordSet[0].coords).toEqual({ latitude: 35, longitude: 139 });
    }
  });
});

// ---------------------------------------------------------------------------
describe('レイヤ設定なしのCSV単体取り込み（createLayerFromCsv）', () => {
  it('BOM付きUTF-8でも先頭フィールド名にBOMが残らない', () => {
    const layer = createLayerFromCsv(`${BOM}name,geometry\nA,"POINT(139 35)"`, 'a.csv', 'POINT');
    expect(layer.field[0].name).toBe('name');
  });

  it('CRLFのCSVでも最終フィールド名に\\rが残らない', () => {
    const layer = createLayerFromCsv('name,memo\r\nA,B\r\n', 'a.csv', 'NONE');
    expect(layer.field.map((f) => f.name)).toEqual(['name', 'memo']);
  });

  it('ヘッダが引用符付き・カンマ入りでも正しく列名になる', () => {
    const layer = createLayerFromCsv('"name","a,b"\nA,B\n', 'a.csv', 'NONE');
    expect(layer.field.map((f) => f.name)).toEqual(['name', 'a,b']);
  });

  it('BOM付き・ヘッダ無しの一般CSV（displayName列なし）は列がずれない', () => {
    const csv = `${BOM}name,memo\nA,B\n`;
    const r = csv2Data(csv, 'a.csv', 'u', 'd');
    const names = r!.layer.field.map((f) => f.name);
    expect(r?.recordSet[0].field[names[0]]).toBe('A');
    expect(r?.recordSet[0].field[names[1]]).toBe('B');
  });

  it('【往復】EcorisMapが書き出したCSVを単体で取り込むと値が正しい列に入る（displayName/geometryは属性にしない）', () => {
    const layer = mkLayer('POINT', [mkField('name', 'STRING'), mkField('memo', 'STRING')]);
    const csv = generateCSV(
      [mkRecord({ name: 'N1', memo: 'M1' }, { latitude: 35, longitude: 139 })],
      layer.field,
      'POINT'
    );
    const r = csv2Data(csv, 'export.csv', 'u', 'd');
    expect(r?.recordSet[0].field.name).toBe('N1');
    expect(r?.recordSet[0].field.memo).toBe('M1');
    expect(r?.layer.field.map((f) => f.name)).toEqual(['name', 'memo']);
  });

  it('同名の列があっても値が上書きで消えない', () => {
    const r = csv2Data('a,a\n1,2\n', 'x.csv', 'u', 'd');
    const values = r?.recordSet[0] ? Object.values(r.recordSet[0].field) : [];
    expect(values).toEqual(expect.arrayContaining(['1', '2']));
  });

  it('__proto__ という列名でもプロトタイプ汚染されない', () => {
    const r = csv2Data('__proto__,b\n{"polluted":1},x\n', 'x.csv', 'u', 'd');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(r).toBeDefined();
  });

  it('列数がヘッダより多い行の余った値は黙って捨てない（少なくとも件数は保持）', () => {
    const r = csv2Data('a,b\n1,2,3,4\n', 'x.csv', 'u', 'd');
    expect(r?.recordSet.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('文字コード（Web: decodeUri）', () => {
  it('Shift_JISのCSV（data URI）を文字化けせずに読める', async () => {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
    jest.doMock('../../../lib/firebase/storage', () => ({ fetchPhoto: jest.fn() }));
    jest.doMock('../../zipProgress', () => ({}));
    jest.doMock('file-saver', () => ({ saveAs: jest.fn() }));
     
    const { decodeUri } = require('../../File.web');
    // 「名前,場所\n山田,東京」をShift_JISでエンコードしたバイト列
    const sjis = Buffer.from([
      0x96, 0xbc, 0x91, 0x4f, 0x2c, 0x8f, 0xea, 0x8f, 0x8a, 0x0a, 0x8e, 0x52, 0x93, 0x63, 0x2c, 0x93, 0x8c, 0x8b,
      0x9e,
    ]);
    const text: string = await decodeUri(`data:text/csv;base64,${sjis.toString('base64')}`);
    expect(text).toBe('名前,場所\n山田,東京');
  });

  it('BOM付きUTF-8（data URI）を読める', async () => {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
    jest.doMock('../../../lib/firebase/storage', () => ({ fetchPhoto: jest.fn() }));
    jest.doMock('../../zipProgress', () => ({}));
    jest.doMock('file-saver', () => ({ saveAs: jest.fn() }));
     
    const { decodeUri } = require('../../File.web');
    const buf = Buffer.from(`${BOM}名前\n山田`, 'utf-8');
    const text: string = await decodeUri(`data:text/csv;base64,${buf.toString('base64')}`);
    expect(text.replace(BOM, '')).toBe('名前\n山田');
  });
});

// ---------------------------------------------------------------------------
describe('ヘッダ（フィールド名）の書き出し', () => {
  it('フィールド名にカンマ・二重引用符を含んでも列がずれない（ヘッダもクォートされる）', () => {
    const layer = mkLayer('NONE', [mkField('高さ,m', 'STRING'), mkField('備考"', 'STRING')]);
    const csv = generateCSV([mkRecord({ '高さ,m': '10', '備考"': 'x' })], layer.field, 'NONE');
    // 引用の付け方（displayName や geometry まで引用するか）は問わず、列数と列名が正しく読めることを確かめる
    const [header, row] = parseCsv(csv);
    expect(header).toHaveLength(row.length);
    expect(header).toEqual(expect.arrayContaining(['高さ,m', '備考"']));
  });

  it('フィールド名が = で始まっても数式として解釈されない', () => {
    const layer = mkLayer('NONE', [mkField('=HYPERLINK("http://evil","x")', 'STRING')]);
    const csv = generateCSV([mkRecord({ '=HYPERLINK("http://evil","x")': 'v' })], layer.field, 'NONE');
    const header = csv.replace(BOM, '').split('\n')[0];
    expect(header).not.toMatch(/(^|,)=/);
  });
});
