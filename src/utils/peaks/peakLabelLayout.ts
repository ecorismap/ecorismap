/**
 * 眺望の山名ラベルの選定と配置（PeakFinder・展望図の方式）。
 *
 * 山名は縦書きの列にして画面上部の帯に並べ、山頂までを引き出し線でつなぐ。
 * 列どうしが横に重なる場合は、優先度の高い山から順に置いて後の山を間引く（貪欲法）。
 * 優先度は重要度（ランク）に近さを加味する（近い山ほど上がる。nearBonus）。
 * 直前に出ていた山を優先するのは、見回すたびに山名が入れ替わってちらつくのを防ぐため。
 */
import { Peak, distanceM } from './peakData';

/** ランクごとの表示距離の上限[m]。主要な山ほど遠くまで出す */
export const RANK_MAX_DISTANCE_M: Record<number, number> = {
  1: 150000,
  2: 80000,
  3: 40000,
  4: 15000,
  5: 6000,
};
/**
 * 標高による距離上限。高い山はランクに関係なく遠くからでも見えるので、ランクの上限より
 * 遠くまで出す（白山2702m・旭岳2867mはランク2で80kmどまりだった）。
 * 1000mを超えた1mにつき100m（2000m→100km、2500m→150km、3000m→200km、富士山→約278km）。
 * 地球の丸みは考えない（描画も平面なので、描かれている山には名前を付ける）
 */
const ELE_DISTANCE_BASE_M = 1000;
const ELE_DISTANCE_PER_M = 100;
/** 候補を探す半径＝距離上限の最大値 */
export const PEAK_SEARCH_RADIUS_M = 300000;
/** 立ち位置のすぐそばの山は「いま居る山」なので出さない */
const MIN_DISTANCE_M = 50;

/** その山の名前を出す距離の上限[m]（ランクと標高の大きい方、PEAK_SEARCH_RADIUS_Mまで） */
export const peakMaxDistanceM = (peak: Pick<Peak, 'rank' | 'ele'>): number =>
  Math.min(
    PEAK_SEARCH_RADIUS_M,
    Math.max(RANK_MAX_DISTANCE_M[peak.rank] ?? RANK_MAX_DISTANCE_M[5], (peak.ele - ELE_DISTANCE_BASE_M) * ELE_DISTANCE_PER_M)
  );

export interface PeakCandidate extends Peak {
  key: string;
  distance: number;
}

/**
 * 立ち位置の周辺から、距離上限（peakMaxDistanceM）に収まる山を選ぶ。
 * @param distanceScale 距離上限に掛ける倍率。望遠では遠くの小さな山も見えるので、倍率ぶん伸ばす
 *   （上限はPEAK_SEARCH_RADIUS_M）
 */
export const selectPeakCandidates = (
  peaks: Peak[],
  viewpoint: { latitude: number; longitude: number },
  distanceScale = 1
): PeakCandidate[] => {
  const result: PeakCandidate[] = [];
  for (const peak of peaks) {
    const distance = distanceM(viewpoint.latitude, viewpoint.longitude, peak.latitude, peak.longitude);
    const limit = Math.min(PEAK_SEARCH_RADIUS_M, peakMaxDistanceM(peak) * distanceScale);
    if (distance < MIN_DISTANCE_M || distance > limit) continue;
    result.push({ ...peak, key: `${peak.name}@${peak.latitude},${peak.longitude}`, distance });
  }
  return result;
};

export interface ProjectedPeak extends PeakCandidate {
  /** 山頂の画面位置[dp] */
  x: number;
  y: number;
}

export interface PlacedPeakLabel extends ProjectedPeak {
  /** 縦書き列の上端[dp] */
  labelTop: number;
  /** 縦書き列の高さ[dp] */
  labelHeight: number;
}

export interface PeakLayoutOptions {
  /** 画面幅・高さ[dp] */
  width: number;
  height: number;
  /** 左端の操作ボタン列の幅[dp]。ここに山名を置くとボタンに重なる */
  leftInset: number;
  /** 山名の帯の上端[dp]（バナーなどの下） */
  bandTop: number;
  /** 縦書き列の幅[dp]。この間隔より近い列は置かない */
  columnWidth: number;
  /** 1文字の高さ[dp] */
  charHeight: number;
  /** 引き出し線の最短の長さ[dp] */
  minStem: number;
  /** 同時に出す最大数 */
  maxLabels: number;
  /** 直前に表示していた山のkey */
  previous: ReadonlySet<string>;
}

/** 直前に出ていた山の優先度の上乗せ（ランク0.6段ぶん） */
const PREVIOUS_BONUS = 0.6;

/**
 * 近い山の優先度の上乗せ。重要度だけで決めると、目の前の小さな山の名前が
 * 同じ方向の遠くの主要峰に負けて出ない（宮古岩泉で、5km先の高倉山が遠方の
 * 三巣子岳に隠れた）。NEAR_FULL_M以内は最大NEAR_MAX_BONUS段、NEAR_ZERO_Mで0になる
 */
const NEAR_ZERO_M = 10000;
const NEAR_STEP_M = 2500;
const NEAR_MAX_BONUS = 2.5;
export const nearBonus = (distance: number): number =>
  Math.min(NEAR_MAX_BONUS, Math.max(0, (NEAR_ZERO_M - distance) / NEAR_STEP_M));

/** 縦書きにしたときの行数（1文字1行） */
export const verticalLength = (name: string): number => Array.from(name).length;

export const layoutPeakLabels = (peaks: ProjectedPeak[], options: PeakLayoutOptions): PlacedPeakLabel[] => {
  const { width, height, leftInset, bandTop, columnWidth, charHeight, minStem, maxLabels, previous } = options;
  const score = (p: ProjectedPeak) => p.rank - nearBonus(p.distance) - (previous.has(p.key) ? PREVIOUS_BONUS : 0);
  const ordered = peaks
    // 山頂が画面の下に外れた山は出さない（上空から見下ろすと近くの山がそうなり、
    // 引き出し線が画面の外へ伸びるだけになる）
    .filter((p) => p.x >= leftInset + columnWidth / 2 && p.x <= width - columnWidth / 2 && p.y <= height)
    .sort((a, b) => score(a) - score(b) || a.distance - b.distance || b.ele - a.ele);

  const placed: PlacedPeakLabel[] = [];
  for (const peak of ordered) {
    if (placed.length >= maxLabels) break;
    if (placed.some((other) => Math.abs(other.x - peak.x) < columnWidth)) continue;
    const labelHeight = verticalLength(peak.name) * charHeight;
    // 基本は帯の上端に揃える。山頂が帯にかかる（見上げている）ときは山頂の真上へずらす
    const labelTop = Math.min(bandTop, peak.y - minStem - labelHeight);
    if (labelTop < 0) continue;
    placed.push({ ...peak, labelTop, labelHeight });
  }
  return placed;
};
