/**
 * 通常3D・リプレイで、視点が地形の中へ入らないようにする持ち上げ量（V-M2）。
 *
 * orbitカメラの視点は「注視点の高さ＋distance·cos(pitch)」にあり、視点の真下の地形とは
 * 比べていない。大きく傾けて下り斜面側を向くと、背後の登り斜面に視点が埋まり、
 * 手前の地形が裏面カリングで抜け、画面中央のタップも交点が取れなくなる。
 * maplibreと同じく、視点の真下の地表より低ければ注視点ごと持ち上げる（ピッチは変えない）
 */

/** 地表からの最低余裕を、ニア面（注視点距離の2%）の何倍にするか。ニア面で足元が切れない幅を取る */
const CLEARANCE_NEAR_PLANE_RATIO = 2;
/** 地表からの最低余裕の下限[ローカル座標m] */
const MIN_CLEARANCE = 10;

/**
 * 視点の地表からの最低余裕[ローカル座標m]。近づくほど小さく、遠いほど大きくする
 * @param distance 注視点からの距離[メルカトルm]
 */
export const cameraClearance = (distance: number): number =>
  Math.max(MIN_CLEARANCE, Math.max(1, distance * 0.02) * CLEARANCE_NEAR_PLANE_RATIO);

/**
 * 注視点の標高に足す持ち上げ量[m]（0以上）。
 *
 * @param targetElevationM 注視点の標高[m]
 * @param groundAtEyeM 視点の真下の標高[m]（取れなければnull＝持ち上げない）
 * @param distance 注視点からの距離[メルカトルm]
 * @param pitchDeg 俯角[度]（0=真上から、90=水平）
 * @param elevScale 標高→ローカル座標の倍率
 */
export const cameraLiftMeters = (
  targetElevationM: number,
  groundAtEyeM: number | null,
  distance: number,
  pitchDeg: number,
  elevScale: number
): number => {
  if (groundAtEyeM === null || elevScale <= 0) return 0;
  const eyeY = targetElevationM * elevScale + distance * Math.cos((pitchDeg * Math.PI) / 180);
  const requiredY = groundAtEyeM * elevScale + cameraClearance(distance);
  return Math.max(0, (requiredY - eyeY) / elevScale);
};
