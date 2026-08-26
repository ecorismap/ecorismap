/**
 * GEBCO海底地形図（relief:// + #style=gebco）のWeb実装。
 *
 * shiwaku/gebco-2025-grid-tile-on-maplibre デモを配信サーバー以外は忠実に再現する:
 *   - color-relief レイヤ（指数補間0.8の深海強調配色、不透明度0.85）
 *   - maplibre内蔵 hillshade レイヤ（光源315°・exaggeration 0.6）
 *   - maplibre-contour による等深線ベクタ＋数値ラベル
 *
 * ソースはGSJ数値PNG/WebPタイル（地理院/産総研エンコード）:
 *   - GEBCO全球: `elev/gebco`（256px PNG、z0-9）
 *   - 日本近海・詳細: `elev2/mixed`（512px WebP、z0-11。海域は内閣府 南海トラフ地形データ入り）
 * raster-dem ソースには gsjdem:// プロトコルでTerrain-RGBへ変換したタイルを渡し、
 * maplibre-contour は fetchAndParseTile を差し替えて同じ標高ローダーを使わせる。
 *
 * 標高ローダーはタイルが無い/NoDataを含む場合に親タイルから補完する
 * （elev2のデータ整備域の縁や、海域データがz8止まりの場所でも表示が途切れないように）。
 *
 * ネイティブ（iOS/Android）はmaplibreが無いため、同じURLをラスタ焼き込みの
 * relief:// パイプライン（gebco配色）で近似表示する。
 */
import { encode as fastPngEncode } from 'fast-png';
import type { LayerSpecification, RequestParameters } from 'maplibre-gl';
import mlcontour from 'maplibre-contour';
import { decodeElevation, toDemUrl } from './terrainShading';
import { CONTOUR_INTERVALS, GEBCO_RELIEF_RAMP } from './colorRelief';
import type { TileMapType } from '../types';
import msilIslandsJson from '../presets/data/msil_islands.json';
import msilUnderseaFeaturesJson from '../presets/data/msil_undersea_features.json';

export const GSJDEM_PROTOCOL = 'gsjdem';

/** 親タイルから補完する最大段数 */
const PARENT_FALLBACK_DEPTH = 4;

/**
 * NoDataの番兵。maplibreのraster-demは透明画素を表現できないため、NoDataは
 * Terrain-RGBの最大値（標高約+167万m）にエンコードし、color-relief側のstep式で
 * 透明にする（データ整備域が限られるソース＝内閣府地形データ等で、範囲外を下の地図に抜く）。
 * 実在の標高（最高でも9000m弱）とは桁違いなので衝突しない。
 */
const NODATA_TERRAIN_RGB = 0xffffff;
/** step式でこの標高を超えたら透明にする閾値[m] */
const NODATA_STEP_ELEV = 500000;

type ElevationTile = { width: number; data: Float32Array };

/** ソースごとのタイル仕様。elev2は512px・z11、GEBCOは256px・z9 */
export function gebcoSourceParams(demUrlTemplate: string): { tileSize: number; maxzoom: number } {
  return demUrlTemplate.includes('/elev2/') ? { tileSize: 512, maxzoom: 11 } : { tileSize: 256, maxzoom: 9 };
}

/** raster-demソース用のタイルURL（gsjdem://プロトコル経由でTerrain-RGBに変換される） */
export function buildGsjDemTileUrl(demUrlTemplate: string): string {
  return `${GSJDEM_PROTOCOL}://${encodeURIComponent(demUrlTemplate)}/{z}/{x}/{y}`;
}

/** GSJ数値PNG/WebPタイルのblobをデコードして標高配列にする。NoDataはNaNのまま返す */
async function decodeGsjBlob(blob: Blob): Promise<ElevationTile> {
  const bitmap = await createImageBitmap(blob);
  const width = bitmap.width;
  const height = bitmap.height;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no canvas context');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data: rgba } = ctx.getImageData(0, 0, width, height);
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) {
    const p = i * 4;
    data[i] = rgba[p + 3] === 0 ? NaN : decodeElevation(rgba[p], rgba[p + 1], rgba[p + 2]);
  }
  return { width, data };
}

// ---- 標高タイルのキャッシュ（親補完で同じタイルを何度も引くため）----
const elevationCache = new Map<string, ElevationTile | null>();
const ELEVATION_CACHE_MAX = 48;

async function loadRawTile(demUrlTemplate: string, z: number, x: number, y: number): Promise<ElevationTile | null> {
  const key = `${demUrlTemplate}|${z}/${x}/${y}`;
  if (elevationCache.has(key)) {
    const cached = elevationCache.get(key)!;
    elevationCache.delete(key);
    elevationCache.set(key, cached);
    return cached;
  }
  let tile: ElevationTile | null = null;
  try {
    const url = demUrlTemplate.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
    const response = await fetch(url);
    if (response.ok) tile = await decodeGsjBlob(await response.blob());
  } catch {
    // ネットワークエラーは一時的な可能性があるためキャッシュしない
    return null;
  }
  elevationCache.set(key, tile);
  while (elevationCache.size > ELEVATION_CACHE_MAX) {
    const oldest = elevationCache.keys().next().value;
    if (oldest === undefined) break;
    elevationCache.delete(oldest);
  }
  return tile;
}

/** 親タイルの該当象限をニアレストで子タイル解像度へ拡大する */
function cropQuadrant(parent: ElevationTile, quadX: number, quadY: number, outWidth: number): ElevationTile {
  const half = parent.width / 2;
  const originX = quadX * half;
  const originY = quadY * half;
  const data = new Float32Array(outWidth * outWidth);
  for (let y = 0; y < outWidth; y++) {
    const srcY = originY + Math.floor((y * half) / outWidth);
    for (let x = 0; x < outWidth; x++) {
      const srcX = originX + Math.floor((x * half) / outWidth);
      data[y * outWidth + x] = parent.data[srcY * parent.width + srcX];
    }
  }
  return { width: outWidth, data };
}

const hasNaN = (tile: ElevationTile): boolean => {
  for (let i = 0; i < tile.data.length; i++) {
    // eslint-disable-next-line no-self-compare
    if (tile.data[i] !== tile.data[i]) return true;
  }
  return false;
};

/**
 * 標高タイルを取得する。タイルが無い・NoDataを含む場合は親タイル（最大4段）から補完する。
 * データ整備域の縁や、海域データが粗いズームで止まる場所でも表示が途切れないようにするため。
 */
async function loadElevationMerged(
  demUrlTemplate: string,
  z: number,
  x: number,
  y: number,
  depth: number = PARENT_FALLBACK_DEPTH
): Promise<ElevationTile | null> {
  const own = await loadRawTile(demUrlTemplate, z, x, y);
  if (own !== null && !hasNaN(own)) return own;
  if (depth <= 0 || z <= 0) return own;

  const parent = await loadElevationMerged(demUrlTemplate, z - 1, x >> 1, y >> 1, depth - 1);
  if (parent === null) return own;
  const filled = cropQuadrant(parent, x & 1, y & 1, own?.width ?? parent.width);
  if (own === null) return filled;
  for (let i = 0; i < own.data.length; i++) {
    // eslint-disable-next-line no-self-compare
    if (own.data[i] !== own.data[i]) own.data[i] = filled.data[i];
  }
  return own;
}

/** GSJ数値タイル → Mapbox Terrain-RGB PNG に変換するプロトコルハンドラ（親補完付き） */
export function createGsjDemProtocolHandler() {
  return async (params: RequestParameters, _abortController: AbortController) => {
    try {
      const parts = params.url.split('/');
      const [rawTemplate, z, x, y] = parts.slice(-4);
      const tile = await loadElevationMerged(decodeURIComponent(rawTemplate), Number(z), Number(x), Number(y));
      if (tile === null) return { data: null };
      const { width, data } = tile;
      const out = new Uint8ClampedArray(width * width * 4);
      for (let i = 0; i < data.length; i++) {
        // Terrain-RGB: v = (標高 + 10000) × 10。親補完後も残るNoDataは番兵（最大値）
        const e = data[i];
        let v;
        // eslint-disable-next-line no-self-compare
        if (e !== e) {
          v = NODATA_TERRAIN_RGB;
        } else {
          v = Math.round((e + 10000) * 10);
          if (v < 0) v = 0;
          if (v >= NODATA_TERRAIN_RGB) v = NODATA_TERRAIN_RGB - 1;
        }
        const p = i * 4;
        out[p] = (v >> 16) & 0xff;
        out[p + 1] = (v >> 8) & 0xff;
        out[p + 2] = v & 0xff;
        out[p + 3] = 255;
      }
      return { data: fastPngEncode({ width, height: width, data: out, channels: 4, depth: 8 }) };
    } catch {
      return { data: null };
    }
  };
}

// ---- maplibre-contour のDemSource（demURLごとにシングルトン。プロトコル二重登録を防ぐ）----
type MaplibreLike = { addProtocol: (id: string, handler: any) => void };
const demSources = new Map<string, { contourTilesUrl: string }>();
let demSourceSeq = 0;

/** CONTOUR_INTERVALSからmaplibre-contourのしきい値（zoom: [minor, major]）を組み立てる */
function contourThresholds(maxzoom: number): Record<number, [number, number]> {
  const thresholds: Record<number, [number, number]> = {};
  for (const [zoom, minor, major] of CONTOUR_INTERVALS) {
    if (zoom <= maxzoom) thresholds[zoom] = [minor, major];
  }
  return thresholds;
}

/**
 * 等深線ベクタタイルのURLテンプレートを返す。初回呼び出しでmaplibre-contourの
 * プロトコルを登録する。しきい値はCONTOUR_INTERVALS（ネイティブの線の焼き込みと同一）。
 */
export function getGebcoContourTilesUrl(maplibregl: MaplibreLike, demUrlTemplate: string): string {
  const cached = demSources.get(demUrlTemplate);
  if (cached) return cached.contourTilesUrl;

  const { maxzoom } = gebcoSourceParams(demUrlTemplate);
  const demSource = new mlcontour.DemSource({
    url: demUrlTemplate,
    encoding: 'mapbox', // fetchAndParseTile差し替え後は参照されない
    maxzoom,
    // Metro/webでworkerバンドルの問題を避けるためメインスレッドで計算する
    worker: false,
    cacheSize: 100,
    timeoutMs: 10_000,
    id: `gebcodem${demSourceSeq++}`,
  });
  // タイル取得・デコードを共通ローダー（GSJエンコード＋親補完）へ差し替える
  (demSource.manager as unknown as { fetchAndParseTile: unknown }).fetchAndParseTile = async (
    z: number,
    x: number,
    y: number
  ) => {
    const tile = await loadElevationMerged(demUrlTemplate, z, x, y);
    if (tile === null) throw new Error('tile not found');
    // NoData(NaN)はそのまま渡す。generateIsolinesはNaNを含むセルをスキップするので、
    // 等値線はデータ整備域の縁で自然に途切れる
    return { width: tile.width, height: tile.width, data: tile.data };
  };
  demSource.setupMaplibre(maplibregl);

  const contourTilesUrl = demSource.contourProtocolUrl({
    multiplier: 1,
    thresholds: contourThresholds(maxzoom),
    contourLayer: 'contours',
    elevationKey: 'ele',
    levelKey: 'level',
    extent: 4096,
    buffer: 9,
  });
  demSources.set(demUrlTemplate, { contourTilesUrl });
  return contourTilesUrl;
}

/** 島名・海底地形名のGeoJSONソース（海しる由来の同梱データ。デモと同じ構成で地図に含める） */
export function getGebcoNameSources(id: string): Record<string, unknown> {
  return {
    [`${id}_islands`]: { type: 'geojson', data: msilIslandsJson },
    [`${id}_undersea`]: { type: 'geojson', data: msilUnderseaFeaturesJson },
  };
}

/**
 * GEBCO_RELIEF_RAMPからデモと同じ指数補間(0.8)のcolor-relief式を組み立てる。
 * NoData番兵（+167万m相当）はstep式で透明にする。
 */
function colorReliefExpression(): unknown[] {
  const ramp: unknown[] = ['interpolate', ['exponential', 0.8], ['elevation']];
  for (const [elev, r, g, b] of GEBCO_RELIEF_RAMP) {
    ramp.push(elev, `rgb(${r},${g},${b})`);
  }
  return ['step', ['elevation'], ramp, NODATA_STEP_ELEV, 'rgba(0,0,0,0)'];
}

/**
 * デモと同じレイヤ（段彩・陰影・等深線・数値ラベル・島名・海底地形名）を返す。
 * ソースは `${id}`（raster-dem）、`${id}_contour`（ベクタ）、
 * `${id}_islands`/`${id}_undersea`（GeoJSON）を前提とする。
 */
export function getGebcoLayers(tileMap: TileMapType): LayerSpecification[] {
  const transparency = tileMap.transparency ?? 0;
  const { maxzoom } = gebcoSourceParams(toDemUrl(tileMap.url));
  return [
    {
      id: `${tileMap.id}_0`,
      type: 'color-relief',
      source: tileMap.id,
      paint: {
        'color-relief-color': colorReliefExpression(),
        'color-relief-opacity': 0.85 * (1 - transparency),
      },
    },
    {
      id: `${tileMap.id}_1`,
      type: 'hillshade',
      source: tileMap.id,
      minzoom: 0,
      maxzoom,
      layout: { visibility: 'visible' },
      paint: {
        'hillshade-exaggeration': 0.6,
        'hillshade-shadow-color': 'rgba(0,0,0,0.22)',
        'hillshade-highlight-color': 'rgba(255,255,255,0.14)',
        'hillshade-accent-color': 'rgba(0,0,0,0.10)',
        'hillshade-illumination-direction': 315,
      },
    },
    {
      id: `${tileMap.id}_2`,
      type: 'line',
      source: `${tileMap.id}_contour`,
      'source-layer': 'contours',
      paint: {
        'line-color': 'rgba(0,0,0, 50%)',
        'line-width': ['match', ['get', 'level'], 1, 1.2, 0.5],
      },
    },
    {
      id: `${tileMap.id}_3`,
      type: 'symbol',
      source: `${tileMap.id}_contour`,
      'source-layer': 'contours',
      filter: ['>', ['get', 'level'], 0],
      layout: {
        'symbol-placement': 'line',
        // ラベル同士の間隔を広げて件数を抑える（デフォルト250px）
        'symbol-spacing': 500,
        'text-size': 10,
        'text-field': ['concat', ['number-format', ['get', 'ele'], {}], 'm'],
        'text-font': ['Noto Sans Universal Regular'],
      },
      paint: {
        // 地形の読図を邪魔しないよう、太字黒ではなく半透明のグレーで控えめにする
        'text-color': 'rgba(60,75,90,0.85)',
        'text-halo-color': 'rgba(255,255,255,0.7)',
        'text-halo-width': 1,
      },
    },
    // 島名・海底地形名（表示はz4〜15。ポイントはデモと違い小さい黒点にしている）
    {
      id: `${tileMap.id}_4`,
      type: 'circle',
      source: `${tileMap.id}_islands`,
      minzoom: 4,
      maxzoom: 15,
      paint: {
        'circle-radius': 2,
        'circle-color': '#000000',
      },
    },
    {
      id: `${tileMap.id}_5`,
      type: 'symbol',
      source: `${tileMap.id}_islands`,
      minzoom: 4,
      maxzoom: 15,
      layout: {
        'text-field': ['get', '島名'],
        'text-font': ['Noto Sans CJK JP Bold'],
        'text-size': 13,
        'text-offset': [0, 0.8],
        'text-anchor': 'top',
        'text-allow-overlap': false,
        'symbol-z-order': 'auto',
      },
      paint: {
        'text-color': '#0b2239',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.2,
      },
    },
    {
      id: `${tileMap.id}_6`,
      type: 'circle',
      source: `${tileMap.id}_undersea`,
      minzoom: 4,
      maxzoom: 15,
      paint: {
        'circle-radius': 2,
        'circle-color': '#000000',
      },
    },
    {
      id: `${tileMap.id}_7`,
      type: 'symbol',
      source: `${tileMap.id}_undersea`,
      minzoom: 4,
      maxzoom: 15,
      layout: {
        'text-field': ['get', '海底地形名'],
        'text-font': ['Noto Sans CJK JP Bold'],
        'text-size': 13,
        'text-offset': [0, 0.8],
        'text-anchor': 'top',
        'text-allow-overlap': false,
        'symbol-z-order': 'auto',
      },
      paint: {
        'text-color': '#1a1a1a',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.2,
      },
    },
  ] as LayerSpecification[];
}
