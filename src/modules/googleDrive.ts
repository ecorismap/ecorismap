import { createSlice, PayloadAction } from '@reduxjs/toolkit';

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
};

export const googleDriveInitialState: GoogleDriveState = {
  connectedEmail: undefined,
  lastSync: {},
};

const reducers = {
  setGoogleDriveConnectedEmailAction: (state: GoogleDriveState, action: PayloadAction<string | undefined>) => {
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
    delete state.lastSync[action.payload];
  },
};

const googleDriveSlice = createSlice({
  name: 'googleDrive',
  initialState: googleDriveInitialState,
  reducers,
});

export const { setGoogleDriveConnectedEmailAction, setGoogleDriveLastSyncAction, deleteGoogleDriveLastSyncAction } =
  googleDriveSlice.actions;
export default googleDriveSlice.reducer;
