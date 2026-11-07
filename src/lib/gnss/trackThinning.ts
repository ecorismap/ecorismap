import { ExternalGnssSettingsType, LocationType } from '../../types';

export type GnssTrackMode = NonNullable<ExternalGnssSettingsType['trackMode']>;

export const DEFAULT_GNSS_TRACK_MODE: GnssTrackMode = 'adaptive';
export const DEFAULT_GNSS_TRACK_DISTANCE = 2;
export const GNSS_TRACK_DISTANCES = [1, 2, 5];

// 間引いていても、止まっていた時刻が分かるようにこの間隔で1点は残す
export const GNSS_TRACK_KEEPALIVE_MS = 30_000;
// 精度に合わせて間引くときの、精度に掛ける倍率と下限・上限[m]
const ADAPTIVE_FACTOR = 2;
const ADAPTIVE_MIN_M = 0.1;
const ADAPTIVE_MAX_M = 10;

const METERS_PER_DEGREE = 111_320;

const distanceMeters = (a: LocationType, b: LocationType) => {
  const cosLat = Math.cos((((a.latitude + b.latitude) / 2) * Math.PI) / 180);
  const dn = (b.latitude - a.latitude) * METERS_PER_DEGREE;
  const de = (b.longitude - a.longitude) * METERS_PER_DEGREE * cosLat;
  return Math.hypot(dn, de);
};

/** 次の点を記録するのに必要な、最後に記録した点からの移動距離[m] */
export const trackThinningDistance = (mode: GnssTrackMode, distance: number, accuracy: number | null | undefined) => {
  if (mode === 'all') return 0;
  if (mode === 'distance') return distance;
  const acc = typeof accuracy === 'number' ? accuracy : ADAPTIVE_MAX_M / ADAPTIVE_FACTOR;
  return Math.min(ADAPTIVE_MAX_M, Math.max(ADAPTIVE_MIN_M, acc * ADAPTIVE_FACTOR));
};

/**
 * 外部GNSS受信機の位置を軌跡に記録するか。
 * last は軌跡に最後に保存された点（無ければ新しい記録の最初の点として必ず記録する）
 */
export const shouldRecordGnssTrackPoint = (
  last: LocationType | null,
  next: LocationType,
  mode: GnssTrackMode,
  distance: number
): boolean => {
  if (mode === 'all' || last === null) return true;
  if ((next.timestamp ?? 0) - (last.timestamp ?? 0) >= GNSS_TRACK_KEEPALIVE_MS) return true;
  return distanceMeters(last, next) >= trackThinningDistance(mode, distance, next.accuracy);
};
