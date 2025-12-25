import { useCallback, useMemo, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { LayerType } from '../types';
import { RootState } from '../store';
import { cloneDeep } from 'lodash';

import { updateLayerAction, setLayersAction } from '../modules/layers';

export type UseLayersReturnType = {
  layers: LayerType[];
  filterdLayers: LayerType[];
  changeExpand: (layer: LayerType) => void;
  changeLabel: (layer: LayerType, labelValue: string) => void;
  changeCustomLabel: (layer: LayerType, labelValue: string) => void;
  changeVisible: (visible: boolean, layer: LayerType) => void;
  changeActiveLayer: (layer: LayerType) => void;
  changeLayerOrder: (index: number, direction: 'up' | 'down') => void;
  updateLayersOrder: (data: LayerType[], from: number, to: number) => void;
  onDragBegin: (layer: LayerType) => void;
};

export const useLayers = (): UseLayersReturnType => {
  const dispatch = useDispatch();

  const layers = useSelector((state: RootState) => state.layers);

  // stale closure対策: 常に最新のlayersを参照できるようにする
  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  // フィルタ条件は必要に応じて拡張可能。ここでは全件返す。
  const filterdLayers = useMemo(
    () =>
      layers.filter((layer) => {
        if (layer.type === 'LAYERGROUP') return true; // グループ親は常に表示
        if (!layer.groupId) return true; // グループに属していないレイヤーは表示
        // グループの子は、親グループのexpandedを見て表示/非表示を決定
        const parentGroup = layers.find((l) => l.id === layer.groupId);
        return parentGroup?.expanded === true;
      }),
    [layers]
  );

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
      // layersRefから最新のlayersを取得（stale closure対策）
      const currentLayers = layersRef.current;
      const currentLayer = currentLayers.find((l) => l.id === layer.id);
      if (!currentLayer) return;

      //Layersの中で、groupIdとlayer.idが一致するものと自分のexpandedを反転させる
      const newExpanded = !currentLayer.expanded;
      const targetLayers = currentLayers.map((l) => {
        if (l.groupId === currentLayer.id || l.id === currentLayer.id) {
          return { ...l, expanded: newExpanded };
        }
        return l;
      });
      dispatch(setLayersAction(targetLayers));
    },
    [dispatch]
  );
  const changeVisible = useCallback(
    (visible: boolean, layer: LayerType) => {
      // layersRefから最新のlayersを取得（stale closure対策）
      const currentLayers = layersRef.current;
      const layerId = layer.id;
      const targetLayers = currentLayers.map((l) => {
        if (l.id === layerId || l.groupId === layerId) {
          return { ...l, visible };
        }
        return l;
      });
      dispatch(setLayersAction(targetLayers));
    },
    [dispatch]
  );

  const changeActiveLayer = useCallback(
    (layer: LayerType) => {
      //自分がアクティブになる場合、同じタイプの他のものはfalseにする。
      //Noneは排他処理はしない

      // layersRefから最新のlayersを取得（stale closure対策）
      const currentLayers = layersRef.current;
      const index = currentLayers.findIndex((l) => l.id === layer.id);
      if (index === -1) return;
      const newlayers = cloneDeep(currentLayers);

      if (currentLayers[index].active) {
        newlayers[index].active = false;
      } else if (currentLayers[index].type === 'NONE') {
        newlayers[index].active = true;
      } else {
        newlayers.forEach((item, idx) => {
          if (currentLayers[index].type === item.type) {
            newlayers[idx].active = index === idx ? true : false;
          }
        });
      }

      dispatch(setLayersAction(newlayers));
    },
    [dispatch]
  );

  const changeLayerOrder = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const newLayers = cloneDeep(layersRef.current);
      if (direction === 'up') {
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
      } else if (direction === 'down') {
        if (index === newLayers.length - 1) return;

        const currentLayer = newLayers[index];
        // nextLayer は単純な隣ではなく、操作後の隣接要素を指すように後で使う
        // const nextLayer = newLayers[index + 1]; // この行は削除またはコメントアウト

        if (currentLayer.type === 'LAYERGROUP') {
          // 親レイヤーとその子レイヤーを特定
          const childLayers = newLayers.filter((layer) => layer.groupId === currentLayer.id);
          const childLayerCount = childLayers.length;
          const groupEndIndex = index + childLayerCount; // グループの最後の要素（子）のインデックス

          // グループが既にリストの末尾にある場合は移動不可
          if (groupEndIndex >= newLayers.length - 1) {
            return;
          }

          // 移動するグループ全体（親＋子）
          const groupToMove = newLayers.slice(index, groupEndIndex + 1);

          // グループの直後にある要素（移動先ブロックの開始）
          const nextItemIndex = groupEndIndex + 1;
          const nextItem = newLayers[nextItemIndex];

          let endOfNextBlockIndex: number;

          // 次の要素がグループか、そうでないかで移動先の終点を決定
          if (nextItem.type === 'LAYERGROUP') {
            // 次の要素がグループの場合、そのグループの子も含めて終点を計算
            const nextGroupChildren = newLayers.filter((layer) => layer.groupId === nextItem.id);
            endOfNextBlockIndex = nextItemIndex + nextGroupChildren.length;
          } else {
            // 次の要素が通常レイヤーまたは別グループの子レイヤーの場合、その要素自体が終点
            endOfNextBlockIndex = nextItemIndex;
          }

          // 挿入位置は、移動先ブロックの直後
          let insertionIndex = endOfNextBlockIndex + 1;

          // まず、移動するグループを配列から削除
          newLayers.splice(index, 1 + childLayerCount);

          // 削除によって挿入位置のインデックスがずれる場合があるため調整
          // 移動元(index)が計算上の挿入位置より前にある場合のみ調整が必要
          // （下に移動するので、常に index < insertionIndex のはずだが念のため）
          if (index < insertionIndex) {
            insertionIndex -= 1 + childLayerCount;
          }

          // 調整後の挿入位置にグループを挿入
          newLayers.splice(insertionIndex, 0, ...groupToMove);

          dispatch(setLayersAction(newLayers));
          return;
        } else {
          // 通常レイヤーまたは子レイヤーの移動 (既存のロジック)
          const nextLayer = newLayers[index + 1]; // ここで nextLayer を定義
          // ... existing logic for non-group 'down' movement ...
          if (nextLayer.type === 'LAYERGROUP' && currentLayer.groupId !== nextLayer.id) {
            // 子レイヤーが親レイヤーに入る
            currentLayer.groupId = nextLayer.id;
            currentLayer.expanded = nextLayer.expanded;
            // 順番も入れ替える
            newLayers.splice(index, 1);
            newLayers.splice(index + 1, 0, currentLayer); // nextLayer(親)の直後に挿入
            dispatch(setLayersAction(newLayers));
            return;
          } else if (nextLayer.groupId && currentLayer.groupId !== nextLayer.groupId) {
            // 子レイヤーが下のレイヤーに属するグループに入る
            currentLayer.groupId = nextLayer.groupId;
            const parent = newLayers.find((l) => l.id === nextLayer.groupId);
            if (parent) currentLayer.expanded = parent.expanded;
            // 順番も入れ替える
            newLayers.splice(index, 1);
            newLayers.splice(index, 0, currentLayer); // nextLayer(兄弟)の前に挿入
            dispatch(setLayersAction(newLayers));
            return;
          } else if (currentLayer.groupId && (!nextLayer || nextLayer.groupId !== currentLayer.groupId)) {
            // 子レイヤーがグループから出る場合、グループの最後の要素の下に移動
            // nextLayer が存在しないか、異なるグループに属する場合
            const currentGroupId = currentLayer.groupId;
            currentLayer.groupId = undefined; // グループから出す

            // findLastIndex の代替: 逆順ループで最後の要素のインデックスを探す
            let groupLastIndex = -1;
            for (let i = newLayers.length - 1; i >= 0; i--) {
              // 自分自身（削除前）を除外して探す
              if (i !== index && newLayers[i].groupId === currentGroupId) {
                groupLastIndex = i;
                break;
              }
            }
            // もし groupLastIndex が -1 のままなら、currentLayer がグループの唯一の要素だった
            // その場合は、単純に groupId を undefined にして通常の入れ替えに進む（この分岐の外側で処理される）

            if (groupLastIndex !== -1) {
              const layerToMove = newLayers.splice(index, 1)[0]; // レイヤーを削除
              // 削除によってインデックスがずれる可能性があるため、挿入位置を調整
              // index < groupLastIndex の場合、groupLastIndex は1つずれる
              const insertionIndex = index < groupLastIndex ? groupLastIndex : groupLastIndex + 1;
              newLayers.splice(insertionIndex, 0, layerToMove); // グループの最後の要素だったものの次に挿入
              dispatch(setLayersAction(newLayers));
              return;
            }
            // グループの最後の要素が見つからなかった場合（元々唯一の要素だった場合など）
            // groupId を undefined にする変更だけ適用し、通常の入れ替え処理に任せる
            // （groupId は上で undefined に設定済み）
          }
        }

        // 通常の入れ替え (グループ操作が行われなかった場合など)
        const layerToMove = newLayers[index]; // 再度取得が必要な場合がある
        const nextLayer = newLayers[index + 1]; // 再度取得が必要な場合がある
        [newLayers[index], newLayers[index + 1]] = [nextLayer, layerToMove];
        dispatch(setLayersAction(newLayers));
      }
    },
    [dispatch]
  );

  const onDragBegin = useCallback(
    (layer: LayerType) => {
      // ドラッグ開始時の処理
      //ドラッグしたものがグループの場合、グループの展開を閉じる
      // layersRefから最新のlayersを取得（stale closure対策）
      const currentLayers = layersRef.current;
      const index = currentLayers.findIndex(({ id }) => id === layer.id);
      const item = currentLayers[index];
      if (item.type === 'LAYERGROUP') {
        const newLayers = currentLayers.map((l) => {
          if (l.groupId === item.id || l.id === item.id) {
            return { ...l, expanded: false };
          }
          return l;
        });
        dispatch(setLayersAction(newLayers));
      }
    },
    [dispatch]
  );

  const updateLayersOrder = useCallback(
    (data: LayerType[], from: number, to: number) => {
      if (from === to) return;

      // layersRefから最新のlayersを取得（stale closure対策）
      const currentLayers = layersRef.current;
      const draggedLayer = data[from];
      const targetLayer = to > 0 ? data[to - 1] : undefined;
      const fromIndex = currentLayers.findIndex(({ id }) => id === data[from].id);
      const toIndex = to > data.length - 1 ? currentLayers.length : currentLayers.findIndex(({ id }) => id === data[to].id);
      const newLayers = cloneDeep(currentLayers);

      // グループ親の場合
      if (draggedLayer.type === 'LAYERGROUP') {
        //グループの中には移動できない
        if (targetLayer && targetLayer.expanded && (targetLayer.type === 'LAYERGROUP' || targetLayer.groupId)) {
          return;
        } else {
          //グループごと移動する
          const groupTileMaps = newLayers.filter(
            (layer) => layer.id === draggedLayer.id || layer.groupId === draggedLayer.id
          );
          newLayers.splice(fromIndex, groupTileMaps.length);
          const fixedToIndex = toIndex > fromIndex ? toIndex - groupTileMaps.length : toIndex;
          // groupTileMapsはすでにdeep cloneされているのでそのまま使う
          newLayers.splice(fixedToIndex, 0, ...groupTileMaps);
        }
      }
      // 子レイヤーの場合
      else if (draggedLayer.groupId) {
        newLayers.splice(fromIndex, 1);
        const fixedToIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
        newLayers.splice(fixedToIndex, 0, draggedLayer);
        //グループの中で移動する場合
        if (
          targetLayer &&
          targetLayer.expanded &&
          ((targetLayer.type === 'LAYERGROUP' && targetLayer.id === draggedLayer.groupId) ||
            (targetLayer.groupId && targetLayer.groupId === draggedLayer.groupId))
        ) {
          // 何もしない
        }
        // 別のグループに移動
        else if (
          targetLayer &&
          targetLayer.expanded &&
          ((targetLayer.type === 'LAYERGROUP' && targetLayer.id !== draggedLayer.groupId) ||
            (targetLayer.groupId && targetLayer.groupId !== draggedLayer.groupId))
        ) {
          newLayers[fixedToIndex] = {
            ...newLayers[fixedToIndex],
            groupId: targetLayer.type === 'LAYERGROUP' ? targetLayer.id : targetLayer.groupId,
            expanded: targetLayer.expanded,
          };
        }
        // グループの外に移動
        else {
          newLayers[fixedToIndex] = {
            ...newLayers[fixedToIndex],
            groupId: undefined,
          };
        }
      }
      // グループに属していない場合
      else {
        newLayers.splice(fromIndex, 1);
        const fixedToIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
        newLayers.splice(fixedToIndex, 0, draggedLayer);
        //グループに入る場合
        if (targetLayer && targetLayer.expanded && (targetLayer.type === 'LAYERGROUP' || targetLayer.groupId)) {
          newLayers[fixedToIndex] = {
            ...newLayers[fixedToIndex],
            groupId: targetLayer.type === 'LAYERGROUP' ? targetLayer.id : targetLayer.groupId,
            expanded: targetLayer.expanded,
          };
        }
      }

      dispatch(setLayersAction(newLayers));
    },
    [dispatch]
  );

  return {
    layers,
    filterdLayers,
    changeExpand,
    changeLabel,
    changeCustomLabel,
    changeVisible,
    changeActiveLayer,
    changeLayerOrder,
    updateLayersOrder,
    onDragBegin,
  } as const;
};
