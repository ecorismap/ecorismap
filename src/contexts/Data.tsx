import { createContext } from 'react';
import { FormatType, LayerType, RecordType } from '../types';
import { SortOrderType } from '../utils/Data';

interface DataContextType {
  projectId: string | undefined;
  isOwnerAdmin: boolean;
  data: RecordType[];
  layer: LayerType;
  isChecked: boolean;
  checkList: boolean[];
  sortedOrder: SortOrderType;
  sortedName: string;

  pressAddData: () => void;
  pressDeleteData: () => void;
  pressExportData: () => void;
  changeOrder: (colname: string, format: FormatType | '_user_') => void;
  changeChecked: (index: number, checked: boolean) => void;
  changeVisible: (index: number, visible: boolean) => void;
  gotoDataEdit: (index: number) => void;
  gotoBack: () => void;
}
export const DataContext = createContext({} as DataContextType);
