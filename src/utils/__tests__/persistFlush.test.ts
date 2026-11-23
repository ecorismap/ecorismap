import { combineReducers, configureStore, createSlice } from '@reduxjs/toolkit';
// jestSetupFileがpersistStoreをスタブ化しているため、本物を使う
const { persistReducer, persistStore } = jest.requireActual('redux-persist');

import { AppState } from 'react-native';

let mockAppStateListener: ((state: string) => void) | null = null;
import { attachPersistFlushOnBackground, flushPersistence, registerPersistFlusher } from '../persistFlush';

const kv = new Map<string, string>();
const storage = {
  setItem: (key: string, value: string) => {
    kv.set(key, value);
    return Promise.resolve();
  },
  getItem: (key: string) => Promise.resolve(kv.get(key) ?? null),
  removeItem: (key: string) => {
    kv.delete(key);
    return Promise.resolve();
  },
};

const makeSlice = (name: string) =>
  createSlice({
    name,
    initialState: { value: '' },
    reducers: { set: (_state, action: { payload: string }) => ({ value: action.payload }) },
  });

const settings = makeSlice('settings');
const layers = makeSlice('layers');

const setup = async () => {
  const reducer = persistReducer(
    { key: 'root', storage, throttle: 1000 },
    combineReducers({ settings: settings.reducer, layers: layers.reducer })
  );
  const store = configureStore({ reducer, middleware: (g) => g({ serializableCheck: false }) });
  const persistor = persistStore(store);
  // rehydrate完了を待つ
  await jest.advanceTimersByTimeAsync(0);
  return { store, persistor };
};

const persistedSettings = () => {
  const raw = kv.get('persist:root');
  return raw ? JSON.parse(JSON.parse(raw).settings) : undefined;
};

describe('attachPersistFlushOnBackground', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    kv.clear();
    mockAppStateListener = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, listener: (state: string) => void) => {
      mockAppStateListener = listener;
      return { remove: () => (mockAppStateListener = null) };
    }) as unknown as typeof AppState.addEventListener);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('スロットル待ちの変更はバックグラウンド移行で即座に書き出される', async () => {
    const { store, persistor } = await setup();
    await jest.advanceTimersByTimeAsync(5000);
    attachPersistFlushOnBackground(persistor);

    store.dispatch(settings.actions.set('Version 0.7.0'));
    store.dispatch(layers.actions.set('changed'));
    // スロットル周期前なのでまだ書かれていない
    expect(persistedSettings()?.value).not.toBe('Version 0.7.0');

    mockAppStateListener?.('background');
    await Promise.resolve();
    await Promise.resolve();
    expect(persistedSettings()).toEqual({ value: 'Version 0.7.0' });
  });

  it('inactiveでも書き出す（iOSのアプリスイッチャー表示時）', async () => {
    const { store, persistor } = await setup();
    await jest.advanceTimersByTimeAsync(5000);
    attachPersistFlushOnBackground(persistor);

    store.dispatch(settings.actions.set('seen'));
    mockAppStateListener?.('inactive');
    await Promise.resolve();
    expect(persistedSettings()).toEqual({ value: 'seen' });
  });

  it('activeへの遷移では書き出さない', async () => {
    const { persistor } = await setup();
    const flush = jest.spyOn(persistor, 'flush');
    attachPersistFlushOnBackground(persistor);
    mockAppStateListener?.('active');
    expect(flush).not.toHaveBeenCalled();
  });

  it('解除後はリスナーが外れる', async () => {
    const { persistor } = await setup();
    const detach = attachPersistFlushOnBackground(persistor);
    expect(mockAppStateListener).not.toBeNull();
    detach();
    expect(mockAppStateListener).toBeNull();
  });
});

describe('flushPersistence（設定監査 S-L3）', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    kv.clear();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('複数スライスを置き換えた直後に呼ぶと、スロットルを待たずに persist:root を書き出す', async () => {
    const { store, persistor } = await setup();
    await jest.advanceTimersByTimeAsync(5000);
    const unregister = registerPersistFlusher(() => persistor.flush());

    store.dispatch(settings.actions.set('closed'));
    store.dispatch(layers.actions.set('initial'));
    expect(persistedSettings()?.value).not.toBe('closed');

    await flushPersistence();
    expect(persistedSettings()).toEqual({ value: 'closed' });
    unregister();
  });

  it('登録された書き出しの1つが失敗しても、ほかは書き出し、呼び出し元へは投げない', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const ok = jest.fn();
    const unregisterFail = registerPersistFlusher(() => Promise.reject(new Error('disk full')));
    const unregisterThrow = registerPersistFlusher(() => {
      throw new Error('sync');
    });
    const unregisterOk = registerPersistFlusher(ok);

    await expect(flushPersistence()).resolves.toBeUndefined();
    expect(ok).toHaveBeenCalledTimes(1);
    unregisterFail();
    unregisterThrow();
    unregisterOk();
    log.mockRestore();
  });

  it('解除した書き出しは呼ばない', async () => {
    const flusher = jest.fn();
    const unregister = registerPersistFlusher(flusher);
    unregister();
    await flushPersistence();
    expect(flusher).not.toHaveBeenCalled();
  });
});
