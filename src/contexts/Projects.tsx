import { createContext } from 'react';
import { ProjectType, UserType } from '../types';

interface ProjectsContextType {
  projects: ProjectType[];
  user: UserType;
  isLoading: boolean;
  isEncryptPasswordModalOpen: boolean;
  pressEncryptPasswordOK: (value: string) => void;
  pressEncryptPasswordCancel: () => void;
  onReloadProjects: () => void;
  pressAddProject: () => void;
  gotoProject: (projectId: string) => void;
  gotoBack: () => void;
}
export const ProjectsContext = createContext({} as ProjectsContextType);
