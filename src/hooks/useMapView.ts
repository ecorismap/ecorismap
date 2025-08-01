import { useMemo } from 'react';
import { useCallback } from 'react';
import MapView, { Region } from 'react-native-maps';
import { MapRef, ViewState } from 'react-map-gl/maplibre';
import { Platform } from 'react-native';
import { isMapRef, isMapView, isRegion, isRegionType, isViewState } from '../utils/Map';
import { useWindow } from './useWindow';
import { RegionType } from '../types';
import { editSettingsAction } from '../modules/settings';
import { deltaToZoom, zoomToDelta } from '../utils/Coords';
import { useDispatch } from 'react-redux';

export type UseMapViewReturnType = {
  zoom: number;
  zoomDecimal: number;
  zoomIn: () => void;
  zoomOut: () => void;
  changeMapRegion: (region: Region | ViewState | undefined, jumpTo?: boolean) => void;
};

export const useMapView = (mapViewRef: MapView | MapRef | null): UseMapViewReturnType => {
  const { windowWidth, mapRegion } = useWindow();
  const dispatch = useDispatch();

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
      mapRef.flyTo({ center: [longitude, latitude], zoom: mapRef.getZoom() + 1, essential: true });
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
      mapRef.flyTo({
        center: [longitude, latitude],
        zoom: mapRef.getZoom() === 0 ? 0 : mapRef.getZoom() - 1,
        essential: true,
      });
    }
  }, [mapRegion, mapViewRef]);

  const changeMapRegion = useCallback(
    (region: Region | ViewState | RegionType | undefined, jumpTo = false) => {
      if (region === undefined) return;
      if (Platform.OS === 'web') {
        if (isRegionType(region)) {
          dispatch(editSettingsAction({ mapRegion: region }));
        } else if (isViewState(region)) {
          if (mapViewRef === null) {
            dispatch(editSettingsAction({ mapRegion: { ...region, latitudeDelta: 0.001, longitudeDelta: 0.001 } }));
          } else if (isMapRef(mapViewRef)) {
            const { latitudeDelta, longitudeDelta } = zoomToDelta(mapViewRef);
            dispatch(editSettingsAction({ mapRegion: { ...region, latitudeDelta, longitudeDelta } }));
          }
        }
      } else {
        if (isRegion(region) && !isRegionType(region)) {
          const delta = { longitudeDelta: region.longitudeDelta, latitudeDelta: region.latitudeDelta };
          const newRegion = { ...region, zoom: deltaToZoom(windowWidth, delta).zoom };
          dispatch(editSettingsAction({ mapRegion: newRegion }));
        } else if (jumpTo && isRegionType(region) && isMapView(mapViewRef)) {
          mapViewRef.setCamera({
            center: {
              latitude: region.latitude,
              longitude: region.longitude,
            },
            zoom: region.zoom,
          });
        }
      }
    },
    [dispatch, mapViewRef, windowWidth]
  );

  return { zoom, zoomDecimal, zoomIn, zoomOut, changeMapRegion } as const;
};
