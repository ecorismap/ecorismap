/**
 * 3D地形のDEM（Mapterhorn 512px、demSource経由）。
 *
 * 標高はネイティブでFloat32まで復元済みなので、そのままr32floatテクスチャとして上げる。
 * シェーダ側のRGB→標高の復元（GSI/terrariumの分岐・NoData処理）は無い。
 *
 * 海底モード（GEBCO海底地形図の表示中）は、Mapterhornの海（0m・外洋の404）を
 * 産総研GEBCOの海底値で埋め、海面下だけBATHYMETRY_EXAGGERATION倍にする（Web版bathyterrain://と同方式）。
 */
import { BATHYMETRY_EXAGGERATION, exaggerateDepths, fillSeaWithBathymetry } from '../bathymetryFill';
import { DEM_SOURCE_TILE_SIZE, getDemTile } from '../demSource';
import { loadReliefElevation, RELIEF_ELEVATION_TILE_SIZE } from './reliefTexture';
import { LayerSpec } from './types';

/**
 * 3Dが参照するDEMのズーム範囲（512px）。旧dem_png 256pxのz8〜14と同じ画素密度
 * （オフラインDLの範囲と揃える）
 */
export const TERRAIN_DEM_MIN_ZOOM = 7;
export const TERRAIN_DEM_MAX_ZOOM = 13;

/**
 * DEMを何×何のブロックに区切って標高範囲を持つか。
 * テクスチャタイルはDEMの1/8（dz=3）の区画を参照するので、8分割なら区画とブロックの境界が揃い、
 * スカート底がタイル自身の起伏だけで決まる（TerrainTileManager.tileElevRange）
 */
export const DEM_RANGE_BLOCKS = 8;

export const clampDemZoom = (zoom: number): number =>
  Math.min(TERRAIN_DEM_MAX_ZOOM, Math.max(TERRAIN_DEM_MIN_ZOOM, Math.round(zoom)));

export interface TerrainDem {
  /** 標高[m]（行優先、size×size） */
  elev: Float32Array;
  size: number;
  /** DEM_RANGE_BLOCKS×DEM_RANGE_BLOCKSのブロック毎の標高範囲[m] */
  blockMin: Float32Array;
  blockMax: Float32Array;
}

/** ブロック毎の標高範囲を求める */
export const elevationBlocks = (
  elev: Float32Array,
  size: number,
  n: number = DEM_RANGE_BLOCKS
): { blockMin: Float32Array; blockMax: Float32Array } => {
  const blockMin = new Float32Array(n * n).fill(Infinity);
  const blockMax = new Float32Array(n * n).fill(-Infinity);
  const blockPx = size / n;
  for (let y = 0; y < size; y++) {
    const rowBase = Math.floor(y / blockPx) * n;
    for (let x = 0; x < size; x++) {
      const e = elev[y * size + x];
      // eslint-disable-next-line no-self-compare
      if (e !== e) continue;
      const b = rowBase + Math.floor(x / blockPx);
      if (e < blockMin[b]) blockMin[b] = e;
      if (e > blockMax[b]) blockMax[b] = e;
    }
  }
  for (let b = 0; b < n * n; b++) {
    if (!Number.isFinite(blockMin[b])) {
      blockMin[b] = 0;
      blockMax[b] = 0;
    }
  }
  return { blockMin, blockMax };
};

/** 開発時の計測用: DEMの解決（取得＋デコード＋海底埋め）の累計回数と累計時間[ms] */
const stats = { count: 0, totalMs: 0 };

export const takeTerrainDemStats = (): { count: number; totalMs: number } => {
  const snapshot = { ...stats };
  stats.count = 0;
  stats.totalMs = 0;
  return snapshot;
};

/**
 * 海底を埋めた標高を作る。元のタイル（demSourceのLRUと共有）は書き換えない。
 * @returns 標高 / undefined=GEBCOの通信エラー
 */
const fillBathymetry = async (
  z: number,
  x: number,
  y: number,
  land: Float32Array | null,
  layer: LayerSpec
): Promise<Float32Array | undefined> => {
  const size = DEM_SOURCE_TILE_SIZE;
  // 外洋（Mapterhornが404）は全面0mの海として埋める
  const elev = land === null ? new Float32Array(size * size) : land.slice();
  // 512pxのzNと256pxのzNは同じ範囲なので、GEBCOは同じタイル番号（の祖先）を引けばよい
  const maxZ = Math.min(layer.maximumNativeZ ?? layer.maximumZ, layer.maximumZ);
  const az = Math.min(z, maxZ);
  const ancestorTile = { z: az, x: x >> (z - az), y: y >> (z - az) };
  const ancestor = await loadReliefElevation(layer, ancestorTile.z, ancestorTile.x, ancestorTile.y);
  if (ancestor === undefined) return undefined;
  if (ancestor !== null) {
    fillSeaWithBathymetry(elev, size, { z, x, y }, ancestor, ancestorTile, true, RELIEF_ELEVATION_TILE_SIZE);
    exaggerateDepths(elev, BATHYMETRY_EXAGGERATION);
  }
  return elev;
};

/**
 * 3D地形用のDEMを解決する。
 * @param bathymetryLayer 海底モードならGEBCO段彩のレイヤ（海底値の取得元）
 * @returns DEM / null=データなし（外洋。0mの平面で描く）/ undefined=通信エラー（一時的）
 */
export const resolveTerrainDem = async (
  z: number,
  x: number,
  y: number,
  bathymetryLayer: LayerSpec | null
): Promise<TerrainDem | null | undefined> => {
  const startMs = __DEV__ ? performance.now() : 0;
  const tile = await getDemTile(z, x, y);
  if (tile === undefined) return undefined;
  let elev: Float32Array;
  let size: number;
  if (bathymetryLayer !== null) {
    const filled = await fillBathymetry(z, x, y, tile === null ? null : tile.elev, bathymetryLayer);
    if (filled === undefined) return undefined;
    elev = filled;
    size = DEM_SOURCE_TILE_SIZE;
  } else {
    if (tile === null) return null;
    elev = tile.elev;
    size = tile.size;
  }
  const { blockMin, blockMax } = elevationBlocks(elev, size);
  if (__DEV__) {
    stats.count++;
    stats.totalMs += performance.now() - startMs;
  }
  return { elev, size, blockMin, blockMax };
};
