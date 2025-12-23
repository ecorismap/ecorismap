import { createContext } from 'react';
import { ProjectType } from '../types';

interface ProjectEditContextType {
  isNew: boolean;
  isProjectOpen: boolean;
  project: ProjectType;
  isOwner: boolean;
  isOwnerAdmin: boolean;
  isEdited: boolean;
  isLoading: boolean;
  changeText: (name: string, value: string) => void;
  changeMemberText: (value: string, idx: number) => void;
  changeAdmin: (checked: boolean, idx: number) => void;
  pressAddMembers: (emails: string) => void;
  pressDeleteMember: (idx: number) => void;
  pressSaveProject: () => void;
  pressOpenProject: (isSetting: boolean) => void;
  pressExportProject: () => void;
  pressDeleteProject: () => void;
  pressSettingProject: () => void;
  pressCloudDataManagement: () => void;
  gotoBack: () => void;
}
export const ProjectEditContext = createContext({} as ProjectEditContextType);
