import { useCallback, useState } from 'react';
import { LayerType, PointToolType, RecordType } from '../types';
import { useDispatch } from 'react-redux';
import * as Location from 'expo-location';
import { toLocationType } from '../utils/Location';
import { LatLng, MapEvent } from 'react-native-maps';
import { t } from '../i18n/config';
import { cloneDeep } from 'lodash';
import { updateRecordsAction } from '../modules/dataSet';
import { useFeature } from './useFeature';

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
    feature: RecordType,
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
  const { addFeature, checkEditable, getEditingLayerAndRecordSet, updatePointPosition } = useFeature();
  const [currentPointTool, setPointTool] = useState<PointToolType>('NONE');

  const addCurrentPoint = useCallback(async () => {
    const location = await Location.getLastKnownPositionAsync();
    if (location === null) {
      return { isOK: false, message: t('hooks.message.turnOnGPS'), layer: undefined, data: undefined };
    }
    return addFeature('POINT', toLocationType(location)!);
  }, [addFeature]);

  const addPressPoint = useCallback(
    (e: MapEvent<{}>) => {
      const location = {
        //@ts-ignore
        latitude: e.nativeEvent ? e.nativeEvent.coordinate.latitude : e.latLng.lat(),
        //@ts-ignore
        longitude: e.nativeEvent ? e.nativeEvent.coordinate.longitude : e.latLng.lng(),
      };
      return addFeature('POINT', location);
    },
    [addFeature]
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
    (layer: LayerType, feature: RecordType, coordinate: LatLng) => {
      const { editingLayer } = getEditingLayerAndRecordSet('POINT');
      if (editingLayer === undefined) {
        resetPointPosition(layer, feature);
        return { isOK: false, message: t('hooks.message.noEditingLayer') };
      }
      const { isOK, message } = checkEditable(editingLayer, feature);
      if (isOK) {
        updatePointPosition(editingLayer, feature, coordinate);
        return { isOK: true, message: '' };
      } else {
        resetPointPosition(layer, feature);
        return { isOK: false, message };
      }
    },
    [checkEditable, getEditingLayerAndRecordSet, resetPointPosition, updatePointPosition]
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
