import { createContext } from 'react';
import { LayerType } from '../types';

interface LayersContextType {
  layers: LayerType[];
  filterdLayers: LayerType[];
  changeExpand: (layer: LayerType) => void;
  changeVisible: (visible: boolean, layer: LayerType) => void;
  changeLabel: (layer: LayerType, labelValue: string) => void;
  changeCustomLabel: (layer: LayerType, labelValue: string) => void;
  changeActiveLayer: (layer: LayerType) => void;
  pressLayerOrder: (layer: LayerType, direction: 'up' | 'down') => void;
  gotoLayerEdit: (layer: LayerType) => void;
  gotoColorStyle: (layer: LayerType) => void;
  gotoData: (layer: LayerType) => void;
  gotoLayerEditForAdd: () => void;
  pressImportLayerAndData: () => Promise<void>;
  updateLayersOrder: (data: LayerType[], from: number, to: number) => void;
  onDragBegin: (layer: LayerType) => void;
}
export const LayersContext = createContext({} as LayersContextType);
