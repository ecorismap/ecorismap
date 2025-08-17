import React from 'react';
import {
  DrawToolType,
  FeatureButtonType,
  LayerType,
  RecordType,
  PointToolType,
  LineToolType,
  PolygonToolType,
} from '../types';
import { Position } from 'geojson';

// Drawing line data structure
export interface DrawLineData {
  id: string;
  coordinates: Position[];
  timestamp: number;
}

// Select line data structure
export interface SelectLineData {
  selectedIndex: number | null;
  coordinates: Position[];
}

// Drawing state interface
export interface DrawingState {
  isEditingDraw: boolean;
  isEditingObject: boolean;
  isSelectedDraw: boolean;
  isEditingLine: boolean;
  editingLineId: string | undefined;
}

// Current tools interface
export interface CurrentTools {
  featureButton: FeatureButtonType;
  currentDrawTool: DrawToolType;
  currentPointTool: PointToolType;
  currentLineTool: LineToolType;
  currentPolygonTool: PolygonToolType;
}

// Drag event interface
export interface DragEndEvent {
  nativeEvent: {
    coordinate: {
      latitude: number;
      longitude: number;
    };
  };
  lngLat?: {
    lng: number;
    lat: number;
  };
}

export interface DrawingToolsContextType {
  // Drawing states (grouped for better memoization)
  drawingState: DrawingState;

  // Current tools (grouped for better memoization)
  currentTools: CurrentTools;

  // Tool actions (stable references)
  selectFeatureButton: (value: FeatureButtonType) => void;
  selectDrawTool: (value: DrawToolType) => void;
  setPointTool: React.Dispatch<React.SetStateAction<PointToolType>>;
  setLineTool: React.Dispatch<React.SetStateAction<LineToolType>>;
  setPolygonTool: React.Dispatch<React.SetStateAction<PolygonToolType>>;

  // Drawing actions (stable references)
  onDragEndPoint: (e: DragEndEvent, layer: LayerType, feature: RecordType) => Promise<void>;
  pressUndoDraw: () => Promise<void>;
  pressSaveDraw: () => Promise<void>;
  pressDeleteDraw: () => Promise<void>;
  finishEditObject: () => boolean;
  resetDrawTools: () => void;

  // Backward compatibility (to be deprecated gradually)
  isEditingDraw: boolean;
  isEditingObject: boolean;
  isSelectedDraw: boolean;
  isEditingLine: boolean;
  editingLineId: string | undefined;
  featureButton: FeatureButtonType;
  currentDrawTool: DrawToolType;
  currentPointTool: PointToolType;
  currentLineTool: LineToolType;
  currentPolygonTool: PolygonToolType;
}

export const DrawingToolsContext = React.createContext<DrawingToolsContextType>({} as DrawingToolsContextType);
