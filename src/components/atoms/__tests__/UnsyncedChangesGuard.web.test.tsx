// 目印の保存は Web のときだけ働くので、読み込む前に web へ切り替える
(require('react-native') as { Platform: { OS: string } }).Platform.OS = 'web';

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import dataSetReducer, { updateRecordsAction } from '../../../modules/dataSet';
import settingsReducer from '../../../modules/settings';
import userReducer from '../../../modules/user';
import { UnsyncedChangesGuard } from '../UnsyncedChangesGuard.web';
import { clearUnsyncedMarks, markLayerUploaded } from '../../../utils/unsyncedChanges';
import { RecordType } from '../../../types';

const record = (id: string, extra: Partial<RecordType> = {}): RecordType => ({
  id,
  userId: 'me',
  displayName: 'me',
  visible: true,
  redraw: false,
  coords: { latitude: 0, longitude: 0 },
  field: {},
  updatedAt: 1,
  ...extra,
});

const createStore = (projectId: string | undefined, data: RecordType[]) => {
  const base = configureStore({ reducer: { settings: settingsReducer } }).getState();
  return configureStore({
    reducer: { dataSet: dataSetReducer, settings: settingsReducer, user: userReducer },
    preloadedState: {
      dataSet: [{ layerId: 'layerA', userId: 'me', data }],
      settings: { ...base.settings, projectId },
      user: { uid: 'me', email: 'me@example.com', displayName: 'me', photoURL: null, emailVerified: true },
    },
  });
};

//jsdom はこの環境で読み込めないので、window に付けた beforeunload のリスナーを手元で控えて呼ぶ
const listeners = new Set<EventListenerOrEventListenerObject>();
type WindowEvents = Pick<Window, 'addEventListener' | 'removeEventListener'>;
const originalWindowEvents: Partial<WindowEvents> = {
  addEventListener: window.addEventListener,
  removeEventListener: window.removeEventListener,
};
beforeAll(() => {
  Object.assign(window, {
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (type === 'beforeunload' && listener !== null) listeners.add(listener);
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (type === 'beforeunload' && listener !== null) listeners.delete(listener);
    },
  });
});
afterAll(() => {
  Object.assign(window, originalWindowEvents);
});

//常駐コンポーネントの effect が走ってリスナーが付くまで待つ
const waitForListener = () => waitFor(() => expect(listeners.size).toBe(1));

//離脱しようとしたときに、ブラウザへ確認を求めたか
const fireBeforeUnload = () => {
  const event = new Event('beforeunload', { cancelable: true });
  //ブラウザの BeforeUnloadEvent と同じく returnValue を書き込めるようにする
  Object.defineProperty(event, 'returnValue', { value: undefined, writable: true });
  listeners.forEach((listener) => (typeof listener === 'function' ? listener(event) : listener.handleEvent(event)));
  return event.defaultPrevented;
};

describe('UnsyncedChangesGuard（Web、同期監査 L14）', () => {
  beforeEach(() => {
    clearUnsyncedMarks();
    listeners.clear();
  });

  it('アップロードしていない記録がある間だけ離脱確認を出す', async () => {
    const store = createStore('p1', [record('r1')]);
    const { unmount } = await render(
      <Provider store={store}>
        <UnsyncedChangesGuard />
      </Provider>
    );
    await waitForListener();
    expect(fireBeforeUnload()).toBe(true);
    await unmount();
    //外したあとは確認を出さない（リスナーが残らない）
    expect(fireBeforeUnload()).toBe(false);
  });

  it('アップロードし終えたら確認を出さず、その後に編集すると再び出す', async () => {
    const now = Date.now();
    const store = createStore('p1', [record('r1', { uploaded: true, updatedAt: now - 1000 })]);
    await render(
      <Provider store={store}>
        <UnsyncedChangesGuard />
      </Provider>
    );
    await waitForListener();
    markLayerUploaded('p1', 'layerA', now);
    expect(fireBeforeUnload()).toBe(false);

    store.dispatch(
      updateRecordsAction({
        layerId: 'layerA',
        userId: 'me',
        data: [record('r1', { uploaded: true, updatedAt: now + 1000 })],
      })
    );
    expect(fireBeforeUnload()).toBe(true);
  });

  it('プロジェクトを開いていなくても、記録があれば確認を出す', async () => {
    const store = createStore(undefined, [record('r1', { userId: undefined })]);
    await render(
      <Provider store={store}>
        <UnsyncedChangesGuard />
      </Provider>
    );
    await waitForListener();
    expect(fireBeforeUnload()).toBe(true);
  });
});
