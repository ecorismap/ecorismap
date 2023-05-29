import { legacy_createStore } from 'redux';
import reducer from './modules/';
import { persistStore, persistReducer } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';

const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  timeout: 0,
};

const persistedReducer = persistReducer(persistConfig, reducer);
export const store = legacy_createStore(persistedReducer);
export const persistor = persistStore(store);
