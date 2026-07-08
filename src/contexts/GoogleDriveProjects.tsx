import { createContext } from 'react';
import { DriveProjectItem } from '../lib/googledrive/types';

interface GoogleDriveProjectsContextType {
  isLoading: boolean;
  progress: number | undefined;
  isConnected: boolean;
  connectedEmail: string | undefined;
  driveProjects: DriveProjectItem[];
  isSaveModalOpen: boolean;
  defaultSaveName: string;
  pressConnect: () => void;
  pressDisconnect: () => void;
  pressReload: () => void;
  pressSaveToDrive: () => void;
  pressSaveOK: (name: string) => void;
  pressSaveCancel: () => void;
  pressLoadProject: (item: DriveProjectItem) => void;
  pressDeleteProject: (item: DriveProjectItem) => void;
  gotoBack: () => void;
}

export const GoogleDriveProjectsContext = createContext({} as GoogleDriveProjectsContextType);
