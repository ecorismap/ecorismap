import { TileMapType } from '../types';

/**
 * Web（maplibre）のラスタXYZソースのmaxzoom。
 * ソースのmaxzoomより上はmaplibreが親タイルを拡大表示するので、固定ズーム（overzoomThreshold）を
 * そのまま渡すとネイティブ・PDFと同じ「それ以上は拡大表示」になる。maximumZ のままだと
 * 実在しないズームを取りに行って404になる（M-L11）。
 */
export const rasterSourceMaxzoom = (tileMap: Pick<TileMapType, 'maximumZ' | 'overzoomThreshold'>): number => {
  const { maximumZ, overzoomThreshold } = tileMap;
  // 古いデータで片方が欠けていても NaN・undefined を maplibre に渡さない
  if (!Number.isFinite(overzoomThreshold)) return maximumZ;
  if (!Number.isFinite(maximumZ)) return overzoomThreshold;
  return Math.min(overzoomThreshold, maximumZ);
};
