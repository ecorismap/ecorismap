import { deflate } from 'pako';
import {
  clearDemTileCache,
  fetchDemTile,
  peekDecodedDemTile,
  peekDecodedDemTileFor,
  resolveDemTexturePixels,
} from '../demTileProvider';
import { loadDemTilePng, loadDownloadedDemTile } from '../demTileLoader';
import { BATHYMETRY_EXAGGERATION as K } from '../bathymetryFill';

jest.mock('../demTileLoader', () => ({
  loadDemTilePng: jest.fn(),
  loadDownloadedDemTile: jest.fn(async () => ({ kind: 'missing' })),
}));

const mockedLoadPng = loadDemTilePng as jest.MockedFunction<typeof loadDemTilePng>;
const mockedDownloaded = loadDownloadedDemTile as jest.MockedFunction<typeof loadDownloadedDemTile>;

/** 256x256 truecolor PNG（GSI dem_png / terrariumと同じ形式）を組み立てる */
const buildPng = (pixel: (col: number, row: number) => [number, number, number]): ArrayBuffer => {
  const size = 256;
  const stride = size * 3;
  const raw = new Uint8Array(size * (stride + 1));
  for (let row = 0; row < size; row++) {
    const offset = row * (stride + 1) + 1;
    for (let col = 0; col < size; col++) {
      const [r, g, b] = pixel(col, row);
      raw[offset + col * 3] = r;
      raw[offset + col * 3 + 1] = g;
      raw[offset + col * 3 + 2] = b;
    }
  }
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    new DataView(out.buffer).setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    return out;
  };
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, size);
  v.setUint32(4, size);
  ihdr[8] = 8; // bitDepth
  ihdr[9] = 2; // colorType=2 (truecolor RGB)
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflate(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const png = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    png.set(p, pos);
    pos += p.length;
  }
  return png.buffer;
};

/** 全ピクセル同一RGB */
const buildUniformPng = (r: number, g: number, b: number): ArrayBuffer => buildPng(() => [r, g, b]);

/** 左半分と右半分で値が違うタイル（ブロック分割の検証用） */
const buildSplitPng = (left: [number, number, number], right: [number, number, number]): ArrayBuffer =>
  buildPng((col) => (col < 128 ? left : right));

beforeEach(() => {
  clearDemTileCache();
  jest.clearAllMocks();
  mockedDownloaded.mockResolvedValue({ kind: 'missing' });
});

describe('デコード済み標高のキャッシュ', () => {
  it('2回目の取得ではPNGを再デコードしない（同じFloat32Arrayを返す）', async () => {
    // GSI式: r*65536+g*256+b の1/100[m] → (0,10,0) = 25.6m
    mockedLoadPng.mockResolvedValue(buildUniformPng(0, 10, 0));
    const first = await fetchDemTile(14, 100, 200);
    const second = await fetchDemTile(14, 100, 200);
    expect(first).toBeInstanceOf(Float32Array);
    expect((first as Float32Array)[0]).toBeCloseTo(25.6, 5);
    // デコード結果がキャッシュされていれば同一インスタンスが返る
    expect(second).toBe(first);
    expect(mockedLoadPng).toHaveBeenCalledTimes(1);
  });

  it('peekDecodedDemTileは取得済みなら同期で返し、未取得はundefined', async () => {
    mockedLoadPng.mockResolvedValue(buildUniformPng(0, 10, 0));
    expect(peekDecodedDemTile(14, 100, 200)).toBeUndefined();
    await fetchDemTile(14, 100, 200);
    expect(peekDecodedDemTile(14, 100, 200)).toBeInstanceOf(Float32Array);
    expect(peekDecodedDemTile(14, 999, 999)).toBeUndefined();
  });

  it('GSIが404でterrariumも404なら、peekはnull（データなし確定）を返す', async () => {
    mockedLoadPng.mockResolvedValue(null);
    await fetchDemTile(14, 1, 1);
    expect(peekDecodedDemTile(14, 1, 1)).toBeNull();
  });

  it('GSIが404でもterrariumが取れればpeekはterrariumの標高を返す', async () => {
    // 1枚目(gsi)は404、2枚目(terrarium)はデータあり
    mockedLoadPng
      .mockResolvedValueOnce(null)
      // terrarium式: r*256+g+b/256-32768 → (128,10,0) = 10m
      .mockResolvedValueOnce(buildUniformPng(128, 10, 0));
    await fetchDemTile(14, 2, 2);
    const peeked = peekDecodedDemTile(14, 2, 2);
    expect(peeked).toBeInstanceOf(Float32Array);
    expect((peeked as Float32Array)[0]).toBeCloseTo(10, 5);
  });

  it('clearDemTileCacheでデコード済みキャッシュも消える', async () => {
    mockedLoadPng.mockResolvedValue(buildUniformPng(0, 10, 0));
    await fetchDemTile(14, 3, 3);
    expect(peekDecodedDemTile(14, 3, 3)).toBeInstanceOf(Float32Array);
    clearDemTileCache();
    expect(peekDecodedDemTile(14, 3, 3)).toBeUndefined();
  });
});

describe('ソースを名指しで引く（3Dのドット位置を描画と一致させる）', () => {
  it('terrariumでキャッシュされていてもgsiを名指しすればundefined（別ソースへ落ちない）', async () => {
    mockedLoadPng
      .mockResolvedValueOnce(null) // gsiは提供範囲外
      .mockResolvedValueOnce(buildUniformPng(128, 10, 0)); // terrariumで10m
    await fetchDemTile(14, 20, 20);
    // ソース混在を許すpeekはterrariumを拾うが、
    expect(peekDecodedDemTile(14, 20, 20)).toBeInstanceOf(Float32Array);
    // gsiを名指ししたら「gsiには無い(404確定)」がそのまま返る。
    // ここで別ソースへ落ちると、描画テクスチャ(terrarium)と違う標高でドットを置くことになる
    expect(peekDecodedDemTileFor('gsi', 14, 20, 20)).toBeNull();
    expect(peekDecodedDemTileFor('terrarium', 14, 20, 20)).toBeInstanceOf(Float32Array);
  });

  it('gsiとterrariumが両方キャッシュされていても、指定したソースの標高を返す', async () => {
    // gsiで取れるタイル((0,10,0) → 2560*0.01 = 25.6m)と、
    // terrariumへ落ちるタイル((128,20,0) → 20m)をそれぞれキャッシュさせる
    mockedLoadPng.mockResolvedValue(buildUniformPng(0, 10, 0));
    await fetchDemTile(14, 21, 21);
    mockedLoadPng.mockReset();
    mockedDownloaded.mockResolvedValue({ kind: 'missing' });
    mockedLoadPng.mockResolvedValueOnce(null).mockResolvedValueOnce(buildUniformPng(128, 20, 0));
    await fetchDemTile(14, 22, 22);

    expect(peekDecodedDemTileFor('gsi', 14, 21, 21)![0]).toBeCloseTo(25.6, 3);
    // gsiで足りたタイルはterrariumを取りに行っていないので未取得のまま
    expect(peekDecodedDemTileFor('terrarium', 14, 21, 21)).toBeUndefined();
    expect(peekDecodedDemTileFor('terrarium', 14, 22, 22)![0]).toBeCloseTo(20, 5);
    expect(peekDecodedDemTileFor('gsi', 14, 22, 22)).toBeNull();
  });
});

describe('テクスチャ化のついでに標高もキャッシュする（二重デコードの廃止）', () => {
  it('resolveDemTexturePixelsの後はpeekDecodedDemTileが同期で標高を返す', async () => {
    mockedLoadPng.mockResolvedValue(buildUniformPng(0, 10, 0));
    expect(peekDecodedDemTile(14, 40, 50)).toBeUndefined();
    await resolveDemTexturePixels(14, 40, 50);
    const peeked = peekDecodedDemTile(14, 40, 50);
    expect(peeked).toBeInstanceOf(Float32Array);
    expect((peeked as Float32Array)[0]).toBeCloseTo(25.6, 5);
  });

  it('シードした標高はfetchDemTile単独のデコード結果と完全に一致する', async () => {
    // 区画ごとに値が違うPNGで、全画素を突き合わせる
    mockedLoadPng.mockResolvedValue(buildSplitPng([0, 195, 80], [0, 3, 232]));
    await resolveDemTexturePixels(14, 41, 51);
    const seeded = peekDecodedDemTile(14, 41, 51) as Float32Array;
    // 別タイルとして素のデコード経路を通す
    const decoded = (await fetchDemTile(14, 42, 52)) as Float32Array;
    expect(seeded.length).toBe(decoded.length);
    for (let i = 0; i < seeded.length; i += 997) {
      expect(seeded[i]).toBe(decoded[i]);
    }
  });

  it('terrariumへフォールバックした場合もterrariumの標高がキャッシュされる', async () => {
    mockedLoadPng.mockResolvedValueOnce(null).mockResolvedValueOnce(buildUniformPng(128, 10, 0));
    await resolveDemTexturePixels(14, 43, 53);
    const peeked = peekDecodedDemTile(14, 43, 53);
    expect((peeked as Float32Array)[0]).toBeCloseTo(10, 5);
  });

  it('NoData(2^23)はNaNのままキャッシュされる（0mと区別する）', async () => {
    mockedLoadPng.mockResolvedValue(buildUniformPng(128, 0, 0));
    await resolveDemTexturePixels(14, 44, 54);
    const peeked = peekDecodedDemTile(14, 44, 54) as Float32Array;
    expect(Number.isNaN(peeked[0])).toBe(true);
  });
});

describe('resolveDemTexturePixels', () => {
  it('PNGのRGB値をそのままRGBA8で返す（標高値を保つ）', async () => {
    mockedLoadPng.mockResolvedValue(buildUniformPng(1, 195, 80));
    const pixels = await resolveDemTexturePixels(14, 10, 20);
    expect(pixels).not.toBeNull();
    expect(pixels?.encoding).toBe('gsi');
    expect(pixels?.width).toBe(256);
    expect(pixels?.height).toBe(256);
    // ネイティブデコーダを通さないので、値が一切変換されていないこと
    expect(Array.from(pixels!.data.slice(0, 8))).toEqual([1, 195, 80, 255, 1, 195, 80, 255]);
  });

  it('GSIが404ならterrariumへフォールバックする', async () => {
    mockedLoadPng.mockResolvedValueOnce(null).mockResolvedValueOnce(buildUniformPng(128, 10, 0));
    const pixels = await resolveDemTexturePixels(14, 1, 1);
    expect(pixels?.encoding).toBe('terrarium');
    expect(Array.from(pixels!.data.slice(0, 4))).toEqual([128, 10, 0, 255]);
  });

  it('4x4ブロック毎の標高範囲を返す（スカート底の算出に使う）', async () => {
    // GSI式: (0,195,80) = 500.00m の一様タイル
    mockedLoadPng.mockResolvedValue(buildUniformPng(0, 195, 80));
    const pixels = await resolveDemTexturePixels(14, 5, 5);
    expect(pixels?.blockMin).toHaveLength(16);
    expect(pixels?.blockMax).toHaveLength(16);
    for (let b = 0; b < 16; b++) {
      expect(pixels!.blockMin[b]).toBeCloseTo(500, 2);
      expect(pixels!.blockMax[b]).toBeCloseTo(500, 2);
    }
  });

  it('ブロック毎に分かれるので、離れた区画の起伏を拾わない', async () => {
    // 左半分500m / 右半分を谷(10m)にしたタイル
    mockedLoadPng.mockResolvedValue(buildSplitPng([0, 195, 80], [0, 3, 232]));
    const pixels = await resolveDemTexturePixels(14, 8, 8);
    // 左列(bx=0,1)は500mだけ、右列(bx=2,3)は10mだけを見る
    for (let by = 0; by < 4; by++) {
      expect(pixels!.blockMin[by * 4]).toBeCloseTo(500, 1);
      expect(pixels!.blockMax[by * 4]).toBeCloseTo(500, 1);
      expect(pixels!.blockMin[by * 4 + 3]).toBeCloseTo(10, 1);
      expect(pixels!.blockMax[by * 4 + 3]).toBeCloseTo(10, 1);
    }
  });

  it('terrariumの標高範囲はterrarium式で求める', async () => {
    // terrarium式: (128,10,0) = 10m
    mockedLoadPng.mockResolvedValueOnce(null).mockResolvedValueOnce(buildUniformPng(128, 10, 0));
    const pixels = await resolveDemTexturePixels(14, 6, 6);
    expect(pixels!.blockMin[0]).toBeCloseTo(10, 2);
    expect(pixels!.blockMax[15]).toBeCloseTo(10, 2);
  });

  it('全画素NoDataなら標高範囲は0になる', async () => {
    // GSIのNoData = 2^23 = (128,0,0)
    mockedLoadPng.mockResolvedValue(buildUniformPng(128, 0, 0));
    const pixels = await resolveDemTexturePixels(14, 7, 7);
    expect(Array.from(pixels!.blockMin)).toEqual(new Array(16).fill(0));
    expect(Array.from(pixels!.blockMax)).toEqual(new Array(16).fill(0));
  });

  it('通信エラー(throw)は別ソースへ落とさずundefinedを返す', async () => {
    mockedLoadPng.mockRejectedValue(new Error('network'));
    await expect(resolveDemTexturePixels(14, 1, 1)).resolves.toBeUndefined();
  });

  it('両ソースとも404ならnull', async () => {
    mockedLoadPng.mockResolvedValue(null);
    await expect(resolveDemTexturePixels(14, 1, 1)).resolves.toBeNull();
  });

  it('タイル範囲外はネットワークを叩かずnull', async () => {
    await expect(resolveDemTexturePixels(2, 9, 0)).resolves.toBeNull();
    expect(mockedLoadPng).not.toHaveBeenCalled();
  });
});

describe('テクスチャと同じ寿命で標高を持ち回れる（3Dのドット消失対策）', () => {
  it('resolveDemTexturePixelsはデコード済み標高を返す', async () => {
    mockedLoadPng.mockResolvedValue(buildUniformPng(0, 10, 0));
    const pixels = await resolveDemTexturePixels(14, 30, 30);
    expect(pixels!.elev).toBeInstanceOf(Float32Array);
    expect(pixels!.elev!.length).toBe(256 * 256);
    expect(pixels!.elev![0]).toBeCloseTo(25.6, 3);
  });

  it('返した標高はデコード済みキャッシュの内容と同一（二度デコードしない）', async () => {
    mockedLoadPng.mockResolvedValue(buildUniformPng(0, 20, 0));
    const pixels = await resolveDemTexturePixels(14, 31, 31);
    expect(peekDecodedDemTileFor('gsi', 14, 31, 31)).toBe(pixels!.elev);
  });

  it('LRUから追い出されても、返した標高は使い続けられる', async () => {
    mockedLoadPng.mockResolvedValue(buildUniformPng(0, 30, 0));
    const pixels = await resolveDemTexturePixels(14, 32, 32);
    const held = pixels!.elev!;
    // 上限(32枚)を超えるまで別タイルを詰めて追い出す
    for (let i = 0; i < 40; i++) {
      mockedLoadPng.mockResolvedValue(buildUniformPng(0, 1 + (i % 50), 0));
      await resolveDemTexturePixels(14, 100 + i, 100);
    }
    expect(peekDecodedDemTileFor('gsi', 14, 32, 32)).toBeUndefined();
    // 掴んでいる配列は生きているので、地形が描けている限り標高を引ける
    expect(held[0]).toBeCloseTo(76.8, 3);
  });

  it('terrariumへフォールバックしたときもその標高を返す', async () => {
    mockedLoadPng.mockReset();
    mockedDownloaded.mockResolvedValue({ kind: 'missing' });
    mockedLoadPng.mockResolvedValueOnce(null).mockResolvedValueOnce(buildUniformPng(128, 40, 0));
    const pixels = await resolveDemTexturePixels(14, 33, 33);
    expect(pixels!.encoding).toBe('terrarium');
    expect(pixels!.elev![0]).toBeCloseTo(40, 5);
  });
});

describe('海底モード（GEBCO表示中の3D）', () => {
  // terrarium: e + 32768 = r*256 + g
  const TERRARIUM_M1000: [number, number, number] = [124, 24, 0];
  const TERRARIUM_M500: [number, number, number] = [126, 12, 0];
  const TERRARIUM_M2000: [number, number, number] = [120, 48, 0];
  const TERRARIUM_ZERO: [number, number, number] = [128, 0, 0];
  const GSI_10M: [number, number, number] = [0, 3, 232];
  const GSI_NODATA: [number, number, number] = [128, 0, 0];

  /** URLからソースとズームを読み、表に従ってPNGを返すモック */
  const serve = (table: Record<string, ArrayBuffer | null | 'error'>) =>
    mockedLoadPng.mockImplementation(async (url: string) => {
      const source = url.includes('terrarium') ? 'terrarium' : 'gsi';
      const z = url.match(/\/(\d+)\/\d+\/\d+\.png/)![1];
      const value = table[`${source}/${z}`];
      if (value === 'error') throw new Error('network');
      return value ?? null;
    });

  const decodeGsi = (data: Uint8Array, i: number) => {
    const x = data[i * 4] * 65536 + data[i * 4 + 1] * 256 + data[i * 4 + 2];
    if (x === 8388608) return NaN;
    return x < 8388608 ? x / 100 : (x - 16777216) / 100;
  };

  // 海面下は海底モードでBATHYMETRY_EXAGGERATION倍に強調される（期待値は K 倍）
  it('GSIの海域NoDataをz10祖先のterrariumの海底値で埋め、GSI形式で返す', async () => {
    serve({ 'gsi/12': buildSplitPng(GSI_NODATA, GSI_10M), 'terrarium/10': buildUniformPng(...TERRARIUM_M1000) });
    const pixels = await resolveDemTexturePixels(12, 3640, 1600, { bathymetry: true });
    expect(pixels!.encoding).toBe('gsi');
    // 左=海（埋めた海底）、右=陸（GSIのまま）
    expect(pixels!.elev![0]).toBeCloseTo(-1000 * K, 3);
    expect(pixels!.elev![255]).toBeCloseTo(10, 3);
    // テクスチャのRGBも同じ値を表す（シェーダはGSI式でデコードする）
    expect(decodeGsi(pixels!.data, 0)).toBeCloseTo(-1000 * K, 2);
    expect(decodeGsi(pixels!.data, 255)).toBeCloseTo(10, 2);
    expect(pixels!.blockMin[0]).toBeCloseTo(-1000 * K, 3);
    expect(pixels!.blockMax[3]).toBeCloseTo(10, 3);
  });

  it('z11以上のterrarium（海が0m）は0以下の画素をz10祖先の海底値で埋める', async () => {
    serve({
      'gsi/12': null,
      'terrarium/12': buildUniformPng(...TERRARIUM_ZERO),
      'terrarium/10': buildUniformPng(...TERRARIUM_M500),
    });
    const pixels = await resolveDemTexturePixels(12, 100, 100, { bathymetry: true });
    expect(pixels!.elev![1000]).toBeCloseTo(-500 * K, 3);
  });

  it('z10以下のterrariumは負値をクランプせずそのまま使う', async () => {
    serve({ 'gsi/9': null, 'terrarium/9': buildUniformPng(...TERRARIUM_M2000) });
    const pixels = await resolveDemTexturePixels(9, 450, 200, { bathymetry: true });
    expect(pixels!.elev![0]).toBeCloseTo(-2000 * K, 3);
    expect(decodeGsi(pixels!.data, 0)).toBeCloseTo(-2000 * K, 2);
    // 祖先（自分自身）の二重取得はしない
    expect(mockedLoadPng).toHaveBeenCalledTimes(2);
  });

  it('海底値は0m以下に丸める（粗い祖先が海岸で拾う正値で海面に凸を作らない）', async () => {
    // 祖先は+50m（terrarium [128,50,0]）
    serve({ 'gsi/12': buildUniformPng(...GSI_NODATA), 'terrarium/10': buildUniformPng(128, 50, 0) });
    const pixels = await resolveDemTexturePixels(12, 3640, 1601, { bathymetry: true });
    expect(pixels!.elev![0]).toBe(0);
  });

  it('祖先の通信エラーは海が欠けたまま確定させずundefined（再取得させる）', async () => {
    serve({ 'gsi/12': buildSplitPng(GSI_NODATA, GSI_10M), 'terrarium/10': 'error' });
    expect(await resolveDemTexturePixels(12, 3640, 1602, { bathymetry: true })).toBeUndefined();
  });

  it('符号付きの標高をviewshed向けのデコード済みキャッシュへ混ぜない', async () => {
    serve({
      'gsi/12': null,
      'terrarium/12': buildUniformPng(...TERRARIUM_ZERO),
      'terrarium/10': buildUniformPng(...TERRARIUM_M500),
    });
    await resolveDemTexturePixels(12, 200, 200, { bathymetry: true });
    expect(peekDecodedDemTileFor('terrarium', 12, 200, 200)).toBeUndefined();
    expect(peekDecodedDemTile(12, 200, 200)).toBeUndefined();
  });

  it('海底モードでなければ従来どおりterrariumの負値は0mへクランプする', async () => {
    serve({ 'gsi/9': null, 'terrarium/9': buildUniformPng(...TERRARIUM_M2000) });
    const pixels = await resolveDemTexturePixels(9, 451, 200);
    expect(pixels!.encoding).toBe('terrarium');
    expect(pixels!.elev![0]).toBe(0);
  });
});
