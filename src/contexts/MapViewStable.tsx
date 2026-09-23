import React from 'react';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl/maplibre';
import { MapLocationInfoType } from '../types';

/**
 * MapViewContextのうち、位置・方位の更新で変化しない部分だけを切り出したコンテキスト。
 *
 * MapViewContextはcurrentLocation/azimuth/gpsStateを含むため、GPS受信のたび（最大5Hz）に
 * 値が作り直され、購読側はReact.memoでも再レンダリングされる。3D地形ビューのように
 * 自前の描画ループをJSスレッドで回すコンポーネントではこれがフレーム落ちに直結するため、
 * 安定値だけをこちらから受け取る。
 */
export interface MapViewStableContextType {
  mapViewRef: React.RefObject<MapView | MapRef | null>;
  /** 整数ズーム（タイル選択・線幅計算用） */
  zoom: number;
  zoomDecimal: number;
  onDragMapView: () => void;
  /** 長押しメニュー（HomePoiPopup）の表示位置と地点。3Dの長押しからも使う */
  setMapLocationInfo: React.Dispatch<React.SetStateAction<MapLocationInfoType | null>>;
}

export const MapViewStableContext = React.createContext<MapViewStableContextType>({} as MapViewStableContextType);
