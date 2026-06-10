import { LatLng } from 'react-native-maps';
import { PointRecordType, LineRecordType, PolygonRecordType } from '../types';

export interface ViewportBounds {
  northEast: LatLng;
  southWest: LatLng;
}

export interface ViewportCullingOptions {
  buffer?: number; // Percentage buffer to load features just outside viewport (default: 10%)
  maxFeatures?: number; // Maximum number of features to render (default: 1000)
  minZoom?: number; // Minimum zoom level to apply culling (default: 0)
}

const DEFAULT_OPTIONS: Required<ViewportCullingOptions> = {
  buffer: 10,
  maxFeatures: 1000,
  minZoom: 0,
};

export const expandBounds = (bounds: ViewportBounds, bufferPercent: number): ViewportBounds => {
  const latDelta = Math.abs(bounds.northEast.latitude - bounds.southWest.latitude);
  const lngDelta = Math.abs(bounds.northEast.longitude - bounds.southWest.longitude);

  const latBuffer = (latDelta * bufferPercent) / 100;
  const lngBuffer = (lngDelta * bufferPercent) / 100;

  return {
    northEast: {
      latitude: bounds.northEast.latitude + latBuffer,
      longitude: bounds.northEast.longitude + lngBuffer,
    },
    southWest: {
      latitude: bounds.southWest.latitude - latBuffer,
      longitude: bounds.southWest.longitude - lngBuffer,
    },
  };
};

export const isPointInBounds = (point: LatLng, bounds: ViewportBounds): boolean => {
  return (
    point.latitude >= bounds.southWest.latitude &&
    point.latitude <= bounds.northEast.latitude &&
    point.longitude >= bounds.southWest.longitude &&
    point.longitude <= bounds.northEast.longitude
  );
};

export const isLineIntersectsBounds = (coordinates: LatLng[], bounds: ViewportBounds): boolean => {
  // 線分単位の厳密な交差判定はコストが高いうえ、以前の簡易判定は
  // 「両端点がビューポート外でコーナーを斜めに横切る線分」を見落としていた。
  // 偽陰性（表示すべき地物の欠落）を避けるため、地物全体のbboxと
  // ビューポート矩形の重なりで保守的に判定する。
  if (coordinates.length === 0) return false;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of coordinates) {
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
    if (p.longitude < minLng) minLng = p.longitude;
    if (p.longitude > maxLng) maxLng = p.longitude;
  }

  return (
    maxLat >= bounds.southWest.latitude &&
    minLat <= bounds.northEast.latitude &&
    maxLng >= bounds.southWest.longitude &&
    minLng <= bounds.northEast.longitude
  );
};

export const isPolygonIntersectsBounds = (coordinates: LatLng[][], bounds: ViewportBounds): boolean => {
  // 外環・穴のいずれかのbboxがビューポートと重なれば表示対象とする（保守的判定）
  return coordinates.some((ring) => isLineIntersectsBounds(ring, bounds));
};

export const cullPoints = (
  points: PointRecordType[],
  bounds: ViewportBounds | null,
  zoom: number,
  options: ViewportCullingOptions = {}
): PointRecordType[] => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Don't cull if no bounds or zoom is too low
  if (!bounds || zoom < opts.minZoom) {
    return points.slice(0, opts.maxFeatures);
  }

  const expandedBounds = expandBounds(bounds, opts.buffer);

  const visiblePoints = points.filter((point) => {
    const coordinates =
      point.coords && point.coords.latitude && point.coords.longitude
        ? { latitude: point.coords.latitude, longitude: point.coords.longitude }
        : null;

    return coordinates && isPointInBounds(coordinates, expandedBounds);
  });

  return visiblePoints.slice(0, opts.maxFeatures);
};

export const cullLines = (
  lines: LineRecordType[],
  bounds: ViewportBounds | null,
  zoom: number,
  options: ViewportCullingOptions = {}
): LineRecordType[] => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!bounds || zoom < opts.minZoom) {
    return lines.slice(0, opts.maxFeatures);
  }

  const expandedBounds = expandBounds(bounds, opts.buffer);

  const visibleLines = lines.filter((line) => {
    const coordinates = line.coords;
    return coordinates && isLineIntersectsBounds(coordinates, expandedBounds);
  });

  return visibleLines.slice(0, opts.maxFeatures);
};

export const cullPolygons = (
  polygons: PolygonRecordType[],
  bounds: ViewportBounds | null,
  zoom: number,
  options: ViewportCullingOptions = {}
): PolygonRecordType[] => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!bounds || zoom < opts.minZoom) {
    return polygons.slice(0, opts.maxFeatures);
  }

  const expandedBounds = expandBounds(bounds, opts.buffer);

  const visiblePolygons = polygons.filter((polygon) => {
    if (!polygon.coords) return false;

    // Check main polygon ring
    if (isLineIntersectsBounds(polygon.coords, expandedBounds)) {
      return true;
    }

    // Check holes if any
    if (polygon.holes) {
      for (const hole of Object.values(polygon.holes)) {
        if (isLineIntersectsBounds(hole, expandedBounds)) {
          return true;
        }
      }
    }

    return false;
  });

  return visiblePolygons.slice(0, opts.maxFeatures);
};
