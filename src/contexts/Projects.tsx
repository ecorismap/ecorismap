import { createContext } from 'react';
import { ProjectType, UserType } from '../types';

interface ProjectsContextType {
  projects: ProjectType[];
  user: UserType;
  isLoading: boolean;
  onReloadProjects: () => void;
  pressAddProject: () => void;
  gotoProject: (index: number) => void;
  gotoBack: () => void;
}
export const ProjectsContext = createContext({} as ProjectsContextType);
