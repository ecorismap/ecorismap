import { createContext } from 'react';
import { LayerType, RecordType } from '../types';
import { SortOrderType } from '../utils/Data';

interface DataContextType {
  projectId: string | undefined;
  isOwnerAdmin: boolean;
  data: RecordType[];
  layer: LayerType;
  isChecked: boolean;
  checkList: boolean[];
  pressAddData: () => void;
  pressDeleteData: () => void;
  pressExportData: () => void;
  changeOrder: (colname: string, order: SortOrderType) => void;
  changeChecked: (index: number, checked: boolean) => void;
  changeCheckedAll: (checked: boolean) => void;
  changeVisible: (record: RecordType) => void;
  changeVisibleAll: (visible: boolean) => void;
  gotoDataEdit: (index: number) => void;
  gotoBack: () => void;
}
export const DataContext = createContext({} as DataContextType);
