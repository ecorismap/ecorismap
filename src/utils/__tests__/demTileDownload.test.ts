import * as FileSystem from 'expo-file-system/legacy';
import { downloadDemTilePair, getDemViewshedTileMap } from '../demTileDownload';
import { GSI_DEM_URL, TERRARIUM_URL } from '../../constants/DemSources';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/',
  downloadAsync: jest.fn(),
  deleteAsync: jest.fn(() => Promise.resolve()),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../i18n/config', () => ({
  t: jest.fn((key: string) => key),
}));

const mockDownload = FileSystem.downloadAsync as jest.Mock;
const mockDelete = FileSystem.deleteAsync as jest.Mock;
const mockWrite = FileSystem.writeAsStringAsync as jest.Mock;

const TILE = { z: 14, x: 100, y: 200 };
const GSI_PATH = 'file:///test/tiles/dem_viewshed/gsi/14/100/200';
const TERRA_PATH = 'file:///test/tiles/dem_viewshed/terrarium/14/100/200';
const GSI_URL = GSI_DEM_URL.replace('{z}', '14').replace('{x}', '100').replace('{y}', '200');
const TERRA_URL = TERRARIUM_URL.replace('{z}', '14').replace('{x}', '100').replace('{y}', '200');

describe('getDemViewshedTileMap', () => {
  it('疑似地図はdem_viewshed IDで非表示・z8-14', () => {
    const map = getDemViewshedTileMap();
    expect(map.id).toBe('dem_viewshed');
    expect(map.visible).toBe(false);
    expect(map.minimumZ).toBe(8);
    expect(map.overzoomThreshold).toBe(14);
  });
});

describe('downloadDemTilePair', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GSIが200ならgsi側のみ保存しterrariumへ行かない', async () => {
    mockDownload.mockResolvedValue({ uri: GSI_PATH, status: 200 });
    await downloadDemTilePair(TILE);
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockDownload).toHaveBeenCalledWith(GSI_URL, GSI_PATH);
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('GSIが404ならterrariumを保存し、最後にgsi側へ0バイトマーカーを書く', async () => {
    mockDownload.mockImplementation(async (url: string) =>
      url === GSI_URL ? { uri: GSI_PATH, status: 404 } : { uri: TERRA_PATH, status: 200 }
    );
    await downloadDemTilePair(TILE);
    expect(mockDownload).toHaveBeenCalledWith(GSI_URL, GSI_PATH);
    expect(mockDownload).toHaveBeenCalledWith(TERRA_URL, TERRA_PATH);
    expect(mockWrite).toHaveBeenCalledWith(GSI_PATH, '');
    // マーカーはterrarium保存の後（=ペア完了の印になる順序保証）
    expect(mockWrite.mock.invocationCallOrder[0]).toBeGreaterThan(mockDownload.mock.invocationCallOrder[1]);
  });

  it('両方404なら恒久欠損としてマーカーのみ書き、エラーにしない', async () => {
    mockDownload.mockImplementation(async (url: string) =>
      url === GSI_URL ? { uri: GSI_PATH, status: 404 } : { uri: TERRA_PATH, status: 404 }
    );
    await expect(downloadDemTilePair(TILE)).resolves.toBeUndefined();
    expect(mockDelete).toHaveBeenCalledWith(TERRA_PATH, { idempotent: true });
    expect(mockWrite).toHaveBeenCalledWith(GSI_PATH, '');
  });

  it('GSIが5xxならgsi側を削除してthrow（再開時に再試行される）', async () => {
    mockDownload.mockResolvedValue({ uri: GSI_PATH, status: 500 });
    await expect(downloadDemTilePair(TILE)).rejects.toThrow();
    expect(mockDelete).toHaveBeenCalledWith(GSI_PATH, { idempotent: true });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('terrariumが5xxなら両ファイルを削除してthrow（未完了に戻す）', async () => {
    mockDownload.mockImplementation(async (url: string) =>
      url === GSI_URL ? { uri: GSI_PATH, status: 404 } : { uri: TERRA_PATH, status: 500 }
    );
    await expect(downloadDemTilePair(TILE)).rejects.toThrow();
    expect(mockDelete).toHaveBeenCalledWith(TERRA_PATH, { idempotent: true });
    expect(mockDelete).toHaveBeenCalledWith(GSI_PATH, { idempotent: true });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('GSIの通信エラーはgsi側を削除してthrow', async () => {
    mockDownload.mockRejectedValue(new Error('network'));
    await expect(downloadDemTilePair(TILE)).rejects.toThrow('network');
    expect(mockDelete).toHaveBeenCalledWith(GSI_PATH, { idempotent: true });
  });
});
