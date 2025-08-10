import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '../store';
import { DataType, LineDataType, PointDataType, PolygonDataType, RecordType } from '../types';

export const selectNonDeletedDataSet = createSelector(
  (state: RootState) => state.dataSet || [],
  (dataSet) =>
    dataSet.map((group) => ({
      ...group,
      data: group.data.filter((record) => !record.deleted),
    }))
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
    (dataSet, layers): DataType[] =>
      layers
        .filter((l) => l.type === layerType)
        .flatMap((l) =>
          dataSet
            .filter((d) => d.layerId === l.id)
            .map((d) => ({
              ...d,
              // ここで論理削除レコードを除外
              data: d.data.filter((record) => !record.deleted),
            }))
        )
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
