/**
 * GEBCO海底地形図の等値線「数値ラベル」をJS側で計算する。
 *
 * 等値線そのものはタイルに焼き込まれるが、数値ラベルはMarkerで重ねる（鮮明・正立・
 * タイル境界切れなし）。焼き込みと同じDEM（GSJのGEBCOタイル）・同じ横断判定・
 * 同じsourceZoomで計算するため、ラベルは描かれた線の上に正確に乗る。
 *
 * DEMタイルの取得・デコードは可視領域計算と同じ仕組み（loadDemTilePng + decodeDemTile）を使う。
 */
import { contourIntervalsForZoom } from './colorRelief';
import { decodeElevation } from './terrainShading';
import { decodePngLite } from './pngLite';
import {
  loadDemTileAsPngBytes,
  loadDemTilePng,
  loadLocalDemTileAsPngBytes,
  loadLocalDemTilePng,
} from './demTileLoader';
import { ViewportBounds } from './ViewportCulling';

export type ContourLabelPoint = {
  lat: number;
  lon: number;
  text: string;
  key: string;
};

type ElevationTile = { width: number; data: Float32Array };

/** ラベルを出す最小表示ズーム（等値線の間隔テーブルの下限と同じ） */
const MIN_LABEL_ZOOM = 4;
/** 間引き格子の一辺（表示ズームのワールドピクセル、256pxタイル基準） */
const GRID_PX = 128;
/** 1画面に出す最大件数 */
const MAX_FEATURES = 40;
/** 1回の計算で読むタイル数の上限（通常の画面では4枚以内に収まる） */
const MAX_TILES = 12;

/**
 * ソースごとのタイル仕様。gebcoDemLayers.webのgebcoSourceParamsと同じ判定
 * （elev2=512px WebP・z11、GEBCO=256px PNG・z9）。ネイティブ焼き込みのsourceZoomとも一致する。
 */
const maxSourceZoomOf = (urlTemplate: string): number => (urlTemplate.includes('/elev2/') ? 11 : 9);

/** PNGバイト列を標高タイルへデコードする（サイズ非依存。NoData=透明はNaN） */
const decodeTile = (png: ArrayBuffer): ElevationTile | null => {
  const decoded = decodePngLite(png);
  if (decoded === null || decoded.width !== decoded.height) return null;
  const { width, data, channels, palette } = decoded;
  const elev = new Float32Array(width * width);
  if (palette !== undefined && channels === 1) {
    for (let i = 0; i < elev.length; i++) {
      const p = data[i] * 3;
      elev[i] = decodeElevation(palette[p], palette[p + 1], palette[p + 2]);
    }
  } else if (channels >= 3) {
    for (let i = 0; i < elev.length; i++) {
      const p = i * channels;
      elev[i] = channels === 4 && data[p + 3] === 0 ? NaN : decodeElevation(data[p], data[p + 1], data[p + 2]);
    }
  } else {
    return null;
  }
  return { width, data: elev };
};

// デコード済みタイルの小さなLRU（elev2の512pxは1枚1MB。PNG自体はネイティブのディスクキャッシュにも載る）
const decodedCache = new Map<string, ElevationTile | null>();
const DECODED_CACHE_MAX = 24;

const fetchGebcoTile = async (
  urlTemplate: string,
  zoom: number,
  x: number,
  y: number,
  offlineTileFolder: string | null
): Promise<ElevationTile | null> => {
  const key = `gebco|${urlTemplate}|${zoom}/${x}/${y}`;
  if (decodedCache.has(key)) {
    const cached = decodedCache.get(key)!;
    decodedCache.delete(key);
    decodedCache.set(key, cached);
    return cached;
  }

  // elev2はWebP配信なのでPNGへ変換して受け取る（HermesのpngLiteはWebP不可）
  const isWebpSource = urlTemplate.includes('/elev2/');
  const loadLocal = isWebpSource ? loadLocalDemTileAsPngBytes : loadLocalDemTilePng;
  const loadRemote = isWebpSource ? loadDemTileAsPngBytes : loadDemTilePng;

  // オフラインダウンロード済みの生DEMタイル（TILE_FOLDER/{地図id}/z/x/y）を優先する。
  // 機内モードでもダウンロード範囲ならラベルが出る
  let png: ArrayBuffer | null = null;
  if (offlineTileFolder !== null) {
    png = await loadLocal(`${offlineTileFolder}/${zoom}/${x}/${y}`);
  }
  if (png === null) {
    try {
      const url = urlTemplate.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y));
      png = await loadRemote(url, key);
    } catch {
      // ネットワークエラーは一時的な可能性があるためキャッシュしない
      return null;
    }
  }
  const decoded = png === null ? null : decodeTile(png);
  decodedCache.set(key, decoded);
  while (decodedCache.size > DECODED_CACHE_MAX) {
    const oldest = decodedCache.keys().next().value;
    if (oldest === undefined) break;
    decodedCache.delete(oldest);
  }
  return decoded;
};

const lonToNx = (lon: number) => (lon + 180) / 360;
const latToNy = (lat: number) => {
  const rad = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
};

/**
 * ビューポートとズームから等値線の数値ラベルを計算する。
 * 焼き込みの太線（major間隔）の横断画素にラベルを置き、表示ズームのワールド格子で間引く。
 *
 * @param demUrlTemplate GEBCOタイルのURLテンプレート（relief://等を剥がしたもの）
 * @param offlineTileFolder オフラインダウンロード済みタイルのフォルダ（TILE_FOLDER/{地図id}。無ければnull）
 */
export async function selectContourLabels(
  demUrlTemplate: string,
  bounds: ViewportBounds,
  zoomDecimal: number,
  offlineTileFolder: string | null = null
): Promise<ContourLabelPoint[]> {
  const displayZoom = Math.floor(zoomDecimal);
  if (displayZoom < MIN_LABEL_ZOOM) return [];
  const sourceZoom = Math.min(displayZoom, maxSourceZoomOf(demUrlTemplate));
  const intervals = contourIntervalsForZoom(sourceZoom);
  if (intervals === null) return [];
  const major = intervals[1];

  // 表示範囲を覆うsourceZoomのタイル範囲
  const n = Math.pow(2, sourceZoom);
  const west = bounds.southWest.longitude;
  const east = bounds.northEast.longitude;
  const north = bounds.northEast.latitude;
  const south = bounds.southWest.latitude;
  const minTx = Math.max(0, Math.floor(lonToNx(west) * n));
  const maxTx = Math.min(n - 1, Math.floor(lonToNx(east) * n));
  const minTy = Math.max(0, Math.floor(latToNy(north) * n));
  const maxTy = Math.min(n - 1, Math.floor(latToNy(south) * n));
  if ((maxTx - minTx + 1) * (maxTy - minTy + 1) > MAX_TILES) return [];

  const worldSize = 256 * Math.pow(2, displayZoom);
  const usedCells = new Set<string>();
  const labels: ContourLabelPoint[] = [];

  for (let ty = minTy; ty <= maxTy && labels.length < MAX_FEATURES; ty++) {
    for (let tx = minTx; tx <= maxTx && labels.length < MAX_FEATURES; tx++) {
      const tile = await fetchGebcoTile(demUrlTemplate, sourceZoom, tx, ty, offlineTileFolder);
      if (tile === null) continue;
      const size = tile.width;
      const elev = tile.data;
      // 右端・下端の列は隣接参照ができないのでスキップ（隣のタイルが受け持つ）
      for (let row = 0; row < size - 1 && labels.length < MAX_FEATURES; row++) {
        for (let col = 0; col < size - 1; col++) {
          const i = row * size + col;
          const e0 = elev[i];
          // eslint-disable-next-line no-self-compare
          if (e0 !== e0) continue;
          const eRight = elev[i + 1];
          const eDown = elev[i + size];
          const level = Math.floor(e0 / major);
          let neighbor: number | undefined;
          // eslint-disable-next-line no-self-compare
          if (eRight === eRight && Math.floor(eRight / major) !== level) neighbor = eRight;
          // eslint-disable-next-line no-self-compare
          else if (eDown === eDown && Math.floor(eDown / major) !== level) neighbor = eDown;
          if (neighbor === undefined) continue;

          const nx = (tx * size + col + 0.5) / (n * size);
          const ny = (ty * size + row + 0.5) / (n * size);
          const cell = `${Math.floor((nx * worldSize) / GRID_PX)}:${Math.floor((ny * worldSize) / GRID_PX)}`;
          if (usedCells.has(cell)) continue;
          usedCells.add(cell);

          const value = Math.max(level, Math.floor(neighbor / major)) * major;
          const lon = nx * 360 - 180;
          const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * ny))) * 180) / Math.PI;
          if (lat < south || lat > north || lon < west || lon > east) continue;
          labels.push({ lat, lon, text: `${value}m`, key: `${value}:${sourceZoom}:${tx}:${ty}:${col}:${row}` });
          if (labels.length >= MAX_FEATURES) break;
        }
      }
    }
  }
  return labels;
}
