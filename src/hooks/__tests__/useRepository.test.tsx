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
import * as projectStorage from '../../lib/firebase/storage';
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
    // 設定の更新確認は uploadType==='PublicAndPrivate' のときだけ走る。
    // ここのテストは 'All' なので呼ばれないが、実装が変わったときに実サーバーを叩かないよう塞いでおく。
    jest.spyOn(projectStore, 'isSettingsUpdatedAtCurrent').mockResolvedValue(true);
  });

  test('基準値なし & クラウド内容がローカルに含まれる → 衝突なしでアップロード（内容確認のため取得はする）', async () => {
    // クラウドにはデータがあるが、内容はローカルと同じ（ローカルが先行/同等）→ 衝突ではない
    jest
      .spyOn(projectStore, 'getMyDataUpdatedAt')
      .mockResolvedValue({ isOK: true, message: '', data: new Map([[conflictKey, 555]]) });
    const dialogSpy = jest.spyOn(AlertAsyncModule, 'DataConflictConfirmAsync');
    const downloadSpy = jest
      .spyOn(projectStore, 'downloadPrivateData')
      .mockResolvedValue({ isOK: true, message: '', data: [{ layerId: 'l1', userId: 'test-user', data: [localRecord] }], unmarkedDekGroups: [] });
    const uploadSpy = jest
      .spyOn(projectStore, 'uploadDataHelper')
      .mockResolvedValue({ isOK: true, message: '', encryptedAt: 999 });

    const store = makeStore({}); // 基準値なし
    const { result } = renderWithStore(store);
    await act(async () => {
      await result.current.uploadDataToRepository(project, 'All');
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
      await result.current.uploadDataToRepository(project, 'All');
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
      .mockResolvedValue({ isOK: true, message: '', data: [{ layerId: 'l1', userId: 'test-user', data: [cloudOnly] }], unmarkedDekGroups: [] });
    const uploadSpy = jest
      .spyOn(projectStore, 'uploadDataHelper')
      .mockResolvedValue({ isOK: true, message: '', encryptedAt: 999 });
    (DataUtils.mergeLayerData as jest.Mock).mockImplementationOnce((args: any) => realMergeLayerData(args));

    const store = makeStore({}); // 基準値なし（2台目の初回）
    const { result } = renderWithStore(store);
    await act(async () => {
      await result.current.uploadDataToRepository(project, 'All');
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
      .mockResolvedValue({ isOK: true, message: '', data: [{ layerId: 'l1', userId: 'test-user', data: [cloudOnly] }], unmarkedDekGroups: [] });
    const uploadSpy = jest.spyOn(projectStore, 'uploadDataHelper');

    const store = makeStore({ proj1: { [conflictKey]: 555 } });
    const { result } = renderWithStore(store);
    let res: any;
    await act(async () => {
      res = await result.current.uploadDataToRepository(project, 'All');
    });

    expect(uploadSpy).not.toHaveBeenCalled();
    expect(res.isOK).toBe(false);
  });
});

describe('uploadDataToRepository（trackレイヤのサイズ超過）', () => {
  const project = { id: 'proj1' } as any;
  const trackLayer = { id: 'track', name: 'トラック', permission: 'PRIVATE', field: [] } as any;

  const makeTrackRecord = (numPoints: number) => ({
    id: 'track1',
    userId: 'test-user',
    displayName: 'U',
    visible: true,
    redraw: false,
    coords: Array.from({ length: numPoints }, (_, i) => ({
      latitude: 35.0 + i * 0.0001 + (i % 2) * 0.0000001,
      longitude: 135.0 + (i < numPoints / 2 ? 0 : (i - numPoints / 2) * 0.0001),
      timestamp: 1700000000000 + i * 1000,
    })),
    field: {},
    updatedAt: 100,
  });

  const makeStore = (record: any) => {
    const initialState = {
      user: { uid: 'test-user', email: 'a@b.c', displayName: 'U' },
      dataSet: [{ layerId: 'track', userId: 'test-user', data: [record] }],
      layers: [trackLayer],
      settings: { isSettingProject: false, updatedAt: undefined },
      tileMaps: [],
      dataSync: {},
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

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(projectStore, 'isSettingsUpdatedAtCurrent').mockResolvedValue(true);
    jest
      .spyOn(projectStore, 'getMyDataUpdatedAt')
      .mockResolvedValue({ isOK: true, message: '', data: new Map() });
  });

  const renderWithStore = (store: any) =>
    renderHook(() => useRepository(), {
      wrapper: (props: any) => <Provider store={store}>{props.children}</Provider>,
    });

  test('trackレイヤがサイズ超過で拒否されたら整理を促すメッセージを付ける', async () => {
    jest
      .spyOn(projectStore, 'uploadDataHelper')
      .mockResolvedValue({ isOK: false, message: 'hooks.message.dataSizeTooLarge' });

    const store = makeStore(makeTrackRecord(100));
    const { result } = renderWithStore(store);
    let res: any;
    await act(async () => {
      res = await result.current.uploadDataToRepository(project, 'All');
    });

    expect(res.isOK).toBe(false);
    expect(res.message).toContain('hooks.message.deleteOldTracks');
  });
});

describe('uploadDataToRepository（写真のアップロード失敗）', () => {
  const project = { id: 'proj1' } as any;
  const layer = {
    id: 'l1',
    name: 'L1',
    permission: 'PRIVATE',
    field: [{ id: 'f1', name: '写真', format: 'PHOTO' }],
  } as any;
  const photo = { id: 'p1', name: 'a.jpg', uri: 'file:///photos/a.jpg', url: null, key: null, width: 1, height: 1, thumbnail: null };
  const record = {
    id: 'r1',
    userId: 'test-user',
    displayName: 'U',
    visible: true,
    redraw: false,
    coords: { latitude: 35, longitude: 135 },
    field: { 写真: [photo] },
    updatedAt: 100,
  };

  const makeStore = () => {
    const initialState = {
      user: { uid: 'test-user', email: 'a@b.c', displayName: 'U' },
      dataSet: [{ layerId: 'l1', userId: 'test-user', data: [record] }],
      layers: [layer],
      settings: { isSettingProject: false, updatedAt: undefined },
      tileMaps: [],
      dataSync: {},
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

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(projectStore, 'isSettingsUpdatedAtCurrent').mockResolvedValue(true);
    jest.spyOn(projectStore, 'getMyDataUpdatedAt').mockResolvedValue({ isOK: true, message: '', data: new Map() });
  });

  test('写真のアップロードに失敗したら警告を返し、写真は未アップロードのまま保存する（次回再試行）', async () => {
    jest
      .spyOn(projectStorage, 'uploadPhoto')
      .mockResolvedValue({ isOK: false, message: 'firebase.message.failUploadPhoto', url: null, key: null });
    const uploadSpy = jest.spyOn(projectStore, 'uploadDataHelper').mockResolvedValue({ isOK: true, message: '', encryptedAt: 1 });

    const { result } = renderWithStore(makeStore());
    let res: any;
    await act(async () => {
      res = await result.current.uploadDataToRepository(project, 'All');
    });

    expect(res.isOK).toBe(true);
    expect(res.warning).toBe('hooks.message.failUploadSomePhotos');
    const savedPhoto = (uploadSpy.mock.calls[0][1] as any).data[0].field['写真'][0];
    expect(savedPhoto).toEqual(photo);
  });

  test('写真のアップロードに成功したら警告は返さず url/key を保存する', async () => {
    jest.spyOn(projectStorage, 'uploadPhoto').mockResolvedValue({ isOK: true, message: '', url: 'https://x/p1', key: 'k' });
    const uploadSpy = jest.spyOn(projectStore, 'uploadDataHelper').mockResolvedValue({ isOK: true, message: '', encryptedAt: 1 });

    const { result } = renderWithStore(makeStore());
    let res: any;
    await act(async () => {
      res = await result.current.uploadDataToRepository(project, 'All');
    });

    expect(res).toEqual({ isOK: true, message: '' });
    const savedPhoto = (uploadSpy.mock.calls[0][1] as any).data[0].field['写真'][0];
    expect(savedPhoto).toMatchObject({ url: 'https://x/p1', key: 'k' });
  });
});

// ---------------------------------------------------------------------------
// 同期監査 2026-11 の high（docs/SYNC_AUDIT_2026-11.md の S1〜S4）
describe('同期の high 修正', () => {
  const project = { id: 'proj1' } as any;
  const rec = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    userId: 'test-user',
    displayName: 'U',
    visible: true,
    redraw: false,
    coords: [],
    field: {},
    updatedAt: 100,
    ...extra,
  });

  const makeStore = (opts: { layers: any[]; dataSet: any[]; dataSync?: any; isSettingProject?: boolean }) => {
    const initialState = {
      user: { uid: 'test-user', email: 'a@b.c', displayName: 'U' },
      dataSet: opts.dataSet,
      layers: opts.layers,
      settings: { isSettingProject: opts.isSettingProject ?? false, updatedAt: undefined },
      tileMaps: [],
      dataSync: opts.dataSync ?? {},
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

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(projectStore, 'isSettingsUpdatedAtCurrent').mockResolvedValue(true);
  });

  describe('S1/M7: クラウドの自分のデータを確かめられないときは上書きしない', () => {
    const layer = { id: 'l1', name: 'L1', permission: 'PRIVATE', field: [] } as any;
    const store = () => makeStore({ layers: [layer], dataSet: [{ layerId: 'l1', userId: 'test-user', data: [rec('new')] }] });

    test('getMyDataUpdatedAt が失敗したら中止する', async () => {
      jest.spyOn(projectStore, 'getMyDataUpdatedAt').mockResolvedValue({ isOK: false, message: 'x' });
      const uploadSpy = jest.spyOn(projectStore, 'uploadDataHelper');
      const { result } = renderWithStore(store());
      let res: any;
      await act(async () => {
        res = await result.current.uploadDataToRepository(project, 'All');
      });
      expect(res).toEqual({ isOK: false, message: 'hooks.message.cannotVerifyCloudData' });
      expect(uploadSpy).not.toHaveBeenCalled();
    });

    test('内容比較のための取得が失敗したら中止する', async () => {
      jest.spyOn(projectStore, 'getMyDataUpdatedAt').mockResolvedValue({ isOK: true, message: '', data: new Map([['l1_PRIVATE', 5]]) });
      jest.spyOn(projectStore, 'downloadPrivateData').mockResolvedValue({ isOK: false, message: 'x' } as any);
      const uploadSpy = jest.spyOn(projectStore, 'uploadDataHelper');
      const { result } = renderWithStore(store());
      let res: any;
      await act(async () => {
        res = await result.current.uploadDataToRepository(project, 'All');
      });
      expect(res.isOK).toBe(false);
      expect(uploadSpy).not.toHaveBeenCalled();
    });

    test('クラウドに自分のデータがあるのに復号できないレイヤは上書きせずに残し、他のレイヤは送って知らせる', async () => {
      const pub = { id: 'p1', name: 'P1', permission: 'PUBLIC', field: [] } as any;
      jest
        .spyOn(projectStore, 'getMyDataUpdatedAt')
        .mockResolvedValue({ isOK: true, message: '', data: new Map([['l1_PRIVATE', 5]]) });
      jest
        .spyOn(projectStore, 'downloadPrivateData')
        .mockResolvedValue({ isOK: true, message: '', data: [], unmarkedDekGroups: [] } as any);
      const uploadSpy = jest.spyOn(projectStore, 'uploadDataHelper').mockResolvedValue({ isOK: true, message: '', encryptedAt: 1 });
      const twoLayers = makeStore({
        layers: [layer, pub],
        dataSet: [
          { layerId: 'l1', userId: 'test-user', data: [rec('new')] },
          { layerId: 'p1', userId: 'test-user', data: [rec('pub')] },
        ],
      });
      const { result } = renderWithStore(twoLayers);
      let res: any;
      await act(async () => {
        res = await result.current.uploadDataToRepository(project, 'All');
      });
      expect(res).toEqual({ isOK: true, message: '', warning: 'hooks.message.skippedUnreadableLayers' });
      expect(uploadSpy).toHaveBeenCalledTimes(1);
      expect((uploadSpy.mock.calls[0][1] as any).layerId).toBe('p1');
    });
  });

  describe('S2: COMMON は管理者ごとのバケットを統合して送る', () => {
    const layer = { id: 'c1', name: 'C1', permission: 'COMMON', field: [] } as any;

    test('別の管理者が編集して移した版と、追加した記録が消えない', async () => {
      const dataSet = [
        // 管理者1のバケット: X は管理者2が編集したので墓標
        { layerId: 'c1', userId: 'admin1', data: [rec('X', { userId: 'admin1', deleted: true, updatedAt: 200 })] },
        // 管理者2（自分）のバケット: 編集後の X' と新規の Y
        { layerId: 'c1', userId: 'test-user', data: [rec('X', { field: { v: 'edited' }, updatedAt: 200 }), rec('Y')] },
        // テンプレートは別に送るので混ぜない
        { layerId: 'c1', userId: 'template', data: [rec('T', { userId: 'template' })] },
      ];
      const uploadSpy = jest.spyOn(projectStore, 'uploadDataHelper').mockResolvedValue({ isOK: true, message: '', encryptedAt: 1 });
      const { result } = renderWithStore(makeStore({ layers: [layer], dataSet, isSettingProject: true }));
      await act(async () => {
        await result.current.uploadDataToRepository(project, 'Common');
      });
      const sent = (uploadSpy.mock.calls[0][1] as any).data;
      expect(sent.map((r: any) => r.id)).toEqual(['X', 'Y']);
      expect(sent[0].deleted).toBeUndefined();
      expect(sent[0].field).toEqual({ v: 'edited' });
      expect(sent.every((r: any) => r.userId === 'test-user')).toBe(true);
    });

    test('取り込みがあるレイヤは、全員分をまとめて送ってから他人名義の doc とテンプレートを片付け、手元も1つにそろえる', async () => {
      const dataSet = [
        { layerId: 'c1', userId: 'test-user', data: [rec('mine')] },
        { layerId: 'c1', userId: 'admin1', data: [rec('a1', { userId: 'admin1' })] },
      ];
      const commonAbsorption = {
        extraCommonDataSet: [{ layerId: 'c1', userId: 'test-user', data: [rec('m1', { userId: 'member' })] }],
        representedUserIds: { c1: ['admin1', 'member'] },
      };
      const uploadSpy = jest.spyOn(projectStore, 'uploadDataHelper').mockResolvedValue({ isOK: true, message: '', encryptedAt: 1 });
      const cleanupSpy = jest.spyOn(projectStore, 'deleteOtherUsersData').mockResolvedValue({ isOK: true, message: '' });
      const templateSpy = jest.spyOn(projectStore, 'deleteData').mockResolvedValue({ isOK: true, message: '' });
      const store = makeStore({ layers: [layer], dataSet, isSettingProject: true });
      const { result } = renderWithStore(store);
      let res: any;
      await act(async () => {
        res = await result.current.uploadDataToRepository(project, 'Common', { commonAbsorption });
      });
      expect(res.isOK).toBe(true);
      const sentIds = (uploadSpy.mock.calls[0][1] as any).data.map((r: any) => r.id).sort();
      expect(sentIds).toEqual(['a1', 'm1', 'mine']);
      expect(cleanupSpy).toHaveBeenCalledWith('proj1', 'c1', 'COMMON', 'test-user', ['admin1', 'member']);
      expect(templateSpy).toHaveBeenCalledWith('proj1', 'c1', 'TEMPLATE');
      const types = (store.dispatch as jest.Mock).mock.calls.map((c) => c[0].type);
      expect(types).toContain('dataSet/deleteDataAction');
      const updateCall = (store.dispatch as jest.Mock).mock.calls.find((c) => c[0].type === 'dataSet/updateDataAction');
      expect(updateCall[0].payload[0].data.map((r: any) => r.id).sort()).toEqual(['a1', 'm1', 'mine']);
    });

    test('書き込みに失敗したら、他人名義の doc を片付けない（先に消すと失敗で消えたままになる）', async () => {
      const commonAbsorption = { extraCommonDataSet: [], representedUserIds: { c1: ['admin1'] } };
      jest.spyOn(projectStore, 'uploadDataHelper').mockResolvedValue({ isOK: false, message: 'fail' } as any);
      const cleanupSpy = jest.spyOn(projectStore, 'deleteOtherUsersData');
      const { result } = renderWithStore(
        makeStore({ layers: [layer], dataSet: [{ layerId: 'c1', userId: 'test-user', data: [rec('mine')] }], isSettingProject: true })
      );
      let res: any;
      await act(async () => {
        res = await result.current.uploadDataToRepository(project, 'Common', { commonAbsorption });
      });
      expect(res.isOK).toBe(false);
      expect(cleanupSpy).not.toHaveBeenCalled();
    });
  });

  describe('S3: 保存の最初に COMMON を消さない', () => {
    test('COMMON のレイヤでは deleteData を呼ばず、PUBLIC/PRIVATE のレイヤはテンプレートだけ消す', async () => {
      const common = { id: 'c1', name: 'C1', permission: 'COMMON', field: [] } as any;
      const pub = { id: 'p1', name: 'P1', permission: 'PUBLIC', field: [] } as any;
      const deleteSpy = jest.spyOn(projectStore, 'deleteData').mockResolvedValue({ isOK: true, message: '' });
      const { result } = renderWithStore(makeStore({ layers: [common, pub], dataSet: [], isSettingProject: true }));
      await act(async () => {
        await result.current.deleteCommonAndTemplateData(project);
      });
      expect(deleteSpy.mock.calls).toEqual([['proj1', 'p1', 'TEMPLATE']]);
    });
  });

  describe('S4: 衝突時のマージで更新日時が同じなら手元を採る', () => {
    test('旧版で作図した記録（時刻が進んでいない）の形の変更がクラウドの版に負けない', async () => {
      const layer = { id: 'l1', name: 'L1', permission: 'PRIVATE', field: [] } as any;
      const local = rec('L', { coords: [{ latitude: 1, longitude: 1 }], updatedAt: 100 });
      const cloud = rec('L', { coords: [{ latitude: 0, longitude: 0 }], updatedAt: 100 });
      const cloudOnly = rec('C', { updatedAt: 300 });
      jest.spyOn(projectStore, 'getMyDataUpdatedAt').mockResolvedValue({ isOK: true, message: '', data: new Map([['l1_PRIVATE', 5]]) });
      jest
        .spyOn(projectStore, 'downloadPrivateData')
        .mockResolvedValue({ isOK: true, message: '', data: [{ layerId: 'l1', userId: 'test-user', data: [cloud, cloudOnly] }], unmarkedDekGroups: [] } as any);
      jest.spyOn(AlertAsyncModule, 'DataConflictConfirmAsync').mockResolvedValue('merge');
      (DataUtils.mergeLayerData as jest.Mock).mockImplementationOnce((args: any) => realMergeLayerData(args));
      const uploadSpy = jest.spyOn(projectStore, 'uploadDataHelper').mockResolvedValue({ isOK: true, message: '', encryptedAt: 9 });
      const { result } = renderWithStore(makeStore({ layers: [layer], dataSet: [{ layerId: 'l1', userId: 'test-user', data: [local] }] }));
      await act(async () => {
        await result.current.uploadDataToRepository(project, 'All');
      });
      const sent = (uploadSpy.mock.calls[0][1] as any).data;
      expect(sent.find((r: any) => r.id === 'L').coords).toEqual([{ latitude: 1, longitude: 1 }]);
      expect(sent.map((r: any) => r.id).sort()).toEqual(['C', 'L']);
    });
  });
});
