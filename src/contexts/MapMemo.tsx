import { createContext } from 'react';
import { MapMemoToolType, PenWidthType } from '../types';
import { Position } from 'geojson';

export interface MapMemoLine {
  id?: string;
  xy: Position[];
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
  isModalMapMemoToolHidden: boolean;

  // Map memo actions
  selectMapMemoTool: (tool: MapMemoToolType | undefined) => void;
  setPenWidth: (width: PenWidthType) => void;
  setVisibleMapMemoColor: (visible: boolean) => void;
  setVisibleMapMemoPen: (visible: boolean) => void;
  setVisibleMapMemoStamp: (visible: boolean) => void;
  setVisibleMapMemoBrush: (visible: boolean) => void;
  setVisibleMapMemoEraser: (visible: boolean) => void;
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
  isModalMapMemoToolHidden: true,
  selectMapMemoTool: () => {},
  setPenWidth: () => {},
  setVisibleMapMemoColor: () => {},
  setVisibleMapMemoPen: () => {},
  setVisibleMapMemoStamp: () => {},
  setVisibleMapMemoBrush: () => {},
  setVisibleMapMemoEraser: () => {},
  selectPenColor: () => {},
  pressUndoMapMemo: () => {},
  pressRedoMapMemo: () => {},
  togglePencilMode: () => {},
});
