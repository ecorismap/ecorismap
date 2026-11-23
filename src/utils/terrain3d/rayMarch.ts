/**
 * 画面のレイと地形の交点探し（three.js非依存の純TS）。
 *
 * 近い範囲（nearRangeT まで）は従来どおり等間隔で刻み、その先は描画している
 * ファー面（farT）まで、距離に比例して刻み幅を広げながら探す。
 * 眺望や傾けた3Dでは、ズームから決まる距離より先にも遠景リングの地形が描かれているので、
 * そこをタップ・長押ししても地点が取れるようにする。
 */
export type Vec3 = [number, number, number];

/** ローカル座標(x, z)の地表の高さ（elevScale適用後）。地形が無ければnull */
export type SurfaceHeightAt = (x: number, z: number) => number | null;

/** 近い範囲の刻み数（従来の等間隔探索と同じ） */
const NEAR_STEPS = 200;
/** 近い範囲より先の刻み幅（その距離に対する割合）。近い範囲の末尾の刻み幅と揃う */
const FAR_STEP_RATIO = 1 / NEAR_STEPS;
/** 遠方の刻みの上限回数（暴走防止） */
const MAX_FAR_STEPS = 2000;
const BISECTION_ITERATIONS = 20;

/**
 * @param nearRangeT 等間隔で探す距離。この範囲では地形が無い場所を0mとみなす（従来どおり）
 * @param farT 探す上限（描画のファー面）。nearRangeTより先では地形が無い場所は当たりにしない
 *   （描いていない場所を地点として返さない）
 * @returns 交点のレイ上の距離。当たらなければnull
 */
export const marchRayToTerrain = (
  eye: Vec3,
  dir: Vec3,
  heightAt: SurfaceHeightAt,
  nearRangeT: number,
  farT: number
): number | null => {
  if (!(nearRangeT > 0)) return null;
  const nearHeight = (x: number, z: number): number => heightAt(x, z) ?? 0;
  const isAbove = (t: number, near: boolean): boolean | null => {
    const x = eye[0] + dir[0] * t;
    const y = eye[1] + dir[1] * t;
    const z = eye[2] + dir[2] * t;
    if (near) return y - nearHeight(x, z) > 0;
    const h = heightAt(x, z);
    if (h === null) return null;
    return y - h > 0;
  };
  const bisect = (lo: number, hi: number, near: boolean): number => {
    let a = lo;
    let b = hi;
    for (let k = 0; k < BISECTION_ITERATIONS; k++) {
      const mid = (a + b) / 2;
      if (isAbove(mid, near) !== false) a = mid;
      else b = mid;
    }
    return b;
  };

  let prevT = 0;
  let prevAbove = isAbove(0, true) === true;
  for (let i = 1; i <= NEAR_STEPS; i++) {
    const t = (i / NEAR_STEPS) * nearRangeT;
    const above = isAbove(t, true) === true;
    if (prevAbove && !above) return bisect(prevT, t, true);
    prevAbove = above;
    prevT = t;
  }

  // 近い範囲の外: 地形が無い区間をまたいだら「地上」から数え直す
  let farPrevAbove: boolean | null = prevAbove;
  for (let n = 0; n < MAX_FAR_STEPS && prevT < farT; n++) {
    const t = Math.min(farT, prevT * (1 + FAR_STEP_RATIO));
    const above = isAbove(t, false);
    if (farPrevAbove === true && above === false) return bisect(prevT, t, false);
    farPrevAbove = above;
    prevT = t;
  }
  return null;
};
