import { configureStore } from '@reduxjs/toolkit';
import reducer from './modules/';
import { persistStore, persistReducer } from 'redux-persist';
import { reduxMMKVStorage } from './utils/mmkvStorage';

const persistConfig: any = {
  key: 'root',
  storage: reduxMMKVStorage, // MMKVを使用（大容量対応、2MB制限なし）
};

const persistedReducer = persistReducer(persistConfig, reducer);
export const store = configureStore({
  reducer: persistedReducer as any,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      immutableCheck: false,
      serializableCheck: false,
    }),
});
export const persistor = persistStore(store);

// RootStateの型を明示的に定義して、undefinedを防ぐ
export type RootState = ReturnType<typeof reducer>;
