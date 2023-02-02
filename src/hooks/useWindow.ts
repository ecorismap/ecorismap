import { useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useDisplay } from './useDisplay';
import { RegionType } from '../types';
import { useSelector } from 'react-redux';
import { AppState } from '../modules';

export type UseWindowReturnType = {
  mapRegion: RegionType;
  windowHeight: number;
  windowWidth: number;
  isLandscape: boolean;
  mapSize: {
    width: number;
    height: number;
  };
};

export const useWindow = (): UseWindowReturnType => {
  const mapRegion = useSelector((state: AppState) => state.settings.mapRegion);
  const { isDataOpened } = useDisplay();
  const window = useWindowDimensions();
  const isLandscape = useMemo(() => window.width > window.height, [window.height, window.width]);
  const windowWidth = window.width;
  let StatusBarHeight = 0;
  if (Platform.OS === 'android') StatusBarHeight = 24;
  const windowHeight = isLandscape ? window.height - StatusBarHeight : window.height;

  const mapSize = useMemo(() => {
    // if (Platform.OS === 'web' && mapViewRef.current && isDataOpened) {
    //   const mapView = (mapViewRef.current as MapRef).getMap();
    //   return { width: mapView.getContainer().offsetWidth, height: mapView.getContainer().offsetHeight };
    // } else {
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
    // }
  }, [isDataOpened, isLandscape, windowHeight, windowWidth]);

  return {
    mapRegion,
    mapSize,
    windowHeight,
    windowWidth,
    isLandscape,
  } as const;
};
