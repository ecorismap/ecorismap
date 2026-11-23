/**
 * データ一覧の書き出しZIPから写真を戻す（restorePhotosFromZip）
 *  ・以前のWebが付けた末尾ドットの名前（「EMAP_…_.」）でも、ZIP内の末尾ドットが落ちた写真を見つける（写真監査 P-M3）
 *  ・Webで作るBlobに画像の種類を付ける。種類なしだとアップロードがRulesに拒否される（写真監査 P-M5）
 */
jest.mock('firebase/auth', () => ({ getAuth: jest.fn(() => ({})) }));
jest.mock('firebase/firestore', () => ({ getFirestore: jest.fn(() => ({})) }));
jest.mock('firebase/storage', () => ({ getStorage: jest.fn(() => ({})) }));
jest.mock('firebase/app-check', () => ({ initializeAppCheck: jest.fn(), ReCaptchaEnterpriseProvider: jest.fn() }));
jest.mock('firebase/app', () => ({ getApp: jest.fn(() => ({})), initializeApp: jest.fn(() => ({})) }));
jest.mock('firebase/functions', () => ({ getFunctions: jest.fn(() => ({})), httpsCallable: jest.fn() }));
jest.mock('../../lib/firebase/firebase', () => ({ auth: {}, db: {}, storage: {}, firestore: {}, functions: {} }));
jest.mock('../../lib/firebase/storage', () => ({ uploadPhoto: jest.fn(), downloadFile: jest.fn(), deletePhoto: jest.fn() }));
jest.mock('../../components/molecules/AlertAsync', () => ({ ConfirmAsync: jest.fn(), DuplicateLayerConfirmAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(async () => ({ uri: 'blob:thumb', width: 1, height: 1, base64: 'abc' })),
  SaveFormat: { JPEG: 'jpeg' },
}));

import JSZip from 'jszip';
import { restorePhotosFromZip, ConvertedGeoJson } from '../useGeoFile';
import { LayerType, RecordType } from '../../types';

const { Platform, Image } = require('react-native');

const LAYER_ID = '01LAYERPHOTOZIPAAAAAAAAAAA';
const layer = { id: LAYER_ID, name: 'L', type: 'POINT', field: [{ id: 'F', name: '写真', format: 'PHOTO' }] } as unknown as LayerType;

const converted = (photoValue: string): ConvertedGeoJson => ({
  records: [{ id: 'R1', field: {} } as unknown as RecordType],
  sourceProperties: [{ 写真: photoValue }],
  featureIndices: new Set([0]),
});

describe('restorePhotosFromZip（Web）', () => {
  const blobs: Blob[] = [];
  const originalCreate = URL.createObjectURL;
  beforeEach(() => {
    Platform.OS = 'web';
    blobs.length = 0;
    URL.createObjectURL = jest.fn((b: Blob) => {
      blobs.push(b);
      return `blob:${blobs.length}`;
    }) as typeof URL.createObjectURL;
    jest.spyOn(Image, 'getSize').mockImplementation((...args: unknown[]) => (args[1] as (w: number, h: number) => void)(4, 3));
  });
  afterEach(() => {
    URL.createObjectURL = originalCreate;
    jest.restoreAllMocks();
  });

  it('末尾ドットの名前でも、末尾ドットが落ちたZIP内の写真を戻す', async () => {
    const zip = new JSZip();
    zip.file(`L_${LAYER_ID}/EMAP_20261101_101010_`, 'img');
    const data = converted('EMAP_20261101_101010_.');
    const missing = await restorePhotosFromZip(data, layer, zip);
    expect(missing).toBe(0);
    const photos = data.records[0].field['写真'] as { name: string; uri: string }[];
    expect(photos).toHaveLength(1);
    expect(photos[0].name).toBe('EMAP_20261101_101010_.');
    expect(photos[0].uri).toBe('blob:1');
  });

  it('作るBlobに名前から画像の種類を付ける（分からなければimage/jpeg）', async () => {
    const zip = new JSZip();
    zip.file(`L_${LAYER_ID}/a.png`, 'img');
    zip.file(`L_${LAYER_ID}/b_`, 'img');
    const data = converted('a.png,b_.');
    await restorePhotosFromZip(data, layer, zip);
    expect(blobs.map((b) => b.type)).toEqual(['image/png', 'image/jpeg']);
  });
});
