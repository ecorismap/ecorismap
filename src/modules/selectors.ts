import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '../store';
import { DataType, LineDataType, PointDataType, PolygonDataType, RecordType } from '../types';

// 元のgroupオブジェクトの参照が変わらない限り、filter済みgroupの参照を維持するキャッシュ。
// Immerは未変更groupの参照を保つため、無関係なレイヤー編集時に下流のReact.memoが壊れない。
const nonDeletedGroupCache = new WeakMap<DataType, DataType>();

const getNonDeletedGroup = (group: DataType): DataType => {
  const cached = nonDeletedGroupCache.get(group);
  if (cached) return cached;
  const data = group.data.filter((record) => !record.deleted);
  const filtered = data.length === group.data.length ? group : { ...group, data };
  nonDeletedGroupCache.set(group, filtered);
  return filtered;
};

export const selectNonDeletedDataSet = createSelector(
  (state: RootState) => state.dataSet || [],
  (dataSet) => dataSet.map(getNonDeletedGroup)
);

// メモ化されたセレクターを作成
export const selectDataSetForLayer = createSelector(
  (state: RootState) => state.dataSet || [],
  (state: RootState, layerId: string) => layerId,
  (dataSet, layerId) => dataSet.filter((d) => d.layerId === layerId)
);

export const selectDataSet = createSelector(
  (state: RootState) => state.dataSet || [],
  (_: RootState, layerId: string) => layerId,
  (dataSet, layerId) => dataSet.filter((d) => d.layerId === layerId)
);

export const selectIsNewLayer = createSelector(
  (state: RootState) => state.layers || [],
  (_: RootState, layerId: string) => layerId,
  (layers, layerId) => layers.every((d) => d.id !== layerId)
);

// variadic オーバーロードを使う
const makeSelectDataByLayerType = (layerType: string) =>
  createSelector(
    (state: RootState) => state.dataSet || [], // 第一引数
    (state: RootState) => state.layers || [], // 第二引数
    (dataSet, layers): DataType[] => {
      const dataByLayerId = new Map<string, DataType[]>();
      for (const d of dataSet) {
        const list = dataByLayerId.get(d.layerId);
        if (list) {
          list.push(d);
        } else {
          dataByLayerId.set(d.layerId, [d]);
        }
      }
      return layers
        .filter((l) => l.type === layerType)
        // 論理削除レコードを除外（キャッシュにより未変更groupの参照は維持される）
        .flatMap((l) => (dataByLayerId.get(l.id) ?? []).map(getNonDeletedGroup));
    }
  );

export const selectPointDataSet = makeSelectDataByLayerType('POINT') as (state: RootState) => PointDataType[];

export const selectLineDataSet = makeSelectDataByLayerType('LINE') as (state: RootState) => LineDataType[];

export const selectPolygonDataSet = makeSelectDataByLayerType('POLYGON') as (state: RootState) => PolygonDataType[];

export const selectNonDeletedAllUserRecordSet = createSelector(
  selectNonDeletedDataSet,
  (_: RootState, layerId?: string) => layerId,
  (dataSet, layerId): RecordType[] =>
    dataSet
      .flatMap((d) => (layerId === undefined || d.layerId === layerId ? d.data : []))
      .filter((d) => !d.deleted && (d.field._group ? d.field._group === '' : true))
);
