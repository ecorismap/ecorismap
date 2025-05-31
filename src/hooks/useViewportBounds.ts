import { useMemo } from 'react';
import { ViewportBounds } from '../utils/ViewportCulling';
import { RegionType } from '../types';

export interface UseViewportBoundsReturnType {
  bounds: ViewportBounds | null;
}

export const useViewportBounds = (mapRegion: RegionType): UseViewportBoundsReturnType => {
  const bounds = useMemo(() => {
    if (!mapRegion || !mapRegion.latitude || !mapRegion.longitude) {
      return null;
    }

    const { latitude, longitude, latitudeDelta, longitudeDelta } = mapRegion;

    return {
      northEast: {
        latitude: latitude + latitudeDelta / 2,
        longitude: longitude + longitudeDelta / 2,
      },
      southWest: {
        latitude: latitude - latitudeDelta / 2,
        longitude: longitude - longitudeDelta / 2,
      },
    };
  }, [mapRegion]);

  return { bounds };
};
