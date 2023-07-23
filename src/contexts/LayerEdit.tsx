import { createContext } from 'react';
import { FeatureType, FormatType, LayerType } from '../types';

interface LayerEditContextType {
  layer: LayerType;
  isEdited: boolean;
  isNewLayer: boolean;
  onChangeLayerName: (val: string) => void;
  submitLayerName: () => void;
  onChangeFeatureType: (itemValue: FeatureType) => void;
  onChangeFieldOrder: (index: number) => void;
  onChangeFieldName: (index: number, val: string) => void;
  submitFieldName: (index: number) => void;
  onChangeFieldFormat: (index: number, itemValue: FormatType) => void;
  pressSaveLayer: () => void;
  pressDeleteField: (id: number) => void;
  pressAddField: () => void;
  pressDeleteLayer: () => void;
  gotoLayerEditFeatureStyle: () => void;
  gotoLayerEditFieldItem: (fieldIndex: number, fieldItem: LayerType['field'][0]) => void;
  gotoBack: () => void;
  pressExportLayer: () => void;
}

export const LayerEditContext = createContext({} as LayerEditContextType);
