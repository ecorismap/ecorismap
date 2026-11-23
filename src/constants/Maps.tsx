import { Platform } from 'react-native';
import { t } from '../i18n/config';
import { TileMapType } from '../types';

// standard/hybridの実体はモバイル=Google Maps SDK、Web=MapTiler（Home.web.tsx参照）
const BASEMAP_ATTRIBUTION = Platform.OS === 'web' ? '© MapTiler © OpenStreetMap contributors' : 'Google';

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
    attribution: BASEMAP_ATTRIBUTION,
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
    attribution: BASEMAP_ATTRIBUTION,
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

/**
 * 新規（初回起動・プロジェクトを閉じた後・新規プロジェクト）の地図一覧。
 * 日本語では不透明な地理院地図が標準地図を覆うので、標準地図は非表示にしておく。表示のままだと Web では
 * 見えない MapTiler のタイルをパン・ズームのたびに取得し、無料枠を消費する（M-M21）。
 * 保存済みの一覧（既存の利用者・共有プロジェクト）は変えない
 */
export const createInitialTileMaps = (language: string | undefined): TileMapType[] => {
  if (language?.includes('ja')) {
    return [...JP, ...BASE.map((m) => (m.id === 'standard' ? { ...m, visible: false } : m))];
  }
  return BASE;
};
