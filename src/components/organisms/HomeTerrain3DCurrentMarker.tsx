/**
 * 3D表示中の現在地マーカー。
 *
 * 3Dシーンのカメラ行列で現在地をスクリーン座標へ投影し、2Dと同じマーカー画像を
 * 3Dキャンバスの上に重ねる（HomeTerrain3DPointsと同じ方式）。タッチは透過。
 *
 * 2Dとの違い:
 * - 精度円は出さない（地形に貼る楕円になり、3Dでは読み取りづらいため）
 * - 方角線も出さない（3D中はヘディングアップを使わないのでコンパス長押しの対象外）
 * - 画像は端末の方位からカメラの方位を引いた角度で回す（地図ごと回っているため）
 */
import React, { useContext, useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { MapViewContext } from '../../contexts/MapView';
import { LocationTrackingContext } from '../../contexts/LocationTracking';
import { useTerrain3DProjection } from '../../hooks/useTerrain3DProjection';
import { TerrainScene } from '../../utils/terrain3d/TerrainScene';
import { CurrentMarkerKind, currentMarkerKind, screenMarkerAngle } from '../../utils/terrain3d/currentMarker';

interface Props {
  scene: TerrainScene | null;
}

/**
 * 投影の更新間隔[ms]。
 * 300点を投影するポイント（250ms）と違い、ここは1点だけなので細かく回してよい
 */
const PROJECT_INTERVAL_MS = 100;

/** マーカー画像の表示サイズ[pt]。アセットは80x80(@1x)で2Dと同じ */
const MARKER_IMAGE_SIZE = 80;

const MARKER_IMAGES: Record<CurrentMarkerKind, number> = {
  red: require('../../assets/marker_red.png'),
  orange: require('../../assets/marker_orange.png'),
  gray: require('../../assets/marker_gray.png'),
};

export const HomeTerrain3DCurrentMarker = React.memo(({ scene }: Props) => {
  const { currentLocation, azimuth, gpsState, isLocationStale } = useContext(MapViewContext);
  const { trackingState } = useContext(LocationTrackingContext);
  // 表示条件は2D（Home.tsxのCurrentMarker）と同じ
  const visible = (gpsState !== 'off' || trackingState !== 'off') && currentLocation !== null;
  const screen = useTerrain3DProjection(scene, visible ? currentLocation : null, PROJECT_INTERVAL_MS);

  // カメラの方位は投影と同じフレームの値を使う
  // （terrain3dHeadingStoreは1度・100msで間引いた通知用の値なので、ここでは使わない）
  const angle = screenMarkerAngle(azimuth, screen?.cameraHeading ?? 0);
  const kind = currentMarkerKind(currentLocation?.accuracy, isLocationStale);

  // 幅0のアンカーを投影座標に置き、画像を絶対配置で中央合わせする。
  // 位置はtransformではなくleft/topで与える（サイズ0Viewのtransform更新は画面に反映されない）。
  // 回転は実寸のある画像側のtransformなので、この制約に当たらない
  const anchorStyle = useMemo(
    () => (screen === null ? null : [styles.anchor, { left: screen.x, top: screen.y }]),
    [screen]
  );
  const imageStyle = useMemo(() => [styles.image, { transform: [{ rotate: `${angle}deg` }] }], [angle]);

  if (screen === null || anchorStyle === null) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={anchorStyle}>
        <Image source={MARKER_IMAGES[kind]} style={imageStyle} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  anchor: {
    height: 0,
    position: 'absolute',
    width: 0,
  },
  image: {
    height: MARKER_IMAGE_SIZE,
    left: -MARKER_IMAGE_SIZE / 2,
    position: 'absolute',
    top: -MARKER_IMAGE_SIZE / 2,
    width: MARKER_IMAGE_SIZE,
  },
});
