/**
 * maplibre の addProtocol で標高タイルからSVF陰影タイルを生成する。
 *
 * maplibre内蔵の hillshade レイヤは光源方位に依存するため、地図を回すと凹凸が反転する。
 * ここでは標高タイルを自前で取得・デコードし、全方向陰影を計算した通常のラスタタイルを返す。
 *
 * タイルURLの形式:
 *   svfao://<encodeURIComponent(JSON設定)>/{z}/{x}/{y}
 */
import { encode as fastPngEncode } from 'fast-png';
import type { RequestParameters } from 'maplibre-gl';
import { computeSvfShading, decodeElevation, metersPerPixel, DEFAULT_SVF_OPTIONS, SvfOptions } from './svfShading';

export const SVF_PROTOCOL = 'svfao';

const TILE_SIZE = 256;
/** 袖の幅。探索半径より広ければよい */
const HALO = 32;
const BUFFER_SIZE = TILE_SIZE + 2 * HALO;

/** デコード済み標高のキャッシュ枚数。1枚あたり 256×256×4B = 256KB */
const MAX_CACHED_TILES = 128;

type SvfTileConfig = {
  /** 標高タイルのURLテンプレート。{z}/{x}/{y} を含む */
  u: string;
  /** Y軸反転（TMS形式） */
  f?: boolean;
};

/** タイルURLの先頭部分を作る。maplibre側で {z}/{x}/{y} が置換される */
export function buildSvfTileUrl(demUrlTemplate: string, flipY?: boolean): string {
  const config: SvfTileConfig = { u: demUrlTemplate };
  if (flipY) config.f = true;
  return `${SVF_PROTOCOL}://${encodeURIComponent(JSON.stringify(config))}/{z}/{x}/{y}`;
}

function resolveDemUrl(config: SvfTileConfig, z: number, x: number, y: number): string {
  const ty = config.f ? Math.pow(2, z) - 1 - y : y;
  return config.u
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(ty));
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
  const key = `${z}/${x}/${y}`;
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
 * 袖はHALO画素分だけあればよいので、隣接タイルは必要な帯だけコピーする。
 */
function assembleWithHalo(tiles: (Float32Array | null)[]): Float32Array {
  const buffer = new Float32Array(BUFFER_SIZE * BUFFER_SIZE).fill(NaN);

  for (let ty = -1; ty <= 1; ty++) {
    for (let tx = -1; tx <= 1; tx++) {
      const tile = tiles[(ty + 1) * 3 + (tx + 1)];
      if (!tile) continue;

      // このタイルのうちバッファに入る範囲を、タイル内座標で求める
      const srcX0 = tx === -1 ? TILE_SIZE - HALO : 0;
      const srcX1 = tx === 1 ? HALO : TILE_SIZE;
      const srcY0 = ty === -1 ? TILE_SIZE - HALO : 0;
      const srcY1 = ty === 1 ? HALO : TILE_SIZE;
      // バッファ上での左上位置
      const dstX = HALO + tx * TILE_SIZE + srcX0;
      const dstY = HALO + ty * TILE_SIZE + srcY0;

      for (let y = srcY0; y < srcY1; y++) {
        const src = y * TILE_SIZE + srcX0;
        const dst = (dstY + (y - srcY0)) * BUFFER_SIZE + dstX;
        buffer.set(tile.subarray(src, src + (srcX1 - srcX0)), dst);
      }
    }
  }
  return buffer;
}

/**
 * addProtocol に渡すハンドラを作る。
 * @param options 陰影のパラメータ。省略時は既定値（8方位・半径16px）
 */
export function createSvfProtocolHandler(options: SvfOptions = DEFAULT_SVF_OPTIONS) {
  return async (params: RequestParameters, abortController: AbortController) => {
    try {
      const parts = params.url.split('/');
      const [rawConfig, rawZ, rawX, rawY] = parts.slice(-4);
      const config: SvfTileConfig = JSON.parse(decodeURIComponent(rawConfig));
      const z = Number(rawZ);
      const x = Number(rawX);
      const y = Number(rawY);
      if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) return { data: null };

      const signal = abortController.signal;
      const max = Math.pow(2, z);
      // 3×3タイルを取得する。隣接タイルはキャッシュに載るので実質1枚あたり1回の取得で済む
      const tiles = await Promise.all(
        [-1, 0, 1].flatMap((dy) =>
          [-1, 0, 1].map((dx) => {
            const nx = ((x + dx) % max + max) % max; // 経度方向は巻き戻す
            const ny = y + dy;
            if (ny < 0 || ny >= max) return Promise.resolve(null);
            return loadElevationTile(config, z, nx, ny, signal);
          })
        )
      );

      // 中央タイルが取れなければ描くものがない
      if (!tiles[4]) return { data: null };
      if (signal.aborted) return { data: null };

      const buffer = assembleWithHalo(tiles);
      const rgba = computeSvfShading(buffer, BUFFER_SIZE, HALO, TILE_SIZE, metersPerPixel(z, y), options);

      return {
        data: fastPngEncode({
          width: TILE_SIZE,
          height: TILE_SIZE,
          data: rgba,
          channels: 4,
          depth: 8,
        }),
      };
    } catch {
      return { data: null };
    }
  };
}
