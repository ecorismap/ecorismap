import { SettingsType } from '../types';

/**
 * 端末（と利用者）に属し、データの置き換え（新規・バックアップから復元）で巻き戻してはいけない設定。
 * - tileRegions: 端末に実際にあるタイルの記録。戻すとタイルの無い範囲が「ダウンロード済み」になる
 * - tutrials・agreedTermsVersion・lastSeenVersion: 既読・同意。戻すと規約やチュートリアルがまた出る
 * - externalGnss: アンテナ高・NTRIP・自動接続。戻すと以後の標高がポール高ぶんずれる
 * - gpsAccuracy・isOffline・mapListURL・mapList・isTrackPhotoVisible・trackGnssColorAutoApplied: 端末の使い方の設定
 * - proximityAlert: 有効・距離だけ引き継ぐ（対象レイヤはデータ側に合わせる。withDeviceLocalSettings 参照）
 * 新規と復元で同じ一覧を使い、経路で扱いが食い違わないようにする（永続化監査 S-M1・S-M2）
 */
export const DEVICE_LOCAL_SETTINGS_KEYS = [
  'tileRegions',
  'tutrials',
  'agreedTermsVersion',
  'lastSeenVersion',
  'externalGnss',
  'gpsAccuracy',
  'isOffline',
  'mapListURL',
  'mapList',
  'isTrackPhotoVisible',
  'trackGnssColorAutoApplied',
  'proximityAlert',
] as const satisfies readonly (keyof SettingsType)[];

type DeviceLocalSettingsKey = (typeof DEVICE_LOCAL_SETTINGS_KEYS)[number];

const copySetting = <K extends DeviceLocalSettingsKey>(target: SettingsType, source: SettingsType, key: K): void => {
  target[key] = source[key];
};

/**
 * base（初期値・スナップショット）に、current（今の設定）の端末ローカルな値を重ねる。
 * 接近通知の対象レイヤは置き換え後のレイヤを指す base 側を使う（今のレイヤIDは置き換えで無くなる）
 */
export const withDeviceLocalSettings = (base: SettingsType, current: SettingsType): SettingsType => {
  const merged: SettingsType = { ...base };
  DEVICE_LOCAL_SETTINGS_KEYS.forEach((key) => copySetting(merged, current, key));
  merged.proximityAlert = {
    ...current.proximityAlert,
    targetLayerIds: base.proximityAlert?.targetLayerIds ?? [],
  };
  return merged;
};
