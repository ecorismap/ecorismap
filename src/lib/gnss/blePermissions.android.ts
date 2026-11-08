import { PermissionsAndroid, Platform } from 'react-native';

/** Android 12以降はBLEの検索・接続に実行時の権限が要る（11以前は位置情報の権限で足りる） */
export const requestBlePermissions = async (): Promise<boolean> => {
  if (Number(Platform.Version) < 31) return true;
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ]);
  return Object.values(result).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
};

/** 権限ダイアログを出さずに、BLEの検索・接続の権限があるかだけ確かめる（自動再接続用） */
export const hasBlePermissions = async (): Promise<boolean> => {
  if (Number(Platform.Version) < 31) return true;
  const results = await Promise.all([
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN),
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT),
  ]);
  return results.every(Boolean);
};
