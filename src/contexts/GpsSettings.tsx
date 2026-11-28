import { createContext } from 'react';
import { GpsAccuracyType } from '../types';
import { UseExternalGnssReturnType } from '../hooks/useExternalGnss';

interface GpsSettingsContextType {
  gpsAccuracy: GpsAccuracyType;
  selectGpsAccuracy: (value: GpsAccuracyType) => void;
  gotoBack: () => void;
  externalGnss: UseExternalGnssReturnType;
  pressConnectUsb: (deviceId: number) => void;
  pressScanBle: () => void;
  pressConnectBle: (address: string) => void;
  pressRefreshSpp: () => void;
  pressConnectSpp: (address: string) => void;
  pressPairSpp: () => void;
  pressDisconnect: () => void;
}

export const GpsSettingsContext = createContext({} as GpsSettingsContextType);
