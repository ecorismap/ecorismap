import { createContext } from 'react';
import { ArrowStyleType, MapMemoToolType, PenWidthType } from '../types';
import { Position } from 'geojson';

export interface MapMemoLine {
  id?: string;
  latlon: Position[];
  strokeColor: string;
  strokeWidth: number;
  strokeStyle?: string;
  stamp?: string;
}

export interface MapMemoContextType {
  // Map memo tools
  currentMapMemoTool: MapMemoToolType;
  visibleMapMemoColor: boolean;
  currentPenWidth: PenWidthType;
  penColor: string;
  //色ピッカーの初期色。単一オブジェクト選択中はそのオブジェクトの色（プロパティパネル方式）
  colorPickerColor: string;
  penWidth: number;
  isPencilModeActive: boolean;
  isUndoable: boolean;
  isRedoable: boolean;
  mapMemoLines: MapMemoLine[];
  arrowStyle: ArrowStyleType;
  setArrowStyle: (style: ArrowStyleType) => void;
  //ペンの描き方（true=直線、false=曲線）。メモはツールバーのボタンで切り替える
  isStraightStyle: boolean;
  setIsStraightStyle: (value: boolean) => void;

  // Map memo actions
  selectMapMemoTool: (tool: MapMemoToolType | undefined) => void;
  setPenWidth: (width: PenWidthType) => void;
  setVisibleMapMemoColor: (visible: boolean) => void;
  selectPenColor: (hue: number, sat: number, val: number, alpha: number) => void;
  pressUndoMapMemo: () => void;
  pressRedoMapMemo: () => void;
  togglePencilMode: () => void;
}

export const MapMemoContext = createContext<MapMemoContextType>({
  currentMapMemoTool: 'NONE',
  visibleMapMemoColor: false,
  currentPenWidth: 'PEN_THIN',
  penColor: '#000000',
  colorPickerColor: '#000000',
  penWidth: 1,
  isPencilModeActive: false,
  isUndoable: false,
  isRedoable: false,
  mapMemoLines: [],
  arrowStyle: 'NONE',
  setArrowStyle: () => {},
  isStraightStyle: false,
  setIsStraightStyle: () => {},
  selectMapMemoTool: () => {},
  setPenWidth: () => {},
  setVisibleMapMemoColor: () => {},
  selectPenColor: () => {},
  pressUndoMapMemo: () => {},
  pressRedoMapMemo: () => {},
  togglePencilMode: () => {},
});
