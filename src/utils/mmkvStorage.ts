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

// AsyncStorageと同じインターフェースを提供（移行を容易にするため）
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