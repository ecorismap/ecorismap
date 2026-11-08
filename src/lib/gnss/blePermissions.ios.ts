import { getBleAuthorization } from '../../../modules/gnss-receiver/src';

/**
 iOSの権限ダイアログはネイティブがBluetoothを初めて使うとき（スキャン開始時）に出す。
 ここでは既に拒否されているかだけを見る
 */
export const requestBlePermissions = async (): Promise<boolean> => getBleAuthorization() !== 'denied';

/** 権限ダイアログを出さずに、BLEの検索・接続の権限があるかだけ確かめる（自動再接続用） */
export const hasBlePermissions = async (): Promise<boolean> => getBleAuthorization() === 'allowed';
