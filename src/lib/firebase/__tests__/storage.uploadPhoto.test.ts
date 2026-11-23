jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  cacheDirectory: 'file:///cache/',
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
const mockPutFile = jest.fn(async () => undefined);
jest.mock('../firebase', () => ({
  storage: {},
  ref: jest.fn(() => ({ putFile: mockPutFile })),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(async () => 'https://example.com/photo'),
  deleteObject: jest.fn(),
  listAll: jest.fn(),
}));
jest.mock('../../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
jest.mock('../../virgilsecurity/e3kit', () => ({
  encryptFileEThreeRN: jest.fn(async (uri: string) => ({ encUri: uri.replace(/[^/]+$/, 'enc_$&'), key: 'k' })),
  decryptFileEThreeRN: jest.fn(),
  encryptFileEThree: jest.fn(),
  decryptFileEThree: jest.fn(),
}));
jest.mock('../../../utils/db', () => ({ db: {} }));
jest.mock('../../../utils/blob', () => ({ blobToBase64: jest.fn() }));
jest.mock('../../../utils/Photo', () => ({
  convertToUploadableJpeg: jest.fn(),
  deletePhotoFile: jest.fn(async () => undefined),
}));

import { uploadPhoto } from '../storage';
import { encryptFileEThreeRN } from '../../virgilsecurity/e3kit';
import { convertToUploadableJpeg, deletePhotoFile } from '../../../utils/Photo';

const mockConvert = convertToUploadableJpeg as jest.MockedFunction<typeof convertToUploadableJpeg>;
const mockEncrypt = encryptFileEThreeRN as jest.MockedFunction<typeof encryptFileEThreeRN>;
const mockDelete = deletePhotoFile as jest.MockedFunction<typeof deletePhotoFile>;

describe('uploadPhoto（JPEG/PNG以外の写真を送る前にJPEGにする: 写真監査 P-H1）', () => {
  beforeEach(() => jest.clearAllMocks());

  it('HEICは変換したJPEGを暗号化して送り、変換の一時ファイルを消す', async () => {
    mockConvert.mockResolvedValueOnce({ uri: 'file:///cache/conv.jpg', isConverted: true });

    const result = await uploadPhoto('P1', 'L1', 'U1', 'PH1', 'file:///docs/projects/P1/L1/U1/EMAP_1.heic');

    expect(result.isOK).toBe(true);
    expect(mockEncrypt).toHaveBeenCalledWith('file:///cache/conv.jpg');
    //putFileの拡張子がjpgになり、contentTypeがimage/jpegで届く
    expect(mockPutFile).toHaveBeenCalledWith('file:///cache/enc_conv.jpg');
    expect(mockDelete).toHaveBeenCalledWith('file:///cache/conv.jpg');
  });

  it('JPEGはそのまま暗号化して送り、元の写真は消さない', async () => {
    const uri = 'file:///docs/projects/P1/L1/U1/EMAP_1.jpg';
    mockConvert.mockResolvedValueOnce({ uri, isConverted: false });

    const result = await uploadPhoto('P1', 'L1', 'U1', 'PH1', uri);

    expect(result.isOK).toBe(true);
    expect(mockEncrypt).toHaveBeenCalledWith(uri);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('暗号化に失敗しても変換の一時ファイルは消す', async () => {
    mockConvert.mockResolvedValueOnce({ uri: 'file:///cache/conv.jpg', isConverted: true });
    mockEncrypt.mockRejectedValueOnce(new Error('enc failed'));

    const result = await uploadPhoto('P1', 'L1', 'U1', 'PH1', 'file:///docs/x.heic');

    expect(result.isOK).toBe(false);
    expect(mockDelete).toHaveBeenCalledWith('file:///cache/conv.jpg');
    expect(mockPutFile).not.toHaveBeenCalled();
  });
});

describe('uploadPhoto（Webは種類を明示して送る: 写真監査 P-M5）', () => {
  const { Platform } = require('react-native');
  const firebase = require('../firebase');
  const e3kit = require('../../virgilsecurity/e3kit');
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'web';
  });
  afterEach(() => {
    Platform.OS = 'ios';
  });

  it('種類のないBlob（ZIPから取り込んだ写真）でも、名前からimage/jpegを付けて送る', async () => {
    e3kit.encryptFileEThree.mockResolvedValueOnce({ encdata: new Blob(['x']), key: 'k' });
    const result = await uploadPhoto('P1', 'L1', 'U1', 'PH1', 'blob:abc', 'EMAP_1.jpg');
    expect(result.isOK).toBe(true);
    expect(firebase.uploadBytes).toHaveBeenCalledWith(expect.anything(), expect.any(Blob), { contentType: 'image/jpeg' });
  });

  it('PNGはimage/pngで送る', async () => {
    e3kit.encryptFileEThree.mockResolvedValueOnce({ encdata: new Blob(['x']), key: 'k' });
    await uploadPhoto('P1', 'L1', 'U1', 'PH1', 'blob:abc', 'EMAP_1.png');
    expect(firebase.uploadBytes).toHaveBeenCalledWith(expect.anything(), expect.any(Blob), { contentType: 'image/png' });
  });

  it('名前から分からなければBlobの種類、それも無ければimage/jpeg', async () => {
    e3kit.encryptFileEThree.mockResolvedValueOnce({ encdata: new Blob(['x'], { type: 'image/png' }), key: 'k' });
    await uploadPhoto('P1', 'L1', 'U1', 'PH1', 'blob:abc', 'EMAP_1_.');
    expect(firebase.uploadBytes).toHaveBeenLastCalledWith(expect.anything(), expect.any(Blob), { contentType: 'image/png' });

    e3kit.encryptFileEThree.mockResolvedValueOnce({ encdata: new Blob(['x']), key: 'k' });
    await uploadPhoto('P1', 'L1', 'U1', 'PH1', 'blob:abc');
    expect(firebase.uploadBytes).toHaveBeenLastCalledWith(expect.anything(), expect.any(Blob), { contentType: 'image/jpeg' });
  });
});
