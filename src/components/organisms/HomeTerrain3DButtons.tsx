/**
 * 3D表示中のカメラ操作ボタン（回転・傾き）。
 * ピンチ回転・2本指チルトのジェスチャが使えない場面（片手操作等）向けの補助UI。
 * mapViewRefに差し込まれたTerrain3DHandle経由でカメラを動かす。
 * 見た目はズームボタンと同じ半透明の青い縦長パネルにまとめ、左側のボタン群と揃える。
 */
import React, { useCallback, useContext, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { MapViewContext } from '../../contexts/MapView';
import { isTerrain3DHandle, Terrain3DHandle } from '../../utils/terrain3d/types';
import { terrain3dVistaStore } from '../../utils/terrain3d/vistaStore';

interface Props {
  top: number;
  left: number;
}

/** 1回の押下で回す角度。眺望中は「その場で首を振る」操作になるので細かく刻む */
const ROTATE_STEP_DEG = 15;
const PITCH_STEP_DEG = 20;

export const HomeTerrain3DButtons = React.memo((props: Props) => {
  const { top, left } = props;
  const { mapViewRef } = useContext(MapViewContext);
  // 眺望の状態はストア購読（描画ループを持つHomeTerrain3Dを再レンダリングさせない）
  const vista = useSyncExternalStore(terrain3dVistaStore.subscribe, terrain3dVistaStore.getSnapshot);

  const withHandle = useCallback(
    (run: (handle: Terrain3DHandle) => void) => {
      const handle = mapViewRef.current;
      if (!isTerrain3DHandle(handle)) return;
      run(handle);
    },
    [mapViewRef]
  );

  // アイコンは「画面上の地面がどちらへ回るか」を表す（眺望中も同じ）。
  // rotateByはカメラの向き（heading）を動かすので符号が裏返る:
  // headingを増やす＝視線が東へ振れる＝画面上の地図は反時計回りに回る。
  // 傾きも同じ考え方で、pitchを増やす（視線を寝かせる）と地面は
  // axis-x-rotate-counterclockwiseの矢印の向きに回って見える（実機で逆だったため入れ替えた）
  const buttons: { key: string; icon: string; run: (handle: Terrain3DHandle) => void }[] = [
    { key: 'rotateCcw', icon: 'axis-z-rotate-counterclockwise', run: (h) => h.rotateBy(ROTATE_STEP_DEG) },
    { key: 'rotateCw', icon: 'axis-z-rotate-clockwise', run: (h) => h.rotateBy(-ROTATE_STEP_DEG) },
    { key: 'pitchCcw', icon: 'axis-x-rotate-counterclockwise', run: (h) => h.pitchBy(PITCH_STEP_DEG) },
    { key: 'pitchCw', icon: 'axis-x-rotate-clockwise', run: (h) => h.pitchBy(-PITCH_STEP_DEG) },
  ];

  return (
    <View style={[styles.container, { top, left }]}>
      {buttons.map((button) => (
        <Pressable key={button.key} style={styles.button} onPress={() => withHandle(button.run)}>
          <MaterialCommunityIcons
            //@ts-ignore アイコン名はグリフマップに存在する
            name={button.icon}
            size={20}
            color={COLOR.WHITE}
            pointerEvents="none"
          />
        </Pressable>
      ))}
      {/* 眺望中だけ、立つ高さ（地上からの視点の高さ）を上下できるようにする */}
      {vista.active && (
        <>
          <Pressable style={styles.button} onPress={() => withHandle((h) => h.changeVistaHeight(1))}>
            <MaterialCommunityIcons name="arrow-up" size={20} color={COLOR.WHITE} pointerEvents="none" />
          </Pressable>
          <View style={styles.height}>
            <Text style={styles.heightText}>{formatHeight(vista.heightM)}</Text>
          </View>
          <Pressable style={styles.button} onPress={() => withHandle((h) => h.changeVistaHeight(-1))}>
            <MaterialCommunityIcons name="arrow-down" size={20} color={COLOR.WHITE} pointerEvents="none" />
          </Pressable>
        </>
      )}
    </View>
  );
});

/** 1.7mは小数、それ以上は整数で表示する */
const formatHeight = (heightM: number): string =>
  `${Number.isInteger(heightM) ? heightM : heightM.toFixed(1)}m`;

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 38,
  },
  // ズームボタン（HomeZoomButton）と同じパネル
  container: {
    alignItems: 'center',
    backgroundColor: COLOR.ALFABLUE,
    borderRadius: 10,
    elevation: 100,
    paddingVertical: 2,
    position: 'absolute',
    width: 38,
    zIndex: 100,
  },
  height: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  heightText: {
    color: COLOR.WHITE,
    fontSize: 10,
  },
});
