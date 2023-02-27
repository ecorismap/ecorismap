import { createContext } from 'react';
import { LayerType } from '../types';

interface LayersContextType {
  layers: LayerType[];
  changeVisible: (layer: LayerType) => void;
  changeLabel: (layer: LayerType, labelValue: string) => void;
  changeActiveLayer: (index: number) => void;
  pressLayerOrder: (index: number) => void;
  gotoLayerEdit: (layer: LayerType) => void;
  gotoColorStyle: (layer: LayerType) => void;
  gotoData: (layer: LayerType) => void;
  gotoLayerEditForAdd: () => void;
  pressImportLayerAndData: () => Promise<void>;
}
export const LayersContext = createContext({} as LayersContextType);
