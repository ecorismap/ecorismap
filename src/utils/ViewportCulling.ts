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
  // Check if any segment of the line intersects or is contained within bounds
  for (let i = 0; i < coordinates.length; i++) {
    // Check if point is in bounds
    if (isPointInBounds(coordinates[i], bounds)) {
      return true;
    }

    // Check if line segment intersects bounds (simplified check)
    if (i > 0) {
      const prev = coordinates[i - 1];
      const curr = coordinates[i];

      // If line segment spans the bounds, it intersects
      if (
        (prev.latitude < bounds.southWest.latitude && curr.latitude > bounds.northEast.latitude) ||
        (prev.latitude > bounds.northEast.latitude && curr.latitude < bounds.southWest.latitude) ||
        (prev.longitude < bounds.southWest.longitude && curr.longitude > bounds.northEast.longitude) ||
        (prev.longitude > bounds.northEast.longitude && curr.longitude < bounds.southWest.longitude)
      ) {
        return true;
      }
    }
  }

  return false;
};

export const isPolygonIntersectsBounds = (coordinates: LatLng[][], bounds: ViewportBounds): boolean => {
  // Check exterior ring (first array) and any holes
  for (const ring of coordinates) {
    // If any point of the polygon is in bounds
    for (const point of ring) {
      if (isPointInBounds(point, bounds)) {
        return true;
      }
    }

    // Check if polygon completely contains the bounds (simplified)
    const minLat = Math.min(...ring.map((p) => p.latitude));
    const maxLat = Math.max(...ring.map((p) => p.latitude));
    const minLng = Math.min(...ring.map((p) => p.longitude));
    const maxLng = Math.max(...ring.map((p) => p.longitude));

    if (
      minLat <= bounds.southWest.latitude &&
      maxLat >= bounds.northEast.latitude &&
      minLng <= bounds.southWest.longitude &&
      maxLng >= bounds.northEast.longitude
    ) {
      return true;
    }
  }

  return false;
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
