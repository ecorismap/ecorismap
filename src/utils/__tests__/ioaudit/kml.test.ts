/**
 * KML/KMZ のインポート/エクスポート監査（往復・壊れた入力・悪意ある入力）
 *
 * 期待値は「あるべき挙動」。現行コードで赤になるケースは不具合の候補。
 */
// Firebaseのモック（useGeoFileが間接的に読み込むため最初に定義する）
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  sendEmailVerification: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn(),
  serverTimestamp: jest.fn(),
}));
jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(() => ({})),
  ref: jest.fn(),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(),
  deleteObject: jest.fn(),
}));
jest.mock('firebase/app-check', () => ({
  initializeAppCheck: jest.fn(),
  ReCaptchaV3Provider: jest.fn(),
  ReCaptchaEnterpriseProvider: jest.fn(),
}));
jest.mock('firebase/app', () => ({
  getApp: jest.fn(() => ({})),
  initializeApp: jest.fn(() => ({})),
}));
jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn(),
}));
jest.mock('../../../lib/firebase/firebase', () => ({
  auth: {},
  db: {},
  storage: {},
  firestore: {},
  functions: {},
  initialize: jest.fn(),
}));
jest.mock('../../../lib/firebase/storage', () => ({
  uploadPhoto: jest.fn(),
  downloadFile: jest.fn(),
  deletePhoto: jest.fn(),
  fetchPhoto: jest.fn(),
}));

let mockDispatch = jest.fn();
let mockSelector = jest.fn();
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => mockSelector(),
  shallowEqual: jest.fn(),
}));

let mockUlidCounter = 0;
jest.mock('ulid', () => ({ ulid: () => `id${mockUlidCounter++}` }));

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(() => Promise.resolve('')),
}));

const mockFiles: Record<string, string> = {};
jest.mock('react-native-fs', () => ({
  mkdir: jest.fn(() => Promise.resolve()),
  exists: jest.fn((p: string) => Promise.resolve(p in mockFiles)),
  readFile: jest.fn((p: string) => Promise.resolve(mockFiles[p])),
  writeFile: jest.fn((p: string, c: string) => {
    mockFiles[p] = c;
    return Promise.resolve();
  }),
  unlink: jest.fn(),
  CachesDirectoryPath: '/cache',
  DownloadDirectoryPath: '/download',
}));

import { kmzPhotoEntryNames } from '../../kmzPhotoNames';
import { kml as toGeoJSON } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { Buffer } from 'buffer';
import { renderHook, act } from '@testing-library/react-hooks';
import { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import { generateKML, generateTrackKML, geoJson2Data, createLayerFromGeoJson, detectGeoJsonType } from '../../Geometry';
import { generateKMZFile } from '../../File';
import { useGeoFile } from '../../../hooks/useGeoFile';
import { FieldType, FormatType, LayerType, LocationType, PhotoType, RecordType } from '../../../types';

const { Platform } = require('react-native');

type FC = FeatureCollection<Geometry | null, GeoJsonProperties>;

// アプリ（useGeoFile.loadKml）と同じパース経路
const parseKml = (s: string): FC => {
  const xml = new DOMParser().parseFromString(s, 'text/xml');
  //@ts-ignore
  return toGeoJSON(xml) as FC;
};

const user = { uid: 'u1', email: 'a@example.com', displayName: 'Tester', photoURL: '' };

const makeLayer = (type: LayerType['type'], field: FieldType[], label = ''): LayerType => ({
  id: 'L1',
  name: 'layer',
  type,
  permission: 'PRIVATE',
  colorStyle: {
    colorType: 'SINGLE',
    transparency: 0,
    color: '#ff0000',
    fieldName: '',
    customFieldValue: '',
    colorRamp: 'RANDOM',
    colorList: [],
    lineWidth: 2,
  },
  label,
  visible: true,
  active: false,
  field,
});

const rec = (coords: RecordType['coords'], field: RecordType['field'], extra: Partial<RecordType> = {}): RecordType => ({
  id: 'r' + Math.random(),
  userId: 'u1',
  displayName: null,
  visible: true,
  redraw: false,
  coords,
  field,
  ...extra,
});

const f = (name: string, format: FormatType): FieldType => ({ id: name, name, format });

// 取り込みフック（Web経路=data URI）を通して、dispatchされたレイヤとレコードを返す
const importViaHook = async (content: string | Buffer, name: string) => {
  mockDispatch = jest.fn();
  mockSelector = jest.fn(() => ({}));
  // useSelectorは projectId, user, layers の順で呼ばれる想定。どれを返しても壊れないようにする
  mockSelector = jest
    .fn()
    .mockReturnValueOnce('p1')
    .mockReturnValueOnce(user)
    .mockReturnValue([]);
  Platform.OS = 'web';
  const b64 = Buffer.isBuffer(content) ? content.toString('base64') : Buffer.from(content).toString('base64');
  const uri = `data:application/octet-stream;base64,${b64}`;
  const { result } = renderHook(() => useGeoFile());
  let ret: { isOK: boolean; message: string } = { isOK: false, message: '' };
  await act(async () => {
    ret = await result.current.importGeoFile(uri, name);
  });
  const layers: LayerType[] = mockDispatch.mock.calls
    .filter((c) => c[0].type === 'layers/addLayerAction')
    .map((c) => c[0].payload);
  const data: RecordType[][] = mockDispatch.mock.calls
    .filter((c) => c[0].type === 'dataSet/addDataAction')
    .map((c) => c[0].payload[0].data);
  return { ret, layers, data };
};

const wrapKml = (body: string, decl = true) =>
  `${decl ? '<?xml version="1.0" encoding="UTF-8"?>' : ''}<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${body}</Document></kml>`;

beforeEach(() => {
  mockUlidCounter = 0;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. generateKML の出力（XMLとして正しいか・値が残るか）
// ---------------------------------------------------------------------------
describe('generateKML: 出力の健全性', () => {
  const nasty = '日本語🌸 <tag> & "quote" \'apos\' , カンマ\tタブ\n改行 ]]> 終わり';

  it('[回帰] 特殊文字(< > & " \' 日本語 絵文字 タブ 改行 ]]>)を含む値でも整形式XMLになり、descriptionで値が読める', () => {
    const layer = makeLayer('POINT', [f('name', 'STRING'), f('memo', 'STRING')], 'name');
    const kml = generateKML([rec({ latitude: 35, longitude: 135 }, { name: nasty, memo: nasty })], layer);
    const gj = parseKml(kml);
    expect(gj.features).toHaveLength(1);
    expect(gj.features[0].properties?.name).toBe(nasty);
    expect(String(gj.features[0].properties?.description)).toContain(`memo: ${nasty}`);
  });

  it('XML1.0で禁止の制御文字(垂直タブ\\u000B・\\u0001等、Excel等からの貼り付けで混入)を含んでも書き出しが例外にならない', () => {
    const layer = makeLayer('POINT', [f('memo', 'STRING')]);
    const records = [rec({ latitude: 35, longitude: 135 }, { memo: 'セル内改行\u000Bです\u0001' })];
    expect(() => generateKML(records, layer)).not.toThrow();
  });

  it('壊れたサロゲート(絵文字の途中で切れた文字列)を含んでも書き出しが例外にならない', () => {
    const layer = makeLayer('POINT', [f('memo', 'STRING')]);
    const records = [rec({ latitude: 35, longitude: 135 }, { memo: 'abc\uD83C' })];
    expect(() => generateKML(records, layer)).not.toThrow();
  });

  it('未入力(undefined/null)の項目はdescriptionに "undefined"/"null" という文字列で出ない', () => {
    const layer = makeLayer('POINT', [f('a', 'STRING'), f('b', 'INTEGER'), f('c', 'STRING')]);
    const r = rec({ latitude: 35, longitude: 135 }, { c: 'x' });
    // b は後から追加した項目で値が無い、a は null が入っているケース
    (r.field as Record<string, unknown>).a = null;
    const gj = parseKml(generateKML([r], layer));
    const desc = String(gj.features[0].properties?.description);
    expect(desc).not.toContain('undefined');
    expect(desc).not.toContain('null');
  });

  it('ラベル項目の値が 0 でもPlacemarkのnameは "0" になる', () => {
    const layer = makeLayer('POINT', [f('count', 'INTEGER')], 'count');
    const gj = parseKml(generateKML([rec({ latitude: 35, longitude: 135 }, { count: 0 })], layer));
    expect(gj.features[0].properties?.name).toBe('0');
  });

  it('[回帰] 色はKMLのaabbggrr順で出力される(#ff0000 → ff0000ff)', () => {
    const layer = makeLayer('LINE', [f('name', 'STRING')]);
    const kml = generateKML(
      [rec([{ latitude: 35, longitude: 135 }, { latitude: 35.1, longitude: 135.1 }], { name: 'a' })],
      layer
    );
    expect(kml).toContain('<color>ff0000ff</color>');
  });

  it('[回帰] 軌跡の既定色（8桁のhex #0000FFee）が白ではなく青で出る', () => {
    const base = makeLayer('LINE', [f('name', 'STRING')]);
    const layer = { ...base, colorStyle: { ...base.colorStyle, color: '#0000FFee' } };
    const kml = generateKML(
      [rec([{ latitude: 35, longitude: 135 }, { latitude: 35.1, longitude: 135.1 }], { name: 'a' })],
      layer
    );
    expect(kml).toContain('<color>eeff0000</color>');
    expect(kml).not.toContain('<color>ffffffff</color>');
  });

  it('[回帰] 写真項目はファイル名がdescriptionに出る', () => {
    const layer = makeLayer('POINT', [f('photo', 'PHOTO')]);
    const photo: PhotoType = { id: 'p', name: 'IMG_1.jpg', uri: null, url: null, key: null, width: 1, height: 1, thumbnail: 't' };
    const gj = parseKml(generateKML([rec({ latitude: 35, longitude: 135 }, { photo: [photo] })], layer));
    expect(String(gj.features[0].properties?.description)).toContain('photo: IMG_1.jpg');
  });
});

// ---------------------------------------------------------------------------
// 2. generateKML → 取り込み の往復
// ---------------------------------------------------------------------------
describe('generateKML → KML取り込み の往復', () => {
  it('[回帰] POINTの座標が往復で一致する（負の経度・小数点以下多桁）', async () => {
    const layer = makeLayer('POINT', [f('name', 'STRING')], 'name');
    const coords = { latitude: -33.8688197, longitude: -151.2092955 };
    const { ret, data } = await importViaHook(generateKML([rec(coords, { name: 'a' })], layer), 'p.kml');
    expect(ret.isOK).toBe(true);
    expect(data[0][0].coords).toEqual(coords);
  });

  it('[回帰] LINEの座標列が往復で一致する', async () => {
    const layer = makeLayer('LINE', [f('name', 'STRING')], 'name');
    const coords: LocationType[] = [
      { latitude: 35, longitude: 135 },
      { latitude: 35.0001, longitude: 135.0002 },
      { latitude: 35.0003, longitude: 135.0001 },
    ];
    const { data } = await importViaHook(generateKML([rec(coords, { name: 'l' })], layer), 'l.kml');
    expect(data[0][0].coords).toEqual(coords);
  });

  it('POINTの標高(altitude)が往復で失われない', async () => {
    const layer = makeLayer('POINT', [f('name', 'STRING')]);
    const coords = { latitude: 35, longitude: 135, altitude: 1234.5 };
    const { data } = await importViaHook(generateKML([rec(coords, { name: 'a' })], layer), 'p.kml');
    expect((data[0][0].coords as LocationType).altitude).toBe(1234.5);
  });

  it('POLYGONの穴(holes)が書き出され、取り込み直すと穴が残る', async () => {
    const layer = makeLayer('POLYGON', [f('name', 'STRING')]);
    const outer: LocationType[] = [
      { latitude: 35, longitude: 135 },
      { latitude: 35, longitude: 135.01 },
      { latitude: 35.01, longitude: 135.01 },
      { latitude: 35.01, longitude: 135 },
      { latitude: 35, longitude: 135 },
    ];
    const hole: LocationType[] = [
      { latitude: 35.004, longitude: 135.004 },
      { latitude: 35.004, longitude: 135.006 },
      { latitude: 35.006, longitude: 135.006 },
      { latitude: 35.006, longitude: 135.004 },
      { latitude: 35.004, longitude: 135.004 },
    ];
    const kml = generateKML([rec(outer, { name: 'pg' }, { holes: { hole0: hole } })], layer);
    expect(kml).toContain('innerBoundaryIs');
    const { data } = await importViaHook(kml, 'pg.kml');
    expect(Object.keys(data[0][0].holes ?? {})).toHaveLength(1);
  });

  it('全ての項目型の値が、取り込み直すと同じ項目名・同じ値で戻る（ExtendedData相当）', async () => {
    const fields: FieldType[] = [
      f('文字', 'STRING'),
      f('複数行', 'STRING_MULTI'),
      f('辞書', 'STRING_DICTIONARY'),
      f('連番', 'SERIAL'),
      f('日時', 'DATETIME'),
      f('日付', 'DATESTRING'),
      f('時刻', 'TIMESTRING'),
      f('時間帯', 'TIMERANGE'),
      f('整数', 'INTEGER'),
      f('小数', 'DECIMAL'),
      f('リスト', 'LIST'),
      f('ラジオ', 'RADIO'),
      f('チェック', 'CHECK'),
      f('参照', 'REFERENCE'),
    ];
    const value = {
      文字: 'a<b>&"c"',
      複数行: '一行目\n二行目: コロン付き',
      辞書: 'ヤマガラ',
      連番: 12,
      日時: '2026-11-21T10:00:00+09:00',
      日付: '2026-11-21',
      時刻: '10:00',
      時間帯: '10:00-11:00',
      整数: -5,
      小数: 3.14159,
      リスト: 'A',
      ラジオ: 'B',
      チェック: 'X,Y',
      参照: 'ref1',
    };
    const layer = makeLayer('POINT', fields, '文字');
    const { layers, data } = await importViaHook(
      generateKML([rec({ latitude: 35, longitude: 135 }, value)], layer),
      'all.kml'
    );
    const names = layers[0].field.map((x) => x.name);
    for (const fld of fields) expect(names).toContain(fld.name);
    for (const [k, v] of Object.entries(value)) expect(String(data[0][0].field[k])).toBe(String(v));
  });
});

// ---------------------------------------------------------------------------
// 3. 外部KMLの取り込み（togeojson経由）
// ---------------------------------------------------------------------------
describe('KML取り込み: 構造のバリエーション', () => {
  it('[回帰] Folderの入れ子の中のPlacemarkも取り込まれる', async () => {
    const k = wrapKml(
      `<Folder><name>f1</name><Folder><name>f2</name><Placemark><name>deep</name><Point><coordinates>135,35</coordinates></Point></Placemark></Folder></Folder>`
    );
    const { data } = await importViaHook(k, 'f.kml');
    expect(data[0]).toHaveLength(1);
    expect(data[0][0].field.name).toBe('deep');
  });

  it('[回帰] 名前空間無しのKMLも取り込める', async () => {
    const k = `<kml><Placemark><name>x</name><Point><coordinates>135,35</coordinates></Point></Placemark></kml>`;
    const { data } = await importViaHook(k, 'n.kml');
    expect(data[0][0].coords).toEqual({ latitude: 35, longitude: 135 });
  });

  it('CDATAのdescriptionは文字列として取り込まれる（オブジェクト{"@type":"html"}が項目値に入らない）', async () => {
    const k = wrapKml(
      `<Placemark><name>x</name><description><![CDATA[<b>太字</b> & <img src="a.jpg">]]></description><Point><coordinates>135,35</coordinates></Point></Placemark>`
    );
    const { data } = await importViaHook(k, 'c.kml');
    expect(data[0][0].field.description).toBe('<b>太字</b> & <img src="a.jpg">');
  });

  it('[回帰] Polygonの内側の穴(innerBoundaryIs)はholesとして取り込まれる', async () => {
    const k = wrapKml(
      `<Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>135,35 135.01,35 135.01,35.01 135,35.01 135,35</coordinates></LinearRing></outerBoundaryIs><innerBoundaryIs><LinearRing><coordinates>135.004,35.004 135.006,35.004 135.006,35.006 135.004,35.006 135.004,35.004</coordinates></LinearRing></innerBoundaryIs></Polygon></Placemark>`
    );
    const { data } = await importViaHook(k, 'h.kml');
    expect(Object.keys(data[0][0].holes ?? {})).toHaveLength(1);
  });

  it('MultiGeometry(同種のPoint×2)のPlacemarkが黙って捨てられない', async () => {
    const k = wrapKml(
      `<Placemark><name>mp</name><MultiGeometry><Point><coordinates>135,35</coordinates></Point><Point><coordinates>135.1,35.1</coordinates></Point></MultiGeometry></Placemark>`
    );
    const { data } = await importViaHook(k, 'mg.kml');
    expect(data.flat().length).toBeGreaterThanOrEqual(1);
  });

  it('MultiGeometry(LineString+Point混在)のPlacemarkが黙って捨てられない', async () => {
    const k = wrapKml(
      `<Placemark><name>mix</name><MultiGeometry><LineString><coordinates>135,35 135.1,35.1</coordinates></LineString><Point><coordinates>135,35</coordinates></Point></MultiGeometry></Placemark>`
    );
    const { data } = await importViaHook(k, 'mg2.kml');
    expect(data.flat().length).toBeGreaterThanOrEqual(1);
  });

  it('ジオメトリ無しのPlacemarkが混ざっていても、LineStringのPlacemarkは取り込まれる', async () => {
    const k = wrapKml(
      `<Placemark><name>line</name><LineString><coordinates>135,35 135.1,35.1</coordinates></LineString></Placemark><Placemark><name>nogeom</name></Placemark>`
    );
    const { layers, data } = await importViaHook(k, 'ng.kml');
    const lineLayerIdx = layers.findIndex((l) => l.type === 'LINE');
    expect(lineLayerIdx).toBeGreaterThanOrEqual(0);
    expect(data[lineLayerIdx]?.[0]?.field.name).toBe('line');
  });

  it('ExtendedDataの項目が2件目以降のPlacemarkにしか無くても項目として取り込まれる', async () => {
    const k = wrapKml(
      `<Placemark><name>a</name><Point><coordinates>135,35</coordinates></Point></Placemark><Placemark><name>b</name><ExtendedData><Data name="種名"><value>ヤマガラ</value></Data></ExtendedData><Point><coordinates>135.1,35.1</coordinates></Point></Placemark>`
    );
    const { layers, data } = await importViaHook(k, 'ed.kml');
    expect(layers[0].field.map((x) => x.name)).toContain('種名');
    expect(data[0][1].field['種名']).toBe('ヤマガラ');
  });

  it('[回帰] ExtendedData(Data/value)の文字列値が取り込まれる', async () => {
    const k = wrapKml(
      `<Placemark><name>a</name><ExtendedData><Data name="memo"><value>&lt;注意&gt; &amp; 改行\nあり</value></Data></ExtendedData><Point><coordinates>135,35</coordinates></Point></Placemark>`
    );
    const { data } = await importViaHook(k, 'ed2.kml');
    expect(data[0][0].field.memo).toBe('<注意> & 改行\nあり');
  });

  it('SchemaData/SimpleData(type=int)の値 0 が空文字にならない', async () => {
    const k = wrapKml(
      `<Schema id="s"><SimpleField name="count" type="int"/></Schema><Placemark><name>a</name><ExtendedData><SchemaData schemaUrl="#s"><SimpleData name="count">0</SimpleData></SchemaData></ExtendedData><Point><coordinates>135,35</coordinates></Point></Placemark>`
    );
    const { data } = await importViaHook(k, 'sd.kml');
    expect(data[0][0].field.count).toBe(0);
  });

  it('[回帰] 範囲外・数値でない座標のPlacemarkは取り込まない（地図が飛ばない）', async () => {
    const k = wrapKml(
      `<Placemark><name>ok</name><Point><coordinates>135,35</coordinates></Point></Placemark><Placemark><name>bad</name><Point><coordinates>135,999</coordinates></Point></Placemark><Placemark><name>nan</name><Point><coordinates>abc,def</coordinates></Point></Placemark>`
    );
    const { data } = await importViaHook(k, 'bad.kml');
    const names = data.flat().map((r) => r.field.name);
    expect(names).toContain('ok');
    expect(names).not.toContain('bad');
  });

  it('座標が数値でないPlacemark(abc,def)が「位置なしレコード」として黙って取り込まれない', async () => {
    const k = wrapKml(
      `<Placemark><name>ok</name><Point><coordinates>135,35</coordinates></Point></Placemark><Placemark><name>nan</name><Point><coordinates>abc,def</coordinates></Point></Placemark>`
    );
    const { data } = await importViaHook(k, 'nan.kml');
    expect(data.flat().map((r) => r.field.name)).not.toContain('nan');
  });

  it('Placemarkが1件も無いKMLは「受信しました」ではなく失敗として扱われる', async () => {
    const { ret, layers } = await importViaHook(wrapKml('<name>empty</name>'), 'empty.kml');
    expect(layers).toHaveLength(0);
    expect(ret.isOK).toBe(false);
  });

  // togeojson 単体は接頭辞込みのタグ名を探すので0件になる。取り込み処理（useGeoFile）が接頭辞を外してから渡すので、フック経由で確かめる
  it('名前空間プレフィックス付き(kml:Placemark)のKMLも取り込める', async () => {
    const k = `<kml:kml xmlns:kml="http://www.opengis.net/kml/2.2"><kml:Placemark><kml:name>x</kml:name><kml:Point><kml:coordinates>135,35</kml:coordinates></kml:Point></kml:Placemark></kml:kml>`;
    const { ret, layers } = await importViaHook(k, 'prefixed.kml');
    expect(ret.isOK).toBe(true);
    expect(layers).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 4. 壊れた・悪意ある入力
// ---------------------------------------------------------------------------
describe('KML取り込み: 壊れた・悪意ある入力', () => {
  it('[回帰] 途中で切れたKMLは例外としてユーザーに失敗が返る（一部だけ黙って取り込まない）', async () => {
    const k = `<kml><Placemark><name>x</name><Point><coordinates>135,35</coordinates></Point></Placemark><Placemark><name>y`;
    const { ret, layers } = await importViaHook(k, 'broken.kml');
    expect(ret.isOK).toBe(false);
    expect(layers).toHaveLength(0);
  });

  it('[回帰] XXE: 外部実体(SYSTEM "file:///etc/passwd")は解決されない', () => {
    const k = `<?xml version="1.0"?><!DOCTYPE kml [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><kml><Placemark><name>&xxe;</name><Point><coordinates>135,35</coordinates></Point></Placemark></kml>`;
    const gj = parseKml(k);
    const name = String(gj.features[0]?.properties?.name ?? '');
    expect(name).not.toMatch(/root:|nobody/);
  });

  it('[回帰] billion laughs(入れ子の内部実体)を展開せず、すぐに終わる', () => {
    const ents = ['<!ENTITY lol0 "lollollollollollollollollollol">'];
    for (let i = 1; i < 10; i++) ents.push(`<!ENTITY lol${i} "${`&lol${i - 1};`.repeat(10)}">`);
    const k = `<?xml version="1.0"?><!DOCTYPE kml [${ents.join('')}]><kml><Placemark><name>&lol9;</name><Point><coordinates>135,35</coordinates></Point></Placemark></kml>`;
    const t0 = Date.now();
    const gj = parseKml(k);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(String(gj.features[0]?.properties?.name ?? '').length).toBeLessThan(1000);
  });

  it('[回帰] XMLでないファイル(.kml拡張子のJSON)はエラーとして返る', async () => {
    const { ret, layers } = await importViaHook('{"type":"FeatureCollection"}', 'x.kml');
    expect(ret.isOK).toBe(false);
    expect(layers).toHaveLength(0);
  });

  it('[回帰] 空ファイルはエラーとして返る（クラッシュしない）', async () => {
    const { ret } = await importViaHook('', 'x.kml');
    expect(ret.isOK).toBe(false);
  });

  it('[回帰] プロパティ名 __proto__ / constructor の ExtendedData でもプロトタイプ汚染しない', async () => {
    const k = wrapKml(
      `<Placemark><name>a</name><ExtendedData><Data name="__proto__"><value>polluted</value></Data><Data name="constructor"><value>c</value></Data></ExtendedData><Point><coordinates>135,35</coordinates></Point></Placemark>`
    );
    await importViaHook(k, 'proto.kml');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. KMZ
// ---------------------------------------------------------------------------
const makeKmz = async (files: Record<string, string>) => {
  const z = new JSZip();
  for (const [n, c] of Object.entries(files)) z.file(n, c);
  return Buffer.from(await z.generateAsync({ type: 'base64' }), 'base64');
};

describe('KMZ取り込み', () => {
  it('[回帰] doc.kmlのPointを取り込める', async () => {
    const kmz = await makeKmz({
      'doc.kml': wrapKml(`<Placemark><name>p</name><Point><coordinates>135,35</coordinates></Point></Placemark>`),
    });
    const { ret, data } = await importViaHook(kmz, 'a.kmz');
    expect(ret.isOK).toBe(true);
    expect(data[0][0].field.name).toBe('p');
  });

  it('PointとLineStringが混在するKMZで、両方とも取り込まれる（KMLと同じ挙動）', async () => {
    const body = `<Placemark><name>p</name><Point><coordinates>135,35</coordinates></Point></Placemark><Placemark><name>l</name><LineString><coordinates>135,35 135.1,35.1</coordinates></LineString></Placemark>`;
    const kmlResult = await importViaHook(wrapKml(body), 'mix.kml');
    const kmzResult = await importViaHook(await makeKmz({ 'doc.kml': wrapKml(body) }), 'mix.kmz');
    expect(kmlResult.layers.map((l) => l.type).sort()).toEqual(['LINE', 'POINT']);
    expect(kmzResult.layers.map((l) => l.type).sort()).toEqual(['LINE', 'POINT']);
  });

  it('Placemarkが0件のdoc.kmlを含むKMZでも内部エラー(TypeError)にならない', async () => {
    const kmz = await makeKmz({ 'doc.kml': wrapKml('<name>empty</name>') });
    const { ret } = await importViaHook(kmz, 'e.kmz');
    expect(ret.message).not.toMatch(/Cannot read|undefined/);
  });

  it('detectGeoJsonType は features が空でも例外にならない', () => {
    expect(() => detectGeoJsonType({ type: 'FeatureCollection', features: [] })).not.toThrow();
  });

  it('拡張子が大文字(DOC.KML)のKMZでも取り込める', async () => {
    const kmz = await makeKmz({
      'DOC.KML': wrapKml(`<Placemark><name>p</name><Point><coordinates>135,35</coordinates></Point></Placemark>`),
    });
    const { data } = await importViaHook(kmz, 'upper.kmz');
    expect(data.flat()).toHaveLength(1);
  });

  it('macOSで作ったKMZの __MACOSX/._doc.kml が混ざっていても本体だけ取り込み、失敗にならない', async () => {
    const kmz = await makeKmz({
      'doc.kml': wrapKml(`<Placemark><name>p</name><Point><coordinates>135,35</coordinates></Point></Placemark>`),
      '__MACOSX/._doc.kml': '\u0000\u0005\u0016\u0007 Mac OS X        garbage',
    });
    const { ret, data } = await importViaHook(kmz, 'mac.kmz');
    expect(ret.isOK).toBe(true);
    expect(data.flat()).toHaveLength(1);
  });

  it('__MACOSX混入時、本体が取り込まれたのに「失敗」と表示される食い違いが起きない', async () => {
    const kmz = await makeKmz({
      'doc.kml': wrapKml(`<Placemark><name>p</name><Point><coordinates>135,35</coordinates></Point></Placemark>`),
      '__MACOSX/._doc.kml': '\u0000\u0005\u0016\u0007 Mac OS X        garbage',
    });
    const { ret, data } = await importViaHook(kmz, 'mac2.kmz');
    // 取り込んだなら成功、失敗なら何も取り込まない（どちらかに揃う）
    expect(ret.isOK).toBe(data.flat().length > 0);
  });

  it('[回帰] 壊れたZIPはエラーとして返る', async () => {
    const { ret } = await importViaHook(Buffer.from('PK\u0003\u0004broken'), 'b.kmz');
    expect(ret.isOK).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. 軌跡KML / KMZ書き出し
// ---------------------------------------------------------------------------
describe('generateTrackKML / generateKMZFile', () => {
  const T0 = Date.UTC(2026, 10, 21, 1, 0, 0);
  const coords: LocationType[] = [
    { latitude: 35, longitude: 135, altitude: 100, timestamp: T0 },
    { latitude: 35.001, longitude: 135.001, altitude: 0, timestamp: T0 + 1000 },
    { latitude: 35.002, longitude: 135.002, altitude: -12.5, timestamp: T0 + 2000 },
  ];

  it('[回帰] 軌跡名に特殊文字があっても整形式で、軌跡の座標と標高(0・負数含む)が往復で一致する', async () => {
    const name = '軌跡 <A&B> "x" 🌲';
    const k = generateTrackKML(coords, name);
    const gj = parseKml(k);
    const line = gj.features.find((x) => x.geometry?.type === 'LineString');
    expect(line?.properties?.name).toBe(name);
    expect((line?.geometry as { coordinates: number[][] }).coordinates).toEqual([
      [135, 35, 100],
      [135.001, 35.001, 0],
      [135.002, 35.002, -12.5],
    ]);
  });

  it('写真ファイル名に " や < が含まれてもdescriptionのimgタグ(HTML)が壊れない／注入されない', () => {
    const k = generateTrackKML(coords, 't', [
      { filename: 'a" onerror="alert(1)<b>.jpg', timestamp: T0, latitude: 35, longitude: 135 },
    ]);
    const gj = parseKml(k);
    const d = gj.features.find((x) => x.geometry?.type === 'Point')?.properties?.description as { value: string };
    // CDATAなのでtogeojsonは {"@type":"html", value} を返す。Google EarthはこのHTMLを吹き出しに描画する
    expect(d.value).not.toContain('onerror="alert(1)');
  });

  it('写真ファイル名に "]]>" が含まれても書き出しが例外にならず、取り込み直すとdescriptionが途中で切れない', () => {
    const k = generateTrackKML(coords, 't', [{ filename: 'x]]>y.jpg', timestamp: T0, latitude: 35, longitude: 135 }]);
    const gj = parseKml(k);
    const pt = gj.features.find((x) => x.geometry?.type === 'Point');
    expect(pt?.properties?.name).toBe('x]]>y.jpg');
    // img の src は KMZ に同梱するファイル名（ファイル名として不正な文字を除いたもの）を指す。
    // description が途中で切れず、src が同梱名と一致することを確かめる
    const desc = (pt?.properties?.description as { value: string }).value;
    expect(desc).toContain(`src="${kmzPhotoEntryNames(['x]]>y.jpg'])[0]}"`);
    expect(desc).toContain('width="480"');
  });

  it('[回帰] generateKMZFile: doc.kmlがルートにあり、写真が同梱され、KMZとして取り込み直せる', async () => {
    Platform.OS = 'ios';
    mockFiles['/photos/IMG_1.jpg'] = Buffer.from('JPEGDATA').toString('base64');
    const photos = [{ filename: 'IMG_1.jpg', timestamp: T0 + 500, latitude: 35.0005, longitude: 135.0005 }];
    const k = generateTrackKML(coords, 'track', photos);
    const path = await generateKMZFile(k, [{ name: 'IMG_1.jpg', uri: 'file:///photos/IMG_1.jpg' }], 'track');
    expect(path).toBe('/cache/export/track.kmz');
    const zip = await JSZip.loadAsync(mockFiles[path as string], { base64: true });
    expect(Object.keys(zip.files).sort()).toEqual(['IMG_1.jpg', 'doc.kml']);
    expect(await zip.file('doc.kml')!.async('string')).toBe(k);
    expect(Buffer.from(await zip.file('IMG_1.jpg')!.async('uint8array')).toString()).toBe('JPEGDATA');

    const { ret, layers } = await importViaHook(Buffer.from(mockFiles[path as string], 'base64'), 'track.kmz');
    expect(ret.isOK).toBe(true);
    expect(layers.length).toBeGreaterThanOrEqual(1);
  });

  it('generateKMZFile: 写真名がファイル名として不正な文字を含む場合もdoc.kml内の参照と同梱ファイル名が一致する', async () => {
    Platform.OS = 'ios';
    mockFiles['/photos/x.jpg'] = Buffer.from('J').toString('base64');
    const fname = '調査:地点1/写真?.jpg';
    const k = generateTrackKML(coords, 't', [{ filename: fname, timestamp: T0, latitude: 35, longitude: 135 }]);
    const path = await generateKMZFile(k, [{ name: fname, uri: 'file:///photos/x.jpg' }], 't2');
    const zip = await JSZip.loadAsync(mockFiles[path as string], { base64: true });
    const photoEntries = Object.keys(zip.files).filter((n) => n !== 'doc.kml');
    expect(k).toContain(`src="${photoEntries[0]}"`);
  });

  it('generateKMZFile: 同名の写真が2枚あっても片方が黙って上書きされない', async () => {
    Platform.OS = 'ios';
    mockFiles['/p/1.jpg'] = Buffer.from('ONE').toString('base64');
    mockFiles['/p/2.jpg'] = Buffer.from('TWO').toString('base64');
    const path = await generateKMZFile(
      generateTrackKML(coords, 't'),
      [
        { name: 'IMG.jpg', uri: 'file:///p/1.jpg' },
        { name: 'IMG.jpg', uri: 'file:///p/2.jpg' },
      ],
      't3'
    );
    const zip = await JSZip.loadAsync(mockFiles[path as string], { base64: true });
    expect(Object.keys(zip.files).filter((n) => n !== 'doc.kml')).toHaveLength(2);
  });
});

describe('エクスポート全体への波及（generateExportGeoData）', () => {
  it('1件のレコードに制御文字(\u000B)があっても、レイヤの書き出し(GeoJSON/CSV/KML…)全体が失敗しない', async () => {
    mockSelector = jest.fn().mockReturnValueOnce('p1').mockReturnValueOnce(user).mockReturnValue([]);
    Platform.OS = 'web';
    const { result } = renderHook(() => useGeoFile());
    const layer = makeLayer('POINT', [f('memo', 'STRING')]);
    const records = [
      rec({ latitude: 35, longitude: 135 }, { memo: '正常' }),
      rec({ latitude: 35.1, longitude: 135.1 }, { memo: 'Excelから貼り付け\u000B2行目' }),
    ];
    let out: { type: string }[] = [];
    let err: unknown;
    await act(async () => {
      try {
        out = await result.current.generateExportGeoData(layer, records, 'base');
      } catch (e) {
        err = e;
      }
    });
    expect(err).toBeUndefined();
    expect(out.map((o) => o.type)).toEqual(expect.arrayContaining(['GeoJSON', 'KML', 'CSV']));
  });
});

// geoJson2Data単体での確認（フックを通さない最小再現）
describe('geoJson2Data（KML由来GeoJSON）の最小再現', () => {
  it('LINE取り込みで geometry:null のフィーチャが混ざると全件が undefined になる（あるべき=LINEだけ取り込む）', () => {
    const gj = parseKml(
      wrapKml(
        `<Placemark><name>line</name><LineString><coordinates>135,35 135.1,35.1</coordinates></LineString></Placemark><Placemark><name>nogeom</name></Placemark>`
      )
    );
    const layer = createLayerFromGeoJson(gj, 'x', 'LINE');
    const out = geoJson2Data(gj, layer, 'LINE', 'u', null);
    expect(out).toBeDefined();
    expect(out?.map((r) => r.field.name)).toEqual(['line']);
  });
});
