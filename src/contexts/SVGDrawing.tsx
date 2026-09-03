import React, { createContext } from 'react';
import { Position } from 'geojson';
import { DrawLineType } from '../types';
import type MapView from 'react-native-maps';
import type { MapRef } from 'react-map-gl/maplibre';

// SVG描画専用のコンテキスト（RefObjectを含むため、メモ化しない）
export interface SVGDrawingContextType {
  // Drawing tools SVG data
  drawLine: React.RefObject<DrawLineType[]>;
  editingLine: React.RefObject<Position[]>;
  selectLine: React.RefObject<Position[]>;

  // MapMemo SVG data
  //スタンプ・ブラシのプレビュー（スクリーン座標）
  mapMemoEditingLine: Position[];
  //ペン・消しゴムのストローク（緯度経度）。表示時に再投影する
  mapMemoEditingLineLatLon: Position[];
  //緯度経度→スクリーン座標の再投影に使う（Webはproject/unproject）
  mapViewRef: MapView | MapRef | null;
  isPencilTouch: boolean | undefined;
}

export const SVGDrawingContext = createContext({} as SVGDrawingContextType);
