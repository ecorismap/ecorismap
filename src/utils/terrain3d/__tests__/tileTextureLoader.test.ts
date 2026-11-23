import * as FileSystem from 'expo-file-system/legacy';
import { renderPmtile } from '../pmtileRasterizer';
import { clearTerrainTextureCache, resolveTileTexture, TransientTileError } from '../tileTextureLoader';
import { LayerSpec } from '../types';

// ファイルシステムを「パス→中身のバイト数」の表で模擬する
const mockFiles = new Map<string, number>();

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(async (uri: string) =>
    mockFiles.has(uri) ? { exists: true, isDirectory: false, size: mockFiles.get(uri) } : { exists: false }
  ),
  makeDirectoryAsync: jest.fn(async () => undefined),
  downloadAsync: jest.fn(),
  writeAsStringAsync: jest.fn(async (uri: string, content: string) => {
    mockFiles.set(uri, content.length);
  }),
  deleteAsync: jest.fn(async (uri: string) => {
    for (const key of [...mockFiles.keys()]) {
      if (key === uri || key.startsWith(`${uri}/`)) mockFiles.delete(key);
    }
  }),
  readDirectoryAsync: jest.fn(async () => []),
}));
jest.mock('../../../constants/AppConstants', () => ({ TILE_FOLDER: 'file:///tiles' }));
jest.mock('../pmtileRasterizer', () => ({ renderPmtile: jest.fn() }));
jest.mock('../reliefTexture', () => ({ resolveReliefTexture: jest.fn() }));
jest.mock('../../demTileLoader', () => ({ readLocalFileBytes: jest.fn() }));
jest.mock('../../pngLite', () => ({ decodePngLite: jest.fn() }));

const mockDownload = FileSystem.downloadAsync as jest.Mock;
const mockRender = renderPmtile as jest.Mock;

const CACHE_DIR = 'file:///cache/terrain3d_tex';

const urlLayer: LayerSpec = {
  id: 'map1',
  urlTemplate: 'https://example.com/{z}/{x}/{y}.png',
  opacity: 1,
  minimumZ: 0,
  maximumZ: 18,
  flipY: false,
};

const pmtilesLayer: LayerSpec = {
  id: 'pm1',
  urlTemplate: 'https://example.com/a.pmtiles',
  isPmtiles: true,
  isVector: true,
  maximumNativeZ: 15,
  offlineMode: false,
  opacity: 1,
  minimumZ: 0,
  maximumZ: 22,
  flipY: false,
};

/** downloadAsyncを「指定ステータスで本文を書く」動作にする */
const respondWith = (status: number | Error) => {
  mockDownload.mockImplementationOnce(async (_url: string, uri: string) => {
    if (status instanceof Error) throw status;
    mockFiles.set(uri, status === 200 ? 1000 : 14);
    return { status };
  });
};

beforeEach(async () => {
  jest.clearAllMocks();
  mockFiles.clear();
  await clearTerrainTextureCache();
});

describe('resolveTileTexture（URL タイル）', () => {
  const tile = { z: 10, x: 900, y: 400 };
  const cacheUri = `${CACHE_DIR}/map1_10_900_400.png`;

  it('404 は0バイトの印を書き、以後は通信しない', async () => {
    respondWith(404);
    await expect(resolveTileTexture(urlLayer, tile)).resolves.toEqual({ kind: 'missing' });
    expect(mockFiles.get(cacheUri)).toBe(0);

    await expect(resolveTileTexture(urlLayer, tile)).resolves.toEqual({ kind: 'missing' });
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it.each([403, 429, 500, 503])('%i は一時失敗として印を書かず、次は取り直す', async (status) => {
    respondWith(status);
    await expect(resolveTileTexture(urlLayer, tile)).rejects.toBeInstanceOf(TransientTileError);
    expect(mockFiles.has(cacheUri)).toBe(false);

    respondWith(200);
    await expect(resolveTileTexture(urlLayer, tile)).resolves.toMatchObject({ kind: 'localUri', uri: cacheUri });
    expect(mockDownload).toHaveBeenCalledTimes(2);
  });

  it('通信例外では書きかけのファイルを残さない', async () => {
    mockDownload.mockImplementationOnce(async (_url: string, uri: string) => {
      mockFiles.set(uri, 10);
      throw new Error('network');
    });
    await expect(resolveTileTexture(urlLayer, tile)).rejects.toThrow('network');
    expect(mockFiles.has(cacheUri)).toBe(false);
  });

  it('ダウンロード済みタイルはキャッシュの印より先に使う', async () => {
    mockFiles.set(cacheUri, 0);
    mockFiles.set('file:///tiles/map1/10/900/400', 500);
    await expect(resolveTileTexture(urlLayer, tile)).resolves.toMatchObject({
      kind: 'localUri',
      uri: 'file:///tiles/map1/10/900/400',
    });
  });
});

describe('resolveTileTexture（PMTiles）', () => {
  const tile = { z: 12, x: 3600, y: 1600 };
  const cacheUri = `${CACHE_DIR}/pm1_12_3600_1600.png`;

  it('オンラインでタイルが無い（0）なら印を書く', async () => {
    mockRender.mockResolvedValueOnce(0);
    await expect(resolveTileTexture(pmtilesLayer, tile)).resolves.toEqual({ kind: 'missing' });
    expect(mockFiles.get(cacheUri)).toBe(0);
  });

  it('オフラインで0なら印を書かない（オンラインに戻れば取れる）', async () => {
    mockRender.mockResolvedValueOnce(0);
    const offline = { ...pmtilesLayer, offlineMode: true };
    await expect(resolveTileTexture(offline, tile)).resolves.toEqual({ kind: 'missing' });
    expect(mockFiles.has(cacheUri)).toBe(false);
  });

  it('ネイティブが一時失敗で reject したら印を書かない', async () => {
    mockRender.mockRejectedValueOnce(new Error('E_TILE_UNAVAILABLE'));
    await expect(resolveTileTexture(pmtilesLayer, tile)).rejects.toThrow('E_TILE_UNAVAILABLE');
    expect(mockFiles.has(cacheUri)).toBe(false);
  });

  it('印があっても、後からダウンロードした .pbf があれば描き直す', async () => {
    mockFiles.set(cacheUri, 0);
    mockFiles.set('file:///tiles/pm1/12/3600/1600.pbf', 300);
    mockRender.mockImplementationOnce(async (options: { outputPath: string }) => {
      mockFiles.set(options.outputPath, 2000);
      return 512;
    });
    await expect(resolveTileTexture(pmtilesLayer, tile)).resolves.toMatchObject({ kind: 'localUri', uri: cacheUri });
    expect(mockRender).toHaveBeenCalledTimes(1);
  });

  it('拡大表示のズームでは maximumNativeZ の親タイルの保存を見る', async () => {
    const deep = { z: 17, x: 14401 * 4 + 3, y: 6401 * 4 + 1 };
    const deepCache = `${CACHE_DIR}/pm1_17_${deep.x}_${deep.y}.png`;
    mockFiles.set(deepCache, 0);
    mockFiles.set('file:///tiles/pm1/15/14400/6401.pbf', 300);
    mockRender.mockResolvedValueOnce(512);
    // 親は (15, 14401, 6401)。保存は隣の位置なので印のまま
    await expect(resolveTileTexture(pmtilesLayer, deep)).resolves.toEqual({ kind: 'missing' });
    expect(mockRender).not.toHaveBeenCalled();

    mockFiles.set('file:///tiles/pm1/15/14401/6401.pbf', 300);
    await expect(resolveTileTexture(pmtilesLayer, deep)).resolves.toMatchObject({ kind: 'localUri' });
    expect(mockRender).toHaveBeenCalledTimes(1);
  });

  it('印があり保存も無ければ通信しない', async () => {
    mockFiles.set(cacheUri, 0);
    await expect(resolveTileTexture(pmtilesLayer, tile)).resolves.toEqual({ kind: 'missing' });
    expect(mockRender).not.toHaveBeenCalled();
  });
});

describe('clearTerrainTextureCache', () => {
  it('キャッシュフォルダを消し、次の書き込み前にフォルダを作り直す', async () => {
    respondWith(200);
    await resolveTileTexture(urlLayer, { z: 3, x: 1, y: 1 });
    expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledTimes(1);

    await clearTerrainTextureCache();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(CACHE_DIR, { idempotent: true });
    expect(mockFiles.size).toBe(0);

    respondWith(200);
    await resolveTileTexture(urlLayer, { z: 3, x: 1, y: 1 });
    expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledTimes(2);
  });
});
