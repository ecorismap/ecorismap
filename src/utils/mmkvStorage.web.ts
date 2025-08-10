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

// AsyncStorageと同じインターフェースを提供（Web用）
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
};

// データマイグレーション用ユーティリティ（Web用）
export const migrateFromAsyncStorage = async (_AsyncStorage: any): Promise<void> => {
  // Web環境ではマイグレーション不要
  // console.log('Migration not needed for web environment');
};