import { TileMapType } from '../types';

/**
 * PMTiles・pbfのネイティブ描画（2DのPMTile / 3D / PDF）でオーバーズームを始めるズーム。
 * オフラインでは保存したレベル（ラスタ16・ベクタ18）までしかタイルが無いので、そこから拡大する
 */
export const getPmtileMaximumNativeZ = (
  tileMap: Pick<TileMapType, 'overzoomThreshold' | 'isVector'>,
  isOffline: boolean
) =>
  isOffline && tileMap.overzoomThreshold > 16 && !tileMap.isVector
    ? 16
    : isOffline && tileMap.overzoomThreshold > 18 && tileMap.isVector
    ? 18
    : tileMap.overzoomThreshold;
