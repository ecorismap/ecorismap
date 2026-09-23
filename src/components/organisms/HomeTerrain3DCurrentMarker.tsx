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
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { MapViewContext } from '../../contexts/MapView';
import { LocationTrackingContext } from '../../contexts/LocationTracking';
import { TerrainScene } from '../../utils/terrain3d/TerrainScene';
import { CurrentMarkerKind, currentMarkerKind, screenMarkerAngle } from '../../utils/terrain3d/currentMarker';

interface Props {
  scene: TerrainScene | null;
}

/**
 * 投影の更新間隔[ms]。
 * 300点を投影するポイント（250ms・ジェスチャ中は停止）と違い、ここは1点だけなので
 * 細かく回してよい。操作中に現在地だけ取り残されると追従していないように見えるため、
 * ジェスチャ中も更新する
 */
const PROJECT_INTERVAL_MS = 100;

/** マーカー画像の表示サイズ[pt]。アセットは80x80(@1x)で2Dと同じ */
const MARKER_IMAGE_SIZE = 80;

const MARKER_IMAGES: Record<CurrentMarkerKind, number> = {
  red: require('../../assets/marker_red.png'),
  orange: require('../../assets/marker_orange.png'),
  gray: require('../../assets/marker_gray.png'),
};

interface Placement {
  x: number;
  y: number;
  angle: number;
}

/** 画面位置・角度が実質同じなら再レンダリングしない（0.5px/0.5度未満は見た目に出ない） */
const isSamePlacement = (prev: Placement | null, next: Placement): boolean =>
  prev !== null &&
  Math.abs(prev.x - next.x) < 0.5 &&
  Math.abs(prev.y - next.y) < 0.5 &&
  Math.abs(((prev.angle - next.angle + 540) % 360) - 180) < 0.5;

export const HomeTerrain3DCurrentMarker = React.memo(({ scene }: Props) => {
  const { currentLocation, azimuth, gpsState, isLocationStale } = useContext(MapViewContext);
  const { trackingState } = useContext(LocationTrackingContext);
  // 表示条件は2D（Home.tsxのCurrentMarker）と同じ
  const visible = (gpsState !== 'off' || trackingState !== 'off') && currentLocation !== null;

  const [placement, setPlacement] = useState<Placement | null>(null);

  // フレームリスナーから最新値を読むためのref（値が変わるたびに購読を張り直さない）
  const latestRef = useRef({ currentLocation, azimuth, visible });
  latestRef.current = { currentLocation, azimuth, visible };

  const update = useCallback(() => {
    const { currentLocation: location, azimuth: deg, visible: show } = latestRef.current;
    if (scene === null || !show || location === null) {
      setPlacement(null);
      return;
    }
    // 地形の裏・画面外・カメラ後方はnull。標高はドレープとまったく同じ関数を通る
    const screen = scene.projectToScreen(location.latitude, location.longitude);
    if (screen === null) {
      setPlacement(null);
      return;
    }
    // カメラの方位は描画に使っている状態から直接引く
    // （terrain3dHeadingStoreは1度・100msで間引いた通知用の値なので、ここでは使わない）
    const next: Placement = { x: screen.x, y: screen.y, angle: screenMarkerAngle(deg, scene.controller.getState().heading) };
    setPlacement((prev) => (isSamePlacement(prev, next) ? prev : next));
  }, [scene]);

  const updateRef = useRef(update);
  updateRef.current = update;

  // 購読はsceneにだけ紐づける（HomeTerrain3DPointsと同じ理由で、依存を増やすと
  // 張り直しのたびに末尾更新の予約が取り消される）
  useEffect(() => {
    if (scene === null) return;
    let lastUpdate = 0;
    let trailing: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = scene.addFrameListener(() => {
      const now = Date.now();
      // カメラが止まっているときの描画は、タイルや標高が新しくなった瞬間だけ。
      // 間引かず投影し直して、粗いDEMで置いた位置に取り残さない
      if (scene.cameraSettled) {
        if (trailing !== null) {
          clearTimeout(trailing);
          trailing = null;
        }
        lastUpdate = now;
        updateRef.current();
        return;
      }
      if (now - lastUpdate < PROJECT_INTERVAL_MS) {
        // 間引き中でも最後のフレームを取りこぼさないよう末尾更新を予約する
        if (trailing === null) {
          trailing = setTimeout(() => {
            trailing = null;
            lastUpdate = Date.now();
            updateRef.current();
          }, PROJECT_INTERVAL_MS);
        }
        return;
      }
      lastUpdate = now;
      updateRef.current();
    });
    updateRef.current();
    return () => {
      if (trailing !== null) clearTimeout(trailing);
      unsubscribe();
    };
  }, [scene]);

  // 位置・方位が届いたときの即時反映。
  // カメラが静止しているとフレームは描かれない（dirty時のみ描画）ので、
  // フレームリスナー任せにすると現在地が動いてもマーカーが動かない
  useEffect(() => {
    updateRef.current();
  }, [currentLocation, azimuth, visible]);

  const kind = currentMarkerKind(currentLocation?.accuracy, isLocationStale);
  // 幅0のアンカーを投影座標に置き、画像を絶対配置で中央合わせする。
  // 位置はtransformではなくleft/topで与える（サイズ0Viewのtransform更新は画面に反映されない）。
  // 回転は実寸のある画像側のtransformなので、この制約に当たらない
  const anchorStyle = useMemo(
    () => (placement === null ? null : [styles.anchor, { left: placement.x, top: placement.y }]),
    [placement]
  );
  const imageStyle = useMemo(
    () => (placement === null ? null : [styles.image, { transform: [{ rotate: `${placement.angle}deg` }] }]),
    [placement]
  );

  if (placement === null || anchorStyle === null || imageStyle === null) return null;
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
