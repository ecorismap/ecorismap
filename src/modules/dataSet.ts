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
    console.assert(dataIndex !== -1, { dataIndex, error: 'UPDATE_RECORDS' });
    if (dataIndex !== -1) {
      state[dataIndex].data = state[dataIndex].data.map((d) => {
        const updateData = data.find((v) => v.id === d.id);
        return updateData ? updateData : d;
      });
    }
  },
  deleteRecordsAction: (state: DataType[], action: PayloadAction<DataType>) => {
    const { layerId, userId, data } = action.payload;
    const dataIndex = state.findIndex((d) => d.layerId === layerId && d.userId === userId);
    console.assert(dataIndex !== -1, { dataIndex, error: 'DELETE_RECORDS' });
    if (dataIndex !== -1) {
      state[dataIndex].data = state[dataIndex].data.filter((d) => !data.find((v) => v.id === d.id));
    }
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
