import { TileMapType } from '../types';

/**
 * URL で登録した PMTiles のズーム設定を、アーカイブのヘッダーに合わせる（M-M18）。
 * 固定ズーム（overzoomThreshold）がアーカイブの最大ズームを超えると、Web ではアーカイブに無いズームのタイルを
 * 取りに行き、ベクタは「地物なし」で確定して消え、PDF は空白になる。利用者が下げた値はそのまま残す
 */
export const pmtilesHeaderZoom = (
  map: Pick<TileMapType, 'overzoomThreshold'>,
  header: { minZoom: number; maxZoom: number }
): Pick<TileMapType, 'minimumZ' | 'maximumZ' | 'overzoomThreshold'> => ({
  minimumZ: header.minZoom,
  maximumZ: header.maxZoom,
  overzoomThreshold: Math.min(map.overzoomThreshold, header.maxZoom),
});
