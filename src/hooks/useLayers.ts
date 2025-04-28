import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { LayerType } from '../types';
import { RootState } from '../store';
import { cloneDeep } from 'lodash';

import { updateLayerAction, setLayersAction } from '../modules/layers';

export type UseLayersReturnType = {
  layers: LayerType[];
  changeExpand: (layer: LayerType) => void;
  changeLabel: (layer: LayerType, labelValue: string) => void;
  changeCustomLabel: (layer: LayerType, labelValue: string) => void;
  changeVisible: (visible: boolean, index: number) => void;
  changeActiveLayer: (layer: LayerType) => void;
  changeLayerOrder: (index: number) => void;
};

export const useLayers = (): UseLayersReturnType => {
  const dispatch = useDispatch();

  const layers = useSelector((state: RootState) => state.layers);

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

  const changeExpand = useCallback(
    (layer: LayerType) => {
      //Layersの中で、groupIdとlayer.idが一致するものと自分のexpandedを反転させる
      const targetLayers = layers.map((l) => {
        if (l.groupId === layer.id || l.id === layer.id) {
          return { ...l, expanded: !l.expanded };
        }
        return l;
      });
      dispatch(setLayersAction(targetLayers));
    },
    [dispatch, layers]
  );
  const changeVisible = useCallback(
    (visible: boolean, index: number) => {
      const layerId = layers[index].id;
      const targetLayers = layers.map((l) => {
        if (l.id === layerId || l.groupId === layerId) {
          return { ...l, visible };
        }
        return l;
      });
      dispatch(setLayersAction(targetLayers));
    },
    [dispatch, layers]
  );

  const changeActiveLayer = useCallback(
    (layer: LayerType) => {
      //自分がアクティブになる場合、同じタイプの他のものはfalseにする。
      //Noneは排他処理はしない

      const index = layers.findIndex((l) => l.id === layer.id);
      if (index === -1) return;
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

      const currentLayer = newLayers[index];
      const previousLayer = newLayers[index - 1];

      if (currentLayer.type === 'LAYERGROUP') {
        // 親レイヤーを移動するとき、その中の子レイヤーも一緒に移動する
        const childLayers = newLayers.filter((layer) => layer.groupId === currentLayer.id);
        const childLayerCount = childLayers.length;

        if (previousLayer.groupId === undefined) {
          // 上のレイヤーがグループに入っていない場合
          // 親レイヤーとその子レイヤーを削除
          newLayers.splice(index, 1 + childLayerCount);
          // 親レイヤーとその子レイヤーを新しい位置に挿入
          newLayers.splice(index - 1, 0, currentLayer, ...childLayers);
        } else {
          // 上のレイヤーがグループに入っている場合
          const groupParentIndex = newLayers.findIndex((layer) => layer.id === previousLayer.groupId);
          if (groupParentIndex !== -1) {
            // 親レイヤーとその子レイヤーを削除
            newLayers.splice(index, 1 + childLayerCount);
            // 親レイヤーとその子レイヤーを新しい位置に挿入
            newLayers.splice(groupParentIndex, 0, currentLayer, ...childLayers);
          }
        }
        dispatch(setLayersAction(newLayers));
        return;
      } else {
        if (previousLayer.type === 'LAYERGROUP' && currentLayer.groupId !== previousLayer.id) {
          // 子レイヤーが親レイヤーに入る
          currentLayer.groupId = previousLayer.id;
          currentLayer.expanded = previousLayer.expanded;
          dispatch(setLayersAction(newLayers));
          return;
        } else if (previousLayer.groupId && currentLayer.groupId !== previousLayer.groupId) {
          // 子レイヤーが上のレイヤーに属するグループに入る
          currentLayer.groupId = previousLayer.groupId;
          currentLayer.expanded = previousLayer.expanded;
          dispatch(setLayersAction(newLayers));
          return;
        } else if (previousLayer.type === 'LAYERGROUP' && currentLayer.groupId) {
          // 子レイヤーがグループから出る場合、親の上に移動する
          const groupParentIndex = newLayers.findIndex((layer) => layer.id === currentLayer.groupId);
          if (groupParentIndex !== -1) {
            currentLayer.groupId = undefined;
            // 子レイヤーを親レイヤーの上に移動
            newLayers.splice(index, 1);
            newLayers.splice(groupParentIndex, 0, currentLayer);
            dispatch(setLayersAction(newLayers));
            return;
          }
        }
      }

      // 入れ替え
      [newLayers[index], newLayers[index - 1]] = [newLayers[index - 1], newLayers[index]];
      dispatch(setLayersAction(newLayers));
    },
    [dispatch, layers]
  );

  return {
    layers,
    changeExpand,
    changeLabel,
    changeCustomLabel,
    changeVisible,
    changeActiveLayer,
    changeLayerOrder,
  } as const;
};
