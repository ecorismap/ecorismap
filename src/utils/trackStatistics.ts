import { LocationType } from '../types';
import { getLineLength, haversineKm, simplifyLocations } from './Location';

// GPS標高の垂直誤差（±5〜10m）による振動を獲得標高に累積しないための定数
export const ALTITUDE_SMOOTHING_WINDOW = 5;
export const ELEVATION_GAIN_THRESHOLD = 5; // m

export interface TrackStatistics {
  distanceKm: number;
  startTime: number | null;
  endTime: number | null;
  durationSeconds: number | null;
  averageSpeedKmh: number | null;
  maxSpeedKmh: number | null;
  ascent: number | null;
  descent: number | null;
  maxAltitude: number | null;
  minAltitude: number | null;
}

export interface ElevationProfilePoint {
  distanceKm: number;
  altitude: number;
  timestamp?: number;
  speed?: number | null;
  latitude: number;
  longitude: number;
}

const hasAltitude = (p: LocationType): p is LocationType & { altitude: number } =>
  p.altitude !== undefined && p.altitude !== null;

// 中央移動平均。端は窓を縮めて平均する
export const smoothAltitudes = (altitudes: number[], windowSize = ALTITUDE_SMOOTHING_WINDOW): number[] => {
  if (altitudes.length === 0) return [];
  const half = Math.floor(windowSize / 2);
  return altitudes.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(altitudes.length - 1, i + half);
    let sum = 0;
    for (let j = start; j <= end; j++) {
      sum += altitudes[j];
    }
    return sum / (end - start + 1);
  });
};

// 閾値ヒステリシス方式。基準標高から閾値以上動いたときだけ累積し、基準を更新する
const calcAscentDescent = (smoothed: number[], threshold = ELEVATION_GAIN_THRESHOLD) => {
  let ascent = 0;
  let descent = 0;
  let ref = smoothed[0];
  for (let i = 1; i < smoothed.length; i++) {
    const alt = smoothed[i];
    if (alt - ref >= threshold) {
      ascent += alt - ref;
      ref = alt;
    } else if (ref - alt >= threshold) {
      descent += ref - alt;
      ref = alt;
    }
  }
  return { ascent, descent };
};

export const calcTrackStatistics = (coords: LocationType[]): TrackStatistics => {
  const distanceKm = getLineLength(coords);

  const timestamps = coords.map((p) => p.timestamp).filter((ts): ts is number => ts !== undefined);
  const startTime = timestamps.length > 0 ? timestamps[0] : null;
  const endTime = timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;
  const durationSeconds = startTime !== null && endTime !== null && endTime >= startTime ? (endTime - startTime) / 1000 : null;
  const averageSpeedKmh =
    durationSeconds !== null && durationSeconds > 0 ? distanceKm / (durationSeconds / 3600) : null;

  const speeds = coords
    .map((p) => p.speed)
    .filter((s): s is number => s !== undefined && s !== null && s >= 0);
  const maxSpeedKmh = speeds.length > 0 ? Math.max(...speeds) * 3.6 : null;

  const altitudes = coords.filter(hasAltitude).map((p) => p.altitude);
  if (altitudes.length === 0) {
    return {
      distanceKm,
      startTime,
      endTime,
      durationSeconds,
      averageSpeedKmh,
      maxSpeedKmh,
      ascent: null,
      descent: null,
      maxAltitude: null,
      minAltitude: null,
    };
  }

  // 最高・最低もスムージング後の値から取り、スパイクを拾わないようにする
  const smoothed = smoothAltitudes(altitudes);
  const { ascent, descent } = calcAscentDescent(smoothed);

  return {
    distanceKm,
    startTime,
    endTime,
    durationSeconds,
    averageSpeedKmh,
    maxSpeedKmh,
    ascent,
    descent,
    maxAltitude: Math.max(...smoothed),
    minAltitude: Math.min(...smoothed),
  };
};

// 地図上の座標に最も近いプロファイル点のインデックスを返す
export const findNearestProfileIndex = (
  profile: ElevationProfilePoint[],
  latlon: { latitude: number; longitude: number }
): number => {
  let nearest = 0;
  let minDistance = Infinity;
  for (let i = 0; i < profile.length; i++) {
    const d = haversineKm(profile[i], latlon);
    if (d < minDistance) {
      minDistance = d;
      nearest = i;
    }
  }
  return nearest;
};

export const buildElevationProfile = (coords: LocationType[], maxPoints = 300): ElevationProfilePoint[] => {
  const simplified = simplifyLocations(coords, maxPoints);

  // 累積距離は標高欠損点も含む間引き後の全ジオメトリで積算し、標高のある点だけをプロファイルに載せる
  const profile: ElevationProfilePoint[] = [];
  let cumulativeKm = 0;
  for (let i = 0; i < simplified.length; i++) {
    if (i > 0) {
      cumulativeKm += haversineKm(simplified[i - 1], simplified[i]);
    }
    const point = simplified[i];
    if (hasAltitude(point)) {
      profile.push({
        distanceKm: cumulativeKm,
        altitude: point.altitude,
        timestamp: point.timestamp,
        speed: point.speed,
        latitude: point.latitude,
        longitude: point.longitude,
      });
    }
  }
  if (profile.length < 2) return [];

  const smoothed = smoothAltitudes(profile.map((p) => p.altitude));
  return profile.map((p, i) => ({ ...p, altitude: smoothed[i] }));
};
