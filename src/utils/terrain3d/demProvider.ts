/**
 * 3D地形エンジン向けのDEM標高サンプリング（JS側）。
 *
 * 描画用の標高は頂点シェーダがDEMテクスチャから直接読むため、ここを通らない。
 * ここが担うのは「JS側で標高が要る処理」＝オーバーレイのドレープ・ポイントの
 * スクリーン投影・タップの逆投影・カメラの地面高で、タイル単位の取得と
 * キャッシュはdemTileProvider（viewshedと共用）に任せる。
 */
import { DEM_DOWNLOAD_MAX_ZOOM, DEM_DOWNLOAD_MIN_ZOOM } from '../../constants/DemSources';
import { DEM_TILE_SIZE, fetchDemTile, peekDecodedDemTile } from '../demTileProvider';
import { latToTileYFloat, lonToTileXFloat } from './coords';

export const clampDemZoom = (zoom: number): number =>
  Math.min(DEM_DOWNLOAD_MAX_ZOOM, Math.max(DEM_DOWNLOAD_MIN_ZOOM, Math.round(zoom)));

/**
 * タイル内のDEM画素を最近傍で読む（エッジクランプ）。
 *
 * **頂点シェーダの decodeElev と同じ読み方にすること**。あちらは
 * `textureLoad(dem, vec2<i32>(px + 0.5), 0)` で最近傍なので、ここをバイリニアにすると
 * 描かれている地形と標高がずれる。特に尾根のような凸地形では、バイリニアが周囲を
 * 平均して低く出るぶん、ドットが地形にめり込んで見える
 */
export const sampleNearest = (elev: Float32Array, px: number, py: number): number => {
  const x = Math.max(0, Math.min(DEM_TILE_SIZE - 1, Math.floor(px + 0.5)));
  const y = Math.max(0, Math.min(DEM_TILE_SIZE - 1, Math.floor(py + 0.5)));
  return elev[y * DEM_TILE_SIZE + x];
};

/**
 * 指定地点の標高[m]をデコード済みキャッシュからのみ引く（同期・取得はしない）。
 * 描画フレーム内から呼ばれる（ドレープ・スクリーン投影・タップの逆投影）ため、
 * タイルを線形走査せずDEMタイルキーを直接計算して1回のMap参照で解決する。
 *
 * @returns 標高[m]（データなしの海上等は0）/ null=未取得
 */
export const peekElevationAt = (latitude: number, longitude: number, demZoom: number): number | null => {
  const z = clampDemZoom(demZoom);
  const tx = lonToTileXFloat(longitude, z);
  const ty = latToTileYFloat(latitude, z);
  const tileX = Math.floor(tx);
  const tileY = Math.floor(ty);
  const tile = peekDecodedDemTile(z, tileX, tileY);
  if (tile === undefined) return null;
  if (tile === null) return 0;
  const v = sampleNearest(tile, (tx - tileX) * DEM_TILE_SIZE, (ty - tileY) * DEM_TILE_SIZE);
  return Number.isNaN(v) ? 0 : v;
};

/**
 * 指定地点の標高[m]（未取得ならタイルを取りに行く非同期版）。軌跡・マーカーのドレープ用。
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
  const v = sampleNearest(tile, (tx - tileX) * DEM_TILE_SIZE, (ty - tileY) * DEM_TILE_SIZE);
  return Number.isNaN(v) ? 0 : v;
};
