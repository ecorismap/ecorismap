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

/**
 * Web（maplibre）のラスタXYZソースのtileSize。
 * 256のままだと高解像度の画面（devicePixelRatio 1.5以上）ではタイルを2倍に引き伸ばしてぼやける。
 * 「高解像度」がオンの地図は128にして1段上のズームのタイルを取り、タイルの1画素を画面の1画素に
 * 合わせる（Leafletの detectRetina と同じ。ネイティブの doubleTileSize に相当）。
 * 文字・記号は半分の大きさになり、タイル数は約4倍になる。等倍の画面では得がないので256のまま。
 */
export const rasterSourceTileSize = (
  tileMap: Pick<TileMapType, 'highResolutionEnabled'>,
  devicePixelRatio: number
): number => (tileMap.highResolutionEnabled && devicePixelRatio >= 1.5 ? 128 : 256);
