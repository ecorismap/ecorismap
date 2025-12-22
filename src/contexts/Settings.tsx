import { createContext } from 'react';

interface SettingsContextType {
  isLoading: boolean;
  pressMapListURLOpen: () => void;
  pressFileOpen: () => void;
  pressFileSave: () => void;
  pressClearData: () => void;
  pressClearTileCache: () => void;
  pressClearPhotoCache: () => void;
  pressClearCache: () => void;
  pressGotoManual: () => void;
  pressOSSLicense: () => void;
  pressVersion: () => void;
  pressPDFSettingsOpen: () => void;
  pressGPSSettingsOpen: () => void;
  pressProximityAlertSettingsOpen: () => void;
}

export const SettingsContext = createContext({} as SettingsContextType);
