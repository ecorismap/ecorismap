/**
 * 任意の標高タイルURLの取得とデコード（Web版）。
 *
 * ネイティブ版の利用元（3Dの段彩テクスチャ・等深線ラベル）はWebでは使われない
 * （Webはmaplibreの3D地形・maplibre-contourが担う）。型を揃えるための最小実装。
 */
import type { DemDecodeEncoding } from '../../modules/dem-decoder/src';

export type DecodedDemTile = { size: number; elev: Float32Array };

export const decodeDemTileFile = async (
  _fileUri: string,
  _encoding: DemDecodeEncoding
): Promise<DecodedDemTile | null> => null;

export const fetchDemTileFile = async (_url: string, _key: string): Promise<string | null> => null;

export const localDemTileFile = async (_fileUri: string): Promise<string | null> => null;

export const readLocalFileBytes = async (_fileUri: string): Promise<ArrayBuffer | null> => null;

export const clearDemTileDiskCache = async (): Promise<void> => {};
