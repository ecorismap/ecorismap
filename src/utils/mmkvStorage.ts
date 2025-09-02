import { MMKV } from 'react-native-mmkv';
import { Storage } from 'redux-persist';

// MMKVインスタンスを作成（アプリ全体で再利用）
export const storage = new MMKV({
  id: 'ecorismap-storage',
  encryptionKey: undefined, // 必要に応じて暗号化キーを設定
});

// 大容量データ用の別インスタンス（トラックログ用）
export const trackLogStorage = new MMKV({
  id: 'ecorismap-tracklog',
  encryptionKey: undefined,
});
// デバッグログ専用のMMKVインスタンス
const debugLogStorage = new MMKV({
  id: 'ecorismap-debug-log',
  encryptionKey: undefined,
});

// Redux Persist用のストレージアダプター
export const reduxMMKVStorage: Storage = {
  setItem: (key: string, value: any): Promise<boolean> => {
    storage.set(key, value);
    return Promise.resolve(true);
  },
  getItem: (key: string): Promise<string | null> => {
    const value = storage.getString(key);
    return Promise.resolve(value ?? null);
  },
  removeItem: (key: string): Promise<void> => {
    storage.delete(key);
    return Promise.resolve();
  },
};

// MMKVベースのストレージインターフェース
export const MMKVAsyncStorageCompat = {
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      storage.set(key, value);
    } catch (error) {
      // console.error('MMKV setItem error:', error);
      throw error;
    }
  },
  
  getItem: async (key: string): Promise<string | null> => {
    try {
      return storage.getString(key) ?? null;
    } catch (error) {
      // console.error('MMKV getItem error:', error);
      return null;
    }
  },
  
  removeItem: async (key: string): Promise<void> => {
    try {
      storage.delete(key);
    } catch (error) {
      // console.error('MMKV removeItem error:', error);
      throw error;
    }
  },
  
  clear: async (): Promise<void> => {
    try {
      storage.clearAll();
    } catch (error) {
      // console.error('MMKV clear error:', error);
      throw error;
    }
  },
  
  getAllKeys: async (): Promise<string[]> => {
    try {
      return storage.getAllKeys();
    } catch (error) {
      // console.error('MMKV getAllKeys error:', error);
      return [];
    }
  },
};

// トラックログ専用のストレージ操作
export const trackLogMMKV = {
  setTrackLog: (data: any): void => {
    try {
      // MMKVは大容量データも効率的に処理できるが、念のためサイズチェック
      const jsonString = JSON.stringify(data);
      const sizeInMB = jsonString.length / (1024 * 1024);
      
      if (sizeInMB > 10) {
        // console.warn(`Large track log detected: ${sizeInMB.toFixed(2)} MB`);
      }
      
      trackLogStorage.set('tracklog', jsonString);
    } catch (error) {
      // console.error('Failed to save track log to MMKV:', error);
      throw error;
    }
  },
  
  getTrackLog: (): any | null => {
    try {
      const jsonString = trackLogStorage.getString('tracklog');
      if (!jsonString) return null;
      return JSON.parse(jsonString);
    } catch (error) {
      // console.error('Failed to get track log from MMKV:', error);
      return null;
    }
  },
  
  clearTrackLog: (): void => {
    try {
      trackLogStorage.delete('tracklog');
    } catch (error) {
      // console.error('Failed to clear track log from MMKV:', error);
      throw error;
    }
  },
  
  // パフォーマンス測定用
  getSize: (): number => {
    const jsonString = trackLogStorage.getString('tracklog');
    return jsonString ? jsonString.length : 0;
  },
  
  // 現在地のみを保存・取得するメソッド
  setCurrentLocation: (location: any | null): void => {
    try {
      if (location) {
        trackLogStorage.set('current-location', JSON.stringify(location));
      } else {
        trackLogStorage.delete('current-location');
      }
    } catch (error) {
      // console.error('Failed to save current location:', error);
      throw error;
    }
  },
  
  getCurrentLocation: (): any | null => {
    try {
      const jsonString = trackLogStorage.getString('current-location');
      return jsonString ? JSON.parse(jsonString) : null;
    } catch (error) {
      // console.error('Failed to get current location:', error);
      return null;
    }
  },
  
  // チャンク操作用メソッド
  setChunk: (key: string, data: any): void => {
    try {
      trackLogStorage.set(key, JSON.stringify(data));
    } catch (error) {
      // console.error(`Failed to save chunk ${key}:`, error);
      throw error;
    }
  },
  
  getChunk: (key: string): any | null => {
    try {
      const jsonString = trackLogStorage.getString(key);
      return jsonString ? JSON.parse(jsonString) : null;
    } catch (error) {
      // console.error(`Failed to get chunk ${key}:`, error);
      return null;
    }
  },
  
  removeChunk: (key: string): void => {
    try {
      trackLogStorage.delete(key);
    } catch (error) {
      // console.error(`Failed to remove chunk ${key}:`, error);
      throw error;
    }
  },
  
  // メタデータ操作
  setMetadata: (metadata: any): void => {
    try {
      trackLogStorage.set('track_metadata', JSON.stringify(metadata));
    } catch (error) {
      // console.error('Failed to save metadata:', error);
      throw error;
    }
  },
  
  getMetadata: (): any | null => {
    try {
      const jsonString = trackLogStorage.getString('track_metadata');
      return jsonString ? JSON.parse(jsonString) : null;
    } catch (error) {
      // console.error('Failed to get metadata:', error);
      return null;
    }
  },
};
// デバッグログ用の型定義
export interface DebugLogEntry {
  timestamp: number;
  type: 'location-received' | 'error' | 'locations-processed' | 'check-locations' | 'chunk-updated' | 'chunk-saved';
  appState: string;
  data?: any;
  error?: any;
  metadata?: any;
}

// デバッグログMMKV
export const debugLogMMKV = {
  addLog: (entry: DebugLogEntry): void => {
    try {
      const logs = debugLogMMKV.getLogs();
      logs.push(entry);
      // 最大1000件まで保持
      if (logs.length > 1000) {
        logs.shift();
      }
      debugLogStorage.set('debug-logs', JSON.stringify(logs));
    } catch (error) {
      console.error('Failed to add debug log:', error);
    }
  },
  
  getLogs: (): DebugLogEntry[] => {
    try {
      const jsonString = debugLogStorage.getString('debug-logs');
      return jsonString ? JSON.parse(jsonString) : [];
    } catch (error) {
      console.error('Failed to get debug logs:', error);
      return [];
    }
  },
  
  clearLogs: (): void => {
    try {
      debugLogStorage.delete('debug-logs');
    } catch (error) {
      console.error('Failed to clear debug logs:', error);
    }
  },
  
  exportLogs: (): string => {
    try {
      const logs = debugLogMMKV.getLogs();
      return JSON.stringify(logs, null, 2);
    } catch (error) {
      console.error('Failed to export debug logs:', error);
      return '[]';
    }
  },
  
  getSize: (): number => {
    const jsonString = debugLogStorage.getString('debug-logs');
    return jsonString ? jsonString.length : 0;
  }
};

// データマイグレーション用ユーティリティ
export const migrateFromAsyncStorage = async (AsyncStorage: any): Promise<void> => {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    // console.log(`Migrating ${allKeys.length} keys from AsyncStorage to MMKV...`);
    
    for (const key of allKeys) {
      const value = await AsyncStorage.getItem(key);
      if (value !== null) {
        storage.set(key, value);
      }
    }
    
    // console.log('Migration completed successfully');
  } catch (error) {
    // console.error('Migration failed:', error);
    throw error;
  }
};