/**
 * コンパス盤面の表示元を切り替えるラッパー。
 *
 * 3D中と、2Dで地図を手で回しているときは、磁気センサーの方位ではなくカメラの方位を盤面に出す。カメラ方位は描画フレーム毎に
 * 更新されるため、Homeページのstateで持つとページツリー全体が高頻度で再レンダリングされ、
 * 同じJSスレッドで回る3Dの描画ループとジェスチャを阻害する。外部ストアを
 * useSyncExternalStoreで購読し、再レンダリングをこのコンポーネントに閉じ込める。
 */
import React, { useSyncExternalStore } from 'react';
import { HomeCompassButton } from './HomeCompassButton';
import { terrain3dHeadingStore } from '../../utils/terrain3d/headingStore';
import { isMapRotated, mapHeadingStore } from '../../utils/mapHeadingStore';

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
  const mapHeading = useSyncExternalStore(mapHeadingStore.subscribe, mapHeadingStore.getSnapshot);
  // 2Dでも手で回した地図では3Dと同じく盤面を地図の方位に合わせる（Nが画面上の北を指す）。
  // 北が上のときは従来どおり端末の向きに追従させる
  const shownAzimuth = isTerrainActive
    ? terrainHeading
    : !rest.headingUp && isMapRotated(mapHeading)
    ? mapHeading
    : azimuth;
  return <HomeCompassButton azimuth={shownAzimuth} {...rest} />;
});
