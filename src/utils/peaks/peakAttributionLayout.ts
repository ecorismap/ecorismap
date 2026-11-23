/**
 * 眺望の山名の出典（「山名: 国土地理院」）を置く位置。
 *
 * ネイティブの3D・眺望は画面いっぱい（Androidのナビゲーションバーの裏まで）に描くので、
 * 下端から測ると出典がナビゲーションバーに隠れる。地図の出典行（HomeAttributionText、
 * 下端＝セーフエリア＋1、右余白15）の1行上に、右端をそろえて積む。
 * Webは地図の出典をmaplibreの出典表示が右下に出すので、従来どおりの位置のままにする。
 */

/** 地図の出典行（fontSize 9）の1行ぶんの高さ＋隙間[dp] */
const MAP_ATTRIBUTION_LINE = 13;
/** 地図の出典行の下端（HomeAttributionTextのbottomの定数部） */
const MAP_ATTRIBUTION_BOTTOM = 1;
/** 地図の出典行の右余白（HomeAttributionTextのpaddingRight） */
const MAP_ATTRIBUTION_RIGHT = 15;

export const peakAttributionPosition = (
  safeAreaBottom: number,
  isWeb: boolean
): { bottom: number; right: number } => {
  if (isWeb) return { bottom: 4, right: 6 };
  return { bottom: safeAreaBottom + MAP_ATTRIBUTION_BOTTOM + MAP_ATTRIBUTION_LINE, right: MAP_ATTRIBUTION_RIGHT };
};
