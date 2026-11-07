import { LocationType } from '../../types';
import { FIX_QUALITY, GnssFix } from './nmea';

/**
 * GSTを出さない受信機向けの、測位品質ごとのおおよその水平精度[m]。
 * 単独測位とDGPSはHDOPに掛ける係数（UERE相当）として使う。
 */
const RTK_FIX_ACCURACY_M = 0.05;
const RTK_FLOAT_ACCURACY_M = 0.5;
const DGPS_UERE_M = 1.0;
const SINGLE_UERE_M = 3.0;

export const isUsableFix = (fix: GnssFix): boolean => fix.fixQuality !== FIX_QUALITY.INVALID;

/** 水平精度[m]。GSTの標準偏差があればそれを、なければ測位品質とHDOPから見積もる */
export const estimateHorizontalAccuracy = (fix: GnssFix): number | null => {
  if (fix.stdLat !== null && fix.stdLon !== null) return Math.hypot(fix.stdLat, fix.stdLon);
  const hdop = fix.hdop ?? 1;
  switch (fix.fixQuality) {
    case FIX_QUALITY.RTK_FIX:
      return RTK_FIX_ACCURACY_M;
    case FIX_QUALITY.RTK_FLOAT:
      return RTK_FLOAT_ACCURACY_M;
    case FIX_QUALITY.DGPS:
      return Math.max(DGPS_UERE_M * hdop, 0.5);
    case FIX_QUALITY.INVALID:
      return null;
    default:
      return Math.max(SINGLE_UERE_M * hdop, 2);
  }
};

/** 楕円体高[m]（標高＋ジオイド高からアンテナ高を引く）。どちらかが無ければnull */
export const ellipsoidHeightOf = (fix: GnssFix, antennaHeight: number): number | null =>
  fix.altitudeMsl !== null && fix.geoidSeparation !== null
    ? fix.altitudeMsl + fix.geoidSeparation - antennaHeight
    : null;

/**
 * 外部受信機の1エポックをアプリの位置に変換する。
 * 標高はポールの先のアンテナ位置なので、アンテナ高を引いて地面の高さにする。
 */
export const gnssFixToLocation = (fix: GnssFix, antennaHeight: number): LocationType => ({
  latitude: fix.latitude,
  longitude: fix.longitude,
  altitude: fix.altitudeMsl !== null ? fix.altitudeMsl - antennaHeight : null,
  accuracy: estimateHorizontalAccuracy(fix),
  altitudeAccuracy: fix.stdAlt,
  heading: fix.course,
  speed: fix.speed,
  timestamp: fix.receivedAt,
  gnss: {
    fixQuality: fix.fixQuality,
    satellites: fix.satellites,
    hdop: fix.hdop,
    diffAge: fix.diffAge,
    ellipsoidHeight: ellipsoidHeightOf(fix, antennaHeight),
  },
});

/** 画面表示用の測位品質の色（FIX=緑、FLOAT=橙、DGPS=青、単独=灰、無効=赤） */
export const fixQualityColor = (fixQuality: number): string => {
  switch (fixQuality) {
    case FIX_QUALITY.RTK_FIX:
      return '#2E9E44';
    case FIX_QUALITY.RTK_FLOAT:
      return '#F29C00';
    case FIX_QUALITY.DGPS:
      return '#2F7FD8';
    case FIX_QUALITY.INVALID:
      return '#D93025';
    default:
      return '#777777';
  }
};

/** 精度[m]を桁に合った単位で表示する（1m未満はcm） */
export const formatAccuracy = (meters: number | null | undefined): string => {
  if (meters === null || meters === undefined) return '-';
  return meters < 1 ? `${(meters * 100).toFixed(1)}cm` : `${meters.toFixed(1)}m`;
};

/** 軌跡の区間の色。RTKのFIX/FLOATだけ色を変え、それ以外（内蔵GPS・単独・DGPS）はundefined＝通常の軌跡色 */
export const trackFixColor = (fixQuality: number | undefined): string | undefined =>
  fixQuality === FIX_QUALITY.RTK_FIX || fixQuality === FIX_QUALITY.RTK_FLOAT ? fixQualityColor(fixQuality) : undefined;

/** GPSボタンの文字にする短い略号（ボタン幅に収まる5文字以内） */
export const fixQualityShortLabel = (fixQuality: number): string => {
  switch (fixQuality) {
    case FIX_QUALITY.RTK_FIX:
      return 'FIX';
    case FIX_QUALITY.RTK_FLOAT:
      return 'FLOAT';
    case FIX_QUALITY.DGPS:
      return 'DGPS';
    default:
      return 'SPP';
  }
};

/** 画面表示用の測位品質の略号 */
export const fixQualityLabel = (fixQuality: number): string => {
  switch (fixQuality) {
    case FIX_QUALITY.RTK_FIX:
      return 'FIX';
    case FIX_QUALITY.RTK_FLOAT:
      return 'FLOAT';
    case FIX_QUALITY.DGPS:
      return 'DGPS';
    case FIX_QUALITY.INVALID:
      return 'NO FIX';
    default:
      return 'SINGLE';
  }
};
