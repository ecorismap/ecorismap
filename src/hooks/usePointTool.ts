import { useCallback } from 'react';
import { LayerType, RecordType } from '../types';
import * as Location from 'expo-location';
import { toLocationType } from '../utils/Location';
import { t } from '../i18n/config';
import { useRecord } from './useRecord';
import { cloneDeep } from 'lodash';
import { useDispatch } from 'react-redux';
import { updateRecordsAction } from '../modules/dataSet';
import { LatLng } from 'react-native-maps';
import { isPoint } from '../utils/Coords';

export type UsePointToolReturnType = {
  addCurrentPoint: () => Promise<{
    isOK: boolean;
    message: string;
    layer: LayerType | undefined;
    record: RecordType | undefined;
  }>;
  resetPointPosition: (targetLayer: LayerType, feature: RecordType) => void;
  updatePointPosition: (targetLayer: LayerType, feature: RecordType, coordinate: LatLng) => void;
};

export const usePointTool = (): UsePointToolReturnType => {
  const dispatch = useDispatch();
  const { addRecordWithCheck } = useRecord();

  const addCurrentPoint = useCallback(async () => {
    const location = await Location.getLastKnownPositionAsync();
    if (location === null) {
      return { isOK: false, message: t('hooks.message.turnOnGPS'), layer: undefined, record: undefined };
    }
    return addRecordWithCheck('POINT', toLocationType(location)!);
  }, [addRecordWithCheck]);

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
    (targetLayer: LayerType, feature: RecordType, coordinate: LatLng) => {
      const data = cloneDeep(feature);
      if (!isPoint(data.coords)) return;

      data.coords.latitude = coordinate.latitude;
      data.coords.longitude = coordinate.longitude;
      dispatch(updateRecordsAction({ layerId: targetLayer.id, userId: feature.userId, data: [data] }));
    },
    [dispatch]
  );

  return {
    addCurrentPoint,
    resetPointPosition,
    updatePointPosition,
  } as const;
};
