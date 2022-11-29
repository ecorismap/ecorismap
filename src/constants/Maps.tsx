import { t } from '../i18n/config';
import { TileMapType } from '../types';

export const JP: TileMapType[] = [
  {
    id: 'hillshademap',
    name: '陰影起伏図',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png',
    attribution: '国土地理院',
    maptype: 'none',
    visible: true,
    transparency: 0.7,
    overzoomThreshold: 16,
    highResolutionEnabled: false,
    minimumZ: 0,
    maximumZ: 17,
    flipY: false,
  },
  {
    id: 'std',
    name: '地理院地図',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
    attribution: '国土地理院',
    maptype: 'none',
    visible: true,
    transparency: 0,
    overzoomThreshold: 18,
    highResolutionEnabled: true,
    minimumZ: 0,
    maximumZ: 22,
    flipY: false,
  },
];

export const BASE: TileMapType[] = [
  {
    id: 'hybrid',
    name: t('common.satelliteImage'),
    url: '',
    attribution: 'Google',
    maptype: 'hybrid',
    visible: false,
    transparency: 0,
    overzoomThreshold: 22,
    highResolutionEnabled: false,
    minimumZ: 0,
    maximumZ: 22,
    flipY: false,
  },
  {
    id: 'standard',
    name: t('common.standardMap'),
    url: '',
    attribution: 'Google',
    maptype: 'standard',
    visible: true,
    transparency: 0,
    overzoomThreshold: 22,
    highResolutionEnabled: false,
    minimumZ: 0,
    maximumZ: 22,
    flipY: false,
  },
];
