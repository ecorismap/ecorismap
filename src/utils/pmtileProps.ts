import { TileMapType } from '../types';

/**
 * PMTiles・pbfのネイティブ描画（2DのPMTile / 3D / PDF）でオーバーズームを始めるズーム。
 * オフラインでは保存したレベル（ラスタ16・ベクタ18）までしかタイルが無いので、そこから拡大する
 */
export const getPmtileMaximumNativeZ = (
  tileMap: Pick<TileMapType, 'overzoomThreshold' | 'isVector'> & { maximumZ?: number },
  isOffline: boolean
) => {
  // アーカイブの最大ズーム（maximumZ）より上にはタイルが無い。Web の getPmtilesSource とそろえる
  const threshold = Number.isFinite(tileMap.maximumZ)
    ? Math.min(tileMap.overzoomThreshold, tileMap.maximumZ as number)
    : tileMap.overzoomThreshold;
  if (!isOffline) return threshold;
  return Math.min(threshold, tileMap.isVector ? 18 : 16);
};
