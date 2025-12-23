import { createContext } from 'react';
import { CloudLayerGroup, ProjectType } from '../types';
import { LayerCheckState } from '../hooks/useCloudDataManagement';

interface CloudDataManagementContextType {
  project: ProjectType;
  isLoading: boolean;
  layerGroups: CloudLayerGroup[];
  checkStates: LayerCheckState[];
  isChecked: boolean;
  refreshData: () => Promise<void>;
  changeLayerChecked: (layerIndex: number, checked: boolean) => void;
  changeDataChecked: (layerIndex: number, dataIndex: number, checked: boolean) => void;
  changeCheckedAll: (checked: boolean) => void;
  pressDeleteSelected: () => Promise<void>;
  gotoBack: () => void;
}

export const CloudDataManagementContext = createContext({} as CloudDataManagementContextType);
