import { ItemValue } from '@react-native-picker/picker/typings/Picker';
import { createContext } from 'react';
import { ColorRampType, ColorStyle, ColorTypesType, FeatureType } from '../types';

interface LayerEditFeatureStyleContextType {
  colorStyle: ColorStyle;
  colorTypes: ColorTypesType[];
  colorTypeLabels: string[];
  fieldNames: string[];
  colorRamps: ColorRampType[];
  colorRampLabels: string[];
  layerType: FeatureType;
  modalVisible: boolean;
  changeColorType: (itemValue: ItemValue, itemIndex: number) => void;
  changeTransparency: (value: number) => void;
  changeFieldName: (itemValue: ItemValue, itemIndex: number) => void;
  changeColorRamp: (itemValue: ItemValue, itemIndex: number) => void;
  changeValue: (index: number, value: string) => void;
  pressDeleteValue: (id: number) => void;
  pressAddValue: () => void;
  pressReloadValue: () => void;
  pressSelectSingleColor: () => void;
  pressSelectValueColor: (index: number) => void;
  pressSelectColorOK: (hue: number, sat: number, val: number) => void;
  pressSelectColorCancel: () => void;
  gotoBack: () => void;
}
export const LayerEditFeatureStyleContext = createContext({} as LayerEditFeatureStyleContextType);
