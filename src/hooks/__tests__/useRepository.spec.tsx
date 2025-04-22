import React from 'react';
import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import configureMockStore from 'redux-mock-store';
import { useRepository } from '../useRepository';
import { updateDataAction } from '../../modules/dataSet';

import * as DataUtils from '../../utils/Data';

// spy を仕掛ける前にオリジナルを退避
const realMergeLayerData = DataUtils.mergeLayerData;

beforeAll(() => {
  jest.spyOn(DataUtils, 'mergeLayerData').mockImplementation(async (args: any) => {
    return realMergeLayerData({
      ...args,
      // ★ 即解決して選択候補の先頭を返す
      conflictsResolver: async (candidates: any[]) => candidates[0],
    });
  });
});

jest.mock('@react-native-firebase/app', () => ({
  __esModule: true,
  default: {
    app: jest.fn(() => ({ functions: jest.fn(() => ({})) })),
  },
}));
jest.mock('@react-native-firebase/functions', () => ({}));
jest.mock('@react-native-firebase/app-check', () => ({
  __esModule: true,
  firebase: {
    app: jest.fn(() => ({ functions: jest.fn(() => ({})) })),
    appCheck: jest.fn(() => ({ activate: jest.fn() })),
  },
  default: {},
}));
jest.mock('@react-native-firebase/auth', () => ({ __esModule: true, default: {} }));
jest.mock('@react-native-firebase/firestore', () => ({ __esModule: true, default: jest.fn(() => ({})) }));
jest.mock('@react-native-firebase/storage', () => ({ __esModule: true, default: jest.fn(() => ({})) }));
jest.mock('i18next', () => ({
  __esModule: true,
  default: { use: jest.fn().mockReturnThis(), init: jest.fn().mockReturnThis(), language: 'ja' },
}));
jest.mock('../../i18n/config', () => ({ t: jest.fn((key) => key) }));
jest.mock('../../modules/tileMaps', () => ({ createTileMapsInitialState: jest.fn(() => []) }));

describe('createMergedDataSet', () => {
  const middlewares: any[] = [];
  const mockStore = configureMockStore(middlewares);
  let store: ReturnType<typeof mockStore>;

  beforeEach(() => {
    const initialState = {
      user: { uid: 'test-user' },
      dataSet: [],
      layers: [],
      settings: {},
      tileMaps: [],
    };
    store = mockStore(initialState);
    store.dispatch = jest.fn();
  });

  const renderWithProvider = (hook: () => any) =>
    renderHook(hook, {
      wrapper: (props: any) => <Provider store={store}>{props.children}</Provider>,
    });

  test('privateDataのみ', async () => {
    const { result } = renderWithProvider(() => useRepository());
    const privateData = [
      {
        layerId: 'l1',
        userId: 'test-user',
        data: [{ id: '1', userId: 'test-user', displayName: 'U', visible: true, redraw: false, coords: [], field: {} }],
      },
    ];
    await act(async () => {
      await result.current.createMergedDataSet({ privateData, publicData: [], templateData: [] });
    });
    expect(store.dispatch).toHaveBeenCalledTimes(1);
    expect(store.dispatch).toHaveBeenCalledWith(updateDataAction([privateData[0]]));
  });

  test('publicDataのみ', async () => {
    const { result } = renderWithProvider(() => useRepository());
    const publicData = [
      {
        layerId: 'l2',
        userId: 'other',
        data: [{ id: '2', userId: 'other', displayName: 'O', visible: true, redraw: false, coords: [], field: {} }],
      },
    ];
    await act(async () => {
      await result.current.createMergedDataSet({ privateData: [], publicData, templateData: [] });
    });
    expect(store.dispatch).toHaveBeenCalledTimes(1);
    expect(store.dispatch).toHaveBeenCalledWith(updateDataAction([publicData[0]]));
  });

  test('templateDataのみ', async () => {
    const { result } = renderWithProvider(() => useRepository());
    const templateData = [
      {
        layerId: 'l3',
        userId: 'template',
        data: [{ id: '3', userId: 'template', displayName: 'T', visible: true, redraw: false, coords: [], field: {} }],
      },
    ];
    await act(async () => {
      await result.current.createMergedDataSet({ privateData: [], publicData: [], templateData });
    });
    expect(store.dispatch).toHaveBeenCalledTimes(1);
    expect(store.dispatch).toHaveBeenCalledWith(updateDataAction([templateData[0]]));
  });

  test('publicDataが複数ユーザー分存在する場合', async () => {
    const { result } = renderWithProvider(() => useRepository());
    const publicData = [
      {
        layerId: 'l6',
        userId: 'user1',
        data: [{ id: 'a', userId: 'user1', displayName: 'A', visible: true, redraw: false, coords: [], field: {} }],
      },
      {
        layerId: 'l6',
        userId: 'user2',
        data: [{ id: 'b', userId: 'user2', displayName: 'B', visible: true, redraw: false, coords: [], field: {} }],
      },
    ];
    await act(async () => {
      await result.current.createMergedDataSet({ privateData: [], publicData, templateData: [] });
    });
    expect(store.dispatch).toHaveBeenCalledTimes(1);
    expect(store.dispatch).toHaveBeenCalledWith(updateDataAction(publicData));
  });

  test('すべて空の場合は dispatch されない', async () => {
    const { result } = renderWithProvider(() => useRepository());
    await act(async () => {
      await result.current.createMergedDataSet({ privateData: [], publicData: [], templateData: [] });
    });
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  test('store の dataSet が更新される (integration)', async () => {
    const { configureStore: realConfigureStore } = require('@reduxjs/toolkit');
    const dataSetReducer = require('../../modules/dataSet').default;
    const { Provider: RealProvider } = require('react-redux');
    const { renderHook: realRenderHook, act: realAct } = require('@testing-library/react-hooks');
    const { useRepository: realUseRepository } = require('../useRepository');

    const integrationStore = realConfigureStore({
      reducer: {
        dataSet: dataSetReducer,
        user: (state = { uid: 'test-user' }) => state,
        settings: (state = { mapRegion: {}, mapType: '', isSettingProject: false }) => state,
        layers: (state = []) => state,
        tileMaps: (state = []) => state,
      },
      preloadedState: {
        dataSet: [],
        settings: { mapRegion: {}, mapType: '', isSettingProject: false },
        layers: [],
        tileMaps: [],
      },
    });
    const wrapper = (props: any) => <RealProvider store={integrationStore}>{props.children}</RealProvider>;
    const { result } = realRenderHook(() => realUseRepository(), { wrapper });

    const privateData = [
      {
        layerId: 'l10',
        userId: 'test-user',
        data: [
          { id: '10', userId: 'test-user', displayName: 'U10', visible: true, redraw: false, coords: [], field: {} },
        ],
      },
    ];

    expect(integrationStore.getState().dataSet).toEqual([]);

    await realAct(async () => {
      await result.current.createMergedDataSet({ privateData, publicData: [], templateData: [] });
    });

    expect(integrationStore.getState().dataSet).toEqual(privateData);
  });

  test('privateData と templateData が同じ layerId の場合は private → template の順で dispatch が2回呼ばれる', async () => {
    const { result } = renderWithProvider(() => useRepository());
    const layerId = 'lX';

    const privateData = [
      {
        layerId,
        userId: 'user1',
        data: [{ id: 'pX', userId: 'user1', displayName: 'U1', visible: true, redraw: false, coords: [], field: {} }],
      },
    ];
    const templateData = [
      {
        layerId,
        userId: 'template',
        data: [{ id: 'tX', userId: 'template', displayName: 'T', visible: true, redraw: false, coords: [], field: {} }],
      },
    ];

    await act(async () => {
      await result.current.createMergedDataSet({ privateData, publicData: [], templateData });
    });

    // 2回呼ばれること
    expect(store.dispatch).toHaveBeenCalledTimes(2);

    // 1回目: private 側
    const first = (store.dispatch as jest.Mock).mock.calls[0][0];
    expect(first).toEqual(updateDataAction([privateData[0]]));

    // 2回目: template 側
    const second = (store.dispatch as jest.Mock).mock.calls[1][0];
    expect(second).toEqual(updateDataAction([templateData[0]]));
  });

  test('publicData と templateData が同じ layerId の場合は public のみ dispatch', async () => {
    const { result } = renderWithProvider(() => useRepository());
    const layerId = 'lY';

    const publicData = [
      {
        layerId,
        userId: 'user2',
        data: [{ id: 'pY', userId: 'user2', displayName: 'U2', visible: true, redraw: false, coords: [], field: {} }],
      },
    ];
    const templateData = [
      {
        layerId,
        userId: 'template',
        data: [{ id: 'tY', userId: 'template', displayName: 'T', visible: true, redraw: false, coords: [], field: {} }],
      },
    ];

    await act(async () => {
      await result.current.createMergedDataSet({ privateData: [], publicData, templateData });
    });

    // 2回呼ばれること
    expect(store.dispatch).toHaveBeenCalledTimes(2);
    // 1回目: public 側
    expect(store.dispatch).toHaveBeenCalledWith(updateDataAction([publicData[0]]));
    // 2回目: template 側
    expect(store.dispatch).toHaveBeenCalledWith(updateDataAction([templateData[0]]));
  });
});
