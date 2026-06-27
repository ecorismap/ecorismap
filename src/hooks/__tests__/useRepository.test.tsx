jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  getAuth: jest.fn(() => ({ currentUser: { uid: 'test-user' } })),
  default: {},
}));

import React from 'react';
import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useRepository } from '../useRepository';
import { updateDataAction } from '../../modules/dataSet';
import { setDataSyncTimestampsAction } from '../../modules/dataSync';

import * as DataUtils from '../../utils/Data';
import * as projectStore from '../../lib/firebase/firestore';
import * as AlertAsyncModule from '../../components/molecules/AlertAsync';

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
  getApp: jest.fn().mockReturnValue({}),
}));
jest.mock('@react-native-firebase/functions', () => ({
  __esModule: true,
  getFunctions: jest.fn().mockReturnValue({}),
}));
jest.mock('@react-native-firebase/app-check', () => ({
  __esModule: true,
  default: jest.fn(), // 追加: defaultエクスポートをモック
  initializeAppCheck: jest.fn(),
  getToken: jest.fn(),
  getAppCheck: jest.fn().mockReturnValue({
    activate: jest.fn(),
    setTokenAutoRefreshEnabled: jest.fn(),
  }),
  ReactNativeFirebaseAppCheckProvider: jest.fn(
    () =>
      ({
        configure: jest.fn(),
      } as unknown as React.FC)
  ),
}));
jest.mock('@react-native-firebase/firestore', () => ({
  __esModule: true,
  getFirestore: jest.fn().mockReturnValue({}),
}));
jest.mock('@react-native-firebase/storage', () => ({ __esModule: true, getStorage: jest.fn().mockReturnValue({}) }));
jest.mock('i18next', () => ({
  __esModule: true,
  default: { use: jest.fn().mockReturnThis(), init: jest.fn().mockReturnThis(), language: 'ja' },
}));
jest.mock('../../i18n/config', () => ({ t: jest.fn((key) => key) }));
jest.mock('../../modules/tileMaps', () => ({ createTileMapsInitialState: jest.fn(() => []) }));

describe('createMergedDataSet', () => {
  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    const initialState = {
      user: { uid: 'test-user' },
      dataSet: [],
      layers: [],
      settings: {},
      tileMaps: [],
    };
    store = configureStore({
      reducer: {
        user: (state = initialState.user) => state,
        dataSet: (state = initialState.dataSet, _action: any) => state,
        layers: (state = initialState.layers) => state,
        settings: (state = initialState.settings) => state,
        tileMaps: (state = initialState.tileMaps) => state,
      } as any, // 型エラー回避のためanyを付与
      preloadedState: initialState,
    });
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
    const layerId = 'l2';

    const publicData = [
      {
        layerId,
        userId: 'other',
        data: [{ id: '2', userId: 'other', displayName: 'O', visible: true, redraw: false, coords: [], field: {} }],
      },
    ];

    await act(async () => {
      await result.current.createMergedDataSet({ privateData: [], publicData, templateData: [] });
    });

    // 2回呼ばれること
    expect(store.dispatch).toHaveBeenCalledTimes(2);

    // 1回目: 他ユーザーのデータ
    expect(store.dispatch).toHaveBeenNthCalledWith(1, updateDataAction([publicData[0]]));

    // 2回目: 自分の空データでローカルをクリア
    expect(store.dispatch).toHaveBeenNthCalledWith(
      2,
      updateDataAction([
        {
          layerId,
          userId: 'test-user',
          data: [],
        },
      ])
    );
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
    const layerId = 'l6';
    const publicData = [
      {
        layerId,
        userId: 'user1',
        data: [{ id: 'a', userId: 'user1', displayName: 'A', visible: true, redraw: false, coords: [], field: {} }],
      },
      {
        layerId,
        userId: 'user2',
        data: [{ id: 'b', userId: 'user2', displayName: 'B', visible: true, redraw: false, coords: [], field: {} }],
      },
    ];

    await act(async () => {
      await result.current.createMergedDataSet({ privateData: [], publicData, templateData: [] });
    });

    // 他人の publicData と、自分の空データでクリアする 2 回 dispatch
    expect(store.dispatch).toHaveBeenCalledTimes(2);

    // 1 回目: 他人のデータがセットされる
    expect(store.dispatch).toHaveBeenNthCalledWith(1, updateDataAction(publicData));

    // 2 回目: 自分のローカルデータを空配列で上書き
    expect(store.dispatch).toHaveBeenNthCalledWith(2, updateDataAction([{ layerId, userId: 'test-user', data: [] }]));
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

  test('publicData と templateData が同じ layerId の場合は public → self-clear → template の順で3回 dispatch', async () => {
    const { result } = renderWithProvider(() => useRepository());
    const layerId = 'lY';

    const publicData = [
      {
        layerId,
        userId: 'user2',
        data: [
          {
            id: 'pY',
            userId: 'user2',
            displayName: 'U2',
            visible: true,
            redraw: false,
            coords: [],
            field: {},
          },
        ],
      },
    ];
    const templateData = [
      {
        layerId,
        userId: 'template',
        data: [
          {
            id: 'tY',
            userId: 'template',
            displayName: 'T',
            visible: true,
            redraw: false,
            coords: [],
            field: {},
          },
        ],
      },
    ];

    await act(async () => {
      await result.current.createMergedDataSet({ privateData: [], publicData, templateData });
    });

    // 合計 3 回呼ばれること
    expect(store.dispatch).toHaveBeenCalledTimes(3);

    // 1回目: public 側
    expect(store.dispatch).toHaveBeenNthCalledWith(1, updateDataAction([publicData[0]]));

    // 2回目: 自分の空データでクリア
    expect(store.dispatch).toHaveBeenNthCalledWith(2, updateDataAction([{ layerId, userId: 'test-user', data: [] }]));

    // 3回目: template 側
    expect(store.dispatch).toHaveBeenNthCalledWith(3, updateDataAction([templateData[0]]));
  });

  // --- 新規テスト追加 ---
  test('publicData のみマージで他人のレコードが選択された場合、自分のローカルデータがクリアされる', async () => {
    const { result } = renderWithProvider(() => useRepository());
    const layerId = 'lZ';
    const publicData = [
      {
        layerId,
        userId: 'other',
        data: [
          { id: 'o1', userId: 'other', displayName: 'Other', visible: true, redraw: false, coords: [], field: {} },
        ],
      },
    ];
    // 既存のローカルデータとして、自分のデータも store.dispatch で設定しておく
    await act(async () => {
      // 初期マージで自分のデータを入れる
      await result.current.createMergedDataSet({
        privateData: [],
        publicData: [
          {
            layerId,
            userId: 'test-user',
            data: [
              {
                id: 's1',
                userId: 'test-user',
                displayName: 'Self',
                visible: true,
                redraw: false,
                coords: [],
                field: {},
              },
            ],
          },
        ],
        templateData: [],
      });
    });
    // モック dispatch 関数をクリア
    (store.dispatch as jest.Mock).mockClear();

    await act(async () => {
      // 今度は他人のレコードのみでマージ実行
      await result.current.createMergedDataSet({ privateData: [], publicData, templateData: [] });
    });

    // 他人のレコードと、自分の空データの2回呼び出しを検証
    expect(store.dispatch).toHaveBeenCalledTimes(2);
    expect(store.dispatch).toHaveBeenNthCalledWith(1, updateDataAction([publicData[0]]));
    expect(store.dispatch).toHaveBeenNthCalledWith(2, updateDataAction([{ layerId, userId: 'test-user', data: [] }]));
  });
});

// 同一アカウント・複数端末での上書き消失防止（データ版の楽観的ロック: 検知→確認→対処）
describe('uploadDataToRepository（楽観的ロック）', () => {
  const project = { id: 'proj1' } as any;
  const layer = { id: 'l1', name: 'L1', permission: 'PRIVATE', field: [] } as any;
  const conflictKey = 'l1_PRIVATE';

  const localRecord = {
    id: 'local',
    userId: 'test-user',
    displayName: 'U',
    visible: true,
    redraw: false,
    coords: [],
    field: {},
    updatedAt: 100,
  };

  const makeStore = (dataSync: any) => {
    const initialState = {
      user: { uid: 'test-user', email: 'a@b.c', displayName: 'U' },
      dataSet: [{ layerId: 'l1', userId: 'test-user', data: [localRecord] }],
      layers: [layer],
      settings: { isSettingProject: false, updatedAt: undefined },
      tileMaps: [],
      dataSync,
    };
    const store = configureStore({
      reducer: {
        user: (state = initialState.user) => state,
        dataSet: (state = initialState.dataSet) => state,
        layers: (state = initialState.layers) => state,
        settings: (state = initialState.settings) => state,
        tileMaps: (state = initialState.tileMaps) => state,
        dataSync: (state = initialState.dataSync) => state,
      } as any,
      preloadedState: initialState,
    });
    store.dispatch = jest.fn();
    return store;
  };

  const renderWithStore = (store: any) =>
    renderHook(() => useRepository(), {
      wrapper: (props: any) => <Provider store={store}>{props.children}</Provider>,
    });

  const uploadedIdsOf = (uploadSpy: jest.SpyInstance, callIdx = 0) =>
    (uploadSpy.mock.calls[callIdx][1] as any).data.map((r: any) => r.id);

  const dispatchedTypes = (store: any) => (store.dispatch as jest.Mock).mock.calls.map((c) => c[0].type);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(projectStore, 'getSettingsUpdatedAt').mockResolvedValue(undefined);
  });

  test('基準値なし & クラウド内容がローカルに含まれる → 衝突なしでアップロード（内容確認のため取得はする）', async () => {
    // クラウドにはデータがあるが、内容はローカルと同じ（ローカルが先行/同等）→ 衝突ではない
    jest
      .spyOn(projectStore, 'getMyDataUpdatedAt')
      .mockResolvedValue({ isOK: true, message: '', data: new Map([[conflictKey, 555]]) });
    const dialogSpy = jest.spyOn(AlertAsyncModule, 'DataConflictConfirmAsync');
    const downloadSpy = jest
      .spyOn(projectStore, 'downloadPrivateData')
      .mockResolvedValue({ isOK: true, message: '', data: [{ layerId: 'l1', userId: 'test-user', data: [localRecord] }] });
    const uploadSpy = jest
      .spyOn(projectStore, 'uploadDataHelper')
      .mockResolvedValue({ isOK: true, message: '', encryptedAt: 999 });

    const store = makeStore({}); // 基準値なし
    const { result } = renderWithStore(store);
    await act(async () => {
      await result.current.uploadDataToRepository(project, true, 'All');
    });

    expect(downloadSpy).toHaveBeenCalledTimes(1); // 内容確認のため取得する
    expect(dialogSpy).not.toHaveBeenCalled(); // 内容が同じなのでダイアログは出ない
    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(uploadedIdsOf(uploadSpy)).toEqual(['local']); // ローカルのみ（マージしない）
    // 基準値が保存される
    expect(dispatchedTypes(store)).toContain(setDataSyncTimestampsAction({ projectId: 'p', entries: {} }).type);
  });

  test('基準値==クラウド（衝突なし） → 従来アップロードのみ（download/merge しない・高速パス）', async () => {
    jest
      .spyOn(projectStore, 'getMyDataUpdatedAt')
      .mockResolvedValue({ isOK: true, message: '', data: new Map([[conflictKey, 555]]) });
    const dialogSpy = jest.spyOn(AlertAsyncModule, 'DataConflictConfirmAsync');
    const downloadSpy = jest.spyOn(projectStore, 'downloadPrivateData');
    const uploadSpy = jest
      .spyOn(projectStore, 'uploadDataHelper')
      .mockResolvedValue({ isOK: true, message: '', encryptedAt: 999 });

    const store = makeStore({ proj1: { [conflictKey]: 555 } }); // 基準値==クラウド
    const { result } = renderWithStore(store);
    await act(async () => {
      await result.current.uploadDataToRepository(project, true, 'All');
    });

    expect(dialogSpy).not.toHaveBeenCalled();
    expect(downloadSpy).not.toHaveBeenCalled(); // 高速パス：取得しない
    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(uploadedIdsOf(uploadSpy)).toEqual(['local']);
  });

  test('2台目の初回アップロード（基準値なし）でクラウドに他端末の変更がある → ダイアログ表示＋マージでユニオン', async () => {
    // ★ ユーザー報告シナリオ: 端末Aがアップ済み、端末B(基準値なし)がアップ → 検知してメッセージを出す
    const cloudOnly = { ...localRecord, id: 'cloudOnly' };
    jest
      .spyOn(projectStore, 'getMyDataUpdatedAt')
      .mockResolvedValue({ isOK: true, message: '', data: new Map([[conflictKey, 777]]) });
    const dialogSpy = jest.spyOn(AlertAsyncModule, 'DataConflictConfirmAsync').mockResolvedValue('merge');
    const downloadSpy = jest
      .spyOn(projectStore, 'downloadPrivateData')
      .mockResolvedValue({ isOK: true, message: '', data: [{ layerId: 'l1', userId: 'test-user', data: [cloudOnly] }] });
    const uploadSpy = jest
      .spyOn(projectStore, 'uploadDataHelper')
      .mockResolvedValue({ isOK: true, message: '', encryptedAt: 999 });
    (DataUtils.mergeLayerData as jest.Mock).mockImplementationOnce((args: any) => realMergeLayerData(args));

    const store = makeStore({}); // 基準値なし（2台目の初回）
    const { result } = renderWithStore(store);
    await act(async () => {
      await result.current.uploadDataToRepository(project, true, 'All');
    });

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(dialogSpy).toHaveBeenCalledTimes(1); // ★ メッセージが出る
    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(uploadedIdsOf(uploadSpy)).toEqual(expect.arrayContaining(['local', 'cloudOnly']));
    expect(uploadedIdsOf(uploadSpy).length).toBe(2);
  });

  test('衝突あり＋キャンセル → アップロードしない', async () => {
    const cloudOnly = { ...localRecord, id: 'cloudOnly' };
    jest
      .spyOn(projectStore, 'getMyDataUpdatedAt')
      .mockResolvedValue({ isOK: true, message: '', data: new Map([[conflictKey, 777]]) });
    jest.spyOn(AlertAsyncModule, 'DataConflictConfirmAsync').mockResolvedValue('cancel');
    jest
      .spyOn(projectStore, 'downloadPrivateData')
      .mockResolvedValue({ isOK: true, message: '', data: [{ layerId: 'l1', userId: 'test-user', data: [cloudOnly] }] });
    const uploadSpy = jest.spyOn(projectStore, 'uploadDataHelper');

    const store = makeStore({ proj1: { [conflictKey]: 555 } });
    const { result } = renderWithStore(store);
    let res: any;
    await act(async () => {
      res = await result.current.uploadDataToRepository(project, true, 'All');
    });

    expect(uploadSpy).not.toHaveBeenCalled();
    expect(res.isOK).toBe(false);
  });
});
