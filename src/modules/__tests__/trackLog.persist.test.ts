import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import trackLogReducer, { appendTrackLogAction } from '../trackLog';
import { LocationType, TrackLogType } from '../../types';

// AsyncStorageのモック
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
}));

describe('Redux Persist with large trackLog data', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('should handle small trackLog data with Redux Persist', async () => {
    const persistConfig = {
      key: 'trackLog',
      storage: AsyncStorage,
    };

    const persistedReducer = persistReducer(persistConfig, trackLogReducer);
    const store = configureStore({
      reducer: {
        trackLog: persistedReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
        }),
    });

    const persistor = persistStore(store);

    // 小さなデータでテスト（1000ポイント ≈ 200KB）
    const smallData = generateLargeTrackLog(1000);
    store.dispatch(appendTrackLogAction(smallData));

    // Redux Persistが保存を試みる
    await new Promise((resolve) => setTimeout(resolve, 100));

    // AsyncStorage.setItemが呼ばれることを確認
    expect(AsyncStorage.setItem).toHaveBeenCalled();
    
    const calls = (AsyncStorage.setItem as jest.Mock).mock.calls;
    const persistedData = calls.find(call => call[0].includes('trackLog'));
    
    if (persistedData) {
      const sizeInMB = new Blob([persistedData[1]]).size / (1024 * 1024);
      console.log(`Small data persisted size: ${sizeInMB.toFixed(2)} MB`);
      expect(sizeInMB).toBeLessThan(2);
    }
  });

  it('should fail when trackLog exceeds 2MB with Redux Persist', async () => {
    // AsyncStorageのモックを2MB超過でエラーを返すように設定
    (AsyncStorage.setItem as jest.Mock).mockImplementation((key, value) => {
      const size = new Blob([value]).size;
      if (size > 2 * 1024 * 1024) {
        console.log(`Redux Persist failed: Data size ${(size / (1024 * 1024)).toFixed(2)} MB exceeds 2MB limit`);
        return Promise.reject(new Error('Value too large, exceeds size limit'));
      }
      return Promise.resolve();
    });

    const persistConfig = {
      key: 'trackLog',
      storage: AsyncStorage,
    };

    const persistedReducer = persistReducer(persistConfig, trackLogReducer);
    const store = configureStore({
      reducer: {
        trackLog: persistedReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
        }),
    });

    const persistor = persistStore(store);

    // 大きなデータでテスト（20000ポイント ≈ 4MB）
    const largeData = generateLargeTrackLog(20000);
    
    // データサイズを確認
    const jsonString = JSON.stringify(largeData);
    const sizeInMB = new Blob([jsonString]).size / (1024 * 1024);
    console.log(`Large trackLog size: ${sizeInMB.toFixed(2)} MB`);
    expect(sizeInMB).toBeGreaterThan(2);

    // Reduxストアに追加
    store.dispatch(appendTrackLogAction(largeData));

    // Redux Persistが保存を試みる
    await new Promise((resolve) => setTimeout(resolve, 100));

    // エラーが発生することを確認
    const calls = (AsyncStorage.setItem as jest.Mock).mock.calls;
    const failedCalls = calls.filter(call => {
      const size = new Blob([call[1]]).size;
      return size > 2 * 1024 * 1024;
    });

    expect(failedCalls.length).toBeGreaterThan(0);
  });

  it('should demonstrate accumulating data problem in foreground', async () => {
    // AsyncStorageのモックを2MB超過でエラーを返すように設定
    let persistFailures = 0;
    (AsyncStorage.setItem as jest.Mock).mockImplementation((key, value) => {
      const size = new Blob([value]).size;
      if (size > 2 * 1024 * 1024) {
        persistFailures++;
        return Promise.reject(new Error('Value too large'));
      }
      return Promise.resolve();
    });

    const persistConfig = {
      key: 'trackLog',
      storage: AsyncStorage,
    };

    const persistedReducer = persistReducer(persistConfig, trackLogReducer);
    const store = configureStore({
      reducer: {
        trackLog: persistedReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
        }),
    });

    const persistor = persistStore(store);

    // 1時間ごとのトラッキングをシミュレート
    const pointsPerHour = 3600; // 1秒ごとに1ポイント
    let totalPoints = 0;
    let persistSucceeded = true;

    for (let hour = 1; hour <= 3; hour++) {
      const hourData = generateLargeTrackLog(pointsPerHour);
      
      // Reduxストアに追加（appendTrackLogActionで累積）
      store.dispatch(appendTrackLogAction(hourData));
      totalPoints += pointsPerHour;

      // 現在のストアの状態を取得
      const currentState = store.getState().trackLog;
      const sizeInMB = new Blob([JSON.stringify(currentState)]).size / (1024 * 1024);
      
      console.log(`After ${hour} hour(s): ${totalPoints} points, ${sizeInMB.toFixed(2)} MB`);

      // Redux Persistが保存を試みる
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (sizeInMB > 2) {
        persistSucceeded = false;
        console.log(`Redux Persist failed after ${hour} hour(s) of tracking`);
        break;
      }
    }

    // 数時間のトラッキングで失敗することを確認
    expect(persistSucceeded).toBe(false);
    expect(persistFailures).toBeGreaterThan(0);
  });

  it('should test blacklist solution for trackLog', async () => {
    // trackLogをblacklistに追加した設定
    const persistConfig = {
      key: 'root',
      storage: AsyncStorage,
      blacklist: ['trackLog'], // trackLogを永続化から除外
    };

    const rootReducer = {
      trackLog: trackLogReducer,
      // 他のreducerもテスト用に追加
      settings: (state = {}) => state,
    };

    const combinedReducer = (state: any = {}, action: any) => ({
      trackLog: trackLogReducer(state.trackLog, action),
      settings: state.settings || {},
    });

    const persistedReducer = persistReducer(persistConfig, combinedReducer);
    const store = configureStore({
      reducer: persistedReducer,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
        }),
    });

    const persistor = persistStore(store);

    // 大きなデータを追加
    const largeData = generateLargeTrackLog(20000);
    store.dispatch(appendTrackLogAction(largeData));

    // Redux Persistが保存を試みる
    await new Promise((resolve) => setTimeout(resolve, 100));

    // trackLogがblacklistに含まれているため、保存されないことを確認
    const calls = (AsyncStorage.setItem as jest.Mock).mock.calls;
    const trackLogPersisted = calls.some(call => {
      const value = call[1];
      return value.includes('track') && value.includes('"track":[{');
    });

    expect(trackLogPersisted).toBe(false);
    console.log('trackLog is successfully excluded from persistence');
  });
});