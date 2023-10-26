import { useMemo } from 'react';
import { PixelRatio, Platform, useWindowDimensions } from 'react-native';
import { RegionType } from '../types';
import { shallowEqual, useSelector } from 'react-redux';
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
  const mapRegion = useSelector((state: AppState) => state.settings.mapRegion, shallowEqual);
  const window = useWindowDimensions();
  const isLandscape = useMemo(() => window.width > window.height, [window.height, window.width]);
  const windowWidth = window.width;
  let StatusBarHeight = 0;
  if (Platform.OS === 'android') StatusBarHeight = 24;
  const windowHeight = isLandscape ? window.height - StatusBarHeight : window.height;
  const devicePixelRatio = PixelRatio.get();

  const mapSize = useMemo(() => {
    return {
      height: windowHeight,
      width: windowWidth,
    };
  }, [windowHeight, windowWidth]);

  return {
    mapRegion,
    mapSize,
    windowHeight,
    windowWidth,
    isLandscape,
    devicePixelRatio,
  } as const;
};
