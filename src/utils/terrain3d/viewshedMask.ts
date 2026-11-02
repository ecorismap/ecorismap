/**
 * 可視領域を3D地形へ貼るためのマスク。
 *
 * 可視領域の2D表示はポリゴンだが、ポリゴンは頂点でしか地形に沿わないので、
 * 数kmにわたる起伏の上に塗ると尾根に潜ったり谷の上に浮いたりする。
 * そこで計算元の可視グリッド（ラスタ）を1枚のマスク画像にまとめ、地形のフラグメント
 * シェーダが画素ごとに引いて塗る。
 */
import { LocationType } from '../../types';
import { ViewshedRaster } from '../viewshed';
import { Rgba } from './colorUtils';
import { MERCATOR_CIRCUMFERENCE, MercatorPoint } from './coords';
import { DataOverlaySpec } from './TerrainScene';

/** 可視グリッドのタイル一辺[px]（viewshed.tsのワールドピクセル座標と同じ基準） */
const RASTER_TILE_SIZE = 512;
/** マスク一辺の上限[px]。超える場合はズームを下げて収める（r8で最大16MB） */
const MAX_MASK_SIZE = 4096;
/**
 * 範囲円の頂点間隔の上限[m]。リボンは頂点でしか地形に沿わないので、
 * 円の72分割（半径3kmで約260m間隔）のままだと尾根を突き抜けたり谷の上に浮いたりする
 */
const CIRCLE_MAX_SEGMENT_METERS = 20;
/** 緯度1度あたりのメートル数（短い区間の長さの見積もり用） */
const METERS_PER_DEGREE = 111320;

export interface ViewshedMask {
  /** 1画素1バイト（255=見える）。行優先・北が上 */
  data: Uint8Array;
  width: number;
  height: number;
  zoom: number;
  /** マスク左上のワールドピクセル座標（zoomにおける512pxタイル基準） */
  originPxX: number;
  originPxY: number;
}

/**
 * 複数の可視グリッドを、和集合の1枚のマスクへまとめる。
 * ズームの違うグリッドが混じる場合は最も細かいズームへ揃える
 */
export const composeViewshedMask = (rasters: ViewshedRaster[]): ViewshedMask | null => {
  if (rasters.length === 0) return null;
  let zoom = Math.max(...rasters.map((r) => r.zoom));
  const boundsAt = (z: number) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const r of rasters) {
      const scale = Math.pow(2, z - r.zoom);
      x0 = Math.min(x0, Math.floor(r.originPxX * scale));
      y0 = Math.min(y0, Math.floor(r.originPxY * scale));
      x1 = Math.max(x1, Math.ceil((r.originPxX + r.size) * scale));
      y1 = Math.max(y1, Math.ceil((r.originPxY + r.size) * scale));
    }
    return { x0, y0, width: x1 - x0, height: y1 - y0 };
  };
  let bounds = boundsAt(zoom);
  while ((bounds.width > MAX_MASK_SIZE || bounds.height > MAX_MASK_SIZE) && zoom > 0) {
    zoom--;
    bounds = boundsAt(zoom);
  }
  const { x0, y0, width, height } = bounds;
  const data = new Uint8Array(width * height);
  for (const r of rasters) {
    const scale = Math.pow(2, zoom - r.zoom);
    // マスク画素の中心がどのグリッド画素に入るかで引く（拡大・縮小どちらでも同じ式）
    const mx0 = Math.max(0, Math.floor(r.originPxX * scale) - x0);
    const my0 = Math.max(0, Math.floor(r.originPxY * scale) - y0);
    const mx1 = Math.min(width, Math.ceil((r.originPxX + r.size) * scale) - x0);
    const my1 = Math.min(height, Math.ceil((r.originPxY + r.size) * scale) - y0);
    for (let my = my0; my < my1; my++) {
      const gy = Math.floor((y0 + my + 0.5) / scale - r.originPxY);
      if (gy < 0 || gy >= r.size) continue;
      const rowOffset = gy * r.size;
      for (let mx = mx0; mx < mx1; mx++) {
        const gx = Math.floor((x0 + mx + 0.5) / scale - r.originPxX);
        if (gx < 0 || gx >= r.size) continue;
        if (r.vis[rowOffset + gx] !== 0) data[my * width + mx] = 255;
      }
    }
  }
  return { data, width, height, zoom, originPxX: x0, originPxY: y0 };
};

/**
 * マスクが覆う範囲を地形のローカル座標で返す: [西端x, 北端z, 幅, 高さ]。
 * ローカル座標はx=東（メルカトルX−原点）、z=南（原点−メルカトルY）
 */
export const viewshedMaskLocalRect = (
  mask: ViewshedMask,
  origin: MercatorPoint
): [number, number, number, number] => {
  const metersPerPx = MERCATOR_CIRCUMFERENCE / (RASTER_TILE_SIZE * Math.pow(2, mask.zoom));
  const westMx = mask.originPxX * metersPerPx - MERCATOR_CIRCUMFERENCE / 2;
  const northMy = MERCATOR_CIRCUMFERENCE / 2 - mask.originPxY * metersPerPx;
  return [westMx - origin.mx, origin.my - northMy, mask.width * metersPerPx, mask.height * metersPerPx];
};

/** 区間の長さが上限を超えないよう、頂点を緯度経度の線形補間で足す */
export const densifyRing = (ring: LocationType[], maxSegmentMeters = CIRCLE_MAX_SEGMENT_METERS): LocationType[] => {
  if (ring.length < 2) return ring;
  const out: LocationType[] = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1];
    const b = ring[i];
    const cosLat = Math.cos((((a.latitude + b.latitude) / 2) * Math.PI) / 180);
    const dx = (b.longitude - a.longitude) * METERS_PER_DEGREE * cosLat;
    const dy = (b.latitude - a.latitude) * METERS_PER_DEGREE;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / maxSegmentMeters));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      out.push({
        latitude: a.latitude + (b.latitude - a.latitude) * t,
        longitude: a.longitude + (b.longitude - a.longitude) * t,
      });
    }
  }
  return out;
};

/** 可視領域の範囲円を、地形に沿うリボンのドレープ指定へ変換する */
export const buildViewshedCircleSpecs = (
  results: { id: string; circleRing: LocationType[] }[],
  widthMeters: number,
  color: Rgba
): DataOverlaySpec[] =>
  results
    .filter((result) => result.circleRing.length >= 2)
    .map((result) => ({
      id: `viewshed-circle-${result.id}`,
      kind: 'line' as const,
      coords: densifyRing(result.circleRing),
      color,
      widthMeters,
    }));
