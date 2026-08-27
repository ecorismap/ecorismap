import * as FileSystem from 'expo-file-system/legacy';
import { loadDownloadedDemTile } from '../demTileLoader';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/',
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { PNG: 'png' },
}));

const mockGetInfo = FileSystem.getInfoAsync as jest.Mock;
const mockReadAsString = FileSystem.readAsStringAsync as jest.Mock;

describe('loadDownloadedDemTile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ファイルが存在しなければmissing（未ダウンロード）', async () => {
    mockGetInfo.mockResolvedValue({ exists: false });
    const result = await loadDownloadedDemTile('gsi', 14, 100, 200);
    expect(result).toEqual({ kind: 'missing' });
    expect(mockGetInfo).toHaveBeenCalledWith('file:///test/tiles/dem_viewshed/gsi/14/100/200');
  });

  it('0バイトファイルはnoData（GSI確定404マーカー）', async () => {
    mockGetInfo.mockResolvedValue({ exists: true, size: 0 });
    const result = await loadDownloadedDemTile('gsi', 14, 100, 200);
    expect(result).toEqual({ kind: 'noData' });
  });

  it('中身のあるファイルはdataとしてバイト列を返す', async () => {
    mockGetInfo.mockResolvedValue({ exists: true, size: 3 });
    mockReadAsString.mockResolvedValue('AQID'); // [1, 2, 3]
    const result = await loadDownloadedDemTile('terrarium', 14, 100, 200);
    expect(result.kind).toBe('data');
    if (result.kind === 'data') {
      expect(Array.from(new Uint8Array(result.bytes))).toEqual([1, 2, 3]);
    }
    expect(mockGetInfo).toHaveBeenCalledWith('file:///test/tiles/dem_viewshed/terrarium/14/100/200');
  });

  it('読み取りエラーはmissing扱い（安全側=ネットワークへフォールバック）', async () => {
    mockGetInfo.mockRejectedValue(new Error('fs error'));
    const result = await loadDownloadedDemTile('gsi', 14, 100, 200);
    expect(result).toEqual({ kind: 'missing' });
  });
});
