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

export const clearDemTileCache = (): void => {
  tileCache.clear();
  tileCacheBytes = 0;
};

/**
 * 1ソース分のタイル取得。メモリ→ダウンロード済みローカル→ディスクキャッシュ→ネットワークの順。
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
  const cached = tileCacheGet(key);
  if (cached !== undefined) return cached === null ? null : decodeDemTile(cached, source);
  // オフラインダウンロード済みタイルを最優先で参照する（オンライン時も通信を省ける。Webは常にmissing）
  const local = await loadDownloadedDemTile(source, zoom, x, y);
  if (local.kind === 'data') {
    tileCacheSet(key, local.bytes);
    return decodeDemTile(local.bytes, source);
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
      return buffer === null ? null : decodeDemTile(buffer, source);
    } catch {
      // ネットワークエラーは一時的な可能性があるためキャッシュしない
    }
  }
  return undefined;
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
