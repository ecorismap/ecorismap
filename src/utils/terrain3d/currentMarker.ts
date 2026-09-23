/**
 * 3D表示中の現在地マーカーの見た目を決める純関数（jestでテスト可能）。
 */

/**
 * 画面上でマーカー画像を回す角度[度]。
 *
 * 2Dは北が常に画面上（3D中はヘディングアップを使わない）なので、端末の方位
 * （azimuth）だけ回せばよかった。3Dはカメラ自体がheadingぶん回っているため、
 * その回転を差し引かないとマーカーだけが地図と別の方向を向く。
 * 俯角による傾きは無視してビルボード表示にする（2Dと同じ画像を同じ大きさで
 * 出す方が、寝かせて潰すより読み取りやすい）
 *
 * @param azimuthDeg 端末が向いている方位[度]（0=北、時計回り）
 * @param cameraHeadingDeg 3Dカメラの方位[度]（0=北が画面上、時計回り）
 */
export const screenMarkerAngle = (azimuthDeg: number, cameraHeadingDeg: number): number =>
  (((azimuthDeg - cameraHeadingDeg) % 360) + 360) % 360;

export type CurrentMarkerKind = 'red' | 'orange' | 'gray';

/** 精度が悪いとみなす閾値[m]（2DのHomeCurrentMarkerと同じ） */
const ACCURACY_GRAY_M = 30;
const ACCURACY_ORANGE_M = 15;

/**
 * 精度に応じたマーカー画像の種類。2D（HomeCurrentMarker.tsx）と同じ出し分け。
 * staleはキャッシュ由来の古い位置なので、精度に関わらず灰色にする
 */
export const currentMarkerKind = (accuracy: number | null | undefined, isStale: boolean): CurrentMarkerKind => {
  if (isStale) return 'gray';
  const value = accuracy ?? 0;
  if (value > ACCURACY_GRAY_M) return 'gray';
  if (value > ACCURACY_ORANGE_M) return 'orange';
  return 'red';
};
