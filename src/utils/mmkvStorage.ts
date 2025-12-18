import { createMMKV, MMKV } from 'react-native-mmkv';
import { Storage } from 'redux-persist';

// MMKVインスタンスを作成（アプリ全体で再利用）
// v4では new MMKV() から createMMKV() に変更
export const storage: MMKV = createMMKV({
  id: 'ecorismap-storage',
});

// 大容量データ用の別インスタンス（トラックログ用）
export const trackLogStorage: MMKV = createMMKV({
  id: 'ecorismap-tracklog',
});
// デバッグログ専用のMMKVインスタンス（削除済み）

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
    storage.remove(key);
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
      storage.remove(key);
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
      trackLogStorage.remove('tracklog');
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
        trackLogStorage.remove('current-location');
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

  // トラッキング状態の保存/取得（kill後の復帰で軌跡記録を正しく復元するため）
  setTrackingState: (state: 'on' | 'off'): void => {
    try {
      trackLogStorage.set('trackingState', state);
    } catch (error) {
      // console.error('Failed to save tracking state:', error);
    }
  },

  getTrackingState: (): 'on' | 'off' => {
    try {
      return (trackLogStorage.getString('trackingState') as 'on' | 'off') ?? 'off';
    } catch (error) {
      // console.error('Failed to get tracking state:', error);
      return 'off';
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
      trackLogStorage.remove(key);
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
// デバッグログMMKV関連のコードは削除済み

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