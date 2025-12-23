import { createContext } from 'react';
import { CloudDataGroup, ProjectType } from '../types';

interface CloudDataManagementContextType {
  project: ProjectType;
  isLoading: boolean;
  dataGroups: CloudDataGroup[];
  checkList: { id: number; checked: boolean }[];
  isChecked: boolean;
  refreshData: () => Promise<void>;
  changeChecked: (index: number, checked: boolean) => void;
  changeCheckedAll: (checked: boolean) => void;
  pressDeleteSelected: () => Promise<void>;
  gotoBack: () => void;
}

export const CloudDataManagementContext = createContext({} as CloudDataManagementContextType);
