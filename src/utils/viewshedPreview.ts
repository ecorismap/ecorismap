import { ulid } from 'ulid';
import { LocationType } from '../types';
import { calcViewshedPolygons, makeCircleRing, ViewshedPolygon } from './viewshed';
import { t } from '../i18n/config';

// 1回の可視領域計算の結果一式。地図への一時表示に必要な情報を持つ
export interface ViewshedPreviewResult {
  // Reactキー用のID
  id: string;
  // スナップ適用済みの観測点座標
  observer: LocationType;
  polygons: ViewshedPolygon[];
  circleRing: LocationType[];
}

/** 可視領域を計算して一時表示用の結果を返す（レイヤ・レコードは作成しない） */
export const calcViewshedPreview = async (
  observer: LocationType,
  distanceKm: number,
  observerHeight: number
): Promise<{ isOK: boolean; message: string; result?: ViewshedPreviewResult }> => {
  let calcResult;
  try {
    calcResult = await calcViewshedPolygons(observer, distanceKm * 1000, observerHeight);
  } catch (e) {
    calcResult = null;
  }
  if (calcResult === null) {
    return { isOK: false, message: t('hooks.message.failGetDem') };
  }
  const { polygons } = calcResult;
  if (polygons.length === 0) {
    return { isOK: false, message: t('hooks.message.failCalcViewshed') };
  }
  return {
    isOK: true,
    message: '',
    result: {
      id: ulid(),
      observer,
      polygons,
      circleRing: makeCircleRing(observer, distanceKm * 1000),
    },
  };
};
