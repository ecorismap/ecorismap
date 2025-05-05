import { useCallback, useMemo } from 'react';
import { LayerType, LocationType, RecordType } from '../types';
import * as Location from 'expo-location';
import { toLocationType } from '../utils/Location';
import { t } from '../i18n/config';
import { useRecord } from './useRecord';
import { cloneDeep } from 'lodash';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { deleteRecordsAction, updateRecordsAction } from '../modules/dataSet';
import { LatLng } from 'react-native-maps';
import { RootState } from '../store';

export type UsePointToolReturnType = {
  addCurrentPoint: () => Promise<{
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
    const location = await Location.getLastKnownPositionAsync();
    if (location === null) return undefined;
    return toLocationType(location);
  }, []);

  const addCurrentPoint = useCallback(async () => {
    const location = await getCurrentPoint();
    if (location === undefined) {
      return { isOK: false, message: t('hooks.message.turnOnGPS'), layer: undefined, record: undefined };
    }
    return addRecordWithCheck('POINT', location);
  }, [addRecordWithCheck, getCurrentPoint]);

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
