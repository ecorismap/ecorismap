/**
 * maplibre の addProtocol で標高タイルから全方向陰影タイルを生成する。
 *
 * maplibre内蔵の hillshade レイヤは光源方位に依存するため、地図を回すと凹凸が反転する。
 * ここでは標高タイルを自前で取得・デコードし、陰影を計算した通常のラスタタイルを返す。
 *
 * 内部のタイルURLの形式:
 *   terrainshade://<encodeURIComponent(JSON設定)>/{z}/{x}/{y}
 */
import { encode as fastPngEncode } from 'fast-png';
import type { RequestParameters } from 'maplibre-gl';
import {
  computeShading,
  decodeElevation,
  metersPerPixel,
  requiredHalo,
  DEFAULT_SHADING_OPTIONS,
  ShadingOptions,
} from './terrainShading';
import { computeColorRelief, computeGebcoRelief, ReliefStyle } from './colorRelief';
import { assembleWithHalo, cropAndScale } from './reliefTileCompose';

export const SHADING_PROTOCOL = 'terrainshade';

const TILE_SIZE = 256;
/** 標高タイルが無いとき、何段まで粗いズームへ降りるか（z15→海域データの上限z10に届く段数） */
const MAX_ZOOM_FALLBACK = 5;
/** デコード済み標高のキャッシュ枚数。1枚あたり 256×256×4B = 256KB */
const MAX_CACHED_TILES = 128;

type ShadingTileConfig = {
  /** 標高タイルのURLテンプレート。{z}/{x}/{y} を含む */
  u: string;
  /** Y軸反転（TMS形式） */
  f?: boolean;
  /** 1なら陰影段彩（relief://）。省略時は無彩色の陰影 */
  m?: 1;
  /** 段彩の配色バリアント（省略時はdefault） */
  s?: ReliefStyle;
};

/** タイルURLの先頭部分を作る。maplibre側で {z}/{x}/{y} が置換される */
export function buildShadingTileUrl(
  demUrlTemplate: string,
  flipY?: boolean,
  relief?: boolean,
  style?: ReliefStyle
): string {
  const config: ShadingTileConfig = { u: demUrlTemplate };
  if (flipY) config.f = true;
  if (relief) config.m = 1;
  if (relief && style && style !== 'default') config.s = style;
  return `${SHADING_PROTOCOL}://${encodeURIComponent(JSON.stringify(config))}/{z}/{x}/{y}`;
}

function resolveDemUrl(config: ShadingTileConfig, z: number, x: number, y: number): string {
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

export function clearShadingTileCache(): void {
  elevationCache.clear();
}

/** 標高タイル1枚を取得してFloat32Arrayへデコードする。取得できなければ null */
async function loadElevationTile(
  config: ShadingTileConfig,
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
 * addProtocol に渡すハンドラを作る。
 * @param baseOptions 陰影のパラメータ。方式はタイルURLの指定が優先される
 */
export function createShadingProtocolHandler(baseOptions: ShadingOptions = DEFAULT_SHADING_OPTIONS) {
  return async (params: RequestParameters, abortController: AbortController) => {
    try {
      const parts = params.url.split('/');
      const [rawConfig, rawZ, rawX, rawY] = parts.slice(-4);
      const config: ShadingTileConfig = JSON.parse(decodeURIComponent(rawConfig));
      const z = Number(rawZ);
      const x = Number(rawX);
      const y = Number(rawY);
      if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) return { data: null };

      // 袖はタイル1枚分(256px)を超えないようにする
      const halo = Math.min(requiredHalo(baseOptions), TILE_SIZE);
      const signal = abortController.signal;

      // 標高タイルの提供範囲はズームによって地域差がある（例えば産総研の陸域統合DEMは
      // z14は全国にあるがz15は佐渡島・知床・屋久島などで欠ける）。要求されたズームで
      // 取れなければ粗いズームへ降り、該当部分を切り出して拡大する。
      for (let sourceZ = z; sourceZ >= Math.max(0, z - MAX_ZOOM_FALLBACK); sourceZ--) {
        const shift = z - sourceZ;
        const sx = x >> shift;
        const sy = y >> shift;
        const max = Math.pow(2, sourceZ);

        // 3×3タイルを取得する。隣接タイルはキャッシュに載るので実質1枚あたり1回の取得で済む
        const tiles = await Promise.all(
          [-1, 0, 1].flatMap((dy) =>
            [-1, 0, 1].map((dx) => {
              const nx = (((sx + dx) % max) + max) % max; // 経度方向は巻き戻す
              const ny = sy + dy;
              if (ny < 0 || ny >= max) return Promise.resolve(null);
              return loadElevationTile(config, sourceZ, nx, ny, signal);
            })
          )
        );
        if (signal.aborted) return { data: null };
        // 中央タイルが取れなければ、さらに粗いズームを試す
        if (!tiles[4]) continue;

        const buffer = assembleWithHalo(tiles, halo);
        // gebcoスタイルはHome.web.tsxがmaplibreの実レイヤを使うためここには来ないが、
        // フォールバックとしてネイティブと同じラスタ近似を返せるようにしておく
        const rgba = config.m
          ? config.s === 'gebco'
            ? computeGebcoRelief(buffer, TILE_SIZE + 2 * halo, halo, TILE_SIZE, sourceZ)
            : computeColorRelief(
                buffer,
                TILE_SIZE + 2 * halo,
                halo,
                TILE_SIZE,
                metersPerPixel(sourceZ, sy),
                sourceZ,
                baseOptions
              )
          : computeShading(buffer, TILE_SIZE + 2 * halo, halo, TILE_SIZE, metersPerPixel(sourceZ, sy), baseOptions);

        const output = shift === 0 ? rgba : cropAndScale(rgba, shift, x - (sx << shift), y - (sy << shift));
        return {
          data: fastPngEncode({ width: TILE_SIZE, height: TILE_SIZE, data: output, channels: 4, depth: 8 }),
        };
      }
      return { data: null };
    } catch {
      return { data: null };
    }
  };
}
