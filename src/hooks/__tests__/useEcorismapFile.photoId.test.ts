/**
 * バックアップZIP（generateEcorisMapData → generateEcorisMapZip → openEcorisMapFile）の写真の扱い
 *  ・同名の写真が別レコードにあっても photo.id で分けて往復する（ZIP内・取り込み先とも）
 *  ・photo.id の階層が無い旧形式ZIPも取り込める
 *  ・fromProject でも写真がZIPに二重に入らない
 * ファイルシステムはメモリ上の偽物、ZIPの生成・展開は本物の JSZip を通す。
 */

jest.mock('firebase/auth', () => ({ getAuth: jest.fn(() => ({})), onAuthStateChanged: jest.fn() }));
jest.mock('firebase/firestore', () => ({ getFirestore: jest.fn(() => ({})) }));
jest.mock('firebase/storage', () => ({ getStorage: jest.fn(() => ({})), ref: jest.fn() }));
jest.mock('firebase/app-check', () => ({ initializeAppCheck: jest.fn() }));
jest.mock('firebase/app', () => ({ getApp: jest.fn(() => ({})), initializeApp: jest.fn(() => ({})) }));
jest.mock('firebase/functions', () => ({ getFunctions: jest.fn(() => ({})), httpsCallable: jest.fn() }));
jest.mock('../../lib/firebase/firebase', () => ({ auth: {}, db: {}, storage: {}, firestore: {}, functions: {} }));

const mockFiles = new Map<string, Buffer>();
const mockNorm = (p: string) => (p.startsWith('file://') ? p.slice('file://'.length) : p);

// クラウドの写真は url をキーにメモリ上へ用意し、取得したら一時ファイルとして置く
const mockCloud = new Map<string, string>();
const mockFetchPhoto = jest.fn(async (url: string, _key: string) => {
  const body = mockCloud.get(url);
  if (body === undefined) return { isOK: false, message: 'no cloud', data: undefined };
  const tmp = `/cache/fetched-${encodeURIComponent(url)}`;
  mockFiles.set(tmp, Buffer.from(body));
  return { isOK: true, message: '', data: tmp };
});
jest.mock('../../lib/firebase/storage', () => ({
  fetchPhoto: (url: string, key: string) => mockFetchPhoto(url, key),
  uploadPhoto: jest.fn(),
  deletePhoto: jest.fn(),
}));

jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/cache',
  DownloadDirectoryPath: '/download',
  mkdir: jest.fn(async () => undefined),
  exists: jest.fn(async (p: string) => mockFiles.has(mockNorm(p))),
  writeFile: jest.fn(async (p: string, data: string, enc: string) => {
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
    mockFiles.set(mockNorm(to), Buffer.from(Uint8Array.from(b)));
  }),
  unlink: jest.fn(async (p: string) => {
    const n = mockNorm(p);
    for (const k of [...mockFiles.keys()]) if (k === n || k.startsWith(`${n}/`)) mockFiles.delete(k);
  }),
  stat: jest.fn(async (p: string) => ({ size: mockFiles.get(mockNorm(p))?.length ?? 0 })),
}));

const mockMkdirs: string[] = [];
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
    mockFiles.set(mockNorm(uri), Buffer.from(data, opts?.encoding === 'base64' ? 'base64' : 'utf8'));
  }),
  makeDirectoryAsync: jest.fn(async (uri: string) => {
    mockMkdirs.push(uri);
  }),
  getInfoAsync: jest.fn(async (uri: string) => ({ exists: mockFiles.has(mockNorm(uri)), uri })),
  deleteAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({})),
  openDatabaseAsync: jest.fn(async () => ({})),
  deserializeDatabaseAsync: jest.fn(),
  deleteDatabaseSync: jest.fn(),
}));
jest.mock('../../utils/SQLite', () => ({
  importDictionary: jest.fn(async () => undefined),
  exportDatabase: jest.fn(async () => undefined),
  deleteDatabase: jest.fn(),
}));

jest.mock('../../components/molecules/AlertAsync', () => ({
  DuplicateLayerConfirmAsync: jest.fn(async () => 'newLayer'),
  AlertAsync: jest.fn(),
}));
jest.mock('../../components/organisms/ExportDestinationModal', () => ({
  showExportDestinationModal: jest.fn(async () => 'share'),
}));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));

const mockDispatch = jest.fn();
const mockState = {
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
jest.mock('../useRepository', () => ({ useRepository: () => ({}) }));
jest.mock('../useDynamicDictionaryInput', () => ({ clearAllDynamicDictionaries: jest.fn() }));
jest.mock('../useData', () => ({ clearAllVisibilitySnapshots: jest.fn() }));
jest.mock('../../utils/projectBackup', () => ({ saveProjectBackup: jest.fn() }));

import JSZip from 'jszip';
import { renderHook, act } from '@testing-library/react-hooks';
import { useEcorisMapFile } from '../useEcorismapFile';
import { generateEcorisMapZip } from '../../utils/File';
import { isUriInsideFolder } from '../../utils/safePath';
import { PHOTO_FOLDER } from '../../constants/AppConstants';
import type { LayerType, PhotoType, RecordType } from '../../types';

const LAYER_ID = '01LAYERPHOTOAAAAAAAAAAAAAA';
const layer: LayerType = {
  id: LAYER_ID,
  name: '写真レイヤ',
  type: 'POINT',
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
  } as unknown as LayerType['colorStyle'],
  label: '',
  visible: true,
  active: true,
  field: [{ id: 'FP', name: '写真', format: 'PHOTO' }],
};

const NAME = 'EMAP_20261121_093000.jpg';
const photo = (id: string, uri: string | null, url: string | null = null): PhotoType => ({
  id,
  name: NAME,
  uri,
  url,
  key: url === null ? null : 'KEY',
  width: 10,
  height: 10,
  thumbnail: null,
});

let recSeq = 0;
const record = (p: PhotoType): RecordType =>
  ({
    id: `REC${++recSeq}`,
    userId: undefined,
    displayName: null,
    visible: true,
    redraw: false,
    coords: { latitude: 35.1, longitude: 139.1 },
    field: { 写真: [p] },
  }) as RecordType;

const backupJson = (records: RecordType[]) =>
  JSON.stringify({
    dataSet: [{ layerId: LAYER_ID, userId: undefined, data: records }],
    layers: [layer],
    settings: mockState.settings,
    maps: [],
  });

const exportBackup = async (records: RecordType[], fromProject: boolean) => {
  const { result } = renderHook(() => useEcorisMapFile());
  const exportData = await result.current.generateEcorisMapData(
    {
      dataSet: [{ layerId: LAYER_ID, userId: undefined, data: records }],
      layers: [layer],
      settings: mockState.settings as never,
      maps: [],
    },
    { includePhoto: true, fromProject }
  );
  const zip = await generateEcorisMapZip(exportData, 'backup');
  return (mockFiles.get(mockNorm(zip?.source as string)) as Buffer).toString('base64');
};

const openBackup = async (base64: string) => {
  const uri = 'file:///inbox/backup.zip';
  mockFiles.set(mockNorm(uri), Buffer.from(base64, 'base64'));
  const { result } = renderHook(() => useEcorisMapFile());
  await act(async () => {
    await result.current.openEcorisMapFile(uri);
  });
  const dataSet = mockDispatch.mock.calls
    .map((c) => c[0] as { type: string; payload: unknown })
    .find((a) => a.type.endsWith('setDataSetAction'))?.payload as { layerId: string; data: RecordType[] }[];
  return dataSet[0].data.map((r) => (r.field['写真'] as PhotoType[])[0]);
};

const photoEntries = async (base64: string) => {
  const zip = await JSZip.loadAsync(base64, { base64: true });
  return Object.keys(zip.files).filter((k) => !zip.files[k].dir && k.endsWith('.jpg'));
};

beforeEach(() => {
  mockFiles.clear();
  mockCloud.clear();
  mockMkdirs.length = 0;
  mockDispatch.mockClear();
  mockFetchPhoto.mockClear();
});

describe('バックアップZIPの写真 × photo.id', () => {
  test('同名の写真が別レコードにあっても、別々の中身のまま往復する', async () => {
    const u1 = `${PHOTO_FOLDER}/LOCAL/${LAYER_ID}/U1/${NAME}`;
    const u2 = `${PHOTO_FOLDER}/LOCAL/${LAYER_ID}/U2/${NAME}`;
    mockFiles.set(mockNorm(u1), Buffer.from('JPEG-1'));
    mockFiles.set(mockNorm(u2), Buffer.from('JPEG-2'));
    const zip = await exportBackup([record(photo('PID1', u1)), record(photo('PID2', u2))], false);
    mockFiles.delete(mockNorm(u1));
    mockFiles.delete(mockNorm(u2));

    const photos = await openBackup(zip);
    expect(photos.map((p) => p.uri)).toEqual([
      `${PHOTO_FOLDER}/LOCAL/${LAYER_ID}/OWNER/PID1/${NAME}`,
      `${PHOTO_FOLDER}/LOCAL/${LAYER_ID}/OWNER/PID2/${NAME}`,
    ]);
    expect(photos.map((p) => mockFiles.get(mockNorm(p.uri as string))?.toString())).toEqual(['JPEG-1', 'JPEG-2']);
    expect(mockMkdirs).toEqual(
      expect.arrayContaining([
        `${PHOTO_FOLDER}/LOCAL/${LAYER_ID}/OWNER/PID1`,
        `${PHOTO_FOLDER}/LOCAL/${LAYER_ID}/OWNER/PID2`,
      ])
    );
  });

  test('photo.id の階層が無い旧形式のZIPも取り込める', async () => {
    const zip = new JSZip();
    zip.file('local_2026.json', backupJson([record(photo('PID1', 'file:///old/device/path.jpg'))]));
    zip.file(`写真レイヤ_${LAYER_ID}/${NAME}`, 'OLD-JPEG');
    const base64 = await zip.generateAsync({ type: 'base64' });

    const [p] = await openBackup(base64);
    expect(isUriInsideFolder(p.uri, PHOTO_FOLDER)).toBe(true);
    expect(mockFiles.get(mockNorm(p.uri as string))?.toString()).toBe('OLD-JPEG');
  });

  test('末尾ドットの写真名（以前のWebの名前）でも、末尾ドットが落ちたZIP内の写真を戻す（写真監査 P-M3）', async () => {
    const dotted = 'EMAP_20261101_101010_.';
    const zip = new JSZip();
    zip.file('local_2026.json', backupJson([record({ ...photo('PID1', 'blob:old'), name: dotted })]));
    //書き出しは sanitize-filename で末尾の「.」を落として入れる
    zip.file(`写真レイヤ_${LAYER_ID}/PID1/EMAP_20261101_101010_`, 'WEB-JPEG');
    const base64 = await zip.generateAsync({ type: 'base64' });

    const [p] = await openBackup(base64);
    expect(p.uri).not.toBe('blob:old');
    expect(isUriInsideFolder(p.uri, PHOTO_FOLDER)).toBe(true);
    expect(mockFiles.get(mockNorm(p.uri as string))?.toString()).toBe('WEB-JPEG');
  });

  test('パスに使えない photo.id はフォルダを分けず、写真フォルダの外にも書かない', async () => {
    const zip = new JSZip();
    zip.file('local_2026.json', backupJson([record(photo('..', 'file:///old/device/path.jpg'))]));
    zip.file(`写真レイヤ_${LAYER_ID}/${NAME}`, 'OLD-JPEG');
    const base64 = await zip.generateAsync({ type: 'base64' });

    const [p] = await openBackup(base64);
    expect(p.uri).toBe(`${PHOTO_FOLDER}/LOCAL/${LAYER_ID}/OWNER/${NAME}`);
    expect(mockFiles.get(mockNorm(p.uri as string))?.toString()).toBe('OLD-JPEG');
  });

  test('fromProject: クラウドの写真はZIPに一度だけ入り、取得も一度だけ', async () => {
    mockCloud.set('https://cloud/p1', 'CLOUD-1');
    mockCloud.set('https://cloud/p2', 'CLOUD-2');
    const zip = await exportBackup(
      [record(photo('PID1', null, 'https://cloud/p1')), record(photo('PID2', null, 'https://cloud/p2'))],
      true
    );
    const entries = await photoEntries(zip);
    expect(entries.sort()).toEqual([`写真レイヤ_${LAYER_ID}/PID1/${NAME}`, `写真レイヤ_${LAYER_ID}/PID2/${NAME}`]);
    expect(mockFetchPhoto).toHaveBeenCalledTimes(2);
    const z = await JSZip.loadAsync(zip, { base64: true });
    expect(await z.file(entries.sort()[0])?.async('string')).toBe('CLOUD-1');
    expect(await z.file(entries.sort()[1])?.async('string')).toBe('CLOUD-2');
  });
});
