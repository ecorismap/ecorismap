import { useMemo } from 'react';
import { useCallback } from 'react';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl';
import { Platform } from 'react-native';
import { useSelector } from 'react-redux';
import { AppState } from '../modules';
import { isMapRef, isMapView } from '../utils/Map';
import { useWindow } from './useWindow';

export type UseZoomReturnType = {
  zoom: number;
  zoomDecimal: number;
  zoomIn: () => void;
  zoomOut: () => void;
};

export const useZoom = (mapViewRef: MapView | MapRef | null): UseZoomReturnType => {
  const mapRegion = useSelector((state: AppState) => state.settings.mapRegion);
  const { windowWidth } = useWindow();

  const zoomDecimal = useMemo(() => {
    if (mapRegion) {
      if (Platform.OS === 'web') {
        return mapRegion.zoom;
      } else {
        if (mapRegion.longitudeDelta < 0) {
          return Math.log2(360 * (windowWidth / 256 / (mapRegion.longitudeDelta + 360)));
        } else {
          return Math.log2(360 * (windowWidth / 256 / mapRegion.longitudeDelta));
        }
      }
    } else {
      return 5;
    }
  }, [mapRegion, windowWidth]);

  const zoom = useMemo(() => Math.floor(zoomDecimal), [zoomDecimal]);

  const zoomIn = useCallback(() => {
    const { latitude, longitude, latitudeDelta, longitudeDelta } = mapRegion;
    const coords = {
      latitude: latitude,
      longitude: longitude,
      latitudeDelta: latitudeDelta / 2,
      longitudeDelta: longitudeDelta / 2,
    };
    if (isMapView(mapViewRef)) {
      mapViewRef.animateToRegion(coords, 200);
    } else if (isMapRef(mapViewRef)) {
      const mapRef = mapViewRef.getMap();
      mapRef.flyTo({ zoom: mapRef.getZoom() + 1 });
    }
  }, [mapRegion, mapViewRef]);

  const zoomOut = useCallback(() => {
    const { latitude, longitude, latitudeDelta, longitudeDelta } = mapRegion;
    const coords = {
      latitude: latitude,
      longitude: longitude,
      latitudeDelta: latitudeDelta * 2,
      longitudeDelta: longitudeDelta * 2,
    };
    if (isMapView(mapViewRef)) {
      mapViewRef.animateToRegion(coords, 200);
    } else if (isMapRef(mapViewRef)) {
      const mapRef = mapViewRef.getMap();
      mapRef.flyTo({ zoom: mapRef.getZoom() === 0 ? 0 : mapRef.getZoom() - 1 });
    }
  }, [mapRegion, mapViewRef]);

  return { zoom, zoomDecimal, zoomIn, zoomOut } as const;
};
