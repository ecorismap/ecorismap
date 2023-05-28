import produce, { enableES5 } from 'immer';
enableES5();

import { DataType, RecordType, LocationType, PhotoType } from '../types';

export const DEFAULT_DATA: RecordType = {
  id: '',
  userId: undefined,
  displayName: null,
  visible: true,
  redraw: false,
  coords: { latitude: 0, longitude: 0 },
  field: {},
};

export function createDataSetInitialState(): DataType[] {
  return [
    { layerId: '0', userId: undefined, data: [] },
    { layerId: '1', userId: undefined, data: [] },
    { layerId: '2', userId: undefined, data: [] },
    { layerId: '3', userId: undefined, data: [] },
  ];
}

export const SET_DATASET = 'dataSet/setDataSet' as const;
export const ADD_DATA = 'dataSet/addData' as const;
export const UPDATE_DATA = 'dataSet/updataData' as const;
export const DELETE_DATA = 'dataSet/deleteData' as const;
export const SET_RECORDSET = 'dataSet/setRecordSet' as const;
export const ADD_RECORDS = 'dataSet/addRecords' as const;
export const UPDATE_RECORDS = 'dataSet/updateRecords' as const;
export const DELETE_RECORDS = 'dataSet/deleteRecords' as const;
export const UPDATE_TRACKFIELD = 'dataSet/updateTrackField' as const;

export const setDataSetAction = (payload: DataType[]) => ({
  type: SET_DATASET,
  value: payload,
});
export const addDataAction = (payload: DataType[]) => ({
  type: ADD_DATA,
  value: payload,
});
export const updateDataAction = (payload: DataType[]) => ({
  type: UPDATE_DATA,
  value: payload,
});
export const deleteDataAction = (payload: DataType[]) => ({
  type: DELETE_DATA,
  value: payload,
});
export const setRecordSetAction = (payload: DataType) => ({
  type: SET_RECORDSET,
  value: payload,
});
export const addRecordsAction = (payload: DataType) => ({
  type: ADD_RECORDS,
  value: payload,
});
export const updateRecordsAction = (payload: DataType) => ({
  type: UPDATE_RECORDS,
  value: payload,
});
export const deleteRecordsAction = (payload: DataType) => ({
  type: DELETE_RECORDS,
  value: payload,
});
export const updateTrackFieldAction = (payload: {
  layerId: string;
  userId: string | undefined;
  dataId: string;
  field: { [key: string]: string | number | PhotoType[] };
  coords: LocationType[];
}) => ({
  type: UPDATE_TRACKFIELD,
  value: payload,
});
export type Action =
  | Readonly<ReturnType<typeof setDataSetAction>>
  | Readonly<ReturnType<typeof addDataAction>>
  | Readonly<ReturnType<typeof updateDataAction>>
  | Readonly<ReturnType<typeof deleteDataAction>>
  | Readonly<ReturnType<typeof setRecordSetAction>>
  | Readonly<ReturnType<typeof addRecordsAction>>
  | Readonly<ReturnType<typeof updateRecordsAction>>
  | Readonly<ReturnType<typeof deleteRecordsAction>>
  | Readonly<ReturnType<typeof updateTrackFieldAction>>;

const reducer = produce((draft, action: Action) => {
  switch (action.type) {
    case SET_DATASET: {
      return action.value;
    }
    case ADD_DATA: {
      draft.push(...action.value);
      break;
    }
    case UPDATE_DATA: {
      if (draft.length === 0) return action.value;
      const newData = action.value.filter((v) => !draft.find((d) => v.layerId === d.layerId && v.userId === d.userId));
      const updatedData = draft.map((d) => {
        return action.value.find((v) => v.layerId === d.layerId && v.userId === d.userId) || d;
      });
      return [...updatedData, ...newData];
    }
    case DELETE_DATA: {
      return draft.filter((d) => !action.value.find((v: DataType) => v.layerId === d.layerId && v.userId === d.userId));
    }
    case SET_RECORDSET: {
      const { layerId, userId, data }: DataType = action.value;
      const dataIndex = draft.findIndex((d) => d.layerId === layerId && d.userId === userId);
      console.assert(dataIndex !== -1, { dataIndex, error: 'SET_RECORDSET' });
      if (dataIndex !== -1) {
        draft[dataIndex].data = data;
      }
      break;
    }
    case ADD_RECORDS: {
      const { layerId, userId, data }: DataType = action.value;
      const dataIndex = draft.findIndex((d) => d.layerId === layerId && d.userId === userId);
      if (dataIndex !== -1) {
        draft[dataIndex].data.push(...data);
      } else {
        //プロジェクトをダウンロードしてすぐはデータがないので以下が必要
        draft.push(action.value);
      }
      break;
    }
    case UPDATE_RECORDS: {
      const { layerId, userId, data }: DataType = action.value;
      const dataIndex = draft.findIndex((d) => d.layerId === layerId && d.userId === userId);
      console.assert(dataIndex !== -1, { dataIndex, error: 'UPDATE_RECORDS' });
      if (dataIndex !== -1) {
        draft[dataIndex].data = draft[dataIndex].data.map((d) => {
          const updateData = data.find((v) => v.id === d.id);
          return updateData ? updateData : d;
        });
      }
      break;
    }
    case DELETE_RECORDS: {
      const { layerId, userId, data }: DataType = action.value;
      const dataIndex = draft.findIndex((d) => d.layerId === layerId && d.userId === userId);
      console.assert(dataIndex !== -1, { dataIndex, error: 'DELETE_RECORDS' });
      if (dataIndex !== -1) {
        //以前とdisplayNameが変更になっていても削除ではdisplayNameの更新はされない
        draft[dataIndex].data = draft[dataIndex].data.filter((d) => !data.find((v) => v.id === d.id));
      }
      break;
    }
    case UPDATE_TRACKFIELD: {
      const {
        layerId,
        userId,
        dataId,
        field,
        coords,
      }: {
        layerId: string;
        userId: string | undefined;
        dataId: string;
        field: { [key: string]: string | number | PhotoType[] };
        coords: LocationType[];
      } = action.value;

      const dataIndex = draft.findIndex((d) => d.layerId === layerId && d.userId === userId);
      if (dataIndex !== -1) {
        const updateDataIndex = draft[dataIndex].data.findIndex((n) => n.id === dataId);
        if (updateDataIndex !== -1) {
          draft[dataIndex].data[updateDataIndex].coords = coords;
          Object.entries(field).forEach(([key, value]) => {
            draft[dataIndex].data[updateDataIndex].field[key] = value;
          });
        }
      }
      break;
    }

    default:
      return draft;
  }
}, createDataSetInitialState());
export default reducer;
