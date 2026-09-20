/**
 * 3D地形エンジン向けのDEM標高サンプリング。
 *
 * タイル単位の取得・キャッシュはdemTileProvider（viewshedと共用）に任せ、
 * ここでは「テクスチャタイル(ztex)の格子点標高」をDEMズーム(zdem<=ztex)の
 * タイルからバイリニア補間で作る。
 */
import { DEM_DOWNLOAD_MAX_ZOOM, DEM_DOWNLOAD_MIN_ZOOM } from '../../constants/DemSources';
import { DEM_TILE_SIZE, fetchDemTile } from '../demTileProvider';
import { latToTileYFloat, lonToTileXFloat } from './coords';
import { TileKey } from './types';

export const clampDemZoom = (zoom: number): number =>
  Math.min(DEM_DOWNLOAD_MAX_ZOOM, Math.max(DEM_DOWNLOAD_MIN_ZOOM, Math.round(zoom)));

/** タイル内のDEM画素をエッジクランプ付きバイリニアで読む。NoData(NaN)が混じる場合は有効画素を優先 */
const sampleBilinear = (elev: Float32Array, px: number, py: number): number => {
  const x0 = Math.max(0, Math.min(DEM_TILE_SIZE - 1, Math.floor(px)));
  const y0 = Math.max(0, Math.min(DEM_TILE_SIZE - 1, Math.floor(py)));
  const x1 = Math.min(DEM_TILE_SIZE - 1, x0 + 1);
  const y1 = Math.min(DEM_TILE_SIZE - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, px - x0));
  const fy = Math.max(0, Math.min(1, py - y0));
  const v00 = elev[y0 * DEM_TILE_SIZE + x0];
  const v10 = elev[y0 * DEM_TILE_SIZE + x1];
  const v01 = elev[y1 * DEM_TILE_SIZE + x0];
  const v11 = elev[y1 * DEM_TILE_SIZE + x1];
  const top = interpolateWithNoData(v00, v10, fx);
  const bottom = interpolateWithNoData(v01, v11, fx);
  return interpolateWithNoData(top, bottom, fy);
};

const interpolateWithNoData = (a: number, b: number, t: number): number => {
  const aNaN = Number.isNaN(a);
  const bNaN = Number.isNaN(b);
  if (aNaN && bNaN) return NaN;
  if (aNaN) return b;
  if (bNaN) return a;
  return a + (b - a) * t;
};

/**
 * テクスチャタイル(ztex>=zdem)の格子点標高を返す。
 * 格子は(segments+1)^2点で、タイルの左上から右下へ行優先。
 * @returns Float32Array((segments+1)^2)。NoDataはNaN。DEM取得失敗（通信エラー）はnull
 */
export const fetchTileElevationGrid = async (
  texTile: TileKey,
  demZoom: number,
  segments: number
): Promise<Float32Array | null> => {
  const dz = texTile.z - demZoom;
  if (dz < 0) throw new Error('demZoom must be <= texTile.z');
  const demX = texTile.x >> dz;
  const demY = texTile.y >> dz;
  const tile = await fetchDemTile(demZoom, demX, demY);
  const grid = new Float32Array((segments + 1) * (segments + 1));
  if (tile === undefined) return null; // 通信エラー（リトライ対象）
  if (tile === null) {
    grid.fill(0); // 恒久欠損（海上等）は0m
    return grid;
  }
  // テクスチャタイルがDEMタイル内で占める範囲（画素単位）
  const scale = Math.pow(2, dz);
  const span = DEM_TILE_SIZE / scale;
  const originPx = (texTile.x - demX * scale) * span;
  const originPy = (texTile.y - demY * scale) * span;
  for (let row = 0; row <= segments; row++) {
    for (let col = 0; col <= segments; col++) {
      const px = originPx + (col / segments) * span;
      const py = originPy + (row / segments) * span;
      grid[row * (segments + 1) + col] = sampleBilinear(tile, px, py);
    }
  }
  return grid;
};

/**
 * 指定地点の標高[m]（バイリニア）。軌跡・マーカーのドレープ用。
 * 取得できない場合はnull。
 */
export const getElevationAt = async (latitude: number, longitude: number, demZoom: number): Promise<number | null> => {
  const z = clampDemZoom(demZoom);
  const tx = lonToTileXFloat(longitude, z);
  const ty = latToTileYFloat(latitude, z);
  const tileX = Math.floor(tx);
  const tileY = Math.floor(ty);
  const tile = await fetchDemTile(z, tileX, tileY);
  if (!(tile instanceof Float32Array)) return tile === null ? 0 : null;
  const v = sampleBilinear(tile, (tx - tileX) * DEM_TILE_SIZE, (ty - tileY) * DEM_TILE_SIZE);
  return Number.isNaN(v) ? 0 : v;
};
