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

export const saveProjectBackup = (_state: BackupStateType, _trigger: BackupTriggerType): boolean => false;

export const listBackups = (): BackupMetaType[] => [];

export const loadBackup = (_id: string): BackupSnapshotType | undefined => undefined;

export const deleteBackup = (_id: string): void => undefined;
