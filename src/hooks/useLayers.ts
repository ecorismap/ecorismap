import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { LayerType, RecordType } from '../types';
import { AppState } from '../modules';
import { updateLayerAction, setLayersAction } from '../modules/layers';

import { cloneDeep } from 'lodash';
import { t } from '../i18n/config';
import dayjs from '../i18n/dayjs';

export type UseLayersReturnType = {
  layers: LayerType[];
  changeLabel: (layer: LayerType, labelValue: string) => void;
  changeCustomLabel: (layer: LayerType, labelValue: string) => void;
  changeVisible: (layer: LayerType) => void;
  changeActiveLayer: (index: number) => void;
  changeLayerOrder: (index: number) => void;
};

export const useLayers = (): UseLayersReturnType => {
  const dispatch = useDispatch();

  const layers = useSelector((state: AppState) => state.layers);

  const changeLabel = useCallback(
    (layer: LayerType, labelValue: string) => {
      dispatch(updateLayerAction({ ...layer, label: labelValue }));
    },
    [dispatch]
  );

  const changeCustomLabel = useCallback(
    (layer: LayerType, labelValue: string) => {
      dispatch(updateLayerAction({ ...layer, customLabel: labelValue }));
    },
    [dispatch]
  );

  const changeVisible = useCallback(
    (layer: LayerType) => {
      dispatch(updateLayerAction({ ...layer, visible: !layer.visible }));
    },
    [dispatch]
  );

  const changeActiveLayer = useCallback(
    (index: number) => {
      //自分がアクティブになる場合、同じタイプの他のものはfalseにする。
      //Noneは排他処理はしない
      const newlayers = cloneDeep(layers);

      if (layers[index].active) {
        newlayers[index].active = false;
      } else if (layers[index].type === 'NONE') {
        newlayers[index].active = true;
      } else {
        newlayers.forEach((item, idx) => {
          if (layers[index].type === item.type) {
            newlayers[idx].active = index === idx ? true : false;
          }
        });
      }

      dispatch(setLayersAction(newlayers));
    },
    [dispatch, layers]
  );

  const changeLayerOrder = useCallback(
    (index: number) => {
      const newLayers = cloneDeep(layers);
      if (index === 0) return;
      [newLayers[index], newLayers[index - 1]] = [newLayers[index - 1], newLayers[index]];
      dispatch(setLayersAction(newLayers));
    },
    [dispatch, layers]
  );

  return {
    layers,
    changeLabel,
    changeCustomLabel,
    changeVisible,
    changeActiveLayer,
    changeLayerOrder,
  } as const;
};

export function generateLabel(layer: LayerType, feature: RecordType) {
  return layer.label === t('common.custom')
    ? layer.customLabel
        ?.split('|')
        .map((f) => {
          const fieldName = f.trim(); // Remove leading and trailing whitespaces
          if (fieldName.startsWith('"') || fieldName.startsWith("'")) {
            return fieldName.substring(1, fieldName.length - 1); // Remove quotes
          } else {
            return feature.field[fieldName];
          }
        })
        .join('') || '' // Remove space between joined items
    : layer.label === ''
    ? ''
    : feature.field[layer.label]
    ? layer.field.find((f) => f.name === layer.label)?.format === 'DATETIME'
      ? dayjs(feature.field[layer.label].toString()).format('L HH:mm')
      : feature.field[layer.label].toString()
    : '';
}
