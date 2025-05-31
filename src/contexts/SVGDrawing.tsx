import React, { createContext } from 'react';
import { Position } from 'geojson';
import { DrawLineType } from '../types';

// SVG描画専用のコンテキスト（MutableRefObjectを含むため、メモ化しない）
export interface SVGDrawingContextType {
  // Drawing tools SVG data
  drawLine: React.MutableRefObject<DrawLineType[]>;
  editingLine: React.MutableRefObject<Position[]>;
  selectLine: React.MutableRefObject<Position[]>;

  // MapMemo SVG data
  mapMemoEditingLine: Position[];
  isPencilTouch: boolean | undefined;
}

export const SVGDrawingContext = createContext({} as SVGDrawingContextType);
