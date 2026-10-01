import * as FileSystem from 'expo-file-system/legacy';
import { downloadDemTile, getDemTileMap } from '../demTileDownload';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/',
  cacheDirectory: 'file:///cache/',
  downloadAsync: jest.fn(),
  deleteAsync: jest.fn(() => Promise.resolve()),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../modules/dem-decoder/src', () => ({ decodeDemFile: jest.fn() }));

jest.mock('../../i18n/config', () => ({
  t: jest.fn((key: string) => key),
}));

const mockDownload = FileSystem.downloadAsync as jest.Mock;
const mockDelete = FileSystem.deleteAsync as jest.Mock;
const mockWrite = FileSystem.writeAsStringAsync as jest.Mock;

const TILE = { z: 13, x: 100, y: 200 };
const PATH = 'file:///test/tiles/dem_mapterhorn/13/100/200.webp';
const URL = 'https://tiles.mapterhorn.com/13/100/200.webp';

describe('getDemTileMap', () => {
  it('疑似地図はdem_mapterhorn IDで非表示・z7-13', () => {
    const map = getDemTileMap();
    expect(map.id).toBe('dem_mapterhorn');
    expect(map.visible).toBe(false);
    expect(map.minimumZ).toBe(7);
    expect(map.overzoomThreshold).toBe(13);
  });
});

describe('downloadDemTile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('200ならそのまま保存する', async () => {
    mockDownload.mockResolvedValue({ uri: PATH, status: 200 });
    await downloadDemTile(TILE);
    expect(mockDownload).toHaveBeenCalledWith(URL, PATH);
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('404（外洋）は0バイトマーカーで上書きし、エラーにしない', async () => {
    mockDownload.mockResolvedValue({ uri: PATH, status: 404 });
    await expect(downloadDemTile(TILE)).resolves.toBeUndefined();
    expect(mockWrite).toHaveBeenCalledWith(PATH, '');
  });

  it('5xxはファイルを削除してthrow（再開時に再試行される）', async () => {
    mockDownload.mockResolvedValue({ uri: PATH, status: 503 });
    await expect(downloadDemTile(TILE)).rejects.toThrow();
    expect(mockDelete).toHaveBeenCalledWith(PATH, { idempotent: true });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('通信エラーはファイルを削除してthrow', async () => {
    mockDownload.mockRejectedValue(new Error('network'));
    await expect(downloadDemTile(TILE)).rejects.toThrow('network');
    expect(mockDelete).toHaveBeenCalledWith(PATH, { idempotent: true });
  });
});
