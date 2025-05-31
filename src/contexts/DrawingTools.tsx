import React from 'react';
import { DrawToolType, FeatureButtonType, LayerType, RecordType } from '../types';

export interface DrawingToolsContextType {
  // Drawing states
  isEditingDraw: boolean;
  isEditingObject: boolean;
  isSelectedDraw: boolean;
  isEditingLine: boolean;
  editingLineId: string | undefined;
  drawLine: any;
  editingLine: any[];
  selectLine: any;

  // Current tools
  featureButton: FeatureButtonType;
  currentDrawTool: DrawToolType;
  currentPointTool: string;
  currentLineTool: 'PLOT_LINE' | 'FREEHAND_LINE' | 'SPLIT_LINE';
  currentPolygonTool: 'PLOT_POLYGON' | 'FREEHAND_POLYGON';

  // Tool actions
  selectFeatureButton: (value: FeatureButtonType) => void;
  selectDrawTool: (value: DrawToolType) => void;
  setPointTool: (value: any) => void;
  setLineTool: (value: any) => void;
  setPolygonTool: (value: any) => void;

  // Drawing actions
  onDragEndPoint: (e: any, layer: LayerType, feature: RecordType) => Promise<void>;
  pressUndoDraw: () => Promise<void>;
  pressSaveDraw: () => Promise<void>;
  pressDeleteDraw: () => Promise<void>;
}

export const DrawingToolsContext = React.createContext<DrawingToolsContextType>({} as DrawingToolsContextType);
