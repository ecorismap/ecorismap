import { createContext } from 'react';
import { GpsAccuracyType } from '../types';

interface GpsSettingsContextType {
  gpsAccuracy: GpsAccuracyType;
  selectGpsAccuracy: (value: GpsAccuracyType) => void;
  gotoBack: () => void;
}

export const GpsSettingsContext = createContext({} as GpsSettingsContextType);
