// Web版用のダミー実装
// Web版ではAsyncStorageからMMKVへの移行は不要

export interface MigrationResult {
  success: boolean;
  message: string;
  backupPath?: string;
  error?: Error;
}

export interface StorageInfo {
  hasData: boolean;
  dataSize: number;
  keys: string[];
  lastModified?: Date;
}

/**
 * Web版では常にfalseを返す
 */
export const checkAsyncStorageData = async (): Promise<StorageInfo> => {
  return {
    hasData: false,
    dataSize: 0,
    keys: [],
  };
};

/**
 * Web版では常にfalseを返す
 */
export const isMigrationCompleted = (): boolean => {
  return true; // Web版では移行済みとして扱う
};

/**
 * Web版では常にfalseを返す
 */
export const isMigrationSkipped = (): boolean => {
  return false;
};

/**
 * Web版では常にfalseを返す
 */
export const isMigrationPostponed = (): boolean => {
  return false;
};

/**
 * Web版では実装不要
 */
export const exportAsyncStorageData = async (): Promise<string | null> => {
  throw new Error('Not supported on web');
};

/**
 * Web版では実装不要
 */
export const migrateToMMKV = async (_options: {
  backup: boolean;
  clearOldData: boolean;
}): Promise<MigrationResult> => {
  return {
    success: false,
    message: 'Not supported on web',
  };
};

/**
 * Web版では実装不要
 */
export const skipMigration = (): void => {
  // No-op
};

/**
 * Web版では実装不要
 */
export const postponeMigration = (): void => {
  // No-op
};

/**
 * Web版では実装不要
 */
export const resetMigrationStatus = (): void => {
  // No-op
};

/**
 * データサイズを人間が読みやすい形式に変換
 */
export const formatDataSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
};