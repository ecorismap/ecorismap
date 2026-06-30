import { useCallback, useMemo } from 'react';
import { LayerType, LocationType, RecordType } from '../types';
import BackgroundGeolocation from '../lib/backgroundGeolocation';
import { toLocationType } from '../utils/Location';
import { t } from '../i18n/config';
import { useRecord } from './useRecord';
import { cloneDeep } from 'lodash';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { deleteRecordsAction, updateRecordsAction } from '../modules/dataSet';
import { LatLng } from 'react-native-maps';
import { RootState } from '../store';

// iOSの getCurrentPosition はキャッシュされた古い位置を返すことがある（issue #113）。
// ライブラリが付与する age(ms) がこの閾値を超える位置は古いキャッシュとみなして採用しない。
const STALE_LOCATION_AGE_MS = 30000;

export type UsePointToolReturnType = {
  addCurrentPoint: (preferredLocation?: LocationType | null) => Promise<{
    isOK: boolean;
    message: string;
    layer: LayerType | undefined;
    record: RecordType | undefined;
  }>;
  resetPointPosition: (targetLayer: LayerType, feature: RecordType) => void;
  updatePointPosition: (targetLayer: LayerType, feature: RecordType, coordinate: LatLng | undefined) => void;
  getCurrentPoint: () => Promise<LocationType | undefined>;
};

export const usePointTool = (): UsePointToolReturnType => {
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.user);
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );
  const { addRecordWithCheck } = useRecord();

  const getCurrentPoint = useCallback(async () => {
    try {
      const location = await BackgroundGeolocation.getCurrentPosition({
        persist: false,
        samples: 3, // 複数fixを集めて最良を返す（ライブラリ既定）。samples:1だとiOSは最初のキャッシュを返す。
        maximumAge: 0, // キャッシュ位置を採用しない（best-effort。iOSでは無視され得るため下のageで再判定）。
        desiredAccuracy: BackgroundGeolocation.DesiredAccuracy.High,
        timeout: 30,
      } as any);
      if (!location) return undefined;
      // iOSは maximumAge を無視して古いキャッシュ位置を返すことがある（issue #113）。
      // age が大きい古い位置は採用しない（呼び出し側でGPS ON/記録中はライブ現在地が優先される）。
      if (typeof location.age === 'number' && location.age > STALE_LOCATION_AGE_MS) {
        return undefined;
      }
      return toLocationType({
        coords: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          altitude: location.coords.altitude ?? null,
          accuracy: location.coords.accuracy ?? null,
          altitudeAccuracy: location.coords.altitude_accuracy ?? null,
          heading: location.coords.heading ?? null,
          speed: location.coords.speed ?? null,
        },
        timestamp:
          typeof location.timestamp === 'string' ? new Date(location.timestamp).getTime() : location.timestamp ?? Date.now(),
      });
    } catch (error) {
      console.error('Failed to get current point', error);
      return undefined;
    }
  }, []);

  const addCurrentPoint = useCallback(
    async (preferredLocation?: LocationType | null) => {
      // 軌跡記録中・GPS ON中は、すでにストリーミングされているライブ現在地（地図上の現在地マーカーと同じ位置）を使う。
      // 記録中に getCurrentPosition を別途呼ぶと、iOSで位置更新ストリームと競合してキャッシュされた古い位置
      // （軌跡の開始地点など）が返ることがあるため。ライブ現在地が無いときのみ getCurrentPosition にフォールバックする。
      const location =
        preferredLocation &&
        typeof preferredLocation.latitude === 'number' &&
        typeof preferredLocation.longitude === 'number'
          ? preferredLocation
          : await getCurrentPoint();
      if (location === undefined || location === null) {
        return { isOK: false, message: t('hooks.message.turnOnGPS'), layer: undefined, record: undefined };
      }
      return addRecordWithCheck('POINT', location);
    },
    [addRecordWithCheck, getCurrentPoint]
  );

  const resetPointPosition = useCallback(
    (targetLayer: LayerType, feature: RecordType) => {
      const data = cloneDeep(feature);
      data.redraw = !data.redraw;
      dispatch(
        updateRecordsAction({
          layerId: targetLayer.id,
          userId: feature.userId,
          data: [data],
        })
      );
    },
    [dispatch]
  );

  const updatePointPosition = useCallback(
    (targetLayer: LayerType, feature: RecordType, coordinate: LatLng | undefined) => {
      const targetRecord = cloneDeep(feature);
      targetRecord.coords = coordinate ? { latitude: coordinate.latitude, longitude: coordinate.longitude } : undefined;
      //unixTimeを更新
      targetRecord.updatedAt = Date.now();
      //データの更新。userIdが変更される場合は、元のデータを削除して新しいデータを追加する
      if (targetRecord.userId !== dataUser.uid) {
        dispatch(
          deleteRecordsAction({
            layerId: targetLayer.id,
            userId: targetRecord.userId,
            data: [targetRecord],
          })
        );
      }
      targetRecord.userId = dataUser.uid;
      targetRecord.displayName = dataUser.displayName;
      dispatch(
        updateRecordsAction({
          layerId: targetLayer.id,
          userId: dataUser.uid,
          data: [targetRecord],
        })
      );
    },
    [dataUser.displayName, dataUser.uid, dispatch]
  );

  return {
    addCurrentPoint,
    resetPointPosition,
    updatePointPosition,
    getCurrentPoint,
  } as const;
};
