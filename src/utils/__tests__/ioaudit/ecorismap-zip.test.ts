/**
 * 監査: EcorisMap形式のZIP（generateZipFile / generateEcorisMapZip で書き出し、useGeoFile / useEcorisMapFile で取り込み）
 *
 * 期待値は「あるべき挙動」。赤になったケースは不具合の候補。
 * ファイルシステム（react-native-fs / expo-file-system）はメモリ上の偽物、
 * expo-sqlite は表の名前と値だけを持つ偽物に差し替え、ZIPの生成・展開は本物の JSZip を通す。
 */

// ---- Firebase（import連鎖で読み込まれるので最初にモック） ----
jest.mock('firebase/auth', () => ({ getAuth: jest.fn(() => ({})), onAuthStateChanged: jest.fn() }));
jest.mock('firebase/firestore', () => ({ getFirestore: jest.fn(() => ({})) }));
jest.mock('firebase/storage', () => ({ getStorage: jest.fn(() => ({})), ref: jest.fn() }));
jest.mock('firebase/app-check', () => ({ initializeAppCheck: jest.fn() }));
jest.mock('firebase/app', () => ({ getApp: jest.fn(() => ({})), initializeApp: jest.fn(() => ({})) }));
jest.mock('firebase/functions', () => ({ getFunctions: jest.fn(() => ({})), httpsCallable: jest.fn() }));
jest.mock('../../../lib/firebase/firebase', () => ({ auth: {}, db: {}, storage: {}, firestore: {}, functions: {} }));
jest.mock('../../../lib/firebase/storage', () => ({
  fetchPhoto: jest.fn(async () => ({ isOK: false, message: 'no cloud', data: undefined })),
  uploadPhoto: jest.fn(),
  deletePhoto: jest.fn(),
}));

// ---- メモリ上のファイルシステム（file:// の有無を区別しない） ----
const mockFiles = new Map<string, Buffer>();
const mockWrites: string[] = [];
const mockMkdirs: string[] = [];
const mockNorm = (p: string) => (p.startsWith('file://') ? p.slice('file://'.length) : p);

jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/cache',
  DownloadDirectoryPath: '/download',
  mkdir: jest.fn(async (p: string) => {
    mockMkdirs.push(p);
  }),
  exists: jest.fn(async (p: string) => mockFiles.has(mockNorm(p))),
  writeFile: jest.fn(async (p: string, data: string, enc: string) => {
    mockWrites.push(p);
    mockFiles.set(mockNorm(p), Buffer.from(data, enc === 'base64' ? 'base64' : 'utf8'));
  }),
  readFile: jest.fn(async (p: string, enc: string) => {
    const b = mockFiles.get(mockNorm(p));
    if (b === undefined) throw new Error(`ENOENT ${p}`);
    return b.toString(enc === 'base64' ? 'base64' : 'utf8');
  }),
  copyFile: jest.fn(async (from: string, to: string) => {
    const b = mockFiles.get(mockNorm(from));
    if (b === undefined) throw new Error(`ENOENT ${from}`);
    mockWrites.push(to);
    mockFiles.set(mockNorm(to), Buffer.from(Uint8Array.from(b)));
  }),
  unlink: jest.fn(async (p: string) => {
    const n = mockNorm(p);
    for (const k of [...mockFiles.keys()]) if (k === n || k.startsWith(`${n}/`)) mockFiles.delete(k);
  }),
  stat: jest.fn(async (p: string) => ({ size: mockFiles.get(mockNorm(p))?.length ?? 0 })),
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  readAsStringAsync: jest.fn(async (uri: string, opts?: { encoding?: string }) => {
    const b = mockFiles.get(mockNorm(uri));
    if (b === undefined) throw new Error(`ENOENT ${uri}`);
    return b.toString(opts?.encoding === 'base64' ? 'base64' : 'utf8');
  }),
  writeAsStringAsync: jest.fn(async (uri: string, data: string, opts?: { encoding?: string }) => {
    mockWrites.push(uri);
    mockFiles.set(mockNorm(uri), Buffer.from(data, opts?.encoding === 'base64' ? 'base64' : 'utf8'));
  }),
  makeDirectoryAsync: jest.fn(async (uri: string) => {
    mockMkdirs.push(uri);
  }),
  getInfoAsync: jest.fn(async (uri: string) => ({ exists: mockFiles.has(mockNorm(uri)), uri })),
  deleteAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
}));

// ---- expo-sqlite の偽物（表名→値の配列だけを持つ） ----
type MockTables = Map<string, (string | null)[]>;
const mockMainTables: MockTables = new Map();
const mockMakeDb = (tables: MockTables) => ({
  tables,
  getAllAsync: jest.fn(async (sql: string) => {
    if (/sqlite_schema/.test(sql)) return [...tables.keys()].map((name) => ({ name }));
    const m = sql.match(/SELECT \w+ FROM "([^"]+)"/);
    if (m) return (tables.get(m[1]) ?? []).map((value) => ({ value }));
    throw new Error(`unsupported sql ${sql}`);
  }),
  execAsync: jest.fn(async (sql: string) => {
    let m = sql.match(/^DROP TABLE IF EXISTS "([^"]+)"/);
    if (m) {
      tables.delete(m[1]);
      return;
    }
    m = sql.match(/^CREATE TABLE "([^"]+)"/);
    if (m) {
      tables.set(m[1], []);
      return;
    }
    throw new Error(`unsupported sql ${sql}`);
  }),
  runAsync: jest.fn(async (sql: string, params: string[]) => {
    const m = sql.match(/^INSERT INTO "([^"]+)"/);
    if (!m) throw new Error(`unsupported sql ${sql}`);
    tables.get(m[1])?.push(...params);
  }),
  withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
  closeAsync: jest.fn(async () => undefined),
});
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => mockMakeDb(mockMainTables)),
  openDatabaseAsync: jest.fn(async () => mockMakeDb(new Map())),
  // 偽物の「SQLiteファイル」は {表名: 値[]} のJSONをバイト列にしたもの
  deserializeDatabaseAsync: jest.fn(async (bytes: Uint8Array) => {
    const obj = JSON.parse(Buffer.from(bytes).toString('utf8')) as Record<string, (string | null)[]>;
    return mockMakeDb(new Map(Object.entries(obj)));
  }),
  deleteDatabaseSync: jest.fn(),
}));

// フックからは辞書の取り込み・書き出しの呼ばれ方を記録する（中身の検証は requireActual で別に行う）
const mockImportDictionary = jest.fn(async (..._args: unknown[]) => undefined);
const mockExportDatabase = jest.fn(async (_layerId: string): Promise<string | undefined> => undefined);
jest.mock('../../SQLite', () => ({
  importDictionary: (...args: unknown[]) => mockImportDictionary(...args),
  exportDatabase: (layerId: string) => mockExportDatabase(layerId),
  deleteDatabase: jest.fn(),
}));

// ---- UI・Redux ----
let mockDuplicateChoice: 'replace' | 'newLayer' | 'cancel' = 'newLayer';
const mockDuplicateConfirm = jest.fn(async () => mockDuplicateChoice);
jest.mock('../../../components/molecules/AlertAsync', () => ({
  DuplicateLayerConfirmAsync: () => mockDuplicateConfirm(),
  AlertAsync: jest.fn(),
}));
jest.mock('../../../components/organisms/ExportDestinationModal', () => ({
  showExportDestinationModal: jest.fn(async () => 'share'),
}));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));

const mockDispatch = jest.fn();
const mockState: { settings: Record<string, unknown>; user: Record<string, unknown>; layers: unknown[] } = {
  settings: { projectId: undefined, tutrials: {}, mapRegion: {}, mapType: 'standard' },
  user: { uid: 'u1', displayName: 'Tester' },
  layers: [],
};
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (s: unknown) => unknown) => selector(mockState),
  useStore: () => ({ getState: () => mockState }),
  shallowEqual: jest.fn(),
}));
jest.mock('../../../hooks/useRepository', () => ({ useRepository: () => ({ fetchAllPhotos: jest.fn(() => []) }) }));
jest.mock('../../../hooks/useDynamicDictionaryInput', () => ({ clearAllDynamicDictionaries: jest.fn() }));
jest.mock('../../../hooks/useData', () => ({ clearAllVisibilitySnapshots: jest.fn() }));
jest.mock('../../projectBackup', () => ({ saveProjectBackup: jest.fn() }));

import JSZip from 'jszip';
import { Image as RNImage } from 'react-native';
import { renderHook, act } from '@testing-library/react-hooks';
import { useGeoFile } from '../../../hooks/useGeoFile';
import { useEcorisMapFile } from '../../../hooks/useEcorismapFile';
import { generateZipFile, generateEcorisMapZip } from '../../File';
import { isSafePathSegment, isUriInsideFolder } from '../../safePath';
import { PHOTO_FOLDER } from '../../../constants/AppConstants';
import type { FieldType, LayerType, PhotoType, RecordType } from '../../../types';

const actualSQLite = jest.requireActual('../../SQLite') as typeof import('../../SQLite');


// ---------------- ヘルパー ----------------

const colorStyle = {
  colorType: 'SINGLE',
  transparency: 0.8,
  color: '#ff0000',
  fieldName: '',
  customFieldValue: '',
  colorRamp: 'RANDOM',
  colorList: [],
  lineWidth: 1.5,
} as unknown as LayerType['colorStyle'];

const makeLayer = (over: Partial<LayerType> = {}): LayerType => ({
  id: '01LAYERAAAAAAAAAAAAAAAAAAA',
  name: 'テストレイヤ',
  type: 'POINT',
  permission: 'PRIVATE',
  colorStyle,
  label: '',
  visible: true,
  active: true,
  field: [],
  ...over,
});

const photo = (name: string, uri: string, id = `p-${name}`): PhotoType => ({
  id,
  name,
  uri,
  url: null,
  key: null,
  width: 10,
  height: 10,
  thumbnail: null,
});

let recSeq = 0;
const pointRecord = (field: RecordType['field'], coords = { latitude: 35.1, longitude: 139.1 }): RecordType =>
  ({
    id: `REC${++recSeq}`,
    userId: undefined,
    displayName: null,
    visible: true,
    redraw: false,
    coords,
    field,
  }) as RecordType;

const actions = () => mockDispatch.mock.calls.map((c) => c[0] as { type: string; payload: any });
const addedLayers = () => actions().filter((a) => a.type.endsWith('addLayerAction')).map((a) => a.payload as LayerType);
const updatedLayers = () =>
  actions().filter((a) => a.type.endsWith('updateLayerAction')).map((a) => a.payload as LayerType);
const addedRecords = () =>
  actions()
    .filter((a) => a.type.endsWith('addDataAction'))
    .flatMap((a) => a.payload)
    .flatMap((d: { data: RecordType[] }) => d.data) as RecordType[];

/** generateExportGeoData → generateZipFile で書き出し、ZIPの中身(base64)を返す */
const exportLayerZip = async (
  layer: LayerType,
  records: RecordType[],
  option: { settingsOnly?: boolean; exportPhoto?: boolean; exportDictionary?: boolean } = {},
  fileName = 'data_export'
) => {
  const { result } = renderHook(() => useGeoFile());
  const exportData = await result.current.generateExportGeoData(layer, records, 'base', option);
  const path = await generateZipFile(exportData, fileName, 'zip');
  expect(path).toBeDefined();
  const buf = mockFiles.get(mockNorm(path as string));
  expect(buf).toBeDefined();
  return (buf as Buffer).toString('base64');
};

/** base64のZIPを「ファイルを開く」から取り込んだときと同じ経路(importGeoFile)で取り込む */
const importZip = async (base64: string, name = 'import.zip') => {
  const uri = `file:///inbox/${name}`;
  mockFiles.set(mockNorm(uri), Buffer.from(base64, 'base64'));
  const { result } = renderHook(() => useGeoFile());
  let ret: { isOK: boolean; message: string } = { isOK: false, message: 'not run' };
  await act(async () => {
    ret = await result.current.importGeoFile(uri, name);
  });
  return ret;
};

const buildZip = async (entries: Record<string, string | Uint8Array>) => {
  const zip = new JSZip();
  for (const [k, v] of Object.entries(entries)) zip.file(k, v);
  return zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
};

const sqliteBytes = (tables: Record<string, (string | null)[]>) => Buffer.from(JSON.stringify(tables), 'utf8');

beforeEach(() => {
  mockFiles.clear();
  mockWrites.length = 0;
  mockMkdirs.length = 0;
  mockMainTables.clear();
  mockDispatch.mockClear();
  mockImportDictionary.mockClear();
  mockExportDatabase.mockReset();
  mockExportDatabase.mockImplementation(async () => undefined);
  mockDuplicateConfirm.mockClear();
  mockDuplicateChoice = 'newLayer';
  mockState.layers = [];
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  // jest-expoのImageLoaderモックは旧シグネチャ(uri, success)のままで、RN 0.85のImage.getSizeから呼ぶと例外になる。
  // 取り込んだ写真の原画寸法として返す値を固定する（afterEachのrestoreAllMocksで外れるので毎回張る）
  jest
    .spyOn(RNImage, 'getSize')
    .mockImplementation(((_uri: string, success: (width: number, height: number) => void) =>
      success(4032, 3024)) as typeof RNImage.getSize);
});
afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------- 1. 正常系の往復（回帰防止） ----------------

const allFormatFields: FieldType[] = [
  { id: 'F_STR', name: 'str', format: 'STRING' },
  { id: 'F_MULTI', name: 'multi', format: 'STRING_MULTI' },
  { id: 'F_DIC', name: 'dic', format: 'STRING_DICTIONARY', useDictionaryAdd: true },
  { id: 'F_DYN', name: 'dyn', format: 'STRING_DYNAMIC' },
  { id: 'F_SERIAL', name: 'serial', format: 'SERIAL' },
  { id: 'F_DT', name: 'datetime', format: 'DATETIME' },
  { id: 'F_DS', name: 'datestring', format: 'DATESTRING' },
  { id: 'F_TS', name: 'timestring', format: 'TIMESTRING' },
  { id: 'F_TR', name: 'timerange', format: 'TIMERANGE' },
  { id: 'F_INT', name: 'integer', format: 'INTEGER' },
  { id: 'F_DEC', name: 'decimal', format: 'DECIMAL' },
  { id: 'F_NR', name: 'numberrange', format: 'NUMBERRANGE' },
  {
    id: 'F_LIST',
    name: 'list',
    format: 'LIST',
    list: [{ value: 'ア', isOther: false, customFieldValue: 'A1' }],
    codeFieldId: 'F_CODE',
  },
  { id: 'F_RADIO', name: 'radio', format: 'RADIO', list: [{ value: 'r1', isOther: false, customFieldValue: '' }] },
  { id: 'F_CHECK', name: 'check', format: 'CHECK', list: [{ value: 'c1', isOther: false, customFieldValue: '' }] },
  { id: 'F_CODE', name: 'code', format: 'STRING' },
  { id: 'F_TABLE', name: 'table', format: 'TABLE', list: [] },
  { id: 'F_LT', name: 'listtable', format: 'LISTTABLE', list: [] },
  { id: 'F_REF', name: 'ref', format: 'REFERENCE', list: [] },
];

const tricky = '日本語😀\n改行\tタブ,カンマ"引用"<tag>&amp;';

describe('1. 正常系の往復（レイヤ定義・GeoJSON）', () => {
  test('全型の文字列値（日本語・絵文字・改行・タブ・カンマ・引用符・<>&）が書き出し→取り込みで元に戻る', async () => {
    const layer = makeLayer({ field: allFormatFields.filter((f) => f.format !== 'PHOTO'), dictionaryFieldId: 'F_DIC' });
    const field: RecordType['field'] = {
      str: tricky,
      multi: 'line1\nline2\r\nline3',
      dic: 'ススキ',
      dyn: '動的',
      serial: 12,
      datetime: '2026-11-21T09:30:00+09:00',
      datestring: '2026-11-21',
      timestring: '09:30',
      timerange: '09:00–10:00',
      integer: -42,
      decimal: 3.14159,
      numberrange: '1–5',
      list: 'ア',
      radio: 'r1',
      check: 'c1,c2',
      code: 'A1',
      table: '',
      listtable: '',
      ref: '',
    };
    const rec = pointRecord(field);
    const zip = await exportLayerZip(layer, [rec]);
    const ret = await importZip(zip);
    expect(ret.isOK).toBe(true);
    const [imported] = addedLayers();
    expect(imported).toBeDefined();
    expect(imported.name).toBe(layer.name);
    expect(imported.field.map((f) => [f.name, f.format])).toEqual(layer.field.map((f) => [f.name, f.format]));
    const [r] = addedRecords();
    expect(r.field).toEqual(field);
    expect(r.coords).toEqual(rec.coords);
  });

  test('新規取り込みではレイヤID・フィールドIDが付け替わり、コード連動先(codeFieldId)と辞書フィールド(dictionaryFieldId)も追従する', async () => {
    const layer = makeLayer({ field: allFormatFields, dictionaryFieldId: 'F_DIC' });
    const zip = await exportLayerZip(layer, [], { settingsOnly: true });
    expect((await importZip(zip)).isOK).toBe(true);
    const [imported] = addedLayers();
    expect(imported.id).not.toBe(layer.id);
    const oldIds = new Set(layer.field.map((f) => f.id));
    imported.field.forEach((f) => expect(oldIds.has(f.id)).toBe(false));
    const list = imported.field.find((f) => f.name === 'list');
    const code = imported.field.find((f) => f.name === 'code');
    expect(list?.codeFieldId).toBe(code?.id);
    expect(imported.dictionaryFieldId).toBe(imported.field.find((f) => f.name === 'dic')?.id);
    expect(imported.active).toBe(false);
  });

  test('ZIP内のエントリ名はNFCに正規化される（NFDの日本語レイヤ名）', async () => {
    const nfd = 'がいど'; // 「がいど」をNFDで
    const { result } = renderHook(() => useGeoFile());
    const exportData = await result.current.generateExportGeoData(makeLayer({ name: nfd }), [], nfd, {
      settingsOnly: true,
      folder: nfd,
    });
    const path = await generateZipFile(exportData, nfd, 'zip');
    const zip = await JSZip.loadAsync((mockFiles.get(mockNorm(path as string)) as Buffer).toString('base64'), {
      base64: true,
    });
    const names = Object.keys(zip.files);
    expect(names).toContain(`${nfd.normalize('NFC')}/${nfd.normalize('NFC')}.json`);
  });
});

// ---------------- 2. 辞書SQLiteの往復（新規・置き換え） ----------------

describe('2. 辞書SQLite', () => {
  const dicLayer = () =>
    makeLayer({
      id: '01LAYERDICAAAAAAAAAAAAAAAA',
      field: [
        { id: '01FIELDDICAAAAAAAAAAAAAAAA', name: '種名', format: 'STRING_DICTIONARY', useDictionaryAdd: true },
        { id: '01FIELDSTRAAAAAAAAAAAAAAAA', name: 'メモ', format: 'STRING' },
      ],
      dictionaryFieldId: '01FIELDDICAAAAAAAAAAAAAAAA',
    });
  const oldTable = '_01LAYERDICAAAAAAAAAAAAAAAA_01FIELDDICAAAAAAAAAAAAAAAA';

  const exportDicZip = async (layer: LayerType) => {
    const dbUri = 'file:///doc/SQLite/temp_dic.sqlite';
    mockFiles.set(mockNorm(dbUri), sqliteBytes({ [oldTable]: ['ススキ', 'チガヤ', '日本語😀'] }));
    mockExportDatabase.mockImplementation(async () => dbUri);
    return exportLayerZip(layer, [], { settingsOnly: true, exportDictionary: true }, 'layer_export');
  };

  test('新規取り込み: 辞書は新しいレイヤID・フィールドIDの表として取り込まれる', async () => {
    const layer = dicLayer();
    const zip = await exportDicZip(layer);
    expect((await importZip(zip)).isOK).toBe(true);
    const [imported] = addedLayers();
    expect(mockImportDictionary).toHaveBeenCalledTimes(1);
    const [bytes, layerIdMap, fieldIdMap] = mockImportDictionary.mock.calls[0] as [
      Uint8Array,
      Record<string, string>,
      Record<string, string>,
    ];
    // ZIPを通したSQLiteのバイト列が変わっていないこと
    expect(Buffer.from(bytes).toString('utf8')).toBe(sqliteBytes({ [oldTable]: ['ススキ', 'チガヤ', '日本語😀'] }).toString());
    // 実際の importDictionary に同じ引数を渡して、どの表ができるかを確かめる
    await actualSQLite.importDictionary(bytes, layerIdMap, fieldIdMap);
    const newDicFieldId = imported.field.find((f) => f.name === '種名')?.id;
    expect([...mockMainTables.keys()]).toEqual([`_${imported.id}_${newDicFieldId}`]);
    expect(mockMainTables.get(`_${imported.id}_${newDicFieldId}`)).toEqual(['ススキ', 'チガヤ', '日本語😀']);
  });

  test('置き換え取り込み: 既存レイヤIDと元のフィールドIDの表として取り込まれ、データも置き換わる', async () => {
    const layer = dicLayer();
    const zip = await exportDicZip(layer);
    mockState.layers = [{ ...layer, groupId: 'G1', visible: false, active: false }];
    mockDuplicateChoice = 'replace';
    expect((await importZip(zip)).isOK).toBe(true);
    expect(mockDuplicateConfirm).toHaveBeenCalledTimes(1);
    expect(addedLayers()).toHaveLength(0);
    const [updated] = updatedLayers();
    expect(updated.id).toBe(layer.id);
    expect(updated.groupId).toBe('G1');
    expect(updated.visible).toBe(false);
    const [bytes, layerIdMap, fieldIdMap] = mockImportDictionary.mock.calls[0] as [
      Uint8Array,
      Record<string, string>,
      Record<string, string>,
    ];
    mockMainTables.set(oldTable, ['古い値']);
    await actualSQLite.importDictionary(bytes, layerIdMap, fieldIdMap);
    expect(mockMainTables.get(oldTable)).toEqual(['ススキ', 'チガヤ', '日本語😀']);
    expect(actions().some((a) => a.type.endsWith('deleteDataAction'))).toBe(true);
  });

  test('重複確認でキャンセルしたら何も取り込まない', async () => {
    const layer = dicLayer();
    const zip = await exportDicZip(layer);
    mockState.layers = [layer];
    mockDuplicateChoice = 'cancel';
    const ret = await importZip(zip);
    expect(ret).toEqual({ isOK: false, message: '' });
    expect(mockImportDictionary).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  test('対応表にない表・不正な表名は取り込まない（SQL埋め込み防止）', async () => {
    const bad = sqliteBytes({
      '_L1_F1': ['ok'],
      '_OTHER_F1': ['他レイヤ'],
      '_L1_F1"; DROP TABLE x; --': ['inj'],
      sqlite_sequence: ['x'],
    });
    await actualSQLite.importDictionary(bad, { L1: 'NL', 'L1"': 'NL' }, { F1: 'NF', 'F1"; DROP TABLE x; --': 'NF' });
    expect([...mockMainTables.keys()]).toEqual(['_NL_NF']);
    expect(mockMainTables.get('_NL_NF')).toEqual(['ok']);
  });

  test('辞書の値にNULL（外部で作ったSQLite）が混ざっても取り込みが例外で止まらない', async () => {
    const withNull = sqliteBytes({ _L1_F1: ['a', null, 'b'] });
    await expect(actualSQLite.importDictionary(withNull, { L1: 'NL' }, { F1: 'NF' })).resolves.toBeUndefined();
    expect(mockMainTables.get('_NL_NF')).toEqual(expect.arrayContaining(['a', 'b']));
  });

  test('書き出したレイヤ定義JSONにクラウド辞書の復号鍵(dictionaryKey)を含めない', async () => {
    const layer = { ...dicLayer(), dictionaryKey: 'SECRET-KEY-FOR-CLOUD-DICTIONARY' };
    const zipB64 = await exportLayerZip(layer, [], { settingsOnly: true }, 'layer_secret');
    const zip = await JSZip.loadAsync(zipB64, { base64: true });
    const jsonName = Object.keys(zip.files).find((f) => f.endsWith('.json')) as string;
    const json = await zip.files[jsonName].async('text');
    expect(json).not.toContain('SECRET-KEY-FOR-CLOUD-DICTIONARY');
  });
});

// ---------------- 3. データの往復で値・レコードが欠ける ----------------

describe('3. データ（GeoJSON経由）の往復', () => {
  test('INTEGER/DECIMAL/SERIALの0は0のまま戻る（空文字にならない）', async () => {
    const layer = makeLayer({
      field: [
        { id: 'F1', name: 'count', format: 'INTEGER' },
        { id: 'F2', name: 'ratio', format: 'DECIMAL' },
        { id: 'F3', name: 'no', format: 'SERIAL' },
      ],
    });
    const zip = await exportLayerZip(layer, [pointRecord({ count: 0, ratio: 0, no: 0 })]);
    expect((await importZip(zip)).isOK).toBe(true);
    expect(addedRecords()[0].field).toEqual({ count: 0, ratio: 0, no: 0 });
  });

  test('巨大数・小数・負数はそのまま戻る', async () => {
    const layer = makeLayer({
      field: [
        { id: 'F1', name: 'big', format: 'INTEGER' },
        { id: 'F2', name: 'dec', format: 'DECIMAL' },
      ],
    });
    const zip = await exportLayerZip(layer, [pointRecord({ big: Number.MAX_SAFE_INTEGER, dec: -0.000123 })]);
    await importZip(zip);
    expect(addedRecords()[0].field).toEqual({ big: Number.MAX_SAFE_INTEGER, dec: -0.000123 });
  });

  test('写真付きで書き出したZIPを取り込むと、写真がレコードに戻る', async () => {
    const layer = makeLayer({ field: [{ id: 'FP', name: '写真', format: 'PHOTO' }] });
    const uri = `${PHOTO_FOLDER}/LOCAL/${layer.id}/OWNER/EMAP_20261121_093000.jpg`;
    mockFiles.set(mockNorm(uri), Buffer.from('JPEG-BYTES-1'));
    const zipB64 = await exportLayerZip(layer, [pointRecord({ 写真: [photo('EMAP_20261121_093000.jpg', uri)] })], {
      exportPhoto: true,
    });
    // 写真はZIPに入っている
    const zip = await JSZip.loadAsync(zipB64, { base64: true });
    expect(Object.keys(zip.files).some((f) => f.endsWith('EMAP_20261121_093000.jpg'))).toBe(true);
    await importZip(zipB64);
    const photos = addedRecords()[0].field['写真'] as PhotoType[];
    expect(photos.map((p) => p.name)).toEqual(['EMAP_20261121_093000.jpg']);
    // 拡大表示はwidth/heightを使うので、サムネイルではなく原画の寸法が入る
    expect(photos.map((p) => [p.width, p.height])).toEqual([[4032, 3024]]);
  });

  // 監査で不採用: アプリの書き出しでは作れないZIP（選択0件では書き出しボタンが無効、設定だけの書き出しは別経路で往復する）
  test.skip('レコード0件のレイヤのデータZIPを取り込んでも、レイヤ自体は追加される', async () => {
    const layer = makeLayer({ field: [{ id: 'F1', name: 'name', format: 'STRING' }] });
    const zip = await exportLayerZip(layer, []);
    const ret = await importZip(zip);
    expect(ret.isOK).toBe(true);
    expect(addedLayers()).toHaveLength(1);
  });

  test('非表示にしたレコードは非表示のまま戻る', async () => {
    const layer = makeLayer({ field: [{ id: 'F1', name: 'name', format: 'STRING' }] });
    const hidden = { ...pointRecord({ name: 'x' }), visible: false };
    await importZip(await exportLayerZip(layer, [hidden]));
    expect(addedRecords()[0].visible).toBe(false);
  });

  test('マップメモ（ライン）: スタンプ（1点）と線の色・太さ・グループが戻る', async () => {
    const layer = makeLayer({ type: 'LINE', field: [{ id: 'F1', name: 'name', format: 'STRING' }] });
    const line = {
      ...pointRecord({ name: 'line', _strokeColor: 'rgba(255,0,0,1)', _strokeWidth: 3, _group: '' }),
      coords: [
        { latitude: 35, longitude: 139 },
        { latitude: 35.001, longitude: 139.001 },
      ],
    } as RecordType;
    const stamp = {
      ...pointRecord({ name: 'stamp', _strokeColor: 'rgba(0,0,255,1)', _strokeWidth: 3, _stamp: 'CIRCLE', _group: '' }),
      coords: [{ latitude: 35.002, longitude: 139.002 }],
    } as RecordType;
    await importZip(await exportLayerZip(layer, [line, stamp]));
    const recs = addedRecords();
    expect(recs.map((r) => r.field.name).sort()).toEqual(['line', 'stamp']);
    expect(recs.find((r) => r.field.name === 'line')?.field._strokeColor).toBe('rgba(255,0,0,1)');
  });

  test('ライン: 座標の無いレコードが1件混ざっても、他のラインが失われない', async () => {
    const layer = makeLayer({ type: 'LINE', field: [{ id: 'F1', name: 'name', format: 'STRING' }] });
    const ok = {
      ...pointRecord({ name: 'ok' }),
      coords: [
        { latitude: 35, longitude: 139 },
        { latitude: 35.001, longitude: 139.001 },
      ],
    } as RecordType;
    const noCoords = { ...pointRecord({ name: 'nocoords' }), coords: undefined } as unknown as RecordType;
    await importZip(await exportLayerZip(layer, [ok, noCoords]));
    expect(addedRecords().map((r) => r.field.name).sort()).toEqual(['nocoords', 'ok']);
  });

  test.failing('ポリゴン: 頂点が書き出し→取り込みで間引かれない', async () => {
    const layer = makeLayer({ type: 'POLYGON', field: [{ id: 'F1', name: 'name', format: 'STRING' }] });
    // 一辺の途中に、直線から約1cm（1e-7度）だけずれた頂点を置く
    const ring = [
      { latitude: 35.0, longitude: 139.0 },
      { latitude: 35.0, longitude: 139.0005 },
      { latitude: 35.0000001, longitude: 139.001 },
      { latitude: 35.0, longitude: 139.0015 },
      { latitude: 35.001, longitude: 139.0015 },
      { latitude: 35.001, longitude: 139.0 },
      { latitude: 35.0, longitude: 139.0 },
    ];
    const poly = { ...pointRecord({ name: 'p' }), coords: ring } as RecordType;
    await importZip(await exportLayerZip(layer, [poly]));
    expect(addedRecords()[0].coords).toEqual(ring);
  });

  test('NONE（位置なし）レイヤ: 改行を含む値がCSV経由でも1レコードのまま戻る', async () => {
    const layer = makeLayer({ type: 'NONE', field: [{ id: 'F1', name: 'memo', format: 'STRING_MULTI' }] });
    const rec = { ...pointRecord({ memo: '1行目\n2行目' }), coords: undefined } as unknown as RecordType;
    await importZip(await exportLayerZip(layer, [rec]));
    const recs = addedRecords();
    expect(recs).toHaveLength(1);
    expect(recs[0].field.memo).toBe('1行目\n2行目');
  });
});

// ---------------- 4. 壊れた・悪意あるZIP ----------------

describe('4. 壊れた・悪意あるZIP（useGeoFile）', () => {
  test('ZIPでないバイト列は失敗として返り、何もdispatchしない', async () => {
    const ret = await importZip(Buffer.from('this is not a zip file').toString('base64'));
    expect(ret.isOK).toBe(false);
    expect(ret.message).not.toBe('');
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  test('途中で切れたZIPは失敗として返る', async () => {
    const full = Buffer.from(await buildZip({ 'a.json': JSON.stringify(makeLayer()) }), 'base64');
    const ret = await importZip(full.subarray(0, Math.floor(full.length / 2)).toString('base64'));
    expect(ret.isOK).toBe(false);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  test('レイヤ定義JSONが無い・壊れている・形が違う場合は失敗として返る', async () => {
    const cases: Record<string, string>[] = [
      { 'a.geojson': '{}' },
      { 'a.json': '{broken' },
      { 'a.json': JSON.stringify({ id: 1, name: 'x' }) },
      { 'a.json': 'null' },
    ];
    for (const entries of cases) {
      mockDispatch.mockClear();
      const ret = await importZip(await buildZip(entries));
      expect(ret.isOK).toBe(false);
      expect(mockDispatch).not.toHaveBeenCalled();
    }
  });

  test('../・絶対パス・長い名前・日本語名のエントリを含むZIPでも、端末にファイルを書かない（zip slip）', async () => {
    const layer = makeLayer({ field: [{ id: 'F1', name: 'name', format: 'STRING' }] });
    const geojson = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { name: 'x' }, geometry: { type: 'Point', coordinates: [139, 35] } }],
    };
    const zip = await buildZip({
      '../../../../doc/SQLite/evil.json': JSON.stringify(layer),
      '/abs/path/evil.geojson': JSON.stringify(geojson),
      [`${'長'.repeat(300)}.jpg`]: 'x',
      '../../doc/projects/LOCAL/x/OWNER/写真.jpg': 'JPEG',
    });
    // JSZipは読み込み時に ../ を解決して取り除く（元の名前は unsafeOriginalName に残る）
    const loadedZip = await JSZip.loadAsync(zip, { base64: true });
    expect(Object.keys(loadedZip.files).some((n) => n.split('/').includes('..'))).toBe(false);
    expect(Object.values(loadedZip.files).some((f) => f.unsafeOriginalName?.includes('../'))).toBe(true);
    mockWrites.length = 0;
    const ret = await importZip(zip);
    expect(ret.isOK).toBe(true);
    // 取り込み用に置いたZIP以外への書き込みが無い
    expect(mockWrites).toEqual([]);
    expect(addedRecords()).toHaveLength(1);
  });

  test('macOSのFinderで圧縮したZIP（__MACOSX/._*.json が先頭）でも取り込める', async () => {
    const layer = makeLayer({ field: [{ id: 'F1', name: 'name', format: 'STRING' }] });
    // AppleDoubleファイルはバイナリ（拡張属性）。JSONとしては読めない
    const appleDouble = new Uint8Array([0x00, 0x05, 0x16, 0x07, 0x00, 0x02, 0x00, 0x00]);
    const zip = await buildZip({
      '__MACOSX/layer/._base.json': appleDouble,
      'layer/base.json': JSON.stringify(layer),
    });
    const ret = await importZip(zip);
    expect(ret.isOK).toBe(true);
    expect(addedLayers()).toHaveLength(1);
  });

  test.failing('展開後に巨大になるエントリ（zip bomb）は展開前のサイズ表示で拒否する', async () => {
    const layer = makeLayer({ field: [{ id: 'F1', name: 'name', format: 'STRING' }] });
    // 30MBの同一文字はDEFLATEで数十KBに縮む
    const huge = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { name: 'a'.repeat(30 * 1024 * 1024) }, geometry: { type: 'Point', coordinates: [139, 35] } },
      ],
    });
    const zip = await buildZip({ 'l.json': JSON.stringify(layer), 'l.geojson': huge });
    const compressedSize = Buffer.from(zip, 'base64').length;
    expect(compressedSize).toBeLessThan(200 * 1024);
    const ret = await importZip(zip);
    // 圧縮率が極端なエントリは取り込まない（現状は全体をメモリに展開してから処理する）
    expect(ret.isOK).toBe(false);
  }, 60000);
});

// ---------------- 5. バックアップ/Drive形式（generateEcorisMapZip → openEcorisMapFile）の写真 ----------------

describe('5. generateEcorisMapZip ↔ openEcorisMapFile の写真', () => {
  const photoLayer = (id = '01LAYERPHOTOAAAAAAAAAAAAAA') =>
    makeLayer({ id, name: '写真レイヤ', field: [{ id: 'FP', name: '写真', format: 'PHOTO' }] });

  const exportBackup = async (layer: LayerType, records: RecordType[]) => {
    const { result } = renderHook(() => useEcorisMapFile());
    const exportData = await result.current.generateEcorisMapData(
      {
        dataSet: [{ layerId: layer.id, userId: undefined, data: records }],
        layers: [layer],
        settings: mockState.settings as never,
        maps: [],
      },
      { includePhoto: true, fromProject: false }
    );
    const zip = await generateEcorisMapZip(exportData, 'backup');
    expect(zip).toBeDefined();
    return (mockFiles.get(mockNorm(zip?.source as string)) as Buffer).toString('base64');
  };

  const openBackup = async (base64: string) => {
    const uri = 'file:///inbox/backup.zip';
    mockFiles.set(mockNorm(uri), Buffer.from(base64, 'base64'));
    const { result } = renderHook(() => useEcorisMapFile());
    let ret: { isOK: boolean; message: string } | undefined;
    await act(async () => {
      ret = await result.current.openEcorisMapFile(uri);
    });
    const dataSet = actions().find((a) => a.type.endsWith('setDataSetAction'))?.payload as
      | { layerId: string; data: RecordType[] }[]
      | undefined;
    return { ret, dataSet };
  };

  test('写真が往復し、取り込み先は写真フォルダ内で中身も同じ（回帰防止）', async () => {
    const layer = photoLayer();
    const uri = `${PHOTO_FOLDER}/LOCAL/${layer.id}/OWNER/EMAP_20261121_093000.jpg`;
    mockFiles.set(mockNorm(uri), Buffer.from('JPEG-A'));
    const zip = await exportBackup(layer, [pointRecord({ 写真: [photo('EMAP_20261121_093000.jpg', uri)] })]);
    mockFiles.delete(mockNorm(uri));
    const { dataSet } = await openBackup(zip);
    const p = (dataSet?.[0].data[0].field['写真'] as PhotoType[])[0];
    expect(isUriInsideFolder(p.uri, PHOTO_FOLDER)).toBe(true);
    expect(mockFiles.get(mockNorm(p.uri as string))?.toString()).toBe('JPEG-A');
  });

  test('同名の写真（秒単位の自動命名が重なった別レコード）が別々の中身のまま往復する', async () => {
    const layer = photoLayer();
    const u1 = `${PHOTO_FOLDER}/LOCAL/${layer.id}/U1/EMAP_20261121_093000.jpg`;
    const u2 = `${PHOTO_FOLDER}/LOCAL/${layer.id}/U2/EMAP_20261121_093000.jpg`;
    mockFiles.set(mockNorm(u1), Buffer.from('JPEG-FROM-MEMBER-1'));
    mockFiles.set(mockNorm(u2), Buffer.from('JPEG-FROM-MEMBER-2'));
    // 実データの photo.id は ulid で写真ごとに一意
    const r1 = pointRecord({ 写真: [photo('EMAP_20261121_093000.jpg', u1, '01PHOTOID000000000000000001')] });
    const r2 = pointRecord({ 写真: [photo('EMAP_20261121_093000.jpg', u2, '01PHOTOID000000000000000002')] });
    const zip = await exportBackup(layer, [r1, r2]);
    const { dataSet } = await openBackup(zip);
    const contents = dataSet?.[0].data.map((r) =>
      mockFiles.get(mockNorm((r.field['写真'] as PhotoType[])[0].uri as string))?.toString()
    );
    expect(contents).toEqual(['JPEG-FROM-MEMBER-1', 'JPEG-FROM-MEMBER-2']);
  });

  test('悪意あるファイル: 写真名にエンコードした ../ があっても写真フォルダの外へ書かない', async () => {
    const layer = photoLayer();
    const evilName = '%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2fSQLite%2fdictionary.sqlite';
    expect(isSafePathSegment(evilName)).toBe(false);
    const backup = {
      dataSet: [{ layerId: layer.id, userId: undefined, data: [pointRecord({ 写真: [photo(evilName, 'x')] })] }],
      layers: [layer],
      settings: mockState.settings,
      maps: [],
    };
    const zip = await buildZip({
      'local_2026.json': JSON.stringify(backup),
      [`写真レイヤ_${layer.id}/${evilName}`]: 'OVERWRITTEN',
    });
    await openBackup(zip);
    const photoWrites = mockWrites.filter((w) => w !== 'file:///inbox/backup.zip');
    expect(photoWrites.filter((w) => !isUriInsideFolder(w, PHOTO_FOLDER))).toEqual([]);
  });

  test('悪意あるファイル: レイヤIDにエンコードした ../ があっても写真フォルダの外にフォルダ・ファイルを作らない', async () => {
    // リテラルの ../ はJSZipがエントリ名から取り除くため照合に失敗するが、%2f はそのまま残る
    const layer = photoLayer('..%2f..%2f..%2fSQLite');
    const backup = {
      dataSet: [{ layerId: layer.id, userId: undefined, data: [pointRecord({ 写真: [photo('evil.jpg', 'x')] })] }],
      layers: [layer],
      settings: mockState.settings,
      maps: [],
    };
    const zip = await buildZip({
      'local_2026.json': JSON.stringify(backup),
      'x_..%2f..%2f..%2fSQLite/evil.jpg': 'OVERWRITTEN',
    });
    await openBackup(zip);
    const photoWrites = mockWrites.filter((w) => w !== 'file:///inbox/backup.zip');
    const targets = [...photoWrites, ...mockMkdirs.filter((d) => d.startsWith('file:///doc/')).map((d) => `${d}/x`)];
    expect(targets.filter((p) => !isUriInsideFolder(p, PHOTO_FOLDER))).toEqual([]);
  });
});
