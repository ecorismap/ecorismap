import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { LayerType } from '../types';
import { AppState } from '../modules';
import { updateLayerAction, setLayersAction } from '../modules/layers';

import { cloneDeep } from 'lodash';

export type UseLayersReturnType = {
  layers: LayerType[];
  changeLabel: (layer: LayerType, labelValue: string) => void;
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
    changeVisible,
    changeActiveLayer,
    changeLayerOrder,
  } as const;
};
