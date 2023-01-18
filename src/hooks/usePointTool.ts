import { useCallback } from 'react';
import { LayerType, PointRecordType, RecordType } from '../types';
import { useDispatch } from 'react-redux';
import * as Location from 'expo-location';
import { toLocationType } from '../utils/Location';
import { LatLng } from 'react-native-maps';
import { t } from '../i18n/config';
import { cloneDeep } from 'lodash';
import { updateRecordsAction } from '../modules/dataSet';
import { useRecord } from './useRecord';

export type UsePointToolReturnType = {
  addCurrentPoint: () => Promise<{
    isOK: boolean;
    message: string;
    layer: LayerType | undefined;
    record: RecordType | undefined;
  }>;

  dragEndPoint: (
    layer: LayerType,
    feature: PointRecordType,
    coordinate: LatLng
  ) => {
    isOK: boolean;
    message: string;
  };
  resetPointPosition: (editingLayer: LayerType, feature: RecordType) => void;
};

export const usePointTool = (): UsePointToolReturnType => {
  const dispatch = useDispatch();
  const { dataUser, addRecordWithCheck, isLayerEditable } = useRecord();

  const addCurrentPoint = useCallback(async () => {
    const location = await Location.getLastKnownPositionAsync();
    if (location === null) {
      return { isOK: false, message: t('hooks.message.turnOnGPS'), layer: undefined, record: undefined };
    }
    return addRecordWithCheck('POINT', toLocationType(location)!);
  }, [addRecordWithCheck]);

  const resetPointPosition = useCallback(
    (editingLayer: LayerType, feature: RecordType) => {
      const data = cloneDeep(feature);
      data.redraw = !data.redraw;

      dispatch(
        updateRecordsAction({
          layerId: editingLayer.id,
          userId: feature.userId,
          data: [data],
        })
      );
    },
    [dispatch]
  );

  const dragEndPoint = useCallback(
    (layer: LayerType, feature: PointRecordType, coordinate: LatLng) => {
      const editable = isLayerEditable('POINT', layer);
      if (editable) {
        const data = cloneDeep(feature);
        data.coords.latitude = coordinate.latitude;
        data.coords.longitude = coordinate.longitude;
        if (data.coords.ele !== undefined) data.coords.ele = undefined;
        dispatch(updateRecordsAction({ layerId: layer.id, userId: dataUser.uid, data: [data] }));

        return { isOK: true, message: '' };
      } else {
        resetPointPosition(layer, feature);
        return { isOK: false, message: '' };
      }
    },
    [dataUser.uid, dispatch, isLayerEditable, resetPointPosition]
  );

  return {
    addCurrentPoint,
    dragEndPoint,
    resetPointPosition,
  } as const;
};
