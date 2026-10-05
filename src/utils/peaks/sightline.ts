/**
 * 眺望の立ち位置から山頂が見えるか（視線が地形に遮られないか）の判定。ネイティブ・Web共通。
 *
 * 目から山頂までの視線上の標高を、描画に使っているDEMから引いて比べる。
 * 描画と同じ標高を使うので、画面の見た目と食い違わない。
 * 標高を一律に何倍しても（地形の誇張）判定は変わらないので、標高の単位は
 * 目・山頂・地形で揃っていればよい（ネイティブは素の標高、Webは誇張込み）。
 */

/** 標高の引き方。読み込み前などで引けない点はnull（その点は判定しない） */
export type ElevationSampler = (latitude: number, longitude: number) => number | null;

export interface SightPoint {
  latitude: number;
  longitude: number;
  /** 標高（ElevationSamplerと同じ単位） */
  altitude: number;
}

/**
 * 視線を調べる点。足元の斜面や手前の尾根が遠くの山を隠すことが多いので、
 * 近くほど細かい対数間隔の点を取り、山の手前の尾根も拾えるよう等間隔の点も混ぜる
 */
const SIGHT_FIRST_M = 10;
const SIGHT_LOG_SAMPLES = 48;
const SIGHT_UNIFORM_SAMPLES = 32;

/** 目標のすぐ手前で、遮蔽とみなさない範囲（固定[m]と距離に対する比の大きい方） */
export interface TargetSlack {
  meters: number;
  ratio: number;
}

/**
 * 山頂のすぐ手前の地形は遮蔽とみなさない。
 * 見る向きによっては、山頂は同じ山の肩や火口縁（富士山を北東から見たときの白山岳）の
 * わずかに奥にあり、厳密には隠れている。山名としては「その山が見えていれば出す」べきなので
 * そこは見逃す。遠くの山はDEMが粗く山頂が丸く描かれるので、比で広げる
 */
export const SUMMIT_SLACK: TargetSlack = { meters: 300, ratio: 0.04 };

/**
 * 視線より地形がこれ以上高ければ隠れているとみなす（固定[m]＋距離に対する比）。
 * DEMの補間の誤差で、稜線上にちょうど乗っている山頂が消えないよう少し甘くする
 */
const SIGHT_TOLERANCE_M = 3;
const SIGHT_TOLERANCE_RATIO = 0.0005;

/** 視線上で調べる位置（0=目、1=目標）。目標の手前の見逃す範囲は含めない */
export const sightSamples = (distanceM: number, slack: TargetSlack = SUMMIT_SLACK): number[] => {
  if (distanceM <= SIGHT_FIRST_M) return [];
  const lastT = 1 - Math.max(slack.meters, distanceM * slack.ratio) / distanceM;
  const result: number[] = [];
  const ratio = distanceM / SIGHT_FIRST_M;
  for (let i = 0; i < SIGHT_LOG_SAMPLES; i++) {
    const t = (SIGHT_FIRST_M * Math.pow(ratio, i / SIGHT_LOG_SAMPLES)) / distanceM;
    if (t <= lastT) result.push(t);
  }
  for (let i = 1; i < SIGHT_UNIFORM_SAMPLES; i++) {
    const t = i / SIGHT_UNIFORM_SAMPLES;
    if (t <= lastT) result.push(t);
  }
  return result;
};

/**
 * 目から目標（山頂や調査地点）への視線が地形に遮られているか。
 *
 * @param distanceM 目から目標までの水平距離[m]
 * @param altitudeScale 標高の単位が誇張込みなら、その倍率（許容差を合わせる）
 * @param slack 目標の手前で見逃す範囲。既定は山頂用（山の肩・火口縁を遮蔽とみなさない）
 */
export const isSightBlocked = (
  sample: ElevationSampler,
  eye: SightPoint,
  summit: SightPoint,
  distanceM: number,
  altitudeScale = 1,
  slack: TargetSlack = SUMMIT_SLACK
): boolean => {
  for (const t of sightSamples(distanceM, slack)) {
    const ground = sample(
      eye.latitude + (summit.latitude - eye.latitude) * t,
      eye.longitude + (summit.longitude - eye.longitude) * t
    );
    if (ground === null) continue;
    const sight = eye.altitude + (summit.altitude - eye.altitude) * t;
    const tolerance = (SIGHT_TOLERANCE_M + distanceM * t * SIGHT_TOLERANCE_RATIO) * altitudeScale;
    if (ground - sight > tolerance) return true;
  }
  return false;
};
