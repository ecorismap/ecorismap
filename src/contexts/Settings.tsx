import { createContext } from 'react';

interface SettingsContextType {
  isLoading: boolean;
  pressMapListURLOpen: () => void;
  pressFileOpen: () => void;
  pressFileSave: () => void;
  pressClearData: () => void;
  pressClearTileCache: () => void;
  pressGotoManual: () => void;
  pressOSSLicense: () => void;
  pressVersion: () => void;
  pressPDFSettingsOpen: () => void;
  pressGPSSettingsOpen: () => void;
}

export const SettingsContext = createContext({} as SettingsContextType);
