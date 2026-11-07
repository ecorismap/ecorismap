import { LocationType } from '../../types';
import { FIX_QUALITY, GnssFix } from './nmea';
import { estimateHorizontalAccuracy, gnssFixToLocation } from './toLocation';

const METERS_PER_DEGREE = 111_320;

// 平均した点の測位品質は、混ざったうちで一番悪いものを名乗る（FIXとFLOATの混在ならFLOAT）
const QUALITY_RANK: Record<number, number> = {
  [FIX_QUALITY.RTK_FIX]: 0,
  [FIX_QUALITY.RTK_FLOAT]: 1,
  [FIX_QUALITY.DGPS]: 2,
  [FIX_QUALITY.SINGLE]: 3,
};
const rankOf = (q: number) => QUALITY_RANK[q] ?? 4;

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const nonNull = (values: (number | null)[]) => values.filter((v): v is number => v !== null);

export type AveragingResult = {
  location: LocationType;
  count: number;
  /** 各エポックの平均位置からの水平のばらつき（2D RMS）[m] */
  horizontalSpread: number;
  /** 標高のばらつき（標準偏差）[m]。標高が無ければnull */
  verticalSpread: number | null;
};

/**
 * 複数エポックの位置を平均して1点にする。
 * 精度は、ばらつきと各エポックの精度の平均のうち大きい方とする（平均しても受信機の系統誤差は消えないため）。
 */
export const averageFixes = (fixes: GnssFix[], antennaHeight: number): AveragingResult | null => {
  if (fixes.length === 0) return null;
  const latitude = mean(fixes.map((f) => f.latitude));
  const longitude = mean(fixes.map((f) => f.longitude));
  const cosLat = Math.cos((latitude * Math.PI) / 180);
  const horizontalSpread = Math.sqrt(
    mean(
      fixes.map((f) => {
        const dn = (f.latitude - latitude) * METERS_PER_DEGREE;
        const de = (f.longitude - longitude) * METERS_PER_DEGREE * cosLat;
        return dn * dn + de * de;
      })
    )
  );
  const altitudes = nonNull(fixes.map((f) => f.altitudeMsl));
  const meanAltitude = altitudes.length > 0 ? mean(altitudes) : null;
  const verticalSpread =
    meanAltitude !== null ? Math.sqrt(mean(altitudes.map((a) => (a - meanAltitude) * (a - meanAltitude)))) : null;
  const accuracies = nonNull(fixes.map(estimateHorizontalAccuracy));
  const worst = fixes.reduce((w, f) => (rankOf(f.fixQuality) > rankOf(w.fixQuality) ? f : w));
  const satellites = nonNull(fixes.map((f) => f.satellites));
  const hdops = nonNull(fixes.map((f) => f.hdop));
  const diffAges = nonNull(fixes.map((f) => f.diffAge));
  const last = gnssFixToLocation(fixes[fixes.length - 1], antennaHeight);

  return {
    count: fixes.length,
    horizontalSpread,
    verticalSpread,
    location: {
      latitude,
      longitude,
      altitude: meanAltitude !== null ? meanAltitude - antennaHeight : null,
      accuracy: accuracies.length > 0 ? Math.max(horizontalSpread, mean(accuracies)) : horizontalSpread,
      altitudeAccuracy: verticalSpread,
      heading: null,
      speed: null,
      timestamp: last.timestamp,
      gnss: {
        fixQuality: worst.fixQuality,
        satellites: satellites.length > 0 ? Math.min(...satellites) : null,
        hdop: hdops.length > 0 ? Math.max(...hdops) : null,
        diffAge: diffAges.length > 0 ? Math.max(...diffAges) : null,
        averagedCount: fixes.length,
      },
    },
  };
};
