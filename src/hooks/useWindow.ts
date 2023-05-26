import { useMemo } from 'react';
import { PixelRatio, Platform, useWindowDimensions } from 'react-native';
import { useScreen } from './useScreen';
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
  devicePixelRatio: number;
};

export const useWindow = (): UseWindowReturnType => {
  const mapRegion = useSelector((state: AppState) => state.settings.mapRegion);
  const { screenState } = useScreen();
  const window = useWindowDimensions();
  const isLandscape = useMemo(() => window.width > window.height, [window.height, window.width]);
  const windowWidth = window.width;
  let StatusBarHeight = 0;
  if (Platform.OS === 'android') StatusBarHeight = 24;
  const windowHeight = isLandscape ? window.height - StatusBarHeight : window.height;
  const devicePixelRatio = PixelRatio.get();

  const mapSize = useMemo(() => {
    // if (Platform.OS === 'web' && mapViewRef.current && screenState) {
    //   const mapView = (mapViewRef.current as MapRef).getMap();
    //   return { width: mapView.getContainer().offsetWidth, height: mapView.getContainer().offsetHeight };
    // } else {
    return {
      height: isLandscape
        ? windowHeight
        : screenState === 'expanded'
        ? 0
        : screenState === 'opened'
        ? windowHeight / 2
        : windowHeight,
      width: !isLandscape
        ? windowWidth
        : screenState === 'expanded'
        ? 0
        : screenState === 'opened'
        ? windowWidth / 2
        : windowWidth,
    };
    // }
  }, [screenState, isLandscape, windowHeight, windowWidth]);

  return {
    mapRegion,
    mapSize,
    windowHeight,
    windowWidth,
    isLandscape,
    devicePixelRatio,
  } as const;
};
