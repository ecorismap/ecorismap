/**
 * 軌跡リプレイの進行位置の計算。
 *
 * 進みかたは「距離基準」にする。タイムスタンプ基準だと休憩でカメラが止まり、
 * 移動中は飛ぶように進むため、一定時間で全体を見せる再生には向かない。
 * GPU・React非依存の純関数（jestでテスト可能）。
 */
import { ElevationProfilePoint } from './trackStatistics';

/** 全体を走破する時間[ms]。距離や実際の所要時間には依らない */
export const REPLAY_DURATION_MS = 30000;

export interface ReplayPosition {
  latitude: number;
  longitude: number;
  altitude: number;
  /** 進行方位[度]（0=北、時計回り。3Dカメラのheadingと同じ定義） */
  bearing: number;
  /** 最も近いプロファイル点（グラフのカーソル位置に使う） */
  index: number;
}

/** 2点間の方位[度]。メルカトル平面での向きなので、緯度による東西の縮みを補正する */
export const bearingBetween = (
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): number => {
  const latRad = ((from.latitude + to.latitude) / 2) * (Math.PI / 180);
  const east = (to.longitude - from.longitude) * Math.cos(latRad);
  const north = to.latitude - from.latitude;
  if (east === 0 && north === 0) return 0;
  const deg = (Math.atan2(east, north) * 180) / Math.PI;
  return (deg + 360) % 360;
};

/**
 * 進行割合から位置・方位を求める。
 *
 * プロファイルは最大300点に間引かれているので、点をそのまま辿るとカクつく。
 * 累積距離で前後2点を線形補間して連続的に進める。
 *
 * @param progress 0..1（全体距離に対する割合）
 * @returns 点が2つ未満、または全長0の軌跡ならnull
 */
export const interpolateProfileAt = (profile: ElevationProfilePoint[], progress: number): ReplayPosition | null => {
  if (profile.length < 2) return null;
  const total = profile[profile.length - 1].distanceKm;
  if (!(total > 0)) return null;

  const targetKm = Math.max(0, Math.min(1, progress)) * total;
  // 累積距離は単調増加なので二分探索でよい（targetKm以下の最後の点を探す）
  let lo = 0;
  let hi = profile.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (profile[mid].distanceKm <= targetKm) lo = mid;
    else hi = mid;
  }
  const from = profile[lo];
  const to = profile[lo + 1] ?? profile[lo];
  const span = to.distanceKm - from.distanceKm;
  const t = span > 0 ? (targetKm - from.distanceKm) / span : 0;

  return {
    latitude: from.latitude + (to.latitude - from.latitude) * t,
    longitude: from.longitude + (to.longitude - from.longitude) * t,
    altitude: from.altitude + (to.altitude - from.altitude) * t,
    bearing: bearingBetween(from, to),
    // カーソルは近い方の点に寄せる（グラフの表示が進行と半点ぶんずれないように）
    index: t < 0.5 ? lo : Math.min(profile.length - 1, lo + 1),
  };
};
