import { createContext } from 'react';
import { ProjectType, UserType } from '../types';
import { ProjectSortField, ProjectSortOrder } from '../modules/projectsUI';

interface ProjectsContextType {
  projects: ProjectType[];
  user: UserType;
  isLoading: boolean;
  isEncryptPasswordModalOpen: boolean;
  favoriteProjectIds: string[];
  showOnlyFavorites: boolean;
  isShowArchive: boolean;
  sortField: ProjectSortField;
  sortOrder: ProjectSortOrder;
  changeProjectSort: (field: ProjectSortField) => void;
  pressEncryptPasswordOK: (value: string) => void;
  pressEncryptPasswordCancel: () => void;
  onReloadProjects: () => void;
  pressAddProject: () => void;
  gotoProject: (projectId: string) => void;
  gotoBack: () => void;
  toggleFavorite: (projectId: string) => void;
  toggleShowOnlyFavorites: () => void;
  toggleShowArchive: () => void;
  pressArchiveProject: (projectId: string) => void;
  pressRestoreProject: (projectId: string) => void;
  dekMigratableCount: number;
  migrationProgress: string;
  pressMigrateProjects: () => void;
}
export const ProjectsContext = createContext({} as ProjectsContextType);
