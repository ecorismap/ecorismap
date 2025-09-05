// Web環境用のMMKV互換実装（sessionStorageを使用）
import { Storage } from 'redux-persist';

// Web環境では通常のsessionStorageを使用
const webStorage = typeof window !== 'undefined' ? window.sessionStorage : null;

// Redux Persist用のストレージアダプター（Web用）
export const reduxMMKVStorage: Storage = {
  setItem: (key: string, value: any): Promise<boolean> => {
    if (webStorage) {
      webStorage.setItem(key, value);
    }
    return Promise.resolve(true);
  },
  getItem: (key: string): Promise<string | null> => {
    const value = webStorage ? webStorage.getItem(key) : null;
    return Promise.resolve(value);
  },
  removeItem: (key: string): Promise<void> => {
    if (webStorage) {
      webStorage.removeItem(key);
    }
    return Promise.resolve();
  },
};

// sessionStorageベースのストレージインターフェース（Web用）
export const MMKVAsyncStorageCompat = {
  setItem: async (key: string, value: string): Promise<void> => {
    if (webStorage) {
      webStorage.setItem(key, value);
    }
  },

  getItem: async (key: string): Promise<string | null> => {
    return webStorage ? webStorage.getItem(key) : null;
  },

  removeItem: async (key: string): Promise<void> => {
    if (webStorage) {
      webStorage.removeItem(key);
    }
  },

  clear: async (): Promise<void> => {
    if (webStorage) {
      webStorage.clear();
    }
  },

  getAllKeys: async (): Promise<string[]> => {
    if (!webStorage) return [];
    const keys: string[] = [];
    for (let i = 0; i < webStorage.length; i++) {
      const key = webStorage.key(i);
      if (key) keys.push(key);
    }
    return keys;
  },
};

// mainストレージ（Web用）
export const storage = {
  set: (key: string, value: string): void => {
    if (webStorage) {
      webStorage.setItem(key, value);
    }
  },

  getString: (key: string): string | undefined => {
    if (webStorage) {
      const value = webStorage.getItem(key);
      return value !== null ? value : undefined;
    }
    return undefined;
  },

  getNumber: (key: string): number | undefined => {
    if (webStorage) {
      const value = webStorage.getItem(key);
      return value !== null ? Number(value) : undefined;
    }
    return undefined;
  },

  getBoolean: (key: string): boolean | undefined => {
    if (webStorage) {
      const value = webStorage.getItem(key);
      return value !== null ? value === 'true' : undefined;
    }
    return undefined;
  },

  delete: (key: string): void => {
    if (webStorage) {
      webStorage.removeItem(key);
    }
  },

  getAllKeys: (): string[] => {
    if (webStorage) {
      const keys = [];
      for (let i = 0; i < webStorage.length; i++) {
        const key = webStorage.key(i);
        if (key) keys.push(key);
      }
      return keys;
    }
    return [];
  },

  clearAll: (): void => {
    if (webStorage) {
      webStorage.clear();
    }
  },
};

// trackLogStorage（Web用）
export const trackLogStorage = storage;

// debugLogStorage（Web用）
//const debugLogStorage = storage;

// デバッグログ用の型定義
export interface DebugLogEntry {
  timestamp: number;
  type:
    | 'location-received'
    | 'error'
    | 'locations-processed'
    | 'check-locations'
    | 'chunk-updated'
    | 'chunk-saved'
    | 'info';
  appState: string;
  data?: any;
  error?: any;
  metadata?: any;
}

// デバッグログMMKV（Web用）
export const debugLogMMKV = {
  addLog: (entry: DebugLogEntry): void => {
    try {
      const logs = debugLogMMKV.getLogs();
      logs.push(entry);
      // 最大1000件まで保持
      if (logs.length > 1000) {
        logs.shift();
      }
      if (webStorage) {
        webStorage.setItem('debug-logs', JSON.stringify(logs));
      }
    } catch (error) {
      console.error('Failed to add debug log:', error);
    }
  },

  getLogs: (): DebugLogEntry[] => {
    try {
      if (webStorage) {
        const jsonString = webStorage.getItem('debug-logs');
        return jsonString ? JSON.parse(jsonString) : [];
      }
      return [];
    } catch (error) {
      console.error('Failed to get debug logs:', error);
      return [];
    }
  },

  clearLogs: (): void => {
    try {
      if (webStorage) {
        webStorage.removeItem('debug-logs');
      }
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
    if (webStorage) {
      const jsonString = webStorage.getItem('debug-logs');
      return jsonString ? jsonString.length : 0;
    }
    return 0;
  },
};

// トラックログ専用のストレージ操作（Web用）
export const trackLogMMKV = {
  setTrackLog: (data: any): void => {
    try {
      const jsonString = JSON.stringify(data);
      if (webStorage) {
        webStorage.setItem('tracklog', jsonString);
      }
    } catch (error) {
      // console.error('Failed to save track log to sessionStorage:', error);
      throw error;
    }
  },

  getTrackLog: (): any | null => {
    try {
      if (!webStorage) return null;
      const jsonString = webStorage.getItem('tracklog');
      if (!jsonString) return null;
      return JSON.parse(jsonString);
    } catch (error) {
      // console.error('Failed to get track log from sessionStorage:', error);
      return null;
    }
  },

  clearTrackLog: (): void => {
    try {
      if (webStorage) {
        webStorage.removeItem('tracklog');
      }
    } catch (error) {
      // console.error('Failed to clear track log from sessionStorage:', error);
      throw error;
    }
  },

  getSize: (): number => {
    if (!webStorage) return 0;
    const jsonString = webStorage.getItem('tracklog');
    return jsonString ? jsonString.length : 0;
  },

  // 現在地のみを保存・取得するメソッド
  setCurrentLocation: (location: any | null): void => {
    try {
      if (webStorage) {
        if (location) {
          webStorage.setItem('current-location', JSON.stringify(location));
        } else {
          webStorage.removeItem('current-location');
        }
      }
    } catch (error) {
      throw error;
    }
  },

  getCurrentLocation: (): any | null => {
    try {
      if (!webStorage) return null;
      const jsonString = webStorage.getItem('current-location');
      return jsonString ? JSON.parse(jsonString) : null;
    } catch (error) {
      return null;
    }
  },

  // チャンク操作用メソッド
  setChunk: (key: string, data: any): void => {
    try {
      if (webStorage) {
        webStorage.setItem(key, JSON.stringify(data));
      }
    } catch (error) {
      throw error;
    }
  },

  getChunk: (key: string): any | null => {
    try {
      if (!webStorage) return null;
      const jsonString = webStorage.getItem(key);
      return jsonString ? JSON.parse(jsonString) : null;
    } catch (error) {
      return null;
    }
  },

  removeChunk: (key: string): void => {
    try {
      if (webStorage) {
        webStorage.removeItem(key);
      }
    } catch (error) {
      throw error;
    }
  },

  // メタデータ操作
  setMetadata: (metadata: any): void => {
    try {
      if (webStorage) {
        webStorage.setItem('track_metadata', JSON.stringify(metadata));
      }
    } catch (error) {
      throw error;
    }
  },

  getMetadata: (): any | null => {
    try {
      if (!webStorage) return null;
      const jsonString = webStorage.getItem('track_metadata');
      return jsonString ? JSON.parse(jsonString) : null;
    } catch (error) {
      return null;
    }
  },
};

// データマイグレーション用ユーティリティ（Web用）
export const migrateFromAsyncStorage = async (_AsyncStorage: any): Promise<void> => {
  // Web環境ではマイグレーション不要
  // console.log('Migration not needed for web environment');
};
