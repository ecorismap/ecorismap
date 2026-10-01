import * as FileSystem from 'expo-file-system/legacy';
import { decodeDemFile } from '../../../modules/dem-decoder/src';
import { clearDemTileMemoryCache, getDemTile, peekDemTile } from '../demSource';
import { createDemTileCache, resampleFromAncestor } from '../demSourceCommon';

// ファイルシステムを「パス→中身のバイト数」の表で模擬する
const mockFiles = new Map<string, number>();

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(async (uri: string) =>
    mockFiles.has(uri) ? { exists: true, size: mockFiles.get(uri) } : { exists: false }
  ),
  makeDirectoryAsync: jest.fn(async () => undefined),
  downloadAsync: jest.fn(),
  writeAsStringAsync: jest.fn(async (uri: string, content: string) => {
    mockFiles.set(uri, content.length);
  }),
  deleteAsync: jest.fn(async (uri: string) => {
    mockFiles.delete(uri);
  }),
}));

jest.mock('../../../modules/dem-decoder/src', () => ({
  decodeDemFile: jest.fn(),
}));

const mockDownload = FileSystem.downloadAsync as jest.Mock;
const mockDecode = decodeDemFile as jest.Mock;

const OFFLINE = (z: number, x: number, y: number) => `file:///doc/tiles/dem_mapterhorn/${z}/${x}/${y}.webp`;
const CACHE = (z: number, x: number, y: number) => `file:///cache/dem_mapterhorn/${z}_${x}_${y}.webp`;

const decoded = (value: number, size = 512) => ({
  width: size,
  height: size,
  elevation: new Float32Array(size * size).fill(value),
  min: value,
  max: value,
  timing: { readMs: 0, decodeMs: 0, convertMs: 0 },
});

/** downloadAsyncを「指定ステータスで、200なら中身を書く」動作にする */
const respondWith = (...statuses: (number | Error)[]) => {
  for (const status of statuses) {
    mockDownload.mockImplementationOnce(async (_url: string, uri: string) => {
      if (status instanceof Error) throw status;
      mockFiles.set(uri, status === 200 ? 1000 : 14);
      return { status };
    });
  }
};

describe('demSource（ネイティブ）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFiles.clear();
    clearDemTileMemoryCache();
  });

  it('ネットワークから取得し、キャッシュファイルをterrariumとしてデコードする', async () => {
    respondWith(200);
    mockDecode.mockResolvedValue(decoded(1234));
    const tile = await getDemTile(13, 7252, 3234);
    expect(mockDownload).toHaveBeenCalledWith('https://tiles.mapterhorn.com/13/7252/3234.webp', CACHE(13, 7252, 3234));
    expect(mockDecode).toHaveBeenCalledWith(CACHE(13, 7252, 3234), 'terrarium');
    expect(tile).toMatchObject({ z: 13, x: 7252, y: 3234, size: 512, min: 1234, max: 1234 });
  });

  it('オフラインDL済みのタイルを最優先し、通信しない', async () => {
    mockFiles.set(OFFLINE(13, 1, 2), 1000);
    mockDecode.mockResolvedValue(decoded(10));
    const tile = await getDemTile(13, 1, 2);
    expect(tile?.min).toBe(10);
    expect(mockDecode).toHaveBeenCalledWith(OFFLINE(13, 1, 2), 'terrarium');
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('オフラインの0バイトマーカーはデータなし（null）で、通信しない', async () => {
    mockFiles.set(OFFLINE(13, 1, 2), 0);
    expect(await getDemTile(13, 1, 2)).toBeNull();
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('ディスクキャッシュがあれば通信しない', async () => {
    mockFiles.set(CACHE(13, 1, 2), 1000);
    mockDecode.mockResolvedValue(decoded(5));
    expect((await getDemTile(13, 1, 2))?.min).toBe(5);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('404は0バイトマーカーを書いてnullを返し、次回は通信しない', async () => {
    respondWith(404);
    expect(await getDemTile(12, 3700, 1600)).toBeNull();
    expect(mockFiles.get(CACHE(12, 3700, 1600))).toBe(0);
    clearDemTileMemoryCache();
    expect(await getDemTile(12, 3700, 1600)).toBeNull();
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it('5xxは1回リトライし、それでも失敗ならundefined（キャッシュに残さない）', async () => {
    respondWith(503, 503);
    expect(await getDemTile(13, 1, 2)).toBeUndefined();
    expect(mockDownload).toHaveBeenCalledTimes(2);
    expect(mockFiles.has(CACHE(13, 1, 2))).toBe(false);
  });

  it('通信の瞬断は1回のリトライで回復する', async () => {
    respondWith(new Error('network'), 200);
    mockDecode.mockResolvedValue(decoded(7));
    expect((await getDemTile(13, 1, 2))?.min).toBe(7);
  });

  it('一時的な失敗は記憶せず、次の呼び出しで取り直す', async () => {
    respondWith(503, 503, 200);
    mockDecode.mockResolvedValue(decoded(8));
    expect(await getDemTile(13, 1, 2)).toBeUndefined();
    expect((await getDemTile(13, 1, 2))?.min).toBe(8);
  });

  it('壊れたキャッシュファイルは捨てて取り直す', async () => {
    mockFiles.set(CACHE(13, 1, 2), 1000);
    mockDecode.mockRejectedValueOnce(new Error('WebP decode failed')).mockResolvedValueOnce(decoded(9));
    respondWith(200);
    expect((await getDemTile(13, 1, 2))?.min).toBe(9);
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it('範囲外のタイル番号は通信せずnull', async () => {
    expect(await getDemTile(2, 4, 0)).toBeNull();
    expect(await getDemTile(2, -1, 0)).toBeNull();
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('同じタイルへの同時要求は1回の取得にまとめ、取得後はpeekで同期に引ける', async () => {
    respondWith(200);
    mockDecode.mockResolvedValue(decoded(3));
    expect(peekDemTile(13, 1, 2)).toBeUndefined();
    const [a, b] = await Promise.all([getDemTile(13, 1, 2), getDemTile(13, 1, 2)]);
    expect(a).toBe(b);
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(peekDemTile(13, 1, 2)).toBe(a);
  });
});

describe('createDemTileCache', () => {
  const tile = (n: number) => ({ z: 1, x: 0, y: 0, size: 1, elev: new Float32Array(1), min: n, max: n });

  it('上限を超えると最も古く使われたものから捨てる', async () => {
    const cache = createDemTileCache(2);
    await cache.getOrLoad('a', async () => tile(1));
    await cache.getOrLoad('b', async () => tile(2));
    cache.peek('a'); // aを最近使ったことにする
    await cache.getOrLoad('c', async () => tile(3));
    expect(cache.peek('a')).toBeDefined();
    expect(cache.peek('b')).toBeUndefined();
    expect(cache.peek('c')).toBeDefined();
  });

  it('読み込みが例外を投げたらundefined（一時的な失敗）として扱う', async () => {
    const cache = createDemTileCache();
    expect(
      await cache.getOrLoad('a', async () => {
        throw new Error('x');
      })
    ).toBeUndefined();
    expect(cache.peek('a')).toBeUndefined();
  });
});

describe('resampleFromAncestor', () => {
  // 列番号をそのまま標高にした4px四方の祖先タイル
  const ancestor = (dz: number) => ({
    tile: {
      z: 10,
      x: 0,
      y: 0,
      size: 4,
      elev: Float32Array.from({ length: 16 }, (_, i) => i % 4),
      min: 0,
      max: 3,
    },
    dz,
  });

  it('dz=0なら祖先の配列をそのまま返す', () => {
    const a = ancestor(0);
    expect(resampleFromAncestor(a, 0, 0)).toBe(a.tile.elev);
  });

  it('dz=1では子タイルの範囲（祖先の半分）を2倍に引き伸ばす', () => {
    // 右上の子(x=1,y=0)は祖先の列2〜3。画素中心どうしを対応させたバイリニア
    const out = resampleFromAncestor(ancestor(1), 1, 0);
    expect(Array.from(out.slice(0, 4))).toEqual([1.75, 2.25, 2.75, 3]);
    // 左の子は列0〜1
    expect(Array.from(resampleFromAncestor(ancestor(1), 0, 0).slice(0, 4))).toEqual([0, 0.25, 0.75, 1.25]);
  });
});
