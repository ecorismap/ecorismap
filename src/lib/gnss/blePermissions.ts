/** Web等、外部受信機をつながないプラットフォームでは要求するものがない */
export const requestBlePermissions = async (): Promise<boolean> => true;

export const hasBlePermissions = async (): Promise<boolean> => true;
