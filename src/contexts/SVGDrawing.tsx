import React, { createContext } from 'react';
import { Position } from 'geojson';
import { DrawLineType } from '../types';

// SVG描画専用のコンテキスト（RefObjectを含むため、メモ化しない）
export interface SVGDrawingContextType {
  // Drawing tools SVG data
  drawLine: React.RefObject<DrawLineType[]>;
  editingLine: React.RefObject<Position[]>;
  selectLine: React.RefObject<Position[]>;

  // MapMemo SVG data
  mapMemoEditingLine: Position[];
  isPencilTouch: boolean | undefined;
}

export const SVGDrawingContext = createContext({} as SVGDrawingContextType);
