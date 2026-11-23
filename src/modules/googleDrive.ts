import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { setDataSetAction } from './dataSet';

/**
 * Google Drive個人プロジェクトの同期記録ストア。
 * 最後に保存/読込したDriveファイルの情報を projectId 単位で保持し、
 * 複数端末利用時の競合検知（headRevisionId比較）と上書き先の特定に使う。
 */
export type GoogleDriveState = {
  connectedEmail?: string;
  lastSync: {
    [projectId: string]: {
      fileId: string;
      headRevisionId: string;
      syncedAt: string;
      name: string;
    };
  };
  /**
   * 今の手元のデータが読み込み・保存されたDriveファイル。保存時の既定名に使う。
   * 直前に同期した別のファイル名を既定にすると、同意ひとつで無関係なデータに上書きされる（A-L13）
   */
  currentFileId?: string;
};

export const googleDriveInitialState: GoogleDriveState = {
  connectedEmail: undefined,
  lastSync: {},
  currentFileId: undefined,
};

const reducers = {
  setGoogleDriveConnectedEmailAction: (state: GoogleDriveState, action: PayloadAction<string | undefined>) => {
    // 接続解除・別アカウントへの切替では、今のデータとDriveファイルの対応は引き継げない
    if (action.payload !== state.connectedEmail) state.currentFileId = undefined;
    state.connectedEmail = action.payload;
  },
  setGoogleDriveLastSyncAction: (
    state: GoogleDriveState,
    action: PayloadAction<{
      projectId: string;
      fileId: string;
      headRevisionId: string;
      syncedAt: string;
      name: string;
    }>
  ) => {
    const { projectId, ...sync } = action.payload;
    state.lastSync[projectId] = sync;
  },
  deleteGoogleDriveLastSyncAction: (state: GoogleDriveState, action: PayloadAction<string>) => {
    const deleted = state.lastSync[action.payload];
    if (deleted !== undefined && deleted.fileId === state.currentFileId) state.currentFileId = undefined;
    delete state.lastSync[action.payload];
  },
  setGoogleDriveCurrentFileAction: (state: GoogleDriveState, action: PayloadAction<string | undefined>) => {
    state.currentFileId = action.payload;
  },
};

const googleDriveSlice = createSlice({
  name: 'googleDrive',
  initialState: googleDriveInitialState,
  reducers,
  extraReducers: (builder) => {
    // 新規・端末のファイルを開く・プロジェクトを開く/閉じる・バックアップ復元など、データを丸ごと置き換える経路は
    // すべてここを通る。呼び出し元ごとに消すと漏れるので、置き換えのたびに対応を外す（Driveから読んだときは直後に付け直す）
    builder.addCase(setDataSetAction, (state) => {
      state.currentFileId = undefined;
    });
  },
});

export const {
  setGoogleDriveConnectedEmailAction,
  setGoogleDriveLastSyncAction,
  deleteGoogleDriveLastSyncAction,
  setGoogleDriveCurrentFileAction,
} = googleDriveSlice.actions;
export default googleDriveSlice.reducer;

/** Drive保存の既定名。今のデータに対応するDriveファイルの名前、なければ日付の名前 */
export const selectGoogleDriveDefaultSaveName = (state: GoogleDriveState, fallbackName: string): string => {
  if (state.currentFileId === undefined) return fallbackName;
  const synced = Object.values(state.lastSync).find((s) => s.fileId === state.currentFileId);
  return synced?.name ?? fallbackName;
};
