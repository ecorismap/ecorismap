/* eslint-disable react-native/no-color-literals */
/**
 * 3D描画の計測値表示（開発ビルドのみ）。
 *
 * 実機ではMetroのコンソールを見られない場面が多いため、fps・JS時間・GPU待ち・
 * ドロップフレーム・DEMデコード枚数を画面に出す。外部ストア購読なので、
 * 更新してもこのコンポーネントの外は再レンダリングされない。
 */
import React, { useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { terrain3dPerfStore } from '../../utils/terrain3d/perfStore';

export const HomeTerrain3DPerf = React.memo(() => {
  const text = useSyncExternalStore(terrain3dPerfStore.subscribe, terrain3dPerfStore.getSnapshot);
  if (!__DEV__ || text === '') return null;
  return (
    <View style={styles.container} pointerEvents="none">
      <Text style={styles.text}>{text}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 4,
    padding: 6,
    position: 'absolute',
    right: 8,
    top: 150,
  },
  text: {
    color: '#fff',
    fontFamily: 'Courier',
    fontSize: 10,
  },
});
