/**
 * 通常の3D表示（眺望でないとき）に山頂へ重ねる山名（▲＋山名＋標高）の選定。
 *
 * 2Dと同じく、地図一覧の「山名」（peaks://）が表示中のときに出す。候補は注視点のまわりから
 * 2Dと同じ縮尺の規則（ランク別の表示開始ズーム）で選び、遠すぎる山は眺望と同じ距離上限で切る。
 * 間引きは2Dのワールド格子ではなく画面上で行う。3Dは遠くほど縮んで見えるので、
 * 地上の間隔で間引いても遠方でラベルが重なるため
 */
import { Peak, distanceM } from './peakData';
import { PEAK_2D_MIN_ZOOM, Peak2DLabel, peakLabelText } from './peak2dLabels';
import { RANK_MAX_DISTANCE_M } from './peakLabelLayout';

const DEFAULT_MIN_ZOOM = 11;
/** 注視点から候補を探す半径[m]（RANK_MAX_DISTANCE_Mの最大値） */
export const PEAK_3D_SEARCH_RADIUS_M = 150000;

/** 注視点のまわりの山から、縮尺と距離の規則に合うものを選ぶ */
export const selectPeak3DCandidates = (
  peaks: Peak[],
  center: { latitude: number; longitude: number },
  zoom: number
): Peak2DLabel[] => {
  const result: Peak2DLabel[] = [];
  for (const peak of peaks) {
    if (Math.floor(zoom) < (PEAK_2D_MIN_ZOOM[peak.rank] ?? DEFAULT_MIN_ZOOM)) continue;
    const distance = distanceM(center.latitude, center.longitude, peak.latitude, peak.longitude);
    if (distance > (RANK_MAX_DISTANCE_M[peak.rank] ?? RANK_MAX_DISTANCE_M[5])) continue;
    result.push({ ...peak, key: `${peak.name}@${peak.latitude},${peak.longitude}`, text: peakLabelText(peak) });
  }
  return result;
};

export type Peak2DLabelCandidates = Peak2DLabel[];

export interface ProjectedPeak3D extends Peak2DLabel {
  x: number;
  y: number;
}

export interface Peak3DThinOptions {
  /** ラベル1つが占める画面上の箱[dp]（▲を中心に左右boxWidth/2、下にboxHeight） */
  boxWidth: number;
  boxHeight: number;
  maxLabels: number;
}

/** 画面上で重なるラベルを、重要な山・高い山から順に残す（貪欲法） */
export const thinPeak3DLabels = (peaks: ProjectedPeak3D[], options: Peak3DThinOptions): ProjectedPeak3D[] => {
  const { boxWidth, boxHeight, maxLabels } = options;
  const ordered = peaks.slice().sort((a, b) => a.rank - b.rank || b.ele - a.ele);
  const placed: ProjectedPeak3D[] = [];
  for (const peak of ordered) {
    if (placed.length >= maxLabels) break;
    if (placed.some((other) => Math.abs(other.x - peak.x) < boxWidth && Math.abs(other.y - peak.y) < boxHeight)) continue;
    placed.push(peak);
  }
  return placed;
};
