import { TileMapType } from '../types';
import { getTileSourceCleanup, isPmtilesSourceUrl } from './tileSourceChange';

type ZoomFields = Pick<TileMapType, 'minimumZ' | 'maximumZ' | 'overzoomThreshold'>;

// 新規の地図の既定値（useMapEdit）
const DEFAULT_ZOOM: ZoomFields = { minimumZ: 0, maximumZ: 22, overzoomThreshold: 18 };

/**
 * URL で登録した PMTiles のズーム設定を、アーカイブのヘッダーに合わせる（M-M18）。
 * 固定ズーム（overzoomThreshold）がアーカイブの最大ズームを超えると、アーカイブに無いズームのタイルを
 * 取りに行き、ベクタは「地物なし」で確定して消え、PDF は空白になる。利用者が下げた値はそのまま残す
 */
export const pmtilesHeaderZoom = (
  map: Pick<TileMapType, 'overzoomThreshold'>,
  header: { minZoom: number; maxZoom: number }
): ZoomFields => ({
  minimumZ: header.minZoom,
  maximumZ: header.maxZoom,
  overzoomThreshold: Math.min(map.overzoomThreshold, header.maxZoom),
});

/**
 * 前のアーカイブのヘッダーから自動で入れたズームを、取得元を変えたときに既定へ戻す。
 * 残すと、前のアーカイブの最大ズームで新しい地図が切れたままになる（編集画面に最小・最大ズームの欄は無い）。
 * 利用者が動かした値（前と違う値）は触らない
 */
export const resetPreviousArchiveZoom = (
  previous: TileMapType | undefined,
  next: TileMapType
): Partial<ZoomFields> => {
  if (previous === undefined || !isPmtilesSourceUrl(previous.url)) return {};
  if (!getTileSourceCleanup(previous, next).source) return {};
  const reset: Partial<ZoomFields> = {};
  if (next.minimumZ === previous.minimumZ) reset.minimumZ = DEFAULT_ZOOM.minimumZ;
  if (next.maximumZ === previous.maximumZ) reset.maximumZ = DEFAULT_ZOOM.maximumZ;
  // 固定ズームは利用者も変えるので、ヘッダーで切り詰めた値（最大ズームと同じ）のときだけ戻す
  if (next.overzoomThreshold === previous.overzoomThreshold && previous.overzoomThreshold === previous.maximumZ) {
    reset.overzoomThreshold = DEFAULT_ZOOM.overzoomThreshold;
  }
  return reset;
};
