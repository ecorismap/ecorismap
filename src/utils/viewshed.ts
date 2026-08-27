/**
 * 可視領域（viewshed）解析。
 *
 * 指定地点から指定距離内で見通せる範囲を国土地理院の標高タイル(dem_png)から計算し、
 * ポリゴン（外周リング＋穴）として返す。iOS/Android/Web共通の純JS実装。
 *
 * 流れ: fetchDemGrid（DEMタイル取得→グリッド化） → computeVisibility（R2レイキャスト）
 *       → visibilityToPolygons（境界追跡でポリゴン化）
 */
import simplify from '@turf/simplify';
import * as turf from '@turf/helpers';
import { decodeElevation } from './terrainShading';
import { decodePngLite } from './pngLite';
import { loadDemTilePng, loadDownloadedDemTile } from './demTileLoader';
import { LocationType } from '../types';
import {
  DEM_DOWNLOAD_MAX_ZOOM,
  DEM_DOWNLOAD_MIN_ZOOM,
  GSI_DEM_URL,
  TERRARIUM_URL,
} from '../constants/DemSources';

const TILE_SIZE = 256;
const MAX_DEM_ZOOM = DEM_DOWNLOAD_MAX_ZOOM;
const MIN_DEM_ZOOM = DEM_DOWNLOAD_MIN_ZOOM;
/**
 * グリッド一辺の上限（画素）。
 * 上限を下げるとズームが粗くなり可視領域の検出が激減する（z12は z14 の4割程度）ため、
 * 日本全域で半径10kmまで z14（10m DEM）を維持できる値にしている
 * （北緯45度・半径10kmでグリッド一辺 約2959px）。
 * 10km時のコストの目安: タイル約120枚・標高グリッド約27MB・計算1〜2秒(デスクトップ)。
 */
const MAX_GRID_SIZE = 3000;
/** 地球半径[m] */
const EARTH_RADIUS = 6371000;
/** 大気屈折係数（測量で一般的な値） */
const REFRACTION_COEF = 0.13;

export interface DemGrid {
  /** 標高[m]。NoData（海・国外）はNaN */
  elev: Float32Array;
  /** グリッド一辺の画素数 */
  size: number;
  zoom: number;
  /** グリッド左上のワールドピクセル座標（zoomにおける256pxタイル基準） */
  originPxX: number;
  originPxY: number;
  /** 中心緯度における1画素あたりのメートル数 */
  mpp: number;
}

export interface ViewshedPolygon {
  coords: LocationType[];
  holes: { [key: string]: LocationType[] };
}

/** 経度・緯度→ワールドピクセル座標（zoomにおける256pxタイル基準） */
const lonToPx = (lon: number, zoom: number) => ((lon + 180) / 360) * TILE_SIZE * Math.pow(2, zoom);
const latToPx = (lat: number, zoom: number) => {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * TILE_SIZE * Math.pow(2, zoom);
};
const pxToLon = (px: number, zoom: number) => (px / (TILE_SIZE * Math.pow(2, zoom))) * 360 - 180;
const pxToLat = (py: number, zoom: number) => {
  const n = Math.PI * (1 - (2 * py) / (TILE_SIZE * Math.pow(2, zoom)));
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
};

/** 半径から、グリッド一辺がMAX_GRID_SIZE以下に収まる最大ズームを選ぶ */
export const selectDemZoom = (latitude: number, radiusMeters: number): number => {
  const cosLat = Math.cos((latitude * Math.PI) / 180);
  for (let z = MAX_DEM_ZOOM; z > MIN_DEM_ZOOM; z--) {
    const mpp = (40075017.0 * cosLat) / (TILE_SIZE * Math.pow(2, z));
    if ((2 * radiusMeters) / mpp <= MAX_GRID_SIZE) return z;
  }
  return MIN_DEM_ZOOM;
};

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
  if (decoded === null || decoded.width !== TILE_SIZE || decoded.height !== TILE_SIZE) return null;
  const decodePixel = encoding === 'terrarium' ? decodeTerrarium : decodeElevation;
  const { data, channels, palette } = decoded;
  const elev = new Float32Array(TILE_SIZE * TILE_SIZE);
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
const fetchTileFromSource = async (
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
const fetchDemTile = async (zoom: number, x: number, y: number): Promise<Float32Array | null | undefined> => {
  const max = Math.pow(2, zoom);
  if (x < 0 || y < 0 || x >= max || y >= max) return null;
  // 国内はGSI（10m）を優先し、提供範囲外（404）ならAWS Terrain Tiles（全球30-90m）へ
  // タイル単位でフォールバックする。国境付近は両ソースが自然に混在する。
  const gsi = await fetchTileFromSource('gsi', GSI_DEM_URL, zoom, x, y);
  if (gsi instanceof Float32Array) return gsi;
  if (gsi === undefined) return undefined; // 通信エラー時は低解像度へフォールバックせず失敗させる
  return await fetchTileFromSource('terrarium', TERRARIUM_URL, zoom, x, y);
};

/**
 * 指定座標の標高[m]を標高タイルから取得する（国内=GSI 10m、国外=Terrain Tiles 30-90m）。
 * 長押しポップアップの標高表示用。可視領域と同じキャッシュを共有する。
 * 取得できない場合（国内の海上NoData・通信エラー等）はnullを返す。
 */
export const getDemElevation = async (latitude: number, longitude: number): Promise<number | null> => {
  const zoom = MAX_DEM_ZOOM;
  const px = lonToPx(longitude, zoom);
  const py = latToPx(latitude, zoom);
  const tileX = Math.floor(px / TILE_SIZE);
  const tileY = Math.floor(py / TILE_SIZE);
  const col = Math.min(TILE_SIZE - 1, Math.floor(px - tileX * TILE_SIZE));
  const row = Math.min(TILE_SIZE - 1, Math.floor(py - tileY * TILE_SIZE));
  const tile = await fetchDemTile(zoom, tileX, tileY);
  if (tile instanceof Float32Array) {
    const e = tile[row * TILE_SIZE + col];
    if (!isNaN(e)) return e;
    // GSIタイル内のNoData（沿岸の海など）はterrariumで補完し、
    // 沖合（GSIタイルなし→terrarium 0m）と表示を一致させる
    const terra = await fetchTileFromSource('terrarium', TERRARIUM_URL, zoom, tileX, tileY);
    if (terra instanceof Float32Array) return terra[row * TILE_SIZE + col];
  }
  return null;
};

/**
 * 中心と半径を覆うDEMグリッドを取得する。
 * 全タイルが取得できなかった場合（範囲外・オフライン等）はnullを返す。
 * 通信エラー（undefined）が1枚でもあった場合もnullを返す。欠損域を海面0m扱いのまま
 * 計算すると、誤った可視領域が警告なしに保存されてしまうため。
 */
export const fetchDemGrid = async (
  center: LocationType,
  radiusMeters: number,
  tileLoader: typeof fetchDemTile = fetchDemTile
): Promise<DemGrid | null> => {
  const zoom = selectDemZoom(center.latitude, radiusMeters);
  const cosLat = Math.cos((center.latitude * Math.PI) / 180);
  const mpp = (40075017.0 * cosLat) / (TILE_SIZE * Math.pow(2, zoom));
  const radiusPx = Math.ceil(radiusMeters / mpp);
  const size = radiusPx * 2 + 1;

  const centerPxX = lonToPx(center.longitude, zoom);
  const centerPxY = latToPx(center.latitude, zoom);
  const originPxX = Math.floor(centerPxX) - radiusPx;
  const originPxY = Math.floor(centerPxY) - radiusPx;

  const tileX0 = Math.floor(originPxX / TILE_SIZE);
  const tileY0 = Math.floor(originPxY / TILE_SIZE);
  const tileX1 = Math.floor((originPxX + size - 1) / TILE_SIZE);
  const tileY1 = Math.floor((originPxY + size - 1) / TILE_SIZE);

  const elev = new Float32Array(size * size).fill(NaN);
  let validTiles = 0;
  let hasTransientError = false;

  const loadTile = async (tx: number, ty: number) => {
    const tile = await tileLoader(zoom, tx, ty);
    if (tile === undefined) {
      hasTransientError = true;
      return;
    }
    if (tile === null) return;
    validTiles++;
    // タイルとグリッドの重なり範囲をコピー
    const gx0 = Math.max(tx * TILE_SIZE, originPxX);
    const gy0 = Math.max(ty * TILE_SIZE, originPxY);
    const gx1 = Math.min((tx + 1) * TILE_SIZE, originPxX + size);
    const gy1 = Math.min((ty + 1) * TILE_SIZE, originPxY + size);
    for (let py = gy0; py < gy1; py++) {
      const srcRow = (py - ty * TILE_SIZE) * TILE_SIZE;
      const dstRow = (py - originPxY) * size;
      for (let px = gx0; px < gx1; px++) {
        elev[dstRow + (px - originPxX)] = tile[srcRow + (px - tx * TILE_SIZE)];
      }
    }
  };

  // 半径10kmではタイルが100枚超になるため、同時取得数を絞って順に処理する
  const CONCURRENCY = 12;
  const queue: { tx: number; ty: number }[] = [];
  for (let ty = tileY0; ty <= tileY1; ty++) {
    for (let tx = tileX0; tx <= tileX1; tx++) {
      queue.push({ tx, ty });
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (;;) {
        const next = queue.shift();
        // 失敗が確定したら残りのタイル取得を打ち切る
        if (next === undefined || hasTransientError) return;
        await loadTile(next.tx, next.ty);
      }
    })
  );

  if (hasTransientError || validTiles === 0) return null;
  return { elev, size, zoom, originPxX, originPxY, mpp };
};

/** UIスレッドを塞がないように制御を返す */
const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * R2アルゴリズムによる可視判定。
 * グリッド外周の各セルへレイを飛ばし、レイ上のセルの仰角（勾配）が
 * それまでの最大値以上なら可視としてマークする。
 *
 * NoData（海・国外）は標高0m（海面）として扱う。海面上の可視域も返すため。
 * 大きい半径（グリッド2500超・実機で10秒超）でもUIが固まらないよう、
 * 一定本数のレイごとにイベントループへ制御を返す。
 *
 * @returns 可視セルを1としたUint8Array（size*size）
 */
export const computeVisibility = async (
  elev: Float32Array,
  size: number,
  mpp: number,
  observerHeight: number,
  radiusPx: number
): Promise<Uint8Array> => {
  const center = (size - 1) / 2;
  const centerIdx = Math.round(center) * size + Math.round(center);
  const groundAtObserver = isNaN(elev[centerIdx]) ? 0 : elev[centerIdx];
  const eyeZ = groundAtObserver + observerHeight;
  const curvatureCoef = (1 - REFRACTION_COEF) / (2 * EARTH_RADIUS);

  const vis = new Uint8Array(size * size);
  vis[centerIdx] = 1;

  // バイリニア補間で標高を取得（NoDataは海面0m扱い）。
  // 最近傍だとレイが尾根をかすめた時にセル丸めの差で1本だけ「見えた」と
  // 判定され、放射状の細いスジ状アーティファクトが出るため。
  const sampleElev = (fx: number, fy: number): number => {
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, size - 1);
    const y1 = Math.min(y0 + 1, size - 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const e00 = elev[y0 * size + x0];
    const e10 = elev[y0 * size + x1];
    const e01 = elev[y1 * size + x0];
    const e11 = elev[y1 * size + x1];
    const v00 = isNaN(e00) ? 0 : e00;
    const v10 = isNaN(e10) ? 0 : e10;
    const v01 = isNaN(e01) ? 0 : e01;
    const v11 = isNaN(e11) ? 0 : e11;
    return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
  };

  const castRay = (targetCol: number, targetRow: number) => {
    const dx = targetCol - center;
    const dy = targetRow - center;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps === 0) return;
    const sx = dx / steps;
    const sy = dy / steps;
    let maxSlope = -Infinity;
    for (let i = 1; i <= steps; i++) {
      const fx = center + sx * i;
      const fy = center + sy * i;
      const distPx = Math.hypot(sx * i, sy * i);
      if (distPx > radiusPx) return;
      const d = distPx * mpp;
      const ground = sampleElev(fx, fy);
      // 地球曲率＋大気屈折の補正
      const effective = ground - d * d * curvatureCoef;
      const slope = (effective - eyeZ) / d;
      if (slope >= maxSlope) {
        vis[Math.round(fy) * size + Math.round(fx)] = 1;
        maxSlope = slope;
      }
    }
  };

  // 外周セルすべてをレイの目標にする（一定本数ごとにUIへ制御を返す）
  const YIELD_EVERY = 256;
  let rayCount = 0;
  const castRayWithYield = async (targetCol: number, targetRow: number) => {
    castRay(targetCol, targetRow);
    if (++rayCount % YIELD_EVERY === 0) await yieldToEventLoop();
  };
  for (let col = 0; col < size; col++) {
    await castRayWithYield(col, 0);
    await castRayWithYield(col, size - 1);
  }
  for (let row = 1; row < size - 1; row++) {
    await castRayWithYield(0, row);
    await castRayWithYield(size - 1, row);
  }

  // オープニング（収縮→膨張、クロス核）で1セル幅のスジ状ノイズを除去する。
  // レイが尾根をかすめた時に単独のレイだけが遠方を「見えた」と判定し、
  // 放射状の細いスジが残るため。実領域の輪郭はほぼ保存される。
  const eroded = new Uint8Array(size * size);
  for (let row = 1; row < size - 1; row++) {
    for (let col = 1; col < size - 1; col++) {
      const i = row * size + col;
      if (vis[i] && vis[i - 1] && vis[i + 1] && vis[i - size] && vis[i + size]) eroded[i] = 1;
    }
  }
  const opened = new Uint8Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const i = row * size + col;
      if (
        eroded[i] ||
        (col > 0 && eroded[i - 1]) ||
        (col < size - 1 && eroded[i + 1]) ||
        (row > 0 && eroded[i - size]) ||
        (row < size - 1 && eroded[i + size])
      ) {
        opened[i] = 1;
      }
    }
  }
  // 観測点自身は常に可視
  opened[centerIdx] = 1;
  return opened;
};

// ---- 可視グリッドのポリゴン化（画素境界の追跡） ----

type Ring = { points: [number, number][]; area: number };

/**
 * 二値グリッドから可視領域の境界リングを抽出する。
 * 可視セルを単位正方形とみなし、可視/不可視の境界辺を「可視セルを左に見る」向きで
 * 連結して閉リングにする。外周リングは反時計回り（グリッド座標系）、穴は時計回りになる。
 * 頂点座標はセル角（col, row ∈ [0, size]）。
 */
export const traceBoundaryRings = (vis: Uint8Array, size: number): Ring[] => {
  const isVisible = (col: number, row: number) =>
    col >= 0 && row >= 0 && col < size && row < size && vis[row * size + col] === 1;

  // 方向: 0=右(+x) 1=下(+y) 2=左(-x) 3=上(-y)。
  // グリッドは y が下向きなので、「可視セルを左に見る」= 外周は画面上で時計回りだが、
  // 地理座標（y上向き）に変換すると反時計回りになる。
  // 辺キー: 始点頂点と方向でエンコード
  const edgeKey = (x: number, y: number, dir: number) => (y * (size + 1) + x) * 4 + dir;
  const edges = new Map<number, [number, number, number]>(); // key -> [x, y, dir]

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (vis[row * size + col] !== 1) continue;
      // 上辺: 上隣が不可視なら、右向きの辺（可視セルは下=左手側...向き規約は下記の連結で辻褄を合わせる）
      if (!isVisible(col, row - 1)) edges.set(edgeKey(col, row, 0), [col, row, 0]);
      // 右辺: 右隣が不可視なら、下向きの辺
      if (!isVisible(col + 1, row)) edges.set(edgeKey(col + 1, row, 1), [col + 1, row, 1]);
      // 下辺: 下隣が不可視なら、左向きの辺
      if (!isVisible(col, row + 1)) edges.set(edgeKey(col + 1, row + 1, 2), [col + 1, row + 1, 2]);
      // 左辺: 左隣が不可視なら、上向きの辺
      if (!isVisible(col - 1, row)) edges.set(edgeKey(col, row + 1, 3), [col, row + 1, 3]);
    }
  }

  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];
  const rings: Ring[] = [];

  for (const first of edges.values()) {
    if (!edges.has(edgeKey(first[0], first[1], first[2]))) continue;
    const points: [number, number][] = [];
    const startX = first[0];
    const startY = first[1];
    let x = startX;
    let y = startY;
    let dir = first[2];
    let area2 = 0; // 符号付き面積の2倍（shoelace）
    for (;;) {
      edges.delete(edgeKey(x, y, dir));
      points.push([x, y]);
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      area2 += x * ny - nx * y;
      x = nx;
      y = ny;
      // 始点に戻ったらリングが閉じた（saddle頂点で別リングに続けないようここで止める）
      if (x === startX && y === startY) break;
      // 次の辺: 内側への曲がり優先で探す（対角接触のセルを分離する = 4連結）
      // 内側曲がり = dir+1, 直進 = dir, 外側曲がり = dir+3 (mod 4)
      let found = false;
      for (const turn of [1, 0, 3]) {
        const ndir = (dir + turn) % 4;
        if (edges.has(edgeKey(x, y, ndir))) {
          dir = ndir;
          found = true;
          break;
        }
      }
      if (!found) break; // 境界が途切れた（通常起きない）
    }
    if (points.length >= 4) {
      points.push([points[0][0], points[0][1]]); // 閉じる
      rings.push({ points, area: area2 / 2 });
    }
  }
  return rings;
};

/** 点がリング内にあるか（レイキャスティング法、グリッド座標） */
const pointInRing = (px: number, py: number, ring: [number, number][]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/**
 * 可視グリッドをポリゴン（外周リング＋穴）の配列に変換する。
 * 座標は緯度経度。微小領域（minAreaCells未満）は捨てる。
 */
export const visibilityToPolygons = (
  vis: Uint8Array,
  grid: Pick<DemGrid, 'size' | 'zoom' | 'originPxX' | 'originPxY'>,
  minAreaCells = 9
): ViewshedPolygon[] => {
  const rings = traceBoundaryRings(vis, grid.size);

  // グリッド座標系（y下向き）で: 面積が正=時計回り表示=外周、負=穴
  const outers = rings.filter((r) => r.area > 0 && r.area >= minAreaCells);
  const holes = rings.filter((r) => r.area < 0 && -r.area >= minAreaCells);

  const toLonLat = (p: [number, number]): [number, number] => [
    pxToLon(grid.originPxX + p[0], grid.zoom),
    pxToLat(grid.originPxY + p[1], grid.zoom),
  ];

  // 各穴を、それを含む最小の外周リングへ割り当てる
  const holesByOuter = new Map<number, [number, number][][]>();
  for (const hole of holes) {
    const [hx, hy] = hole.points[0];
    let ownerIdx = -1;
    let ownerArea = Infinity;
    for (let i = 0; i < outers.length; i++) {
      if (outers[i].area < ownerArea && pointInRing(hx, hy, outers[i].points)) {
        ownerIdx = i;
        ownerArea = outers[i].area;
      }
    }
    if (ownerIdx < 0) continue;
    const list = holesByOuter.get(ownerIdx) ?? [];
    list.push(hole.points);
    holesByOuter.set(ownerIdx, list);
  }

  const result: ViewshedPolygon[] = [];
  for (let i = 0; i < outers.length; i++) {
    const ringsLonLat = [outers[i].points, ...(holesByOuter.get(i) ?? [])].map((ring) => ring.map(toLonLat));
    // 画素境界の階段状の形をセルサイズ相当のtoleranceで間引く
    const pxDeg = 360 / (TILE_SIZE * Math.pow(2, grid.zoom));
    let coordinates: [number, number][][];
    try {
      const simplified = simplify(turf.polygon(ringsLonLat), { tolerance: pxDeg * 1.5, highQuality: false });
      coordinates = simplified.geometry.coordinates as [number, number][][];
    } catch {
      coordinates = ringsLonLat;
    }
    const [outer, ...holeRings] = coordinates;
    if (outer === undefined || outer.length < 4) continue;
    result.push({
      coords: outer.map(([longitude, latitude]) => ({ longitude, latitude })),
      holes: holeRings
        .filter((ring) => ring.length >= 4)
        .reduce(
          (acc, ring, idx) => ({ ...acc, [`hole${idx}`]: ring.map(([longitude, latitude]) => ({ longitude, latitude })) }),
          {}
        ),
    });
  }
  // 大きい領域から順に
  return result.sort((a, b) => b.coords.length - a.coords.length);
};

/**
 * 中心と半径から円ポリゴン（閉リング）を作る。球面上の測地円。
 * 範囲の円・中心マーカーの保存用。
 */
export const makeCircleRing = (center: LocationType, radiusMeters: number, segments = 72): LocationType[] => {
  const DEG2RAD = Math.PI / 180;
  const lat = center.latitude * DEG2RAD;
  const lon = center.longitude * DEG2RAD;
  const d = radiusMeters / EARTH_RADIUS;
  const ring: LocationType[] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (2 * Math.PI * i) / segments;
    const phi = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(theta));
    const lambda =
      lon + Math.atan2(Math.sin(theta) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(phi));
    ring.push({ latitude: phi / DEG2RAD, longitude: lambda / DEG2RAD });
  }
  return ring;
};

/**
 * 可視領域を計算する。観測点から半径radiusMeters内で見通せる範囲のポリゴンと、
 * 観測点の標高（DEM値、海・NoDataは0）を返す。DEMが取得できない場合はnull。
 */
export const calcViewshedPolygons = async (
  observer: LocationType,
  radiusMeters: number,
  observerHeight: number
): Promise<{ polygons: ViewshedPolygon[]; observerElevation: number } | null> => {
  const grid = await fetchDemGrid(observer, radiusMeters);
  if (grid === null) return null;
  const radiusPx = (grid.size - 1) / 2;
  const centerElev = grid.elev[radiusPx * grid.size + radiusPx];
  const observerElevation = isNaN(centerElev) ? 0 : centerElev;
  const vis = await computeVisibility(grid.elev, grid.size, grid.mpp, observerHeight, radiusPx);
  return { polygons: visibilityToPolygons(vis, grid), observerElevation };
};
