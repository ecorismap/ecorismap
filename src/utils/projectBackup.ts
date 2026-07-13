import { createMMKV, MMKV } from 'react-native-mmkv';
import { ulid } from 'ulid';
import { DataType, LayerType, ProjectType, SettingsType, TileMapType, UserType } from '../types';
import { DataSyncState } from '../modules/dataSync';

// ============================================================================
// データ破棄直前の自動バックアップ（端末内スナップショット）
//
// プロジェクトを閉じる/開く/ログアウト/データ全消去の直前に、Redux全状態を
// 専用MMKVインスタンスへ同期的に退避する。専用インスタンスにすることで
// persist用storageのclearAll等から隔離される（trackLogStorageと同じパターン）。
// 復元はsettings/layers/tileMaps/dataSet/user/projects/dataSyncのdispatchで行う。
// 写真はファイルパス参照のため、端末内復元であれば写真も維持される。
// 注意: 動的辞書（SQLite）はスナップショット対象外のため復元されない。
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

const INDEX_KEY = 'backup:index';
const SNAPSHOT_KEY_PREFIX = 'backup:snapshot:';
const MAX_GENERATIONS = 5;
//同一トリガーの連続呼び出し（例: 確認ダイアログ経由の二重実行）をスキップする間隔
const DUPLICATE_GUARD_MS = 5000;
//端末容量保護の上限。dataSetは通常数MB想定のため実質発動しない
const MAX_SNAPSHOT_SIZE = 50 * 1024 * 1024;

export const isBackupAvailable = true;

export const backupStorage: MMKV = createMMKV({
  id: 'ecorismap-backup',
});

const snapshotKey = (id: string) => `${SNAPSHOT_KEY_PREFIX}${id}`;

const readIndex = (): BackupMetaType[] => {
  try {
    const indexString = backupStorage.getString(INDEX_KEY);
    if (indexString === undefined) return [];
    const parsed = JSON.parse(indexString);
    return Array.isArray(parsed) ? (parsed as BackupMetaType[]) : [];
  } catch (e) {
    console.log('[projectBackup] index read error:', e);
    return [];
  }
};

const writeIndex = (index: BackupMetaType[]): void => {
  backupStorage.set(INDEX_KEY, JSON.stringify(index));
};

const countRecords = (dataSet: DataType[]): number =>
  dataSet.reduce((sum, d) => sum + d.data.filter((record) => !record.deleted).length, 0);

/**
 * 破棄直前のRedux状態をスナップショットとして保存する。
 * - レコード0件ならスキップ（守るべきデータがない）
 * - 同一トリガーが5秒以内に連続した場合はスキップ（二重取得ガード）
 * - 直近MAX_GENERATIONS世代のみ保持（古いものから削除）
 * 同期実行なので、呼び出し側はdispatchで破棄する前にそのまま呼べばよい。
 */
export const saveProjectBackup = (state: BackupStateType, trigger: BackupTriggerType): boolean => {
  try {
    const recordCount = countRecords(state.dataSet);
    if (recordCount === 0) return false;

    const index = readIndex();
    const now = Date.now();
    const latest = index[0];
    if (latest !== undefined && latest.trigger === trigger && now - latest.createdAt < DUPLICATE_GUARD_MS) {
      return false;
    }

    const snapshot: BackupSnapshotType = {
      version: 1,
      createdAt: now,
      trigger,
      state,
    };
    const snapshotString = JSON.stringify(snapshot);
    if (snapshotString.length > MAX_SNAPSHOT_SIZE) {
      console.log('[projectBackup] snapshot too large, skipped:', snapshotString.length);
      return false;
    }

    const meta: BackupMetaType = {
      id: ulid(),
      createdAt: now,
      trigger,
      projectId: state.settings.projectId,
      projectName: state.settings.projectName,
      recordCount,
    };

    backupStorage.set(snapshotKey(meta.id), snapshotString);

    const updatedIndex = [meta, ...index];
    const removed = updatedIndex.splice(MAX_GENERATIONS);
    removed.forEach((old) => backupStorage.remove(snapshotKey(old.id)));
    writeIndex(updatedIndex);
    return true;
  } catch (e) {
    //バックアップ失敗で本来の操作（プロジェクトを閉じる等）を妨げない
    console.log('[projectBackup] save error:', e);
    return false;
  }
};

/** バックアップ一覧（新しい順）を返す。 */
export const listBackups = (): BackupMetaType[] => readIndex();

/**
 * スナップショット本体を読み込む。JSONが壊れている場合はundefinedを返し、
 * 壊れたエントリをインデックスから除去する。
 */
export const loadBackup = (id: string): BackupSnapshotType | undefined => {
  try {
    const snapshotString = backupStorage.getString(snapshotKey(id));
    if (snapshotString === undefined) {
      writeIndex(readIndex().filter((meta) => meta.id !== id));
      return undefined;
    }
    const parsed = JSON.parse(snapshotString) as BackupSnapshotType;
    if (parsed === null || typeof parsed !== 'object' || parsed.state === undefined) throw new Error('invalid snapshot');
    return parsed;
  } catch (e) {
    console.log('[projectBackup] load error:', e);
    backupStorage.remove(snapshotKey(id));
    writeIndex(readIndex().filter((meta) => meta.id !== id));
    return undefined;
  }
};

/** 指定バックアップを削除する。 */
export const deleteBackup = (id: string): void => {
  backupStorage.remove(snapshotKey(id));
  writeIndex(readIndex().filter((meta) => meta.id !== id));
};
