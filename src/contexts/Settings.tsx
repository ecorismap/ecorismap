import { createContext } from 'react';

interface SettingsContextType {
  mapListURL: string | undefined;
  isMapListURLOpen: boolean;
  isFileSaveOpen: boolean;
  isLoading: boolean;
  pressMapListURLOpen: () => void;
  pressMapListURLOK: (mapListURL: string) => void;
  pressMapListURLCancel: () => void;
  pressMapListURLReset: () => void;
  pressFileOpen: () => void;
  pressFileSave: () => void;
  pressFileSaveOK: (mapListURL: string, includePhoto: boolean) => void;
  pressFileSaveCancel: () => void;
  pressClearData: () => void;
  pressClearTileCache: () => void;
  pressClearPhotoCache: () => void;
  pressGotoManual: () => void;
  pressOSSLicense: () => void;
  pressVersion: () => void;
  pressPDFSettingsOpen: () => void;
}

export const SettingsContext = createContext({} as SettingsContextType);
