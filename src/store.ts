import { configureStore } from '@reduxjs/toolkit';
import reducer from './modules/';
import { persistStore, persistReducer, createTransform } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrackLogType } from './types';

// trackLogの大容量データを安全に保存するトランスフォーム
const trackLogTransform = createTransform(
  // 保存時: trackが大きい場合はメタデータのみ保存
  (inboundState: TrackLogType, key) => {
    if (key === 'trackLog' && inboundState.track) {
      const trackLength = inboundState.track.length;
      
      // 5000ポイント（約1MB）を超える場合
      if (trackLength > 5000) {
        console.log(`Large trackLog detected: ${trackLength} points. Storing metadata only in Redux Persist.`);
        
        // メタデータのみ保存（実データはAsyncStorageのチャンク保存を使用）
        return {
          distance: inboundState.distance,
          lastTimeStamp: inboundState.lastTimeStamp,
          track: [], // 空配列にして容量削減
          trackLength: trackLength, // ポイント数を保存
          isLargeData: true, // 大容量フラグ
        };
      }
    }
    return inboundState;
  },
  // 復元時: 必要に応じてAsyncStorageから復元
  (outboundState: any, key) => {
    if (key === 'trackLog' && outboundState?.isLargeData) {
      // 大容量データの場合、AsyncStorageから復元
      // ※起動時にcheckUnsavedTrackLogで処理されるため、ここでは最小限の処理
      console.log(`Large trackLog detected on restore: ${outboundState.trackLength} points`);
    }
    return outboundState;
  },
  { whitelist: ['trackLog'] }
);

const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  transforms: [trackLogTransform],
  // trackLogも永続化するが、transformで容量制御
};

const persistedReducer = persistReducer(persistConfig, reducer);
export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      immutableCheck: false,
      serializableCheck: false,
    }),
});
export const persistor = persistStore(store);
export type RootState = ReturnType<typeof store.getState>;
