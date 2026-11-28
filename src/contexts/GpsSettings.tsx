import { createContext } from 'react';
import { GpsAccuracyType } from '../types';
import { UseExternalGnssReturnType } from '../hooks/useExternalGnss';
import { RawLogEntry } from '../lib/gnss/rawLog';

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
  pressStartRawLog: () => void;
  pressStopRawLog: () => void;
  pressShareRawLog: (entry: RawLogEntry) => void;
  pressDeleteRawLog: (entry: RawLogEntry) => void;
  pressDisconnect: () => void;
}

export const GpsSettingsContext = createContext({} as GpsSettingsContextType);
