/**
 * Web の共有スタイルの保存（uploadStyle）。内容が同じなら上げ直さず、いまの URL と鍵を使い回す。
 * 上げ直すとダウンロードトークン（URL）が変わり、メンバーが開き直すたびに描画済みタイルが捨てられる。
 */
jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('../firebase', () => ({
  storage: {},
  ref: jest.fn((_storage: unknown, path: string) => path),
  uploadBytes: jest.fn(async () => undefined),
  getDownloadURL: jest.fn(async () => 'https://s/v0/b/b/o/projects%2FP1%2FSTYLE%2Fm1?alt=media&token=NEW'),
  deleteObject: jest.fn(),
  listAll: jest.fn(),
}));
jest.mock('../../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
jest.mock('../../virgilsecurity/e3kit', () => ({
  encryptFileEThreeRN: jest.fn(),
  decryptFileEThreeRN: jest.fn(),
  encryptFileEThree: jest.fn(async () => ({ encdata: 'ENC', key: 'NEWKEY' })),
  // 「復号」は鍵が OLDKEY のときだけ中身をそのまま返す
  decryptFileEThree: jest.fn(async (blob: { text: () => Promise<string> }, key: string) =>
    key === 'OLDKEY' ? { decdata: { text: () => blob.text() } } : { decdata: undefined }
  ),
}));
const mockLocalStyles: Record<string, string> = {};
jest.mock('../../../utils/db', () => ({
  db: {
    pmtiles: {
      get: jest.fn(async (id: string) => (id in mockLocalStyles ? { style: mockLocalStyles[id] } : undefined)),
    },
  },
}));
jest.mock('../../../utils/blob', () => ({ blobToBase64: jest.fn() }));

import { uploadBytes } from '../firebase';
import { uploadStyle } from '../storage';

const mockedUploadBytes = uploadBytes as jest.Mock;
const SHARED = 'style://https://s/v0/b/b/o/projects%2FP1%2FSTYLE%2Fm1?alt=media&token=OLD';
let cloudStyle: { status: number; body: string };
const fetchMock = jest.fn(async (_url: string) => ({
  status: cloudStyle.status,
  blob: async () => ({ text: async () => cloudStyle.body }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockLocalStyles.m1 = '{"name":"same"}';
  cloudStyle = { status: 200, body: '{"name":"same"}' };
  (global as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
});

describe('uploadStyle: 同じ内容なら共有中の URL を使い回す', () => {
  test('共有中のスタイルと同じ内容なら上げ直さず、URL と鍵をそのまま返す', async () => {
    const res = await uploadStyle('P1', 'm1', { styleURL: SHARED, encryptKey: 'OLDKEY' });
    expect(res).toEqual({ isOK: true, message: '', url: SHARED, key: 'OLDKEY' });
    expect(mockedUploadBytes).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(SHARED.replace('style://', ''));
  });

  test('内容が変わっていれば今までどおり上げ直し、新しい URL と鍵を返す', async () => {
    mockLocalStyles.m1 = '{"name":"changed"}';
    const res = await uploadStyle('P1', 'm1', { styleURL: SHARED, encryptKey: 'OLDKEY' });
    expect(res).toMatchObject({ isOK: true, key: 'NEWKEY' });
    expect(res.url).toContain('token=NEW');
    expect(mockedUploadBytes).toHaveBeenCalledWith('projects/P1/STYLE/m1', 'ENC');
  });

  test('共有中のスタイルを取れない・復号できないときは上げ直す', async () => {
    cloudStyle = { status: 404, body: '' };
    expect((await uploadStyle('P1', 'm1', { styleURL: SHARED, encryptKey: 'OLDKEY' })).key).toBe('NEWKEY');
    cloudStyle = { status: 200, body: '{"name":"same"}' };
    expect((await uploadStyle('P1', 'm1', { styleURL: SHARED, encryptKey: 'WRONG' })).key).toBe('NEWKEY');
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect((await uploadStyle('P1', 'm1', { styleURL: SHARED, encryptKey: 'OLDKEY' })).key).toBe('NEWKEY');
    expect(mockedUploadBytes).toHaveBeenCalledTimes(3);
  });

  test('別のプロジェクトの URL・鍵の無い地図・手元で取り込んだだけのスタイルは確かめずに上げる', async () => {
    const otherProject = SHARED.replace('P1', 'P2');
    const cases = [
      { styleURL: otherProject, encryptKey: 'OLDKEY' },
      { styleURL: SHARED },
      { styleURL: 'style://style.json', encryptKey: 'OLDKEY' },
      {},
    ];
    for (const shared of cases) {
      const res = await uploadStyle('P1', 'm1', shared);
      expect(res.key).toBe('NEWKEY');
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockedUploadBytes).toHaveBeenCalledTimes(4);
  });

  test('手元にスタイルが無ければ失敗（今までどおり）', async () => {
    delete mockLocalStyles.m1;
    const res = await uploadStyle('P1', 'm1', { styleURL: SHARED, encryptKey: 'OLDKEY' });
    expect(res.isOK).toBe(false);
    expect(mockedUploadBytes).not.toHaveBeenCalled();
  });
});
