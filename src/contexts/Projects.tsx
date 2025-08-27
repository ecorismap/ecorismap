import { createContext } from 'react';
import { ProjectType, UserType } from '../types';

interface ProjectsContextType {
  projects: ProjectType[];
  user: UserType;
  isLoading: boolean;
  isEncryptPasswordModalOpen: boolean;
  favoriteProjectIds: string[];
  showOnlyFavorites: boolean;
  pressEncryptPasswordOK: (value: string) => void;
  pressEncryptPasswordCancel: () => void;
  onReloadProjects: () => void;
  pressAddProject: () => void;
  gotoProject: (projectId: string) => void;
  gotoBack: () => void;
  toggleFavorite: (projectId: string) => void;
  toggleShowOnlyFavorites: () => void;
}
export const ProjectsContext = createContext({} as ProjectsContextType);
