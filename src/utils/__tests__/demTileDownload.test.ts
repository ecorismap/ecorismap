import * as FileSystem from 'expo-file-system/legacy';
import { downloadDemTile, getDemTileMap } from '../demTileDownload';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/',
  cacheDirectory: 'file:///cache/',
  downloadAsync: jest.fn(),
  moveAsync: jest.fn(() => Promise.resolve()),
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
const mockMove = FileSystem.moveAsync as jest.Mock;

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

  it('200なら一時ファイルから保存先へ移す', async () => {
    mockDownload.mockImplementation(async (_url: string, uri: string) => ({ uri, status: 200 }));
    await expect(downloadDemTile(TILE)).resolves.toBe('saved');
    const [url, temp] = mockDownload.mock.calls[0];
    expect(url).toBe(URL);
    expect(temp).toMatch(/^file:\/\/\/cache\//);
    expect(mockMove).toHaveBeenCalledWith({ from: temp, to: PATH });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('404（外洋）は0バイトマーカーを書き、missingを返す', async () => {
    mockDownload.mockImplementation(async (_url: string, uri: string) => ({ uri, status: 404 }));
    await expect(downloadDemTile(TILE)).resolves.toBe('missing');
    expect(mockWrite).toHaveBeenCalledWith(PATH, '');
    expect(mockMove).not.toHaveBeenCalled();
  });

  it('5xxは保存済みのタイルに触れず一時ファイルだけ消してfailedを返す', async () => {
    mockDownload.mockImplementation(async (_url: string, uri: string) => ({ uri, status: 503 }));
    await expect(downloadDemTile(TILE)).resolves.toBe('failed');
    const temp = mockDownload.mock.calls[0][1];
    expect(mockDelete).toHaveBeenCalledWith(temp, { idempotent: true });
    expect(mockDelete).not.toHaveBeenCalledWith(PATH, expect.anything());
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockMove).not.toHaveBeenCalled();
  });

  it('通信エラーは保存済みのタイルに触れずfailedを返す', async () => {
    mockDownload.mockRejectedValue(new Error('network'));
    await expect(downloadDemTile(TILE)).resolves.toBe('failed');
    expect(mockDelete).not.toHaveBeenCalledWith(PATH, expect.anything());
  });
});
