/** 外部受信機のBLE接続はAndroidのみ対応。他のプラットフォームでは要求するものがない */
export const requestBlePermissions = async (): Promise<boolean> => true;

export const hasBlePermissions = async (): Promise<boolean> => true;
