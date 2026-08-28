import { LocationType } from '../types';

// 軌跡上への写真表示（スーパー地形方式）の純関数群。
// 写真の撮影時刻を軌跡のtimestampと照合して位置を補間し、
// 画面上で重なる写真のグループ化（クラスタリング）と展開レイアウトを計算する。

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

// ---- 重なり写真のグループ化 ----

// 画面上でこの距離（px）以内の写真マーカーを1つのグループにまとめる
export const TRACK_PHOTO_CLUSTER_THRESHOLD_PX = 40;
// マーカーのタップ判定半径（px）
export const TRACK_PHOTO_TAP_RADIUS_PX = 24;

export interface TrackPhotoClusterType {
  id: string; // 先頭メンバーのassetId
  x: number; // 代表位置（先頭メンバーの画面座標）
  y: number;
  assetIds: string[];
}

// 画面座標ベースの貪欲クラスタリング。
// 表示側（HomeTrackPhotoMarkers）とタップ判定側（containers/Home）で結果が一致するよう、
// 同じ入力順（撮影時刻順）で呼ぶこと
export const clusterTrackPhotos = (
  items: { assetId: string; x: number; y: number }[],
  thresholdPx: number = TRACK_PHOTO_CLUSTER_THRESHOLD_PX
): TrackPhotoClusterType[] => {
  const clusters: TrackPhotoClusterType[] = [];
  for (const item of items) {
    const found = clusters.find((c) => Math.hypot(c.x - item.x, c.y - item.y) <= thresholdPx);
    if (found !== undefined) {
      found.assetIds.push(item.assetId);
    } else {
      clusters.push({ id: item.assetId, x: item.x, y: item.y, assetIds: [item.assetId] });
    }
  }
  return clusters;
};

// 展開時に円周上へサムネイル（36px＋間隔）を重ならず並べるのに必要な半径（px）
export const spiderRadius = (count: number): number => Math.max(48, Math.ceil((count * 44) / (2 * Math.PI)));

// 展開時の各メンバーの中心からの画面オフセット（真上から時計回りの円形配置）
export const spiderOffsets = (count: number): { dx: number; dy: number }[] => {
  if (count <= 1) return [{ dx: 0, dy: 0 }];
  const radius = spiderRadius(count);
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    return { dx: radius * Math.cos(angle), dy: radius * Math.sin(angle) };
  });
};
