import { configureStore } from '@reduxjs/toolkit';
import reducer from './modules/';
import { persistStore, persistReducer } from 'redux-persist';
import { reduxMMKVStorage } from './utils/mmkvStorage';
import {
  migrateDataSetFromPersistRoot,
  loadPersistedDataSet,
  attachDataSetPersistSubscriber,
  dataSetExcludingReconciler,
} from './utils/dataSetStorage';

// dataSet（最大データ）はpersist:rootから分離し、専用キーへカスタム購読で永続化する。
// これによりdataSetと無関係な更新（地図パン等）でdataSet全体が再書き込みされない。
// blacklist + reconciler + 移行の詳細は utils/dataSetStorage.ts を参照。
const persistConfig: any = {
  key: 'root',
  storage: reduxMMKVStorage, // MMKVを使用（大容量対応、2MB制限なし）
  // dataSetを含む全stateをdispatchごとにシリアライズすると大量データ時に重いため間引く
  throttle: 1000,
  blacklist: ['dataSet'],
  stateReconciler: dataSetExcludingReconciler,
};

// 旧形式（persist:root内のdataSet）からの一回限りの移行と同期ハイドレーション。
// MMKVは同期APIのため、store生成前に完了できる（PersistGateのフラッシュなし）。
migrateDataSetFromPersistRoot();
const preloadedDataSet = loadPersistedDataSet();

const persistedReducer = persistReducer(persistConfig, reducer);
export const store = configureStore({
  reducer: persistedReducer as any,
  preloadedState: preloadedDataSet !== undefined ? ({ dataSet: preloadedDataSet } as any) : undefined,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      immutableCheck: false,
      serializableCheck: false,
    }),
});
attachDataSetPersistSubscriber(store as any);
export const persistor = persistStore(store);

// RootStateの型を明示的に定義して、undefinedを防ぐ
export type RootState = ReturnType<typeof reducer>;

// AppDispatch型をエクスポート（Thunkを使用するために必要）
export type AppDispatch = typeof store.dispatch;
