/**
 * 標高タイルのタイル単位取得・デコード・メモリキャッシュ。
 *
 * viewshed（可視領域）と3D地形エンジンが共用する。
 * 国内はGSI dem_png（10m）を優先し、提供範囲外（404）はAWS Terrain Tiles
 * （terrarium、全球30-90m）へタイル単位でフォールバックする。
 * 取得順はメモリLRU→オフラインダウンロード済み→ディスクキャッシュ→ネットワーク。
 */
import { decodeElevation } from './terrainShading';
import { decodePngLite } from './pngLite';
import { loadDemTilePng, loadDownloadedDemTile } from './demTileLoader';
import { GSI_DEM_URL, TERRARIUM_URL } from '../constants/DemSources';
import {
  BATHYMETRY_EXAGGERATION,
  BATHYMETRY_MAX_ZOOM,
  bathymetryAncestor,
  encodeGsiRgba,
  exaggerateDepths,
  fillSeaWithBathymetry,
} from './bathymetryFill';

/** 標高タイルの一辺画素数（GSI dem_png / terrariumとも256px固定） */
export const DEM_TILE_SIZE = 256;

export type DemEncoding = 'gsi' | 'terrarium';

/**
 * terrarium方式のRGB→標高[m]。
 * 負値（海洋のバスメトリ）は海面0mへクランプする。可視判定では水面が視線を
 * 遮らない・水面自体は見える、が正しいため。海抜より低い陸地（死海等）は僅かな誤差になる。
 */
const decodeTerrarium = (r: number, g: number, b: number): number => {
  const e = r * 256 + g + b / 256 - 32768;
  return e < 0 ? 0 : e;
};

/** PNGバイナリを標高タイル（Float32Array 256x256）へデコードする */
export const decodeDemTile = (png: ArrayBuffer, encoding: DemEncoding = 'gsi'): Float32Array | null => {
  const decoded = decodePngLite(png);
  if (decoded === null || decoded.width !== DEM_TILE_SIZE || decoded.height !== DEM_TILE_SIZE) return null;
  const decodePixel = encoding === 'terrarium' ? decodeTerrarium : decodeElevation;
  const { data, channels, palette } = decoded;
  const elev = new Float32Array(DEM_TILE_SIZE * DEM_TILE_SIZE);
  if (palette !== undefined && channels === 1) {
    for (let i = 0; i < elev.length; i++) {
      const p = data[i] * 3;
      elev[i] = decodePixel(palette[p], palette[p + 1], palette[p + 2]);
    }
  } else if (channels >= 3) {
    for (let i = 0; i < elev.length; i++) {
      const p = i * channels;
      elev[i] = decodePixel(data[p], data[p + 1], data[p + 2]);
    }
  } else {
    return null;
  }
  return elev;
};

// ---- 標高タイルのキャッシュ（PNGバイト列の挿入順LRU） ----
// 距離を変えての再計算やスナップでの再実行時にネットワーク取得を省く。
// デコード済み(Float32Array 256KB/枚)ではなくPNGのまま(平均30KB/枚)保持することで
// 半径10km分(約120枚)でも数MBに収まる。デコードは1枚あたり数msで無視できる。
// 海上・提供範囲外の404もnullとして記憶し、再取得を防ぐ。
const TILE_CACHE_MAX_BYTES = 10 * 1024 * 1024;
const tileCache = new Map<string, ArrayBuffer | null>();
let tileCacheBytes = 0;

const tileCacheGet = (key: string): ArrayBuffer | null | undefined => {
  if (!tileCache.has(key)) return undefined;
  const value = tileCache.get(key)!;
  // 参照したものを末尾に移してLRUを維持する
  tileCache.delete(key);
  tileCache.set(key, value);
  return value;
};

const tileCacheSet = (key: string, value: ArrayBuffer | null): void => {
  tileCache.set(key, value);
  tileCacheBytes += value?.byteLength ?? 0;
  while (tileCacheBytes > TILE_CACHE_MAX_BYTES && tileCache.size > 0) {
    const oldestKey = tileCache.keys().next().value;
    if (oldestKey === undefined) break;
    tileCacheBytes -= tileCache.get(oldestKey)?.byteLength ?? 0;
    tileCache.delete(oldestKey);
  }
};

// ---- PNGデコードの実行レーン ----
// 標高PNGの展開は1枚で数十msかかる同期処理で、これを並列に投げるとJSスレッドが
// 連続して塞がりジェスチャや描画が止まる。取得（I/O）は並列のまま、展開だけを
// 1本のレーンへ通し、1枚ごとにイベントループへ制御を返して操作を割り込ませる。
let decodeLaneTail: Promise<void> = Promise.resolve();

/**
 * 「いまはデコードを始めないでほしい」を伝える述語（3D側がジェスチャ中に立てる）。
 * 1枚の展開は途中で中断できない同期処理なので、操作中は着手そのものを見送る。
 */
let shouldDeferDecode: (() => boolean) | null = null;

/** デコードを保留する条件を差し込む（3Dのジェスチャ中など）。nullで解除 */
export const setDemDecodeDeferPredicate = (predicate: (() => boolean) | null): void => {
  shouldDeferDecode = predicate;
};

/** 保留条件が解けるまで待つ（上限つき。解けなくてもいずれは取得できるようにする） */
const waitWhileDeferred = async (): Promise<void> => {
  for (let i = 0; i < DECODE_DEFER_MAX_WAITS && shouldDeferDecode?.() === true; i++) {
    await new Promise((resolve) => setTimeout(resolve, DECODE_DEFER_POLL_MS));
  }
};

const DECODE_DEFER_POLL_MS = 100;
/** 保留の上限（100ms×50=5秒）。操作しっぱなしでもいずれタイルが出るようにする */
const DECODE_DEFER_MAX_WAITS = 50;

/** 開発時の計測用: PNG展開の累計回数と累計時間[ms]（どれだけJSスレッドを使ったか） */
const decodeStats = { count: 0, totalMs: 0 };

/** 直近の集計区間のデコード統計を読み出して0に戻す（開発時の計測表示用） */
export const takeDemDecodeStats = (): { count: number; totalMs: number } => {
  const snapshot = { count: decodeStats.count, totalMs: decodeStats.totalMs };
  decodeStats.count = 0;
  decodeStats.totalMs = 0;
  return snapshot;
};

export const runInDecodeLane = <T>(job: () => T): Promise<T> => {
  const result = decodeLaneTail.then(async () => {
    // 操作中は着手を見送る（始めてしまうと途中で止められない）
    await waitWhileDeferred();
    return new Promise<T>((resolve, reject) => {
      // setTimeout(0)を挟むことで、前のデコードとの間にジェスチャ等の
      // 保留タスクが処理される（連続デコードでの入力遅延を防ぐ）
      setTimeout(() => {
        try {
          resolve(job());
        } catch (e) {
          reject(e);
        }
      }, 0);
    });
  });
  // 失敗してもレーンを止めない
  decodeLaneTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
};

// ---- デコード済み標高のキャッシュ（Float32Array 256KB/枚の挿入順LRU） ----
// PNGバイト列のキャッシュはヒットしても毎回inflate+65536画素ループが走るため、
// 同じタイルを繰り返し引く用途（3Dの標高サンプリング・オーバーレイのドレープ・逆投影）では
// デコード結果も保持する。枚数を絞って常駐量を抑える（32枚≒8MB）。
// 3D地形はこのLRUに依存しない（DemTextureCacheがGPUテクスチャと同じ寿命で標高を持つ）。
// ここを使うのはviewshed等、同じタイルを繰り返し引く処理
const DECODED_CACHE_MAX_ENTRIES = 32;
const decodedCache = new Map<string, Float32Array | null>();

const decodedCacheGet = (key: string): Float32Array | null | undefined => {
  if (!decodedCache.has(key)) return undefined;
  const value = decodedCache.get(key)!;
  decodedCache.delete(key);
  decodedCache.set(key, value);
  return value;
};

const decodedCacheSet = (key: string, value: Float32Array | null): void => {
  decodedCache.set(key, value);
  while (decodedCache.size > DECODED_CACHE_MAX_ENTRIES) {
    const oldestKey = decodedCache.keys().next().value;
    if (oldestKey === undefined) break;
    decodedCache.delete(oldestKey);
  }
};

/**
 * デコード済み標高タイルをキャッシュからのみ取り出す（同期・取得はしない）。
 * 描画フレーム内から標高を引く用途（ドレープ・投影・逆投影）で使う。
 *
 * @returns 標高 / null=データなし / undefined=未キャッシュ
 */
/**
 * ソースを指定してデコード済み標高を引く（同期・取得はしない）。
 *
 * GSIとterrariumは別々の実測データなので、同じ地点でも標高が数m〜数十m違う。
 * 描画に使ったテクスチャと違うソースを引くと、地形とドットの高さが食い違うため、
 * 3Dのように「描かれている地形に合わせたい」用途ではソースを固定して引く
 */
export const peekDecodedDemTileFor = (
  encoding: DemEncoding,
  zoom: number,
  x: number,
  y: number
): Float32Array | null | undefined => decodedCacheGet(`${encoding}/${zoom}/${x}/${y}`);

export const peekDecodedDemTile = (zoom: number, x: number, y: number): Float32Array | null | undefined => {
  const gsi = decodedCacheGet(`gsi/${zoom}/${x}/${y}`);
  if (gsi instanceof Float32Array) return gsi;
  const terrarium = decodedCacheGet(`terrarium/${zoom}/${x}/${y}`);
  if (terrarium instanceof Float32Array) return terrarium;
  // 両ソースとも404が確定しているときだけ「データなし」。片方でも未取得なら未確定
  return gsi === null && terrarium === null ? null : undefined;
};

export const clearDemTileCache = (): void => {
  tileCache.clear();
  tileCacheBytes = 0;
  decodedCache.clear();
  bathymetryCache.clear();
};

/**
 * 1ソース分のPNGバイト列取得。メモリ→ダウンロード済みローカル→ディスクキャッシュ→ネットワークの順。
 * @returns PNGバイト列 / null=404（記憶される） / undefined=ネットワークエラー（記憶しない）
 */
const fetchTileBytes = async (
  source: DemEncoding,
  urlTemplate: string,
  zoom: number,
  x: number,
  y: number
): Promise<ArrayBuffer | null | undefined> => {
  const key = `${source}/${zoom}/${x}/${y}`;
  const cached = tileCacheGet(key);
  if (cached !== undefined) return cached;
  // オフラインダウンロード済みタイルを最優先で参照する（オンライン時も通信を省ける。Webは常にmissing）
  const local = await loadDownloadedDemTile(source, zoom, x, y);
  if (local.kind === 'data') {
    tileCacheSet(key, local.bytes);
    return local.bytes;
  }
  if (local.kind === 'noData') {
    // GSI確定404マーカー。nullを記憶するとfetchDemTileがterrarium側ローカルへフォールバックする
    tileCacheSet(key, null);
    return null;
  }
  const url = urlTemplate.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y));
  // 電波が不安定な屋外での瞬断に備えて1回だけリトライする
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // ネイティブはディスクキャッシュ付きローダー、Webはブラウザキャッシュ任せ（demTileLoader参照）
      const buffer = await loadDemTilePng(url, key);
      // 404（提供範囲外）は恒久的なのでnullも記憶する
      tileCacheSet(key, buffer);
      return buffer;
    } catch {
      // ネットワークエラーは一時的な可能性があるためキャッシュしない
    }
  }
  return undefined;
};

/**
 * 1ソース分のタイル取得。
 * @returns デコード済み標高 / null=404（記憶される） / undefined=ネットワークエラー（記憶しない）
 */
export const fetchTileFromSource = async (
  source: DemEncoding,
  urlTemplate: string,
  zoom: number,
  x: number,
  y: number
): Promise<Float32Array | null | undefined> => {
  const key = `${source}/${zoom}/${x}/${y}`;
  // デコード済みが残っていれば展開を丸ごと省く
  const decodedHit = decodedCacheGet(key);
  if (decodedHit !== undefined) return decodedHit;
  const bytes = await fetchTileBytes(source, urlTemplate, zoom, x, y);
  if (bytes === undefined) return undefined;
  const elev = bytes === null ? null : decodeDemTile(bytes, source);
  decodedCacheSet(key, elev);
  return elev;
};

/** GPUテクスチャ化するDEMタイルの画素とエンコード方式 */
export interface DemTexturePixels {
  /** RGBA8（アルファは255固定）。標高のデコードは頂点シェーダが行う */
  data: Uint8Array;
  width: number;
  height: number;
  encoding: DemEncoding;
  /**
   * DEMを4x4に区切ったブロック毎の標高範囲[m]（NoDataは除く。行優先）。
   *
   * 地形メッシュのスカート（タイル外周の垂れ壁）の底を決めるのに使う。
   * オーバーズーム時（z15/z16）は1枚のDEMを4〜16タイルで分け合うため、
   * DEM全体の範囲を使うと関係のない谷や山を拾ってスカートが極端に深くなり、
   * 地平線に縦縞の壁として見えてしまう。テクスチャタイルが占める区画だけを見る
   */
  blockMin: Float32Array;
  blockMax: Float32Array;
  /**
   * デコード済み標高[m]（NoDataはNaN）。width×heightが256でないときはnull。
   *
   * GPUへ上げたのと同じバイト列から作ったものを返す。呼び出し側（DemTextureCache）が
   * テクスチャと同じ寿命で保持することで、「地形は描けているのにJSは標高を引けない」
   * という状態が構造的に起きなくなる
   */
  elev: Float32Array | null;
}

/** blockMin/blockMaxの分割数（一辺）。dz=0,1,2のいずれでもブロック境界に揃う */
export const DEM_RANGE_BLOCKS = 4;

/**
 * PNGの画素をRGBA8へ展開する（標高値をそのまま保つ）。
 *
 * 標高タイルは「色」ではなくRGBに詰めた数値なので、ネイティブの画像デコーダ
 * （createImageBitmap経由）に任せるとカラーマネジメントやプリマルチプライで
 * 値が変わり、標高が壊れる。ここではpngLiteで展開してバイトをそのまま上げる。
 */
const pngToRgba = (png: ArrayBuffer): { data: Uint8Array; width: number; height: number } | null => {
  const decoded = decodePngLite(png);
  if (decoded === null) return null;
  const { width, height, data, channels, palette } = decoded;
  const count = width * height;
  const rgba = new Uint8Array(count * 4);
  if (palette !== undefined && channels === 1) {
    for (let i = 0; i < count; i++) {
      const p = data[i] * 3;
      rgba[i * 4] = palette[p];
      rgba[i * 4 + 1] = palette[p + 1];
      rgba[i * 4 + 2] = palette[p + 2];
      rgba[i * 4 + 3] = 255;
    }
  } else if (channels === 3) {
    for (let i = 0; i < count; i++) {
      rgba[i * 4] = data[i * 3];
      rgba[i * 4 + 1] = data[i * 3 + 1];
      rgba[i * 4 + 2] = data[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
  } else if (channels === 4) {
    rgba.set(data.subarray(0, count * 4));
    for (let i = 0; i < count; i++) rgba[i * 4 + 3] = 255;
  } else {
    return null;
  }
  return { data: rgba, width, height };
};

/**
 * RGBA8の標高タイルから、4x4ブロック毎の標高範囲[m]と全画素の標高を求める（NoDataはNaN）。
 * 有効画素が無いブロックは0/0にする。
 *
 * 標高配列を同時に返すのは、同じ全画素デコードをタップ・ドレープ用に
 * もう一度回さないため（1枚あたり数十msの同期処理なので二重に走らせない）。
 */
const elevationRangeBlocks = (
  rgba: Uint8Array,
  width: number,
  height: number,
  encoding: DemEncoding
): { blockMin: Float32Array; blockMax: Float32Array; elev: Float32Array } => {
  const decodePixel = encoding === 'terrarium' ? decodeTerrarium : decodeElevation;
  const n = DEM_RANGE_BLOCKS;
  const blockMin = new Float32Array(n * n).fill(Infinity);
  const blockMax = new Float32Array(n * n).fill(-Infinity);
  const elev = new Float32Array(width * height);
  for (let py = 0; py < height; py++) {
    const by = Math.min(n - 1, Math.floor((py * n) / height));
    for (let px = 0; px < width; px++) {
      const p = py * width + px;
      const i = p * 4;
      const v = decodePixel(rgba[i], rgba[i + 1], rgba[i + 2]);
      elev[p] = v;
      if (Number.isNaN(v)) continue;
      const b = by * n + Math.min(n - 1, Math.floor((px * n) / width));
      if (v < blockMin[b]) blockMin[b] = v;
      if (v > blockMax[b]) blockMax[b] = v;
    }
  }
  for (let b = 0; b < blockMin.length; b++) {
    if (!Number.isFinite(blockMin[b])) {
      blockMin[b] = 0;
      blockMax[b] = 0;
    }
  }
  return { blockMin, blockMax, elev };
};

/** 4x4ブロック毎の標高範囲（NaNは除く。有効画素が無いブロックは0/0） */
const blocksFromElev = (
  elev: Float32Array,
  width: number,
  height: number
): { blockMin: Float32Array; blockMax: Float32Array } => {
  const n = DEM_RANGE_BLOCKS;
  const blockMin = new Float32Array(n * n).fill(Infinity);
  const blockMax = new Float32Array(n * n).fill(-Infinity);
  for (let py = 0; py < height; py++) {
    const by = Math.min(n - 1, Math.floor((py * n) / height));
    for (let px = 0; px < width; px++) {
      const v = elev[py * width + px];
      // eslint-disable-next-line no-self-compare
      if (v !== v) continue; // NaN
      const b = by * n + Math.min(n - 1, Math.floor((px * n) / width));
      if (v < blockMin[b]) blockMin[b] = v;
      if (v > blockMax[b]) blockMax[b] = v;
    }
  }
  for (let b = 0; b < blockMin.length; b++) {
    if (!Number.isFinite(blockMin[b])) {
      blockMin[b] = 0;
      blockMax[b] = 0;
    }
  }
  return { blockMin, blockMax };
};

// 海底値の祖先タイル（z10以下のterrarium、符号付き）のデコード結果。
// z12のDEMなら4x4=16枚が同じ祖先を引くので、展開は1回で済ませる
const BATHYMETRY_CACHE_MAX_ENTRIES = 8;
const bathymetryCache = new Map<string, Float32Array | null>();

const decodeBathymetryAncestor = (key: string, png: ArrayBuffer): Float32Array | null => {
  const hit = bathymetryCache.get(key);
  if (hit !== undefined) return hit;
  const pixels = pngToRgba(png);
  let elev: Float32Array | null = null;
  if (pixels !== null && pixels.width === DEM_TILE_SIZE && pixels.height === DEM_TILE_SIZE) {
    elev = new Float32Array(DEM_TILE_SIZE * DEM_TILE_SIZE);
    const d = pixels.data;
    for (let i = 0, p = 0; i < elev.length; i++, p += 4) elev[i] = d[p] * 256 + d[p + 1] + d[p + 2] / 256 - 32768;
  }
  bathymetryCache.set(key, elev);
  while (bathymetryCache.size > BATHYMETRY_CACHE_MAX_ENTRIES) {
    const oldestKey = bathymetryCache.keys().next().value;
    if (oldestKey === undefined) break;
    bathymetryCache.delete(oldestKey);
  }
  return elev;
};

/**
 * 海底モードのDEM画素。陸はGSI（無ければterrarium）、海はterrariumの海底値で埋め、
 * GSI方式のRGBへ詰め直して返す（エンコードを1種類にしてシェーダを変えずに済ませる）。
 *
 * terrariumの海底値はz10までしか無いので、z11以上はz10の祖先から引き伸ばす（bathymetryFill参照）。
 * 描画とタップ等のJS側標高が一致するよう、elevも埋めた後の値を返す。
 * 符号付きの値をviewshed向けのdecodedCacheへ混ぜないよう、ここではキャッシュへ書かない。
 */
const resolveBathymetryDemPixels = async (
  zoom: number,
  x: number,
  y: number
): Promise<DemTexturePixels | null | undefined> => {
  const gsiBytes = await fetchTileBytes('gsi', GSI_DEM_URL, zoom, x, y);
  if (gsiBytes === undefined) return undefined;
  let primary: { encoding: DemEncoding; bytes: ArrayBuffer | null } = { encoding: 'gsi', bytes: gsiBytes };
  if (gsiBytes === null) {
    const terrariumBytes = await fetchTileBytes('terrarium', TERRARIUM_URL, zoom, x, y);
    if (terrariumBytes === undefined) return undefined;
    primary = { encoding: 'terrarium', bytes: terrariumBytes };
  }
  const ancestor = bathymetryAncestor(zoom, x, y);
  // z10以下のterrariumはそれ自体が海底値を持つので祖先は要らない
  const needsAncestor = primary.encoding === 'gsi' || zoom > BATHYMETRY_MAX_ZOOM;
  const ancestorBytes = needsAncestor
    ? await fetchTileBytes('terrarium', TERRARIUM_URL, ancestor.z, ancestor.x, ancestor.y)
    : null;
  // 通信エラーは海が欠けたまま確定させず、失敗させて再取得に回す
  if (ancestorBytes === undefined) return undefined;
  if (primary.bytes === null && ancestorBytes === null) return null;
  const primaryBytes = primary.bytes;

  return await runInDecodeLane(() => {
    const startMs = __DEV__ ? performance.now() : 0;
    const size = DEM_TILE_SIZE;
    let elev: Float32Array;
    const pixels = primaryBytes === null ? null : pngToRgba(primaryBytes);
    if (pixels !== null && pixels.width === size && pixels.height === size) {
      elev = new Float32Array(size * size);
      const d = pixels.data;
      if (primary.encoding === 'terrarium') {
        for (let i = 0, p = 0; i < elev.length; i++, p += 4) elev[i] = d[p] * 256 + d[p + 1] + d[p + 2] / 256 - 32768;
      } else {
        for (let i = 0, p = 0; i < elev.length; i++, p += 4) elev[i] = decodeElevation(d[p], d[p + 1], d[p + 2]);
      }
    } else {
      // 陸のデータが無い（両ソースとも404・256px以外）→ 全面を海底値で埋める
      elev = new Float32Array(size * size).fill(NaN);
    }
    if (needsAncestor && ancestorBytes) {
      const ancestorElev = decodeBathymetryAncestor(`${ancestor.z}/${ancestor.x}/${ancestor.y}`, ancestorBytes);
      if (ancestorElev !== null) {
        // terrariumのz11以上は海が0m（または僅かな負値）で入っているので、0以下を海とみなす
        fillSeaWithBathymetry(elev, size, { z: zoom, x, y }, ancestorElev, ancestor, primary.encoding === 'terrarium');
      }
    }
    // 描画とJS側の標高（タップ・投影）が一致するよう、強調はelevの段階で掛ける
    exaggerateDepths(elev, BATHYMETRY_EXAGGERATION);
    const data = new Uint8Array(size * size * 4);
    encodeGsiRgba(elev, data);
    const { blockMin, blockMax } = blocksFromElev(elev, size, size);
    if (__DEV__) {
      const elapsed = performance.now() - startMs;
      decodeStats.count++;
      decodeStats.totalMs += elapsed;
      // eslint-disable-next-line no-console
      console.log(`[terrain3d] dem decode bathy/${zoom}/${x}/${y} ${elapsed.toFixed(1)}ms`);
    }
    return { data, width: size, height: size, encoding: 'gsi' as const, blockMin, blockMax, elev };
  });
};

/**
 * DEMタイルをGPUテクスチャ化するための画素を返す。
 * fetchDemTileと同じ優先順（GSI→404ならterrarium）。
 * bathymetry=trueなら海域を海底の深さで埋める（GEBCO海底地形図の3D表示用）。
 *
 * @returns 画素 / null=データなし / undefined=通信エラー（一時的）
 */
export const resolveDemTexturePixels = async (
  zoom: number,
  x: number,
  y: number,
  options: { bathymetry?: boolean } = {}
): Promise<DemTexturePixels | null | undefined> => {
  const max = Math.pow(2, zoom);
  if (x < 0 || y < 0 || x >= max || y >= max) return null;
  if (options.bathymetry === true) return resolveBathymetryDemPixels(zoom, x, y);
  const sources: { encoding: DemEncoding; url: string }[] = [
    { encoding: 'gsi', url: GSI_DEM_URL },
    { encoding: 'terrarium', url: TERRARIUM_URL },
  ];
  for (const { encoding, url } of sources) {
    const bytes = await fetchTileBytes(encoding, url, zoom, x, y);
    // 通信エラーは別ソースへ落とさず失敗させる（fetchDemTileと同じ規約）
    if (bytes === undefined) return undefined;
    if (bytes === null) continue;
    // 展開と全画素デコードはまとめてレーンへ通す（JSスレッドを連続で塞がない）
    const decoded = await runInDecodeLane(() => {
      const startMs = __DEV__ ? performance.now() : 0;
      const pixels = pngToRgba(bytes);
      if (pixels === null) return null;
      const { blockMin, blockMax, elev } = elevationRangeBlocks(pixels.data, pixels.width, pixels.height, encoding);
      // 読み出し側（sampleNearest）が256x256前提なので、それ以外は標高を渡さない
      const sized = pixels.width === DEM_TILE_SIZE && pixels.height === DEM_TILE_SIZE;
      // viewshed等が使うデコード済みキャッシュへ相乗りさせる（同じ展開を二度やらない）。
      // 3D側はこのLRUに依存せず、DemTextureCacheがテクスチャと同じ寿命でelevを持つ
      if (sized) decodedCacheSet(`${encoding}/${zoom}/${x}/${y}`, elev);
      if (__DEV__) {
        const elapsed = performance.now() - startMs;
        decodeStats.count++;
        decodeStats.totalMs += elapsed;
        // eslint-disable-next-line no-console
        console.log(`[terrain3d] dem decode ${encoding}/${zoom}/${x}/${y} ${elapsed.toFixed(1)}ms`);
      }
      return { ...pixels, encoding, blockMin, blockMax, elev: sized ? elev : null };
    });
    if (decoded !== null) return decoded;
  }
  return null;
};

/**
 * @returns デコード済み標高 / null=データなし（海上・提供範囲外） / undefined=通信エラー（一時的）
 */
export const fetchDemTile = async (zoom: number, x: number, y: number): Promise<Float32Array | null | undefined> => {
  const max = Math.pow(2, zoom);
  if (x < 0 || y < 0 || x >= max || y >= max) return null;
  // 国内はGSI（10m）を優先し、提供範囲外（404）ならAWS Terrain Tiles（全球30-90m）へ
  // タイル単位でフォールバックする。国境付近は両ソースが自然に混在する。
  const gsi = await fetchTileFromSource('gsi', GSI_DEM_URL, zoom, x, y);
  if (gsi instanceof Float32Array) return gsi;
  if (gsi === undefined) return undefined; // 通信エラー時は低解像度へフォールバックせず失敗させる
  return await fetchTileFromSource('terrarium', TERRARIUM_URL, zoom, x, y);
};
