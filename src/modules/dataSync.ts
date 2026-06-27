import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/**
 * データの楽観的ロック用の「最終同期時刻」基準値ストア。
 * 同一アカウントを複数端末で使うときの上書き消失を防ぐため、
 * 自分のデータをアップロードした時点のクラウド encryptedAt(ms) を
 * `${layerId}_${permission}` 単位で保持する。
 *
 * 形: { [projectId]: { [`${layerId}_${permission}`]: number(ms) } }
 */
export type DataSyncState = {
  [projectId: string]: {
    [layerPermissionKey: string]: number;
  };
};

export const dataSyncInitialState: DataSyncState = {};

export const dataSyncKey = (layerId: string, permission: string) => `${layerId}_${permission}`;

const reducers = {
  /**
   * 指定プロジェクトの基準値をまとめて更新する。
   * value が undefined のキーは削除（クラウドにデータが無い＝基準値未確立を表す）。
   */
  setDataSyncTimestampsAction: (
    state: DataSyncState,
    action: PayloadAction<{ projectId: string; entries: { [key: string]: number | undefined } }>
  ) => {
    const { projectId, entries } = action.payload;
    const current = { ...(state[projectId] ?? {}) };
    Object.entries(entries).forEach(([key, value]) => {
      if (value === undefined) {
        delete current[key];
      } else {
        current[key] = value;
      }
    });
    state[projectId] = current;
  },
  /** 指定プロジェクトの基準値をすべて破棄する。 */
  clearDataSyncProjectAction: (state: DataSyncState, action: PayloadAction<string>) => {
    delete state[action.payload];
  },
};

const dataSyncSlice = createSlice({
  name: 'dataSync',
  initialState: dataSyncInitialState,
  reducers,
});

export const { setDataSyncTimestampsAction, clearDataSyncProjectAction } = dataSyncSlice.actions;
export default dataSyncSlice.reducer;
