import { DataType, LayerType, ProjectType, SettingsType, TileMapType, UserType } from '../types';
import { DataSyncState } from '../modules/dataSync';

// ============================================================================
// Web版のno-op実装。
// Webはセッションスコープ永続化（タブを閉じると消える）のため端末内
// スナップショットの対象外。react-native-mmkvをWebバンドルに混入させない
// ためにも、このファイルで全APIを空実装にする。
// ============================================================================

export type BackupTriggerType = 'projectClose' | 'projectOpen' | 'fileNew' | 'fileOpen' | 'beforeRestore';

export type BackupMetaType = {
  id: string;
  createdAt: number;
  trigger: BackupTriggerType;
  projectId?: string;
  projectName?: string;
  recordCount: number;
  //保存時のユーザー。null=未ログイン、undefined=uid導入前の旧メタ
  uid?: string | null;
  //復元前の別枠に入っている控えだけ true
  restoreSlot?: boolean;
};

export type BackupStateType = {
  settings: SettingsType;
  layers: LayerType[];
  tileMaps: TileMapType[];
  dataSet: DataType[];
  user: UserType;
  projects: ProjectType[];
  dataSync: DataSyncState;
};

export type BackupSnapshotType = {
  version: number;
  createdAt: number;
  trigger: BackupTriggerType;
  state: BackupStateType;
};

export const isBackupAvailable = false;

export type BackupSaveResultType = 'saved' | 'notNeeded' | 'failed';

//Webはそもそもバックアップの対象外なので、置き換えの前に確認を出さない（notNeeded）
export const saveProjectBackupWithResult = (_state: BackupStateType, _trigger: BackupTriggerType): BackupSaveResultType =>
  'notNeeded';

export const selectBackupsToRemove = (_index: BackupMetaType[]): BackupMetaType[] => [];

export const planBackupRetention = (
  index: BackupMetaType[],
  _isRedundant: (meta: BackupMetaType) => boolean
): { kept: BackupMetaType[]; removed: BackupMetaType[] } => ({ kept: index, removed: [] });

export const saveProjectBackup = (_state: BackupStateType, _trigger: BackupTriggerType): boolean => false;

export const listBackups = (): BackupMetaType[] => [];

export const loadBackup = (_id: string): BackupSnapshotType | undefined => undefined;

export const deleteBackup = (_id: string): void => undefined;

export const clearAllBackups = (): void => undefined;
