import { createContext } from 'react';
import { LayerType, RecordType } from '../types';
import { SortOrderType } from '../utils/Data';

interface DataContextType {
  projectId: string | undefined;
  data: RecordType[];
  layer: LayerType;
  isChecked: boolean;
  checkList: { id: number; checked: boolean }[];
  isMapMemoLayer: boolean;
  sortedName: string;
  sortedOrder: SortOrderType;
  addDataByDictinary: (fieldId: string, value: string) => void;
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
  updateOwnRecordSetOrder: (allUserRecordSet_: RecordType[]) => void;
}
export const DataContext = createContext({} as DataContextType);
