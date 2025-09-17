import { NativeModules, Platform } from 'react-native';

type BatteryOptimizationNativeModule = {
  isIgnoringBatteryOptimizations?: () => Promise<boolean>;
  requestIgnoreBatteryOptimizations?: () => Promise<boolean>;
};

const { BatteryOptimization } = NativeModules as {
  BatteryOptimization?: BatteryOptimizationNativeModule;
};

export const isBatteryOptimizationIgnored = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  if (BatteryOptimization?.isIgnoringBatteryOptimizations === undefined) return true;

  try {
    return await BatteryOptimization.isIgnoringBatteryOptimizations();
  } catch (error) {
    return true;
  }
};

export const requestDisableBatteryOptimization = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return false;
  if (BatteryOptimization?.requestIgnoreBatteryOptimizations === undefined) return false;

  try {
    return await BatteryOptimization.requestIgnoreBatteryOptimizations();
  } catch (error) {
    return false;
  }
};
