import { createContext } from 'react';
import { ArrowStyleType, MapMemoToolGroupType, MapMemoToolType, PenWidthType } from '../types';
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
  penWidth: number;
  isPencilModeActive: boolean;
  isUndoable: boolean;
  isRedoable: boolean;
  mapMemoLines: MapMemoLine[];
  arrowStyle: ArrowStyleType;

  // Map memo actions
  selectMapMemoTool: (tool: MapMemoToolType | undefined) => void;
  setPenWidth: (width: PenWidthType) => void;
  setVisibleMapMemoColor: (visible: boolean) => void;
  //ツールボタン押下（選択中=解除、初回=設定タブを開く、以降=前回の種別で即選択）
  pressMapMemoToolButton: (group: MapMemoToolGroupType) => void;
  //設定モーダルを指定タブで開く（歯車ボタン用）
  openMapMemoSettingsTab: (tab: MapMemoToolGroupType) => void;
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
  penWidth: 1,
  isPencilModeActive: false,
  isUndoable: false,
  isRedoable: false,
  mapMemoLines: [],
  arrowStyle: 'NONE',
  selectMapMemoTool: () => {},
  setPenWidth: () => {},
  setVisibleMapMemoColor: () => {},
  pressMapMemoToolButton: () => {},
  openMapMemoSettingsTab: () => {},
  selectPenColor: () => {},
  pressUndoMapMemo: () => {},
  pressRedoMapMemo: () => {},
  togglePencilMode: () => {},
});
