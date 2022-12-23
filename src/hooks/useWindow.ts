import { MutableRefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import { MapRef, ViewState } from 'react-map-gl';
import { Platform, useWindowDimensions } from 'react-native';
import { useDisplay } from './useDisplay';
import { isMapRef, isRegion, isRegionType, isViewState } from '../utils/Map';
import MapView, { Region } from 'react-native-maps';
import { RegionType } from '../types';
import { useDispatch, useSelector } from 'react-redux';
import { editSettingsAction } from '../modules/settings';
import { deltaToZoom, zoomToDelta } from '../utils/Coords';
import { AppState } from '../modules';

export type UseWindowReturnType = {
  mapViewRef: MutableRefObject<MapView | MapRef | null>;
  mapRegion: RegionType;
  windowHeight: number;
  windowWidth: number;
  isLandscape: boolean;
  mapSize: {
    width: number;
    height: number;
  };
  changeMapRegion: (region: Region | ViewState, jumpTo?: boolean) => void;
};

export const useWindow = (): UseWindowReturnType => {
  const mapViewRef = useRef<MapView | MapRef | null>(null);
  const dispatch = useDispatch();
  const mapRegion = useSelector((state: AppState) => state.settings.mapRegion);
  const { isDataOpened } = useDisplay();
  const window = useWindowDimensions();
  const isLandscape = useMemo(() => window.width > window.height, [window.height, window.width]);
  const windowWidth = window.width;
  let StatusBarHeight = 0;
  if (Platform.OS === 'android') StatusBarHeight = 24;
  const windowHeight = isLandscape ? window.height - StatusBarHeight : window.height;
  //console.log(window.width, window.height, isLandscape, StatusBar.currentHeight);

  const mapSize = useMemo(() => {
    if (Platform.OS === 'web' && mapViewRef.current && isDataOpened) {
      const mapView = (mapViewRef.current as MapRef).getMap();
      return { width: mapView.getContainer().offsetWidth, height: mapView.getContainer().offsetHeight };
    } else {
      return {
        height: isLandscape
          ? windowHeight
          : isDataOpened === 'expanded'
          ? 0
          : isDataOpened === 'opened'
          ? windowHeight / 2
          : windowHeight,
        width: !isLandscape
          ? windowWidth
          : isDataOpened === 'expanded'
          ? 0
          : isDataOpened === 'opened'
          ? windowWidth / 2
          : windowWidth,
      };
    }
  }, [isDataOpened, isLandscape, windowHeight, windowWidth]);

  const changeMapRegion = useCallback(
    (region: Region | ViewState | RegionType, jumpTo = false) => {
      if (Platform.OS === 'web') {
        if (isRegionType(region)) {
          dispatch(editSettingsAction({ mapRegion: region }));
        } else if (isViewState(region)) {
          if (mapViewRef.current === null) {
            dispatch(editSettingsAction({ mapRegion: { ...region, latitudeDelta: 0.001, longitudeDelta: 0.001 } }));
          } else if (isMapRef(mapViewRef.current)) {
            const { latitudeDelta, longitudeDelta } = zoomToDelta(mapViewRef.current);
            dispatch(editSettingsAction({ mapRegion: { ...region, latitudeDelta, longitudeDelta } }));
          }
        }
      } else {
        if (isRegion(region) && !isRegionType(region)) {
          const delta = { longitudeDelta: region.longitudeDelta, latitudeDelta: region.latitudeDelta };
          const newRegion = { ...region, zoom: deltaToZoom(windowWidth, delta).zoom };
          dispatch(editSettingsAction({ mapRegion: newRegion }));
        } else if (jumpTo && isRegionType(region)) {
          const jumpRegion = {
            latitude: region.latitude,
            longitude: region.longitude,
            latitudeDelta: region.latitudeDelta,
            longitudeDelta: region.longitudeDelta,
          };
          (mapViewRef.current as MapView).animateToRegion(jumpRegion, 5);
        }
      }
    },
    [dispatch, windowWidth]
  );

  useEffect(() => {
    //Dataを表示させたときにmapRegionを強制的に更新する。mapの見た目は更新されているがmapRegionは更新されていないバグ？のため

    if (mapViewRef.current === null || isDataOpened === 'expanded') return;
    if (Platform.OS === 'web') {
      (mapViewRef.current as MapRef).resize();
    } else {
      (mapViewRef.current as MapView).animateToRegion(mapRegion, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDataOpened, isLandscape]);

  return {
    mapViewRef,
    mapRegion,
    mapSize,
    windowHeight,
    windowWidth,
    isLandscape,
    changeMapRegion,
  } as const;
};
