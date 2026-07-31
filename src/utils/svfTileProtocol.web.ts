/**
 * maplibre の addProtocol で標高タイルから全方向陰影タイルを生成する。
 *
 * maplibre内蔵の hillshade レイヤは光源方位に依存するため、地図を回すと凹凸が反転する。
 * ここでは標高タイルを自前で取得・デコードし、陰影を計算した通常のラスタタイルを返す。
 *
 * 計算方式は地図URLの末尾にフラグメントで指定する（省略時はsvf）:
 *   hillshade://https://example/{z}/{x}/{y}.png#opendiff
 *
 * 内部のタイルURLの形式:
 *   svfao://<encodeURIComponent(JSON設定)>/{z}/{x}/{y}
 */
import { encode as fastPngEncode } from 'fast-png';
import type { RequestParameters } from 'maplibre-gl';
import {
  computeShading,
  decodeElevation,
  metersPerPixel,
  parseShadingMethod,
  requiredHalo,
  DEFAULT_SHADING_OPTIONS,
  ShadingMethod,
  ShadingOptions,
} from './terrainShading';

export const SVF_PROTOCOL = 'svfao';

const TILE_SIZE = 256;
/** デコード済み標高のキャッシュ枚数。1枚あたり 256×256×4B = 256KB */
const MAX_CACHED_TILES = 128;

type SvfTileConfig = {
  /** 標高タイルのURLテンプレート。{z}/{x}/{y} を含む */
  u: string;
  /** Y軸反転（TMS形式） */
  f?: boolean;
  /** 計算方式 */
  m?: ShadingMethod;
};

/** タイルURLの先頭部分を作る。maplibre側で {z}/{x}/{y} が置換される */
export function buildSvfTileUrl(hillshadeUrl: string, flipY?: boolean): string {
  const { demUrl, method } = parseShadingMethod(hillshadeUrl);
  const config: SvfTileConfig = { u: demUrl };
  if (flipY) config.f = true;
  if (method !== DEFAULT_SHADING_OPTIONS.method) config.m = method;
  return `${SVF_PROTOCOL}://${encodeURIComponent(JSON.stringify(config))}/{z}/{x}/{y}`;
}

function resolveDemUrl(config: SvfTileConfig, z: number, x: number, y: number): string {
  const ty = config.f ? Math.pow(2, z) - 1 - y : y;
  return config.u.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(ty));
}

// ---- デコード済み標高タイルのキャッシュ（挿入順を使った簡易LRU）----
const elevationCache = new Map<string, Float32Array | null>();
const inflight = new Map<string, Promise<Float32Array | null>>();

function cacheGet(key: string): Float32Array | null | undefined {
  if (!elevationCache.has(key)) return undefined;
  const value = elevationCache.get(key)!;
  // 参照したものを末尾に移してLRUを維持する
  elevationCache.delete(key);
  elevationCache.set(key, value);
  return value;
}

function cacheSet(key: string, value: Float32Array | null): void {
  elevationCache.set(key, value);
  while (elevationCache.size > MAX_CACHED_TILES) {
    const oldest = elevationCache.keys().next().value;
    if (oldest === undefined) break;
    elevationCache.delete(oldest);
  }
}

export function clearSvfTileCache(): void {
  elevationCache.clear();
}

/** 標高タイル1枚を取得してFloat32Arrayへデコードする。取得できなければ null */
async function loadElevationTile(
  config: SvfTileConfig,
  z: number,
  x: number,
  y: number,
  signal: AbortSignal
): Promise<Float32Array | null> {
  // 同じ標高タイルを方式違いの地図が共有できるよう、キーに方式を含めない
  const key = `${config.u}|${z}/${x}/${y}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    try {
      const response = await fetch(resolveDemUrl(config, z, x, y), { signal });
      if (!response.ok) return null;
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, TILE_SIZE, TILE_SIZE);
      bitmap.close();
      const { data } = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
      const elevation = new Float32Array(TILE_SIZE * TILE_SIZE);
      for (let i = 0; i < elevation.length; i++) {
        const p = i * 4;
        elevation[i] = decodeElevation(data[p], data[p + 1], data[p + 2]);
      }
      return elevation;
    } catch {
      // 中断・ネットワークエラーはNoData扱い
      return null;
    }
  })();

  inflight.set(key, task);
  try {
    const result = await task;
    // 中断された場合はキャッシュに残さない（次回再取得させる）
    if (!signal.aborted) cacheSet(key, result);
    return result;
  } finally {
    inflight.delete(key);
  }
}

/**
 * 中央タイルと周囲8タイルから、袖付きの標高バッファを組み立てる。
 * 袖はhalo画素分だけあればよいので、隣接タイルは必要な帯だけコピーする。
 */
function assembleWithHalo(tiles: (Float32Array | null)[], halo: number): Float32Array {
  const bufferSize = TILE_SIZE + 2 * halo;
  const buffer = new Float32Array(bufferSize * bufferSize).fill(NaN);

  for (let ty = -1; ty <= 1; ty++) {
    for (let tx = -1; tx <= 1; tx++) {
      const tile = tiles[(ty + 1) * 3 + (tx + 1)];
      if (!tile) continue;

      // このタイルのうちバッファに入る範囲を、タイル内座標で求める
      const srcX0 = tx === -1 ? TILE_SIZE - halo : 0;
      const srcX1 = tx === 1 ? halo : TILE_SIZE;
      const srcY0 = ty === -1 ? TILE_SIZE - halo : 0;
      const srcY1 = ty === 1 ? halo : TILE_SIZE;
      // バッファ上での左上位置
      const dstX = halo + tx * TILE_SIZE + srcX0;
      const dstY = halo + ty * TILE_SIZE + srcY0;

      for (let y = srcY0; y < srcY1; y++) {
        const src = y * TILE_SIZE + srcX0;
        const dst = (dstY + (y - srcY0)) * bufferSize + dstX;
        buffer.set(tile.subarray(src, src + (srcX1 - srcX0)), dst);
      }
    }
  }
  return buffer;
}

/**
 * addProtocol に渡すハンドラを作る。
 * @param baseOptions 陰影のパラメータ。方式はタイルURLの指定が優先される
 */
export function createSvfProtocolHandler(baseOptions: ShadingOptions = DEFAULT_SHADING_OPTIONS) {
  return async (params: RequestParameters, abortController: AbortController) => {
    try {
      const parts = params.url.split('/');
      const [rawConfig, rawZ, rawX, rawY] = parts.slice(-4);
      const config: SvfTileConfig = JSON.parse(decodeURIComponent(rawConfig));
      const z = Number(rawZ);
      const x = Number(rawX);
      const y = Number(rawY);
      if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) return { data: null };

      const options: ShadingOptions = { ...baseOptions, method: config.m ?? baseOptions.method };
      // マルチスケールは粗い層のぶん広い袖が要る。タイル1枚分(256px)を超えない範囲で確保する
      const halo = Math.min(requiredHalo(options), TILE_SIZE);

      const signal = abortController.signal;
      const max = Math.pow(2, z);
      // 3×3タイルを取得する。隣接タイルはキャッシュに載るので実質1枚あたり1回の取得で済む
      const tiles = await Promise.all(
        [-1, 0, 1].flatMap((dy) =>
          [-1, 0, 1].map((dx) => {
            const nx = (((x + dx) % max) + max) % max; // 経度方向は巻き戻す
            const ny = y + dy;
            if (ny < 0 || ny >= max) return Promise.resolve(null);
            return loadElevationTile(config, z, nx, ny, signal);
          })
        )
      );

      // 中央タイルが取れなければ描くものがない
      if (!tiles[4]) return { data: null };
      if (signal.aborted) return { data: null };

      const buffer = assembleWithHalo(tiles, halo);
      const rgba = computeShading(
        buffer,
        TILE_SIZE + 2 * halo,
        halo,
        TILE_SIZE,
        metersPerPixel(z, y),
        options
      );

      return {
        data: fastPngEncode({ width: TILE_SIZE, height: TILE_SIZE, data: rgba, channels: 4, depth: 8 }),
      };
    } catch {
      return { data: null };
    }
  };
}
