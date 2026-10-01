/**
 * 標高タイルの取得元（Mapterhorn）とデコードの共通基盤（Web版）。
 *
 * ディスクキャッシュとオフラインDLはブラウザキャッシュ任せ。デコードはcreateImageBitmapを
 * 色空間変換・アルファ乗算なしで使い、ネイティブ版と同じ値を得る。
 */
import { MAPTERHORN_URL } from '../constants/DemSources';
import { createDemTileCache, DemTile, DemTileResult, demTileKey, isValidTile } from './demSourceCommon';

export type { DemTile, DemTileResult } from './demSourceCommon';
export { DEM_SOURCE_TILE_SIZE } from './demSourceCommon';

const tileUrl = (z: number, x: number, y: number) =>
  MAPTERHORN_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

const cache = createDemTileCache();

/** terrariumのWebP/PNGを標高[m]へ。負値はクランプしない */
export const decodeTerrariumBlob = async (blob: Blob): Promise<{ size: number; elev: Float32Array }> => {
  // 標高をRGBに詰めた画像なので、色空間変換・アルファ乗算で値が変わらないようにする
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const size = bitmap.width;
  const canvas = new OffscreenCanvas(size, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no canvas context');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data: rgba } = ctx.getImageData(0, 0, size, size);
  const elev = new Float32Array(size * size);
  for (let i = 0, p = 0; i < elev.length; i++, p += 4) {
    elev[i] = rgba[p] * 256 + rgba[p + 1] + rgba[p + 2] / 256 - 32768;
  }
  return { size, elev };
};

const loadTile = async (z: number, x: number, y: number): Promise<DemTileResult> => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(tileUrl(z, x, y));
      if (response.status === 404) return null;
      if (!response.ok) continue;
      const { size, elev } = await decodeTerrariumBlob(await response.blob());
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < elev.length; i++) {
        const e = elev[i];
        if (e < min) min = e;
        if (e > max) max = e;
      }
      const tile: DemTile = { z, x, y, size, elev, min, max };
      return tile;
    } catch {
      // 通信の瞬断はもう1回だけ試す
    }
  }
  return undefined;
};

export const getDemTile = (z: number, x: number, y: number): Promise<DemTileResult> => {
  if (!isValidTile(z, x, y)) return Promise.resolve(null);
  return cache.getOrLoad(demTileKey(z, x, y), () => loadTile(z, x, y));
};

export const peekDemTile = (z: number, x: number, y: number): DemTile | null | undefined =>
  cache.peek(demTileKey(z, x, y));

/** Webはオフラインの保存先を持たない（型をネイティブ版と揃えるため） */
export const downloadedDemTileUri = (_z: number, _x: number, _y: number): string => '';

export const clearDemTileMemoryCache = (): void => cache.clear();

export const clearDemTileDiskCache = async (): Promise<void> => {};
