import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ulid } from 'ulid';
import { DataType, RecordType } from '../types';

export const DEFAULT_DATA: RecordType = {
  id: '',
  userId: undefined,
  displayName: null,
  visible: true,
  redraw: false,
  coords: { latitude: 0, longitude: 0 },
  field: {},
};

export const dataSetInitialState: DataType[] = [
  { layerId: ulid(), userId: undefined, data: [] },
  { layerId: ulid(), userId: undefined, data: [] },
  { layerId: ulid(), userId: undefined, data: [] },
];

const reducers = {
  setDataSetAction: (_state: DataType[], action: PayloadAction<DataType[]>) => {
    return action.payload;
  },
  addDataAction: (state: DataType[], action: PayloadAction<DataType[]>) => {
    state.push(...action.payload);
  },
  updateDataAction: (state: DataType[], action: PayloadAction<DataType[]>) => {
    if (state.length === 0) return action.payload;
    const newData = action.payload.filter((v) => !state.find((d) => v.layerId === d.layerId && v.userId === d.userId));
    const updatedData = state.map((d) => {
      return action.payload.find((v) => v.layerId === d.layerId && v.userId === d.userId) || d;
    });
    return [...updatedData, ...newData];
  },
  deleteDataAction: (state: DataType[], action: PayloadAction<DataType[]>) => {
    return state.filter((d) => !action.payload.find((v: DataType) => v.layerId === d.layerId && v.userId === d.userId));
  },
  setRecordSetAction: (state: DataType[], action: PayloadAction<DataType>) => {
    const { layerId, userId, data } = action.payload;
    const dataIndex = state.findIndex((d) => d.layerId === layerId && d.userId === userId);
    console.assert(dataIndex !== -1, { dataIndex, error: 'SET_RECORDSET' });
    if (dataIndex !== -1) {
      state[dataIndex].data = data;
    }
  },
  addRecordsAction: (state: DataType[], action: PayloadAction<DataType>) => {
    const { layerId, userId, data } = action.payload;
    const dataIndex = state.findIndex((d) => d.layerId === layerId && d.userId === userId);
    if (dataIndex !== -1) {
      state[dataIndex].data.push(...data);
    } else {
      state.push(action.payload);
    }
  },
  updateRecordsAction: (state: DataType[], action: PayloadAction<DataType>) => {
    const { layerId, userId, data } = action.payload;
    const dataIndex = state.findIndex((d) => d.layerId === layerId && d.userId === userId);
    //console.assert(dataIndex !== -1, { dataIndex, error: 'UPDATE_RECORDS' });
    if (dataIndex === -1) {
      // レイヤーが存在しない場合は新規追加
      state.push(action.payload);
    } else {
      // 既存レコードは更新、存在しないレコードは追加
      const existingData = state[dataIndex].data;
      const updatedData = existingData.map((d) => {
        const updateData = data.find((v) => v.id === d.id);
        return updateData ? updateData : d;
      });
      const newRecords = data.filter((v) => !existingData.find((d) => d.id === v.id));
      state[dataIndex].data = [...updatedData, ...newRecords];
    }
  },
  deleteRecordsAction: (state: DataType[], action: PayloadAction<DataType>) => {
    const { layerId, userId, data: toDelete } = action.payload;
    const idx = state.findIndex((d) => d.layerId === layerId && d.userId === userId);
    if (idx === -1) return;

    const existing = state[idx].data as RecordType[];

    // flatMap で「残すもの」「置き換えるもの」「除外するもの」を一度に処理
    state[idx].data = existing.flatMap((record) => {
      const isTarget = toDelete.some((d) => d.id === record.id);
      if (!isTarget) {
        return record;
      }

      if (record.isSynced) {
        // すでにサーバー同期済み → 論理削除フラグを立てて、coords を undefined にする。サイズを小さくするため。
        return {
          ...record,
          //field: {},
          //coords: undefined,
          userId: userId,
          deleted: true,
          updatedAt: Date.now(),
        };
      } else {
        // 未同期 → 物理削除
        return [];
      }
    });
  },
};

const dataSetSlice = createSlice({
  name: 'dataSet',
  initialState: dataSetInitialState,
  reducers,
});

export const {
  setDataSetAction,
  addDataAction,
  updateDataAction,
  deleteDataAction,
  setRecordSetAction,
  addRecordsAction,
  updateRecordsAction,
  deleteRecordsAction,
} = dataSetSlice.actions;

export default dataSetSlice.reducer;
