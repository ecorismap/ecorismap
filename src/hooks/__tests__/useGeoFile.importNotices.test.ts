/**
 * useGeoFile の取り込み時の振る舞い（idの振り直し・GeometryCollection/MultiGeometryの分割・
 * 除外件数と座標系の通知・ネイティブCSVの文字コード判定）
 */
jest.mock('firebase/auth', () => ({ getAuth: jest.fn(() => ({})) }));
jest.mock('firebase/firestore', () => ({ getFirestore: jest.fn(() => ({})) }));
jest.mock('firebase/storage', () => ({ getStorage: jest.fn(() => ({})) }));
jest.mock('firebase/app-check', () => ({
  initializeAppCheck: jest.fn(),
  ReCaptchaEnterpriseProvider: jest.fn(),
}));
jest.mock('firebase/app', () => ({ getApp: jest.fn(() => ({})), initializeApp: jest.fn(() => ({})) }));
jest.mock('firebase/functions', () => ({ getFunctions: jest.fn(() => ({})), httpsCallable: jest.fn() }));
jest.mock('../../lib/firebase/firebase', () => ({
  auth: {},
  db: {},
  storage: {},
  firestore: {},
  functions: {},
  initialize: jest.fn(),
}));
jest.mock('../../lib/firebase/storage', () => ({ uploadPhoto: jest.fn(), downloadFile: jest.fn(), deletePhoto: jest.fn() }));

import { renderHook, act } from '@testing-library/react-hooks';
import { useGeoFile } from '../useGeoFile';
import { RecordType, UserType } from '../../types';
import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';

let mockDispatch = jest.fn();
let mockSelector = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => mockSelector(),
}));

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(() => Promise.resolve('')),
}));

const { Platform } = require('react-native');

const user: UserType = { uid: '0', email: 'a@example.com', displayName: 'tester', photoURL: '' };

const toDataUri = (text: string) => `data:application/octet-stream;base64,${Buffer.from(text).toString('base64')}`;

const importFile = async (uri: string, name: string) => {
  const { result } = renderHook(() => useGeoFile());
  let ret: { isOK: boolean; message: string } | undefined;
  await act(async () => {
    ret = await result.current.importGeoFile(uri, name);
  });
  return ret;
};

const addedRecords = (): RecordType[] =>
  mockDispatch.mock.calls
    .map((call) => call[0])
    .filter((action) => action.type === 'dataSet/addDataAction')
    .flatMap((action) => action.payload.flatMap((p: { data: RecordType[] }) => p.data));

const addedLayers = () =>
  mockDispatch.mock.calls.map((call) => call[0]).filter((action) => action.type === 'layers/addLayerAction');

describe('useGeoFile 取り込みの通知と正規化', () => {
  beforeEach(() => {
    Platform.OS = 'web';
    mockDispatch = jest.fn();
    // projectId, user, layers の順に参照される
    mockSelector = jest.fn().mockReturnValueOnce('0').mockReturnValueOnce(user).mockReturnValueOnce([]);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('単体.geojsonの _id はレコードidに使わず振り直す', async () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { _id: '01ABCDEFGHJKMNPQRSTVWXYZ00', name: 'a' },
          geometry: { type: 'Point', coordinates: [139, 35] },
        },
      ],
    };
    const ret = await importFile(toDataUri(JSON.stringify(geojson)), 'a.geojson');
    expect(ret?.isOK).toBe(true);
    const records = addedRecords();
    expect(records).toHaveLength(1);
    expect(records[0].id).not.toBe('01ABCDEFGHJKMNPQRSTVWXYZ00');
  });

  test('自前で書き出したLINEの.geojsonで、1点のスタンプと位置なしが点レイヤに重複しない', async () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { _id: 'A1', name: 'line' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [139, 35],
              [139.1, 35.1],
            ],
          },
        },
        { type: 'Feature', properties: { _id: 'A2', name: 'stamp' }, geometry: { type: 'Point', coordinates: [139, 35] } },
        { type: 'Feature', properties: { _id: 'A3', name: 'nocoords' }, geometry: null },
      ],
    };
    const ret = await importFile(toDataUri(JSON.stringify(geojson)), 'memo.geojson');
    expect(ret?.isOK).toBe(true);
    expect(addedLayers().map((action) => action.payload.type)).toEqual(['LINE']);
    expect(addedRecords().map((r) => r.field.name)).toEqual(['line', 'stamp', 'nocoords']);
  });

  test('外部の.geojsonで点と線が混在すると、点は点レイヤ・線は線レイヤに1回ずつ入る', async () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { name: 'p' }, geometry: { type: 'Point', coordinates: [139, 35] } },
        {
          type: 'Feature',
          properties: { name: 'l' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [139, 35],
              [139.1, 35.1],
            ],
          },
        },
      ],
    };
    const ret = await importFile(toDataUri(JSON.stringify(geojson)), 'mixed.geojson');
    expect(ret?.isOK).toBe(true);
    expect(addedLayers().map((action) => action.payload.type).sort()).toEqual(['LINE', 'POINT']);
    expect(addedRecords().map((r) => r.field.name).sort()).toEqual(['l', 'p']);
  });

  test('.geojsonのGeometryCollectionは構成要素ごとに取り込まれ、除外扱いにならない', async () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'gc' },
          geometry: {
            type: 'GeometryCollection',
            geometries: [
              { type: 'Point', coordinates: [139, 35] },
              { type: 'LineString', coordinates: [[139, 35], [139.1, 35.1]] },
            ],
          },
        },
      ],
    };
    const ret = await importFile(toDataUri(JSON.stringify(geojson)), 'gc.geojson');
    expect(ret).toStrictEqual({ isOK: true, message: 'hooks.message.receiveFile' });
    expect(addedRecords()).toHaveLength(2);
  });

  test('座標系が緯度経度でない.geojsonは、0件の通知に座標系の理由を添える', async () => {
    const geojson = {
      type: 'FeatureCollection',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::6677' } },
      features: [{ type: 'Feature', properties: { name: 'a' }, geometry: { type: 'Point', coordinates: [10, 20] } }],
    };
    const ret = await importFile(toDataUri(JSON.stringify(geojson)), 'p.geojson');
    expect(ret?.isOK).toBe(false);
    expect(ret?.message).toContain('hooks.message.noImportableData');
    expect(ret?.message).toContain('hooks.message.failLoadFile');
    expect(ret?.message).toContain('EPSG::6677');
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  test('KMLのMultiGeometryは分けて取り込み、スタイル由来の項目は作らない', async () => {
    const kml =
      '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>' +
      '<Style id="s"><LineStyle><color>ff0000ff</color><width>2</width></LineStyle></Style>' +
      '<Placemark><name>mp</name><styleUrl>#s</styleUrl><MultiGeometry>' +
      '<Point><coordinates>135,35</coordinates></Point><Point><coordinates>135.1,35.1</coordinates></Point>' +
      '</MultiGeometry></Placemark></Document></kml>';
    const ret = await importFile(toDataUri(kml), 'mp.kml');
    expect(ret).toStrictEqual({ isOK: true, message: 'hooks.message.receiveFile' });
    expect(addedRecords()).toHaveLength(2);
    const fieldNames = addedLayers().flatMap((action) => action.payload.field.map((f: { name: string }) => f.name));
    expect(fieldNames).not.toContain('styleUrl');
    expect(fieldNames).not.toContain('stroke');
  });

  test('GPXで緯度経度が不正な点を捨てたときは、除外件数を知らせる', async () => {
    const gpx =
      '<?xml version="1.0"?><gpx version="1.1" creator="t">' +
      '<wpt lat="35" lon="139"><name>ok</name></wpt><wpt lat="999" lon="139"><name>bad</name></wpt></gpx>';
    const ret = await importFile(toDataUri(gpx), 'w.gpx');
    expect(ret).toStrictEqual({
      isOK: true,
      message: 'hooks.message.receiveFile\nhooks.message.someFeaturesSkipped',
    });
  });

  test('CSVで座標が読めなかったレコードがあるときは、件数を知らせる', async () => {
    const csv = 'name,geometry\na,POINT(139 35)\nb,POINT(139 999)\n';
    const ret = await importFile(toDataUri(csv), 'c.csv');
    expect(ret).toStrictEqual({
      isOK: true,
      message: 'hooks.message.receiveFile\nhooks.message.someFeaturesSkipped',
    });
  });

  test('ネイティブのCSVはバイト列で読み、Shift_JISでも文字化けしない', async () => {
    Platform.OS = 'ios';
    // 「名前,geometry\n地点,POINT(139 35)\n」をShift_JISで表したバイト列
    const sjis = Buffer.from([
      ...[0x96, 0xbc, 0x91, 0x4f],
      ...Buffer.from(',geometry\n'),
      ...[0x92, 0x6e, 0x93, 0x5f],
      ...Buffer.from(',POINT(139 35)\n'),
    ]);
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(sjis.toString('base64'));
    const ret = await importFile('file:///tmp/s.csv', 's.csv');
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith('file:///tmp/s.csv', { encoding: 'base64' });
    expect(ret?.isOK).toBe(true);
    const records = addedRecords();
    expect(records).toHaveLength(1);
    expect(records[0].field['名前']).toBe('地点');
  });
});
