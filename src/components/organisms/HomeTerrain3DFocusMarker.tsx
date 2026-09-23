/**
 * 3D表示中の軌跡フォーカスマーカー。
 *
 * 軌跡サマリーの標高グラフをなぞったとき（およびリプレイ中）に、その地点を
 * 地形上に示す。2DのHomeTrackFocusMarkerと同じ見た目で、投影だけ3D用に差し替えたもの。
 */
import React, { useContext, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { TrackFocusContext } from '../../contexts/TrackFocus';
import { useTerrain3DProjection } from '../../hooks/useTerrain3DProjection';
import { TerrainScene } from '../../utils/terrain3d/TerrainScene';

interface Props {
  scene: TerrainScene | null;
}

/**
 * 投影の更新間隔[ms]。リプレイ中はこの間隔で地形上を滑っていくので、
 * 現在地マーカーと同じく細かめにする（1点だけなので負荷は無視できる）
 */
const PROJECT_INTERVAL_MS = 100;

const DOT_SIZE = 16;

export const HomeTerrain3DFocusMarker = React.memo(({ scene }: Props) => {
  const { trackFocusPoint } = useContext(TrackFocusContext);
  const screen = useTerrain3DProjection(scene, trackFocusPoint, PROJECT_INTERVAL_MS);

  // 位置はtransformではなくleft/topで与える（サイズ0Viewのtransform更新は画面に反映されない）
  const anchorStyle = useMemo(
    () => (screen === null ? null : [styles.anchor, { left: screen.x, top: screen.y }]),
    [screen]
  );

  if (screen === null || anchorStyle === null) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={anchorStyle}>
        <View style={styles.dot} />
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
  dot: {
    backgroundColor: COLOR.ORANGE,
    borderColor: COLOR.WHITE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2.5,
    height: DOT_SIZE,
    left: -DOT_SIZE / 2,
    position: 'absolute',
    top: -DOT_SIZE / 2,
    width: DOT_SIZE,
  },
});
