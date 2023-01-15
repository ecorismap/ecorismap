import { useCallback, useState } from 'react';
import { LayerType, PointRecordType, PointToolType, RecordType } from '../types';
import { useDispatch } from 'react-redux';
import * as Location from 'expo-location';
import { toLocationType } from '../utils/Location';
import { LatLng, MapEvent } from 'react-native-maps';
import { t } from '../i18n/config';
import { cloneDeep } from 'lodash';
import { updateRecordsAction } from '../modules/dataSet';
import { useRecord } from './useRecord';

export type UsePointToolReturnType = {
  currentPointTool: PointToolType;
  addCurrentPoint: () => Promise<{
    isOK: boolean;
    message: string;
    layer: LayerType | undefined;
    data: RecordType | undefined;
  }>;
  addPressPoint: (e: MapEvent<{}>) => {
    isOK: boolean;
    message: string;
    data: RecordType | undefined;
    layer: LayerType | undefined;
  };
  dragEndPoint: (
    layer: LayerType,
    feature: PointRecordType,
    coordinate: LatLng
  ) => {
    isOK: boolean;
    message: string;
  };
  resetPointPosition: (editingLayer: LayerType, feature: RecordType) => void;
  setPointTool: React.Dispatch<React.SetStateAction<PointToolType>>;
};

export const usePointTool = (): UsePointToolReturnType => {
  const dispatch = useDispatch();
  const { dataUser, addRecord, checkRecordEditable, getEditingLayerAndRecordSet } = useRecord();
  const [currentPointTool, setPointTool] = useState<PointToolType>('NONE');

  const addCurrentPoint = useCallback(async () => {
    const location = await Location.getLastKnownPositionAsync();
    if (location === null) {
      return { isOK: false, message: t('hooks.message.turnOnGPS'), layer: undefined, data: undefined };
    }
    return addRecord('POINT', toLocationType(location)!);
  }, [addRecord]);

  const addPressPoint = useCallback(
    (e: MapEvent<{}>) => {
      const location = {
        //@ts-ignore
        latitude: e.nativeEvent ? e.nativeEvent.coordinate.latitude : e.latLng.lat(),
        //@ts-ignore
        longitude: e.nativeEvent ? e.nativeEvent.coordinate.longitude : e.latLng.lng(),
      };
      return addRecord('POINT', location);
    },
    [addRecord]
  );

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
      const { editingLayer } = getEditingLayerAndRecordSet('POINT');
      if (editingLayer === undefined) {
        resetPointPosition(layer, feature);
        return { isOK: false, message: t('hooks.message.noEditingLayer') };
      }
      const { isOK, message } = checkRecordEditable(editingLayer, feature);
      if (isOK) {
        const data = cloneDeep(feature);
        data.coords.latitude = coordinate.latitude;
        data.coords.longitude = coordinate.longitude;
        if (data.coords.ele !== undefined) data.coords.ele = undefined;
        dispatch(updateRecordsAction({ layerId: editingLayer.id, userId: dataUser.uid, data: [data] }));

        return { isOK: true, message: '' };
      } else {
        resetPointPosition(layer, feature);
        return { isOK: false, message };
      }
    },
    [checkRecordEditable, dataUser.uid, dispatch, getEditingLayerAndRecordSet, resetPointPosition]
  );

  return {
    currentPointTool,
    setPointTool,
    addCurrentPoint,
    addPressPoint,
    dragEndPoint,
    resetPointPosition,
  } as const;
};
