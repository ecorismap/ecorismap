import { LocationType } from '../types';

// 軌跡上への写真表示（スーパー地形方式）の純関数群。
// 写真の撮影時刻を軌跡のtimestampと照合して位置を補間し、
// EXIFのGPSImgDirectionから撮影方向（真北基準）を求める。

// カメラ時計と GPS 時刻のズレ許容幅
export const TRACK_PHOTO_TIME_MARGIN_MS = 3 * 60 * 1000;

export interface TrackTimePosition {
  latitude: number;
  longitude: number;
}

interface TimedPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
}

// timestampを持つ点だけ抽出。有効点が2未満、またはtimestampが逆行していたらnull（安全側）
const prepareTimedPoints = (coords: LocationType[]): TimedPoint[] | null => {
  const points: TimedPoint[] = [];
  for (const c of coords) {
    if (c.timestamp === undefined) continue;
    points.push({ latitude: c.latitude, longitude: c.longitude, timestamp: c.timestamp });
  }
  if (points.length < 2) return null;
  for (let i = 1; i < points.length; i++) {
    if (points[i].timestamp < points[i - 1].timestamp) return null;
  }
  return points;
};

const interpolateOnPoints = (points: TimedPoint[], timeMs: number, marginMs: number): TrackTimePosition | null => {
  const first = points[0];
  const last = points[points.length - 1];
  if (timeMs < first.timestamp - marginMs || timeMs > last.timestamp + marginMs) return null;
  // 軌跡の開始前/終了後でもマージン内なら端点にクランプ
  if (timeMs <= first.timestamp) return { latitude: first.latitude, longitude: first.longitude };
  if (timeMs >= last.timestamp) return { latitude: last.latitude, longitude: last.longitude };

  // 二分探索: points[lo].timestamp <= timeMs < points[hi].timestamp となる隣接区間を探す
  let lo = 0;
  let hi = points.length - 1;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (points[mid].timestamp <= timeMs) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const a = points[lo];
  const b = points[hi];
  const span = b.timestamp - a.timestamp;
  const t = span === 0 ? 0 : (timeMs - a.timestamp) / span;
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
};

// 撮影時刻timeMsに対応する軌跡上の位置を線形補間で求める
export const interpolateTrackPositionAtTime = (
  coords: LocationType[],
  timeMs: number,
  marginMs: number = TRACK_PHOTO_TIME_MARGIN_MS
): TrackTimePosition | null => {
  const points = prepareTimedPoints(coords);
  if (points === null) return null;
  return interpolateOnPoints(points, timeMs, marginMs);
};

// 複数写真の撮影時刻を一括照合する。範囲外の写真はnull
export const matchPhotoTimesToTrack = (
  coords: LocationType[],
  photoTimes: number[],
  marginMs: number = TRACK_PHOTO_TIME_MARGIN_MS
): (TrackTimePosition | null)[] => {
  const points = prepareTimedPoints(coords);
  if (points === null) return photoTimes.map(() => null);
  return photoTimes.map((t) => interpolateOnPoints(points, t, marginMs));
};

export interface PhotoImgDirection {
  direction: number; // 0-360度
  ref: 'T' | 'M'; // T=真方位, M=磁気方位
}

const normalizeDegrees = (deg: number): number => {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
};

// "347/100"のようなEXIF有理数表現や数値文字列も受け付ける
const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const rational = value.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (rational) {
      const denom = parseFloat(rational[2]);
      if (denom === 0) return null;
      return parseFloat(rational[1]) / denom;
    }
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

// getAssetInfoAsyncのexifから撮影方向を取り出す。
// iOSはネスト形式 exif['{GPS}'].ImgDirection、Androidはフラット形式 exif.GPSImgDirection（double）
export const parseImgDirectionFromExif = (exif: unknown): PhotoImgDirection | null => {
  if (exif === null || typeof exif !== 'object') return null;
  const record = exif as Record<string, unknown>;

  let rawDirection: unknown;
  let rawRef: unknown;
  const gps = record['{GPS}'];
  if (gps !== null && typeof gps === 'object') {
    rawDirection = (gps as Record<string, unknown>).ImgDirection;
    rawRef = (gps as Record<string, unknown>).ImgDirectionRef;
  }
  if (rawDirection === undefined) {
    rawDirection = record.GPSImgDirection;
    rawRef = record.GPSImgDirectionRef;
  }

  const direction = toFiniteNumber(rawDirection);
  if (direction === null || direction < 0) return null;
  // Ref省略時は'T'扱い（磁北と断定できないため補正しない安全側）
  const ref = rawRef === 'M' ? 'M' : 'T';
  return { direction: normalizeDegrees(direction), ref };
};

// 撮影方向を真北基準に変換する。declinationは磁気偏角（度、東偏が正）
export const toTrueDirection = (direction: number, ref: 'T' | 'M', declination: number): number =>
  ref === 'M' ? normalizeDegrees(direction + declination) : normalizeDegrees(direction);
