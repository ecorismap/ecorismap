import { createContext } from 'react';
import { FormatType, LayerType } from '../types';

interface LayerEditFieldItemContextType {
  itemValues: { value: string; isOther: boolean }[];
  itemFormat: FormatType;
  pickerValues: string[];
  refLayerIds: LayerType['id'][];
  refLayerNames: LayerType['name'][];
  refFieldNames: string[];
  primaryFieldNames: string[];
  editable: boolean;
  changeValue: (index: number, value: string) => void;
  pressDeleteValue: (id: number) => void;
  pressAddValue: (other?: boolean) => void;
  gotoBack: () => void;
}
export const LayerEditFieldItemContext = createContext({} as LayerEditFieldItemContextType);
