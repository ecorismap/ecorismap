/**
 * コンパス盤面の表示元を切り替えるラッパー。
 *
 * 3D中は磁気センサーの方位ではなくカメラの方位を盤面に出す。カメラ方位は描画フレーム毎に
 * 更新されるため、Homeページのstateで持つとページツリー全体が高頻度で再レンダリングされ、
 * 同じJSスレッドで回る3Dの描画ループとジェスチャを阻害する。外部ストアを
 * useSyncExternalStoreで購読し、再レンダリングをこのコンポーネントに閉じ込める。
 */
import React, { useSyncExternalStore } from 'react';
import { HomeCompassButton } from './HomeCompassButton';
import { terrain3dHeadingStore } from '../../utils/terrain3d/headingStore';

interface Props {
  /** 磁気センサー由来の方位（2D時に使う） */
  azimuth: number;
  /** 3D地形ビュー表示中か（trueならカメラ方位を使う） */
  isTerrainActive: boolean;
  headingUp: boolean;
  onPressCompass: () => void;
  onLongPressCompass: () => void;
}

export const HomeCompassRose = React.memo(({ azimuth, isTerrainActive, ...rest }: Props) => {
  const terrainHeading = useSyncExternalStore(terrain3dHeadingStore.subscribe, terrain3dHeadingStore.getSnapshot);
  return <HomeCompassButton azimuth={isTerrainActive ? terrainHeading : azimuth} {...rest} />;
});
