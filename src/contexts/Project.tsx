import React from 'react';

export interface ProjectContextType {
  projectName: string | undefined;
  isSynced: boolean;
  isShowingProjectButtons: boolean;
  isSettingProject: boolean;

  // Project actions
  pressProjectLabel: () => void;
  pressJumpProject: () => void;
  pressDownloadData: () => void;
  pressCloseProject: () => void;
  pressUploadData: () => void;
  pressSaveProjectSetting: () => void;
  pressDiscardProjectSetting: () => void;

  // Navigation
  gotoProjects: () => void;
  gotoAccount: () => void;
  gotoLogin: () => void;
  pressLogout: () => void;
}

export const ProjectContext = React.createContext<ProjectContextType>({} as ProjectContextType);
