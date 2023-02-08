import { createContext } from 'react';

interface SettingsContextType {
  mapListURL: string | undefined;
  isMapListURLOpen: boolean;
  isFileSaveOpen: boolean;
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
  pressGotoManual: () => void;
  pressOSSLicense: () => void;
  pressVersion: () => void;
}

export const SettingsContext = createContext({} as SettingsContextType);
