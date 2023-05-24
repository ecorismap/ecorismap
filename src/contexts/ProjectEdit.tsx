import { createContext } from 'react';
import { CreateProjectType, ProjectType } from '../types';

interface ProjectEditContextType {
  createType: CreateProjectType | undefined;
  isNew: boolean;
  isProjectOpen: boolean;
  project: ProjectType;
  isOwner: boolean;
  isOwnerAdmin: boolean;
  isEdited: boolean;
  isLoading: boolean;
  changeText: (name: string, value: string) => void;
  changeCreateType: (value: CreateProjectType) => void;
  changeMemberText: (value: string, idx: number) => void;
  changeAdmin: (checked: boolean, idx: number) => void;
  pressAddMember: () => void;
  pressDeleteMember: (idx: number) => void;
  pressSaveProject: () => void;
  pressOpenProject: (isSetting: boolean) => void;
  pressExportProject: () => void;
  pressDeleteProject: () => void;
  pressSettingProject: () => void;
  gotoBack: () => void;
}
export const ProjectEditContext = createContext({} as ProjectEditContextType);
