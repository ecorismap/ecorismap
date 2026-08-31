import { createContext } from 'react';
import { LayerType, RecordType } from '../types';
import { SortOrderType } from '../utils/Data';

interface DataContextType {
  projectId: string | undefined;
  isOwnerAdmin: boolean;
  sortedRecordSet: RecordType[];
  layer: LayerType;
  isChecked: boolean;
  checkList: { id: number; checked: boolean }[];
  isMapMemoLayer: boolean;
  sortedName: string;
  sortedOrder: SortOrderType;
  isEditable: boolean;
  isExporting: boolean;
  isLocationEnabled: boolean;
  isLocationLocked: boolean;
  filterText: string;
  filterFieldName: string;
  isFiltering: boolean;
  setFilter: (text: string, fieldName: string) => void;
  clearFilter: () => void;
  getFieldCandidates: (fieldName: string) => string[];
  //絞り込みモーダル。undefinedなら閉じている。空文字は全フィールド横断、'_user_'はUser列
  filterTarget: string | undefined;
  openFilterDialog: (fieldName: string) => void;
  closeFilterDialog: () => void;
  applyFilter: (value: string, fieldName: string) => void;
  showOnlyFilteredRecords: () => void;
  addDataByDictionary: (fieldId: string, value: string) => void;
  pressAddData: () => void;
  pressToggleLocation: () => void;
  pressToggleLocationLock: () => void;
  pressDeleteData: () => void;
  pressExportData: () => void;
  changeOrder: (colname: string, order: SortOrderType) => void;
  changeChecked: (index: number, checked: boolean) => void;
  changeCheckedAll: (checked: boolean) => void;
  changeVisible: (record: RecordType) => void;
  changeVisibleAll: (visible: boolean) => void;
  gotoDataEdit: (index: number) => void;
  gotoBack: () => void;
  updateRecordSetOrder: (allUserRecordSet_: RecordType[]) => void;
}
export const DataContext = createContext({} as DataContextType);
