import { createContext } from 'react';
import { FormatType, LayerType } from '../types';

interface LayerEditFieldItemContextType {
  isLoading: boolean;
  dictionaryData: string[];
  itemValues: { value: string; isOther: boolean; customFieldValue: string }[];
  itemFormat: FormatType;
  pickerValues: string[];
  refLayerIds: LayerType['id'][];
  refLayerNames: LayerType['name'][];
  refFieldNames: string[];
  primaryFieldNames: string[];
  refFieldValues: string[];
  primaryFieldValues: string[];
  customFieldReference: string;
  customFieldPrimary: string;
  useLastValue: boolean;
  codeFieldId: string;
  codeFieldIds: string[];
  codeFieldNames: string[];
  changeUseLastValue: (value: boolean) => void;
  changeCodeFieldId: (value: string) => void;
  changeCodeValue: (index: number, value: string) => void;
  changeCustomFieldReference: (value: string) => void;
  changeCustomFieldPrimary: (value: string) => void;
  changeValue: (index: number, value: string) => void;
  pressDeleteValue: (id: number) => void;
  pressAddValue: (other?: boolean) => void;
  gotoBack: () => void;
  pressListOrder: (index: number) => void;
  pressImportDictionary: () => void;
}
export const LayerEditFieldItemContext = createContext({} as LayerEditFieldItemContextType);
