/**
 * 3D表示中のカメラ操作ボタン（回転・傾き）。
 * ピンチ回転・2本指チルトのジェスチャが使えない場面（片手操作等）向けの補助UI。
 * mapViewRefに差し込まれたTerrain3DHandle経由でカメラを動かす。
 */
import React, { useCallback, useContext } from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { MapViewContext } from '../../contexts/MapView';
import { isTerrain3DHandle } from '../../utils/terrain3d/types';

interface Props {
  top: number;
  left: number;
}

const ROTATE_STEP_DEG = 30;
const PITCH_STEP_DEG = 20;

export const HomeTerrain3DButtons = React.memo((props: Props) => {
  const { top, left } = props;
  const { mapViewRef } = useContext(MapViewContext);

  const withHandle = useCallback(
    (action: 'rotateLeft' | 'rotateRight' | 'pitchUp' | 'pitchDown') => {
      const handle = mapViewRef.current;
      if (!isTerrain3DHandle(handle)) return;
      if (action === 'rotateLeft') handle.rotateBy(-ROTATE_STEP_DEG);
      else if (action === 'rotateRight') handle.rotateBy(ROTATE_STEP_DEG);
      else if (action === 'pitchUp') handle.pitchBy(-PITCH_STEP_DEG);
      else handle.pitchBy(PITCH_STEP_DEG);
    },
    [mapViewRef]
  );

  const buttons: { key: 'rotateLeft' | 'rotateRight' | 'pitchUp' | 'pitchDown'; icon: string }[] = [
    { key: 'rotateLeft', icon: 'axis-z-rotate-counterclockwise' },
    { key: 'rotateRight', icon: 'axis-z-rotate-clockwise' },
    { key: 'pitchUp', icon: 'axis-x-rotate-counterclockwise' },
    { key: 'pitchDown', icon: 'axis-x-rotate-clockwise' },
  ];

  return (
    <View style={[styles.container, { top, left }]}>
      {buttons.map((button) => (
        <Pressable key={button.key} style={styles.button} onPress={() => withHandle(button.key)}>
          <MaterialCommunityIcons
            //@ts-ignore アイコン名はグリフマップに存在する
            name={button.icon}
            size={20}
            color={COLOR.BLACK}
            pointerEvents="none"
          />
        </Pressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: COLOR.WHITE,
    borderColor: COLOR.GRAY2,
    borderRadius: 5,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    marginBottom: 5,
    width: 30,
  },
  container: {
    elevation: 100,
    position: 'absolute',
    zIndex: 100,
  },
});
