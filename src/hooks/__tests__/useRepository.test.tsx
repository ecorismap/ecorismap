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
import * as unsyncedChanges from '../../utils/unsyncedChanges';
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
      .mockResolvedValue({ isOK: true, message: '', data: [{ layerId: 'l1', userId: 'test-user', data: [localRecord] }], unmarkedDekGroups: [], undecryptableGroups: [] });
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
      .mockResolvedValue({ isOK: true, message: '', data: [{ layerId: 'l1', userId: 'test-user', data: [cloudOnly] }], unmarkedDekGroups: [], undecryptableGroups: [] });
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
      .mockResolvedValue({ isOK: true, message: '', data: [{ layerId: 'l1', userId: 'test-user', data: [cloudOnly] }], unmarkedDekGroups: [], undecryptableGroups: [] });
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

// ---------------------------------------------------------------------------
// 同期監査 2026-11 の medium（M3・M4・M5）
describe('同期の medium 修正', () => {
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
  const makeStore = (opts: { layers: any[]; dataSet: any[]; dataSync?: any }) => {
    const initialState = {
      user: { uid: 'test-user', email: 'a@b.c', displayName: 'U' },
      dataSet: opts.dataSet,
      layers: opts.layers,
      settings: { isSettingProject: false, updatedAt: undefined },
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

  describe('M5: 一括解決の指定は、その取得の残りにだけ効く', () => {
    test('「残りは自分優先」を押した後でも、次の取得の競合は利用者に尋ねる', async () => {
      const { result } = renderWithStore(makeStore({ layers: [], dataSet: [] }));
      const candidates = [rec('x', { userId: 'other', updatedAt: 300 }), rec('x', { updatedAt: 100 })];
      let first: any;
      act(() => {
        first = result.current.conflictsResolver(candidates, 'x');
      });
      expect(result.current.conflictState.queue).toHaveLength(1);
      act(() => {
        result.current.handleBulkSelect('self');
      });
      await expect(first).resolves.toMatchObject({ userId: 'test-user' });
      // 次の取得（createMergedDataSet）を始めると一括の指定は解除される
      await act(async () => {
        await result.current.createMergedDataSet({ privateData: [], publicData: [], templateData: [] });
      });
      act(() => {
        result.current.conflictsResolver(candidates, 'x');
      });
      expect(result.current.conflictState.queue).toHaveLength(1);
      expect(result.current.conflictState.bulkMode).toBeNull();
    });

    test('「自分優先」で自分の候補が無いときは最新を、更新日時の無い候補は最も古いものとして選ぶ', async () => {
      const { result } = renderWithStore(makeStore({ layers: [], dataSet: [] }));
      let chosen: any;
      act(() => {
        chosen = result.current.conflictsResolver(
          [rec('x', { userId: 'a', updatedAt: undefined }), rec('x', { userId: 'b', updatedAt: 50 })],
          'x'
        );
      });
      act(() => {
        result.current.handleBulkSelect('self');
      });
      await expect(chosen).resolves.toMatchObject({ userId: 'b' });
    });
  });

  describe('M3: 写真は書き込みに成功してから、要らないものだけ消す', () => {
    const layer = { id: 'l1', name: 'L1', permission: 'PRIVATE', field: [{ id: 'f', name: '写真', format: 'PHOTO' }] } as any;
    const photo = { id: 'ph1', name: 'a.jpg', uri: null, url: 'https://x/ph1', key: 'k', width: 1, height: 1, thumbnail: null };

    test('削除したレコードの写真でも、マージで採られた版が参照していれば消さない', async () => {
      const local = rec('X', { deleted: true, updatedAt: 150, field: { 写真: [photo] } });
      const cloud = rec('X', { updatedAt: 200, field: { 写真: [photo] } });
      jest.spyOn(projectStore, 'getMyDataUpdatedAt').mockResolvedValue({ isOK: true, message: '', data: new Map([['l1_PRIVATE', 5]]) });
      jest
        .spyOn(projectStore, 'downloadPrivateData')
        .mockResolvedValue({ isOK: true, message: '', data: [{ layerId: 'l1', userId: 'test-user', data: [cloud] }], unmarkedDekGroups: [] } as any);
      jest.spyOn(AlertAsyncModule, 'DataConflictConfirmAsync').mockResolvedValue('merge');
      (DataUtils.mergeLayerData as jest.Mock).mockImplementationOnce((args: any) => realMergeLayerData(args));
      jest.spyOn(projectStore, 'uploadDataHelper').mockResolvedValue({ isOK: true, message: '', encryptedAt: 9 });
      const deleteSpy = jest.spyOn(projectStorage, 'deleteStoragePhoto').mockResolvedValue({ isOK: true, message: '' });
      const { result } = renderWithStore(makeStore({ layers: [layer], dataSet: [{ layerId: 'l1', userId: 'test-user', data: [local] }] }));
      await act(async () => {
        await result.current.uploadDataToRepository(project, 'All');
      });
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    test('参照されなくなった写真は、書き込みの成功後に消す。書き込みに失敗したら消さない', async () => {
      const removed = rec('Y', { deleted: true, field: { 写真: [photo] } });
      jest.spyOn(projectStore, 'getMyDataUpdatedAt').mockResolvedValue({ isOK: true, message: '', data: new Map() });
      const uploadSpy = jest.spyOn(projectStore, 'uploadDataHelper').mockResolvedValueOnce({ isOK: false, message: 'fail' } as any);
      const deleteSpy = jest.spyOn(projectStorage, 'deleteStoragePhoto').mockResolvedValue({ isOK: true, message: '' });
      const store = makeStore({ layers: [layer], dataSet: [{ layerId: 'l1', userId: 'test-user', data: [removed] }] });
      const { result } = renderWithStore(store);
      await act(async () => {
        await result.current.uploadDataToRepository(project, 'All');
      });
      expect(deleteSpy).not.toHaveBeenCalled();

      uploadSpy.mockResolvedValueOnce({ isOK: true, message: '', encryptedAt: 9 });
      await act(async () => {
        await result.current.uploadDataToRepository(project, 'All');
      });
      expect(deleteSpy).toHaveBeenCalledWith('proj1', 'l1', 'test-user', 'ph1');
    });
  });

  describe('M4: 他人の写真は持ち主のフォルダに id 付きで保存する', () => {
    test('同じ名前の写真でも、他人の記録の写真は自分の写真とすり替わらない', async () => {
      const layer = { id: 'l1', name: 'L1', permission: 'PUBLIC', field: [{ id: 'f', name: '写真', format: 'PHOTO' }] } as any;
      const photo = {
        id: 'ph9',
        name: 'EMAP_1.jpg',
        uri: null,
        url: 'https://firebasestorage.googleapis.com/v0/b/b/o/projects%2Fproj1%2FPHOTO%2Fl1%2Fother%2Fph9?alt=media',
        key: 'k',
        width: 1,
        height: 1,
        thumbnail: null,
      };
      const ownUrl = 'https://firebasestorage.googleapis.com/v0/b/b/o/projects%2Fproj1%2FPHOTO%2Fl1%2Ftest-user%2Fph1?alt=media';
      const dlSpy = jest.spyOn(projectStorage, 'downloadPhoto').mockResolvedValue({ isOK: true, message: '', uri: 'file:///x' });
      jest.spyOn(projectStore, 'downloadPublicAndCommonData').mockResolvedValue({
        isOK: true,
        message: '',
        data: [
          { layerId: 'l1', userId: 'other', data: [rec('o', { userId: 'other', field: { 写真: [photo] } })] },
          { layerId: 'l1', userId: 'test-user', data: [rec('m', { field: { 写真: [{ ...photo, id: 'ph1', url: ownUrl }] } })] },
        ],
      } as any);
      const { result } = renderWithStore(makeStore({ layers: [layer], dataSet: [] }));
      await act(async () => {
        await result.current.downloadPublicAndCommonData(project, true);
      });
      const calls = dlSpy.mock.calls.map((c) => [c[2], c[3]]);
      expect(calls).toContainEqual(['ph9_EMAP_1.jpg', expect.stringMatching(/\/proj1\/l1\/other$/)]);
      expect(calls).toContainEqual(['EMAP_1.jpg', expect.stringMatching(/\/proj1\/l1\/test-user$/)]);
    });
  });
});

describe('同期の low 修正', () => {
  const project = { id: 'proj1' } as any;
  const rec = (id: string) => ({
    id,
    userId: 'test-user',
    displayName: 'U',
    visible: true,
    redraw: false,
    coords: [],
    field: {},
    updatedAt: 100,
  });
  const makeStore = (opts: { layers: any[]; dataSet: any[]; dataSync?: any }) => {
    const initialState = {
      user: { uid: 'test-user', email: 'a@b.c', displayName: 'U' },
      dataSet: opts.dataSet,
      layers: opts.layers,
      settings: { isSettingProject: false, updatedAt: undefined },
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

  describe('L5: 判定に使ったクラウドの版を、書く直前の照合に渡す', () => {
    const privateLayer = { id: 'l1', name: 'L1', permission: 'PRIVATE', field: [] } as any;
    const commonLayer = { id: 'c1', name: 'C1', permission: 'COMMON', field: [] } as any;

    it('衝突判定で見た版（基準値と同じ）を期待値として渡す', async () => {
      jest
        .spyOn(projectStore, 'getMyDataUpdatedAt')
        .mockResolvedValue({ isOK: true, message: '', data: new Map([['l1_PRIVATE', 555]]) });
      const uploadSpy = jest
        .spyOn(projectStore, 'uploadDataHelper')
        .mockResolvedValue({ isOK: true, message: '', encryptedAt: 999 });
      const store = makeStore({
        layers: [privateLayer],
        dataSet: [{ layerId: 'l1', userId: 'test-user', data: [rec('a')] }],
        dataSync: { proj1: { l1_PRIVATE: 555 } },
      });
      const { result } = renderWithStore(store);
      await act(async () => {
        await result.current.uploadDataToRepository(project, 'All');
      });

      expect(uploadSpy).toHaveBeenCalledTimes(1);
      expect(uploadSpy.mock.calls[0][2]).toEqual({ expected: { encryptedAt: 555 } });
    });

    it('クラウドに無いと判定したレイヤは「無い」ことを期待値として渡す', async () => {
      jest.spyOn(projectStore, 'getMyDataUpdatedAt').mockResolvedValue({ isOK: true, message: '', data: new Map() });
      const uploadSpy = jest
        .spyOn(projectStore, 'uploadDataHelper')
        .mockResolvedValue({ isOK: true, message: '', encryptedAt: 999 });
      const store = makeStore({
        layers: [privateLayer],
        dataSet: [{ layerId: 'l1', userId: 'test-user', data: [rec('a')] }],
      });
      const { result } = renderWithStore(store);
      await act(async () => {
        await result.current.uploadDataToRepository(project, 'All');
      });

      expect(uploadSpy.mock.calls[0][2]).toEqual({ expected: { encryptedAt: undefined } });
    });

    it('書く直前に別の端末で更新されていたら、中止して利用者にやり直しを伝え、基準値を保存しない', async () => {
      jest
        .spyOn(projectStore, 'getMyDataUpdatedAt')
        .mockResolvedValue({ isOK: true, message: '', data: new Map([['l1_PRIVATE', 555]]) });
      jest.spyOn(projectStore, 'uploadDataHelper').mockResolvedValue({
        isOK: false,
        message: 'hooks.message.cloudDataChangedByOtherDevice',
        staleExpectation: true,
      });
      const store = makeStore({
        layers: [privateLayer],
        dataSet: [{ layerId: 'l1', userId: 'test-user', data: [rec('a')] }],
        dataSync: { proj1: { l1_PRIVATE: 555 } },
      });
      const { result } = renderWithStore(store);
      let res: any;
      await act(async () => {
        res = await result.current.uploadDataToRepository(project, 'All');
      });

      expect(res).toEqual({ isOK: false, message: 'hooks.message.cloudDataChangedByOtherDevice (L1)' });
      const types = (store.dispatch as jest.Mock).mock.calls.map((c) => c[0].type);
      expect(types).not.toContain(setDataSyncTimestampsAction({ projectId: 'p', entries: {} }).type);
    });

    it('COMMON には期待値を渡さない（衝突判定の対象外）', async () => {
      const uploadSpy = jest
        .spyOn(projectStore, 'uploadDataHelper')
        .mockResolvedValue({ isOK: true, message: '', encryptedAt: 999 });
      const store = makeStore({
        layers: [commonLayer],
        dataSet: [{ layerId: 'c1', userId: 'test-user', data: [rec('a')] }],
      });
      const { result } = renderWithStore(store);
      await act(async () => {
        await result.current.uploadDataToRepository(project, 'All');
      });

      expect(uploadSpy).toHaveBeenCalledTimes(1);
      expect(uploadSpy.mock.calls[0][2]).toEqual({});
    });
  });
});

describe('同期の low 修正（ダウンロード時のマージ）', () => {
  const dataSetReducer = require('../../modules/dataSet').default;
  const rec = (id: string, userId: string, extra: Record<string, unknown> = {}) => ({
    id,
    userId,
    displayName: userId,
    visible: true,
    redraw: false,
    coords: [],
    field: {},
    updatedAt: 100,
    ...extra,
  });
  const publicLayer = { id: 'pub', name: 'PUB', permission: 'PUBLIC', field: [] } as any;
  const privateLayer = { id: 'prv', name: 'PRV', permission: 'PRIVATE', field: [] } as any;
  // 取得の結果を手元の dataSet に反映させて確かめたいので、dataSet は本物の reducer を使う
  const makeRealStore = (opts: { layers: any[]; dataSet: any[] }) =>
    configureStore({
      reducer: {
        user: (state = { uid: 'test-user', email: 'a@b.c', displayName: 'U' }) => state,
        dataSet: dataSetReducer,
        layers: (state = opts.layers) => state,
        settings: (state = { isSettingProject: false, updatedAt: undefined }) => state,
        tileMaps: (state = []) => state,
        dataSync: (state = {}) => state,
      } as any,
      preloadedState: { dataSet: opts.dataSet } as any,
    });
  const renderWithStore = (store: any) =>
    renderHook(() => useRepository(), {
      wrapper: (props: any) => <Provider store={store}>{props.children}</Provider>,
    });
  const bucketsOf = (store: any, layerId: string) =>
    (store.getState().dataSet as any[])
      .filter((d) => d.layerId === layerId)
      .map((d) => ({ userId: d.userId, ids: d.data.map((r: any) => r.id) }));

  describe('L2: クラウドから消えた他人のデータを手元から消す', () => {
    test('取り直した PUBLIC レイヤで、取得結果に無い他人のバケットを消す。自分・未ログイン時の分は残す', async () => {
      const store = makeRealStore({
        layers: [publicLayer],
        dataSet: [
          { layerId: 'pub', userId: 'test-user', data: [rec('m1', 'test-user')] },
          { layerId: 'pub', userId: 'gone', data: [rec('g1', 'gone')] },
          { layerId: 'pub', userId: 'stay', data: [rec('s1', 'stay')] },
          { layerId: 'pub', userId: undefined, data: [rec('u1', undefined as any)] },
        ],
      });
      const { result } = renderWithStore(store);
      await act(async () => {
        await result.current.createMergedDataSet({
          privateData: [],
          publicData: [
            { layerId: 'pub', userId: 'stay', data: [rec('s1', 'stay', { updatedAt: 200 })] },
            { layerId: 'pub', userId: 'test-user', data: [rec('m1', 'test-user')] },
          ],
          templateData: [],
          fetchedScope: { permissions: ['PUBLIC'], template: true },
        });
      });
      const buckets = bucketsOf(store, 'pub');
      expect(buckets.map((b) => b.userId)).not.toContain('gone');
      expect(buckets).toEqual(
        expect.arrayContaining([
          { userId: 'test-user', ids: ['m1'] },
          { userId: 'stay', ids: ['s1'] },
          { userId: undefined, ids: ['u1'] },
        ])
      );
    });

    test('管理者が PRIVATE を取得しなかった取得（pruneOthers:false）では、PRIVATE から PUBLIC に変えたレイヤの他人の写しを消さない', async () => {
      const store = makeRealStore({
        layers: [publicLayer],
        dataSet: [{ layerId: 'pub', userId: 'member', data: [rec('p1', 'member')] }],
      });
      const { result } = renderWithStore(store);
      await act(async () => {
        await result.current.createMergedDataSet({
          privateData: [],
          publicData: [],
          templateData: [],
          fetchedScope: { permissions: ['PUBLIC'], template: true, pruneOthers: false },
        });
      });
      expect(bucketsOf(store, 'pub')).toEqual([{ userId: 'member', ids: ['p1'] }]);
    });

    test('取得結果にそのレイヤの分が一つも無くても、他人のバケットを消す', async () => {
      const store = makeRealStore({
        layers: [publicLayer],
        dataSet: [{ layerId: 'pub', userId: 'gone', data: [rec('g1', 'gone')] }],
      });
      const { result } = renderWithStore(store);
      await act(async () => {
        await result.current.createMergedDataSet({
          privateData: [],
          publicData: [],
          templateData: [],
          fetchedScope: { permissions: ['PUBLIC'], template: true },
        });
      });
      expect(bucketsOf(store, 'pub')).toEqual([]);
    });

    test('復号できなかった人のバケットは消さずに残し、件数を警告で知らせる', async () => {
      const store = makeRealStore({
        layers: [publicLayer],
        dataSet: [{ layerId: 'pub', userId: 'locked', data: [rec('l1', 'locked')] }],
      });
      const { result } = renderWithStore(store);
      let res: any;
      await act(async () => {
        res = await result.current.createMergedDataSet({
          privateData: [],
          publicData: [],
          templateData: [],
          fetchedScope: { permissions: ['PUBLIC'], template: true },
          undecryptableGroups: [{ layerId: 'pub', userId: 'locked', permission: 'PUBLIC' }],
        });
      });
      expect(bucketsOf(store, 'pub')).toEqual([{ userId: 'locked', ids: ['l1'] }]);
      expect(res).toEqual({ isOK: true, message: '', warning: 'hooks.message.someDataUndecryptable' });
    });

    test('PRIVATE を取得しなかった取得（管理者として取得しない選択）では、以前に取得した他人の PRIVATE を消さない', async () => {
      const store = makeRealStore({
        layers: [publicLayer, privateLayer],
        dataSet: [{ layerId: 'prv', userId: 'member', data: [rec('p1', 'member')] }],
      });
      const { result } = renderWithStore(store);
      await act(async () => {
        await result.current.createMergedDataSet({
          privateData: [],
          publicData: [],
          templateData: [],
          fetchedScope: { permissions: ['PUBLIC'], template: true },
        });
      });
      expect(bucketsOf(store, 'prv')).toEqual([{ userId: 'member', ids: ['p1'] }]);
    });

    test('管理者として PRIVATE を取り直したときは、取得結果に無い他人の PRIVATE を消す', async () => {
      const store = makeRealStore({
        layers: [privateLayer],
        dataSet: [
          { layerId: 'prv', userId: 'test-user', data: [rec('m1', 'test-user')] },
          { layerId: 'prv', userId: 'gone', data: [rec('g1', 'gone')] },
        ],
      });
      const { result } = renderWithStore(store);
      await act(async () => {
        await result.current.createMergedDataSet({
          privateData: [{ layerId: 'prv', userId: 'test-user', data: [rec('m1', 'test-user')] }],
          publicData: [],
          templateData: [],
          fetchedScope: { permissions: ['PUBLIC', 'PRIVATE'], template: true },
        });
      });
      expect(bucketsOf(store, 'prv')).toEqual([{ userId: 'test-user', ids: ['m1'] }]);
    });

    test('取得の範囲を渡さなければ、従来どおり手元のバケットを消さない', async () => {
      const store = makeRealStore({
        layers: [publicLayer],
        dataSet: [{ layerId: 'pub', userId: 'gone', data: [rec('g1', 'gone')] }],
      });
      const { result } = renderWithStore(store);
      await act(async () => {
        await result.current.createMergedDataSet({ privateData: [], publicData: [], templateData: [] });
      });
      expect(bucketsOf(store, 'pub')).toEqual([{ userId: 'gone', ids: ['g1'] }]);
    });
  });

  describe('L3: テンプレートを取得結果にそろえる', () => {
    test('テンプレートの記録がすべて利用者の版に置き換わったら、手元のテンプレートを空にする（二重表示しない）', async () => {
      const store = makeRealStore({
        layers: [publicLayer],
        dataSet: [{ layerId: 'pub', userId: 'template', data: [rec('t1', 'template')] }],
      });
      const { result } = renderWithStore(store);
      await act(async () => {
        await result.current.createMergedDataSet({
          privateData: [],
          publicData: [{ layerId: 'pub', userId: 'test-user', data: [rec('t1', 'test-user', { updatedAt: 300 })] }],
          templateData: [{ layerId: 'pub', userId: 'template', data: [rec('t1', 'template')] }],
          fetchedScope: { permissions: ['PUBLIC'], template: true },
        });
      });
      expect(bucketsOf(store, 'pub')).toEqual(
        expect.arrayContaining([
          { userId: 'template', ids: [] },
          { userId: 'test-user', ids: ['t1'] },
        ])
      );
    });

    test('テンプレートを取得したのにそのレイヤの分が無ければ、手元の古いテンプレートを消す', async () => {
      const store = makeRealStore({
        layers: [publicLayer],
        dataSet: [{ layerId: 'pub', userId: 'template', data: [rec('t1', 'template')] }],
      });
      const { result } = renderWithStore(store);
      await act(async () => {
        await result.current.createMergedDataSet({
          privateData: [],
          publicData: [],
          templateData: [],
          fetchedScope: { permissions: ['PUBLIC'], template: true },
        });
      });
      expect(bucketsOf(store, 'pub')).toEqual([{ userId: 'template', ids: [] }]);
    });

    test('テンプレートを復号できなかったときは、手元のテンプレートを残す', async () => {
      const store = makeRealStore({
        layers: [publicLayer],
        dataSet: [{ layerId: 'pub', userId: 'template', data: [rec('t1', 'template')] }],
      });
      const { result } = renderWithStore(store);
      await act(async () => {
        await result.current.createMergedDataSet({
          privateData: [],
          publicData: [],
          templateData: [],
          fetchedScope: { permissions: ['PUBLIC'], template: true },
          undecryptableGroups: [{ layerId: 'pub', userId: 'admin', permission: 'TEMPLATE' }],
        });
      });
      expect(bucketsOf(store, 'pub')).toEqual([{ userId: 'template', ids: ['t1'] }]);
    });
  });

  describe('L13: 途中のレイヤで失敗しても、先に書き込めたレイヤの基準値は保存する', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      jest.spyOn(projectStore, 'isSettingsUpdatedAtCurrent').mockResolvedValue(true);
      jest.spyOn(projectStore, 'getMyDataUpdatedAt').mockResolvedValue({ isOK: true, message: '', data: new Map() });
    });
    const layerA = { id: 'a', name: 'A', permission: 'PRIVATE', field: [] } as any;
    const layerB = { id: 'b', name: 'B', permission: 'PRIVATE', field: [] } as any;
    const setup = () => {
      const store = makeRealStore({
        layers: [layerA, layerB],
        dataSet: [
          { layerId: 'a', userId: 'test-user', data: [rec('x', 'test-user')] },
          { layerId: 'b', userId: 'test-user', data: [rec('y', 'test-user')] },
        ],
      });
      const dispatchSpy = jest.spyOn(store, 'dispatch');
      return { store, dispatchSpy };
    };
    const savedBaselines = (dispatchSpy: jest.SpyInstance) =>
      dispatchSpy.mock.calls
        .map((c) => c[0])
        .filter((a: any) => a.type === setDataSyncTimestampsAction({ projectId: 'p', entries: {} }).type)
        .map((a: any) => a.payload);

    test('2つ目のレイヤの書き込みに失敗しても、1つ目の基準値を保存する', async () => {
      jest
        .spyOn(projectStore, 'uploadDataHelper')
        .mockResolvedValueOnce({ isOK: true, message: '', encryptedAt: 11 })
        .mockResolvedValueOnce({ isOK: false, message: 'fail' } as any);
      const { store, dispatchSpy } = setup();
      const { result } = renderWithStore(store);
      let res: any;
      await act(async () => {
        res = await result.current.uploadDataToRepository({ id: 'proj1' } as any, 'All');
      });
      expect(res).toEqual({ isOK: false, message: 'fail (B)' });
      expect(savedBaselines(dispatchSpy)).toEqual([{ projectId: 'proj1', entries: { a_PRIVATE: 11 } }]);
    });

    test('2つ目のレイヤが別端末に先に書かれていて中止しても、1つ目の基準値を保存する', async () => {
      jest
        .spyOn(projectStore, 'uploadDataHelper')
        .mockResolvedValueOnce({ isOK: true, message: '', encryptedAt: 11 })
        .mockResolvedValueOnce({ isOK: false, message: '', staleExpectation: true } as any);
      const { store, dispatchSpy } = setup();
      const { result } = renderWithStore(store);
      await act(async () => {
        await result.current.uploadDataToRepository({ id: 'proj1' } as any, 'All');
      });
      expect(savedBaselines(dispatchSpy)).toEqual([{ projectId: 'proj1', entries: { a_PRIVATE: 11 } }]);
    });

    test('1つ目で失敗したら基準値は保存しない', async () => {
      jest.spyOn(projectStore, 'uploadDataHelper').mockResolvedValueOnce({ isOK: false, message: 'fail' } as any);
      const { store, dispatchSpy } = setup();
      const { result } = renderWithStore(store);
      await act(async () => {
        await result.current.uploadDataToRepository({ id: 'proj1' } as any, 'All');
      });
      expect(savedBaselines(dispatchSpy)).toEqual([]);
    });
  });

  describe('L14: Web版の離脱確認のため、書き込めたレイヤだけをアップロード済みとして記録する', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      jest.spyOn(projectStore, 'isSettingsUpdatedAtCurrent').mockResolvedValue(true);
      jest.spyOn(projectStore, 'getMyDataUpdatedAt').mockResolvedValue({ isOK: true, message: '', data: new Map() });
    });
    const layerA = { id: 'a', name: 'A', permission: 'PRIVATE', field: [] } as any;
    const layerB = { id: 'b', name: 'B', permission: 'PRIVATE', field: [] } as any;

    test('失敗したレイヤは記録せず、記録する時刻はアップロードを始めた時刻にする', async () => {
      jest
        .spyOn(projectStore, 'uploadDataHelper')
        .mockResolvedValueOnce({ isOK: true, message: '', encryptedAt: 11 })
        .mockResolvedValueOnce({ isOK: false, message: 'fail' } as any);
      const markSpy = jest.spyOn(unsyncedChanges, 'markLayerUploaded').mockImplementation(() => undefined);
      const store = makeRealStore({
        layers: [layerA, layerB],
        dataSet: [
          { layerId: 'a', userId: 'test-user', data: [rec('x', 'test-user')] },
          { layerId: 'b', userId: 'test-user', data: [rec('y', 'test-user')] },
        ],
      });
      const { result } = renderWithStore(store);
      const before = Date.now();
      await act(async () => {
        await result.current.uploadDataToRepository({ id: 'proj1' } as any, 'All');
      });
      expect(markSpy).toHaveBeenCalledTimes(1);
      const [projectId, layerId, startedAt] = markSpy.mock.calls[0];
      expect([projectId, layerId]).toEqual(['proj1', 'a']);
      expect(startedAt).toBeGreaterThanOrEqual(before);
      expect(startedAt).toBeLessThanOrEqual(Date.now());
      markSpy.mockRestore();
    });
  });
});

describe('M8・L1: 管理者が引き継いだ記録と、元の持ち主のアップロード', () => {
  const project = { id: 'proj1' } as any;
  const layer = { id: 'l1', name: 'L1', permission: 'PUBLIC', field: [] } as any;
  const conflictKey = 'l1_PUBLIC';
  const base = { displayName: 'U', visible: true, redraw: false, coords: [], field: {} };
  const kept = { ...base, id: 'kept', userId: 'test-user', updatedAt: 100 };
  const takenOriginal = { ...base, id: 'taken', userId: 'test-user', updatedAt: 100 };
  const adminTombstone = {
    ...base,
    id: 'taken',
    userId: 'admin',
    updatedAt: 200,
    deleted: true,
    takenOverFrom: ['test-user'],
  };

  const makeStore = () => {
    const initialState = {
      user: { uid: 'test-user', email: 'a@b.c', displayName: 'U' },
      // 取得で、管理者が引き継いで消した記録は自分の名義から外れ、管理者の墓標が手元にある
      dataSet: [
        { layerId: 'l1', userId: 'test-user', data: [kept] },
        { layerId: 'l1', userId: 'admin', data: [adminTombstone] },
      ],
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

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(projectStore, 'isSettingsUpdatedAtCurrent').mockResolvedValue(true);
  });

  test('クラウドの自分の doc に残る引き継がれた記録を「クラウドにだけある変更」とみなさず、送り直さない', async () => {
    jest
      .spyOn(projectStore, 'getMyDataUpdatedAt')
      .mockResolvedValue({ isOK: true, message: '', data: new Map([[conflictKey, 555]]) });
    const dialogSpy = jest.spyOn(AlertAsyncModule, 'DataConflictConfirmAsync');
    jest.spyOn(projectStore, 'downloadPublicData').mockResolvedValue({
      isOK: true,
      message: '',
      data: [{ layerId: 'l1', userId: 'test-user', data: [kept, takenOriginal] }],
      unmarkedDekGroups: [],
      undecryptableGroups: [],
    } as any);
    const uploadSpy = jest
      .spyOn(projectStore, 'uploadDataHelper')
      .mockResolvedValue({ isOK: true, message: '', encryptedAt: 999 });

    const { result } = renderHook(() => useRepository(), {
      wrapper: (props: any) => <Provider store={makeStore()}>{props.children}</Provider>,
    });
    await act(async () => {
      await result.current.uploadDataToRepository(project, 'PublicAndPrivate');
    });

    expect(dialogSpy).not.toHaveBeenCalled();
    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect((uploadSpy.mock.calls[0][1] as any).data.map((r: any) => r.id)).toEqual(['kept']);
  });
});
