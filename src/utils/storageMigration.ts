import AsyncStorage from '@react-native-async-storage/async-storage';
import { storage } from './mmkvStorage';
import * as Sharing from 'expo-sharing';
import * as RNFS from 'react-native-fs';
import { zip } from 'react-native-zip-archive';
import { exportFileFromUri, normalizeFilePath } from './File';

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
 * AsyncStorageにデータが存在するかチェック
 */
export const checkAsyncStorageData = async (): Promise<StorageInfo> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const persistKey = 'persist:root';
    const hasPersistData = keys.includes(persistKey);
    
    if (!hasPersistData) {
      return {
        hasData: false,
        dataSize: 0,
        keys: [],
      };
    }

    // データサイズを計算
    let totalSize = 0;
    const relevantKeys: string[] = [];
    
    for (const key of keys) {
      if (key.startsWith('persist:')) {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          totalSize += value.length;
          relevantKeys.push(key);
        }
      }
    }

    return {
      hasData: totalSize > 0,
      dataSize: totalSize,
      keys: relevantKeys,
    };
  } catch (error) {
    // Error checking AsyncStorage data
    return {
      hasData: false,
      dataSize: 0,
      keys: [],
    };
  }
};

/**
 * 移行済みかどうかをチェック
 */
export const isMigrationCompleted = (): boolean => {
  try {
    const migrationStatus = storage.getString('migration_completed_v2');
    return migrationStatus === 'true';
  } catch {
    return false;
  }
};

/**
 * 移行をスキップした履歴があるかチェック
 */
export const isMigrationSkipped = (): boolean => {
  try {
    const skipStatus = storage.getString('migration_skipped');
    return skipStatus === 'true';
  } catch {
    return false;
  }
};

/**
 * 移行を延期した履歴があるかチェック
 */
export const isMigrationPostponed = (): boolean => {
  try {
    const postponedStatus = storage.getString('migration_postponed');
    return postponedStatus === 'true';
  } catch {
    return false;
  }
};

/**
 * AsyncStorageのデータをecorismap形式（ZIP）でエクスポート
 */
export const exportAsyncStorageData = async (): Promise<string | null> => {
  try {
    const storageInfo = await checkAsyncStorageData();
    if (!storageInfo.hasData) {
      throw new Error('No data to export');
    }

    // persist:rootのデータを取得してパース
    const persistRootValue = await AsyncStorage.getItem('persist:root');
    if (!persistRootValue) {
      throw new Error('No persist:root data found');
    }

    const persistRoot = JSON.parse(persistRootValue);
    
    // 各reducerのデータをパース
    const exportPackage: any = {};
    
    // dataSetをパース
    if (persistRoot.dataSet) {
      try {
        exportPackage.dataSet = JSON.parse(persistRoot.dataSet);
      } catch (e) {
        // Failed to parse dataSet
        exportPackage.dataSet = [];
      }
    } else {
      exportPackage.dataSet = [];
    }
    
    // layersをパース
    if (persistRoot.layers) {
      try {
        exportPackage.layers = JSON.parse(persistRoot.layers);
      } catch (e) {
        // Failed to parse layers
        exportPackage.layers = [];
      }
    } else {
      exportPackage.layers = [];
    }
    
    // settingsをパース
    if (persistRoot.settings) {
      try {
        exportPackage.settings = JSON.parse(persistRoot.settings);
      } catch (e) {
        // Failed to parse settings
        exportPackage.settings = {};
      }
    } else {
      exportPackage.settings = {};
    }
    
    // tileMapsをパース（mapsとして）
    if (persistRoot.tileMaps) {
      try {
        exportPackage.maps = JSON.parse(persistRoot.tileMaps);
      } catch (e) {
        // Failed to parse tileMaps
        exportPackage.maps = [];
      }
    } else {
      exportPackage.maps = [];
    }

    const jsonString = JSON.stringify(exportPackage, null, 2);
    const time = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const fileName = `local_${time}`;
    
    // ecorismap形式でエクスポート
    if (RNFS) {
      const sourcePath = `${RNFS.CachesDirectoryPath}/export/${fileName}`;
      const targetPath = `${RNFS.CachesDirectoryPath}/export/${fileName}.ecorismap`;
      
      try {
        // エクスポートディレクトリを作成
        await RNFS.mkdir(`${RNFS.CachesDirectoryPath}/export`);
        await RNFS.mkdir(sourcePath);
        
        // データをlocal.jsonとして保存（generateEcorisMapDataと同じ形式）
        const localJsonPath = normalizeFilePath(`${sourcePath}/local.json`);
        await RNFS.writeFile(localJsonPath, jsonString, 'utf8');
        
        // Unicode正規化を適用してからZIP圧縮
        const normalizedSourcePath = normalizeFilePath(sourcePath);
        const normalizedTargetPath = normalizeFilePath(targetPath);
        const zipPath = await zip(normalizedSourcePath, normalizedTargetPath);
        if (zipPath !== undefined) {
          // ファイルを共有
          await exportFileFromUri(zipPath, `${fileName}.ecorismap`);
          
          // 一時ファイルを削除
          await RNFS.unlink(sourcePath);
          await RNFS.unlink(targetPath);
          
          return zipPath;
        }
      } catch (error) {
        // Error creating ecorismap backup
        
        // フォールバック: 単純なJSONファイルとして保存
        const fallbackFileName = `${fileName}.json`;
        const fallbackPath = `${RNFS.CachesDirectoryPath}/${fallbackFileName}`;
        await RNFS.writeFile(fallbackPath, jsonString, 'utf8');
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(`file://${encodeURI(fallbackPath)}`, {
            mimeType: 'application/json',
            dialogTitle: 'バックアップファイルを保存',
          });
        }
        
        await RNFS.unlink(fallbackPath);
        return fallbackPath;
      }
    }

    return null;
  } catch (error) {
    // Error exporting AsyncStorage data
    throw error;
  }
};

/**
 * AsyncStorageからMMKVへデータを移行
 */
export const migrateToMMKV = async (options: {
  backup: boolean;
  clearOldData: boolean;
}): Promise<MigrationResult> => {
  try {
    // 既に移行済みの場合
    if (isMigrationCompleted()) {
      return {
        success: true,
        message: 'Migration already completed',
      };
    }

    const storageInfo = await checkAsyncStorageData();
    if (!storageInfo.hasData) {
      // データがない場合も移行完了とマーク
      storage.set('migration_completed_v2', 'true');
      return {
        success: true,
        message: 'No data to migrate',
      };
    }

    let backupPath: string | null = null;

    // バックアップを作成
    if (options.backup) {
      try {
        backupPath = await exportAsyncStorageData();
      } catch (backupError) {
        // Backup failed, but continuing with migration
      }
    }

    // 移行処理
    let migratedCount = 0;
    for (const key of storageInfo.keys) {
      const value = await AsyncStorage.getItem(key);
      if (value !== null) {
        storage.set(key, value);
        migratedCount++;
      }
    }

    // 移行完了フラグを設定
    storage.set('migration_completed_v2', 'true');
    storage.set('migration_date', new Date().toISOString());
    storage.set('migrated_keys_count', migratedCount.toString());
    
    // postponedフラグをクリア
    storage.delete('migration_postponed');
    storage.delete('migration_postpone_date');

    // 古いデータを削除
    if (options.clearOldData) {
      try {
        for (const key of storageInfo.keys) {
          await AsyncStorage.removeItem(key);
        }
      } catch (clearError) {
        // Failed to clear old data
      }
    }

    return {
      success: true,
      message: `Successfully migrated ${migratedCount} keys to MMKV`,
      backupPath: backupPath || undefined,
    };
  } catch (error) {
    // Migration failed
    return {
      success: false,
      message: 'Migration failed',
      error: error as Error,
    };
  }
};

/**
 * 移行をスキップする
 */
export const skipMigration = (): void => {
  storage.set('migration_skipped', 'true');
  storage.set('migration_skip_date', new Date().toISOString());
};

/**
 * 移行を後で実行するようにマーク
 */
export const postponeMigration = (): void => {
  // 初回のみpostponedフラグをセット（既にセット済みの場合は上書きしない）
  if (!isMigrationPostponed()) {
    storage.set('migration_postponed', 'true');
    storage.set('migration_postpone_date', new Date().toISOString());
  }
};

/**
 * 移行状態をリセット（デバッグ用）
 */
export const resetMigrationStatus = (): void => {
  storage.delete('migration_completed_v2');
  storage.delete('migration_skipped');
  storage.delete('migration_postponed');
  storage.delete('migration_date');
  storage.delete('migrated_keys_count');
  storage.delete('migration_skip_date');
  storage.delete('migration_postpone_date');
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