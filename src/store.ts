import { legacy_createStore } from 'redux';
import reducer from './modules/';
import { persistStore, persistReducer } from 'redux-persist';
import FilesystemStorage from 'redux-persist-filesystem-storage';

const persistConfig = {
  key: 'root',
  storage: FilesystemStorage,
};

const persistedReducer = persistReducer(persistConfig, reducer);
export const store = legacy_createStore(persistedReducer);
export const persistor = persistStore(store);
