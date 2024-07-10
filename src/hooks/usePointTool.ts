import { useCallback } from 'react';
import { LayerType, LocationType, RecordType } from '../types';
import * as Location from 'expo-location';
import { toLocationType } from '../utils/Location';
import { t } from '../i18n/config';
import { useRecord } from './useRecord';
import { cloneDeep } from 'lodash';
import { useDispatch } from 'react-redux';
import { updateRecordsAction } from '../modules/dataSet';
import { LatLng } from 'react-native-maps';

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
      const data = cloneDeep(feature);
      data.coords = coordinate ? { latitude: coordinate.latitude, longitude: coordinate.longitude } : undefined;
      dispatch(updateRecordsAction({ layerId: targetLayer.id, userId: feature.userId, data: [data] }));
    },
    [dispatch]
  );

  return {
    addCurrentPoint,
    resetPointPosition,
    updatePointPosition,
    getCurrentPoint,
  } as const;
};
