import { Platform, StatusBar, useWindowDimensions } from 'react-native';

export type UseWindowReturnType = {
  windowHeight: number;
  windowWidth: number;
  isLandscape: boolean;
};

export const useWindow = (): UseWindowReturnType => {
  const window = useWindowDimensions();
  const isLandscape = window.width > window.height;
  const windowWidth = window.width;
  let StatusBarHeight = 0;
  if (Platform.OS === 'android') StatusBarHeight = 24;
  const windowHeight = isLandscape && StatusBar.currentHeight ? window.height - StatusBarHeight : window.height;
  //console.log(window.width, window.height, isLandscape, StatusBar.currentHeight);
  return { windowHeight, windowWidth, isLandscape } as const;
};
