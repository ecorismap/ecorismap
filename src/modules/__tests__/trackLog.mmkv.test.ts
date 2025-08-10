import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import trackLogReducer, { appendTrackLogAction } from '../trackLog';
import { LocationType, TrackLogType } from '../../types';
import { reduxMMKVStorage } from '../../utils/mmkvStorage';

// MMKVのモック
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    getString: jest.fn(() => null),
    delete: jest.fn(),
    clearAll: jest.fn(),
    getAllKeys: jest.fn(() => []),
  })),
}));

// reduxMMKVStorageのモック
jest.mock('../../utils/mmkvStorage', () => ({
  reduxMMKVStorage: {
    setItem: jest.fn(() => Promise.resolve(true)),
    getItem: jest.fn(() => Promise.resolve(null)),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

describe('Redux Persist with MMKV for large trackLog data', () => {
  let persistor: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    if (persistor) {
      persistor.pause();
      persistor = null;
    }
  });

  // 大量のGPSデータを生成する関数
  const generateLargeTrackLog = (pointCount: number): TrackLogType => {
    const track: LocationType[] = [];
    let distance = 0;
    const baseTime = Date.now();
    
    for (let i = 0; i < pointCount; i++) {
      // リアルなGPSデータをシミュレート（東京周辺）
      const lat = 35.6762 + (Math.random() - 0.5) * 0.1;
      const lng = 139.6503 + (Math.random() - 0.5) * 0.1;
      
      track.push({
        latitude: lat,
        longitude: lng,
        altitude: Math.random() * 100,
        accuracy: 5 + Math.random() * 25,
        altitudeAccuracy: Math.random() * 10,
        heading: Math.random() * 360,
        speed: Math.random() * 30,
        timestamp: baseTime + i * 1000,
      });
      
      if (i > 0) {
        distance += 0.05; // 各ポイント間で約50m
      }
    }
    
    return {
      track,
      distance,
      lastTimeStamp: baseTime + (pointCount - 1) * 1000,
    };
  };

  it('should handle small trackLog data with MMKV', async () => {
    const persistConfig = {
      key: 'root',
      storage: reduxMMKVStorage,
    };

    const persistedReducer = persistReducer(persistConfig, trackLogReducer);

    const store = configureStore({
      reducer: persistedReducer,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
        }),
    });

    persistor = persistStore(store);

    // 小さなデータでテスト（1000ポイント ≈ 200KB）
    const smallData = generateLargeTrackLog(1000);
    store.dispatch(appendTrackLogAction(smallData));

    // 永続化を待つ
    await new Promise((resolve) => setTimeout(resolve, 100));

    // MMKVへの保存を確認
    expect(reduxMMKVStorage.setItem).toHaveBeenCalled();
    
    // データサイズを確認
    const jsonString = JSON.stringify(smallData);
    const sizeInMB = new Blob([jsonString]).size / (1024 * 1024);
    expect(sizeInMB).toBeLessThan(1);

    // クリーンアップ
    persistor.pause();
  });

  it('should handle large trackLog data exceeding 2MB with MMKV', async () => {
    const persistConfig = {
      key: 'root',
      storage: reduxMMKVStorage,
    };

    const persistedReducer = persistReducer(persistConfig, trackLogReducer);

    const store = configureStore({
      reducer: persistedReducer,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
        }),
    });

    persistor = persistStore(store);

    // 大きなデータでテスト（20000ポイント ≈ 4MB）
    const largeData = generateLargeTrackLog(20000);
    const jsonString = JSON.stringify(largeData);
    const sizeInMB = new Blob([jsonString]).size / (1024 * 1024);
    
    // 2MBを超えることを確認
    expect(sizeInMB).toBeGreaterThan(2);

    // MMKVなら問題なく保存できる
    store.dispatch(appendTrackLogAction(largeData));

    // 永続化を待つ
    await new Promise((resolve) => setTimeout(resolve, 100));

    // MMKVへの保存を確認（エラーなし）
    expect(reduxMMKVStorage.setItem).toHaveBeenCalled();

    // クリーンアップ
    persistor.pause();
  });

  it('should handle very large data (>5MB) with MMKV', async () => {
    const persistConfig = {
      key: 'root',
      storage: reduxMMKVStorage,
    };

    const persistedReducer = persistReducer(persistConfig, trackLogReducer);

    const store = configureStore({
      reducer: persistedReducer,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
        }),
    });

    persistor = persistStore(store);

    // 非常に大きなデータでテスト（30000ポイント ≈ 6MB）
    const veryLargeData = generateLargeTrackLog(30000);
    const jsonString = JSON.stringify(veryLargeData);
    const sizeInMB = new Blob([jsonString]).size / (1024 * 1024);
    
    // 5MBを超えることを確認
    expect(sizeInMB).toBeGreaterThan(5);

    // MMKVなら問題なく保存できる
    store.dispatch(appendTrackLogAction(veryLargeData));

    // 永続化を待つ
    await new Promise((resolve) => setTimeout(resolve, 100));

    // MMKVへの保存を確認（エラーなし）
    expect(reduxMMKVStorage.setItem).toHaveBeenCalled();

    // クリーンアップ
    persistor.pause();
  });
});