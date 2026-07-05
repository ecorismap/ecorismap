import { configureStore } from '@reduxjs/toolkit';
import reducer from './modules/';
import { persistStore, persistReducer } from 'redux-persist';
import { reduxPersistWebStorage } from './utils/reduxPersistWebStorage';

const persistConfig = {
  key: 'root',
  // sessionStorage(約5MB制限)からIndexedDBへ移行。タブごとの独立DBにより
  // 「タブを閉じたらデータが消える」セッションスコープは従来どおり維持される
  storage: reduxPersistWebStorage,
  // dataSetを含む全stateをdispatchごとにシリアライズすると大量データ時に重いため間引く
  throttle: 1000,
};

const persistedReducer = persistReducer(persistConfig, reducer);
export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      //immutableCheck: false,
      serializableCheck: false,
    }),
});
export const persistor = persistStore(store);
export type RootState = ReturnType<typeof store.getState>;
