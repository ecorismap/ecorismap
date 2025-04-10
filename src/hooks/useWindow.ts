import { useMemo } from 'react';
import { PixelRatio, useWindowDimensions } from 'react-native';
import { RegionType } from '../types';
import { shallowEqual, useSelector } from 'react-redux';
import { RootState } from '../store';

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
  const mapRegion = useSelector((state: RootState) => state.settings.mapRegion, shallowEqual);
  const window = useWindowDimensions();
  const isLandscape = useMemo(() => window.width > window.height, [window.height, window.width]);
  const windowWidth = window.width;

  //Android15（>=API 35）の場合、window.heightはinsetsを含まない値になるため、insetsを引いて計算する
  // 2025.4.10現在、Andoridの更新で修正された？
  const windowHeight = window.height;
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
