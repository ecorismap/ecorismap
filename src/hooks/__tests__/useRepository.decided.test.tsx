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
import dataSetReducer from '../../modules/dataSet';
import dataSyncReducer from '../../modules/dataSync';
import * as projectStore from '../../lib/firebase/firestore';
import * as unsyncedChanges from '../../utils/unsyncedChanges';
import * as AlertAsyncModule from '../../components/molecules/AlertAsync';

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
      }) as unknown as React.FC
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

/**
 * 同期監査の判断待ちだった M10・L11・L4（2026-11-22 決定の方針）
 */
const project = { id: 'proj1' } as any;
const rec = (id: string, userId: string, extra: Record<string, unknown> = {}) => ({
  id,
  userId,
  displayName: userId,
  visible: true,
  redraw: false,
  coords: [],
  field: {},
  updatedAt: 100,
  uploaded: true,
  ...extra,
});
const makeStore = (opts: { layers: any[]; dataSet: any[]; dataSync?: any; settingsUpdatedAt?: string }) =>
  configureStore({
    reducer: {
      user: (state = { uid: 'test-user', email: 'a@b.c', displayName: 'U' }) => state,
      dataSet: dataSetReducer,
      layers: (state = opts.layers) => state,
      settings: (state = { isSettingProject: false, updatedAt: opts.settingsUpdatedAt }) => state,
      tileMaps: (state = []) => state,
      dataSync: dataSyncReducer,
    } as any,
    preloadedState: { dataSet: opts.dataSet, dataSync: opts.dataSync ?? {} } as any,
  });
const renderWithStore = (store: any) =>
  renderHook(() => useRepository(), {
    wrapper: (props: any) => <Provider store={store}>{props.children}</Provider>,
  });
const uploadedLayerIds = (uploadSpy: jest.SpyInstance) => uploadSpy.mock.calls.map((c) => (c[1] as any).layerId);

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('M10: クラウドの設定と権限が食い違うレイヤはアップロードしない', () => {
  const layerA = { id: 'a', name: 'A', permission: 'PRIVATE', field: [] } as any;
  const layerB = { id: 'b', name: 'B', permission: 'PUBLIC', field: [] } as any;
  const setup = () =>
    makeStore({
      layers: [layerA, layerB],
      dataSet: [
        { layerId: 'a', userId: 'test-user', data: [rec('x', 'test-user')] },
        { layerId: 'b', userId: 'test-user', data: [rec('y', 'test-user')] },
      ],
    });

  beforeEach(() => {
    jest.spyOn(projectStore, 'isSettingsUpdatedAtCurrent').mockResolvedValue(false);
    jest.spyOn(projectStore, 'getMyDataUpdatedAt').mockResolvedValue({ isOK: true, message: '', data: new Map() });
  });

  test('権限が変わったレイヤだけ止め、他のレイヤは上げて、設定の取り込み直しを案内する', async () => {
    jest.spyOn(projectStore, 'downloadProjectSettings').mockResolvedValue({
      isOK: true,
      message: '',
      data: { layers: [{ ...layerA, permission: 'PUBLIC' }, layerB] } as any,
    });
    const confirmSpy = jest.spyOn(AlertAsyncModule, 'ConfirmAsync');
    const uploadSpy = jest
      .spyOn(projectStore, 'uploadDataHelper')
      .mockResolvedValue({ isOK: true, message: '', encryptedAt: 11 });
    const { result } = renderWithStore(setup());
    let res: any;
    await act(async () => {
      res = await result.current.uploadDataToRepository(project, 'PublicAndPrivate');
    });
    expect(uploadedLayerIds(uploadSpy)).toEqual(['b']);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(res.isOK).toBe(true);
    expect(res.warning).toContain('hooks.message.skippedLayersSettingsChanged');
  });

  test('クラウドの設定を読めないときは従来どおり確かめ、キャンセルなら上げない', async () => {
    jest.spyOn(projectStore, 'downloadProjectSettings').mockResolvedValue({ isOK: false, message: 'fail' });
    const confirmSpy = jest.spyOn(AlertAsyncModule, 'ConfirmAsync').mockResolvedValue(false);
    const uploadSpy = jest.spyOn(projectStore, 'uploadDataHelper');
    const { result } = renderWithStore(setup());
    let res: any;
    await act(async () => {
      res = await result.current.uploadDataToRepository(project, 'PublicAndPrivate');
    });
    expect(confirmSpy).toHaveBeenCalledWith('hooks.message.cannotUploadData');
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(res).toEqual({ isOK: false, message: '' });
  });

  test('設定が最新なら設定を取りに行かない', async () => {
    (projectStore.isSettingsUpdatedAtCurrent as jest.Mock).mockResolvedValue(true);
    const settingsSpy = jest.spyOn(projectStore, 'downloadProjectSettings');
    const uploadSpy = jest
      .spyOn(projectStore, 'uploadDataHelper')
      .mockResolvedValue({ isOK: true, message: '', encryptedAt: 11 });
    const { result } = renderWithStore(setup());
    await act(async () => {
      await result.current.uploadDataToRepository(project, 'PublicAndPrivate');
    });
    expect(settingsSpy).not.toHaveBeenCalled();
    expect(uploadedLayerIds(uploadSpy)).toEqual(['a', 'b']);
  });
});

describe('L11: 前回同期したのにクラウドから消えているデータは、上げ直す前に確かめる', () => {
  const layerA = { id: 'a', name: 'A', permission: 'PRIVATE', field: [] } as any;
  const layerB = { id: 'b', name: 'B', permission: 'PRIVATE', field: [] } as any;
  const setup = (dataSync: any = { proj1: { a_PRIVATE: 50, b_PRIVATE: 60 } }) =>
    makeStore({
      layers: [layerA, layerB],
      dataSet: [
        { layerId: 'a', userId: 'test-user', data: [rec('x', 'test-user')] },
        { layerId: 'b', userId: 'test-user', data: [rec('y', 'test-user')] },
      ],
      dataSync,
    });

  beforeEach(() => {
    jest.spyOn(projectStore, 'isSettingsUpdatedAtCurrent').mockResolvedValue(true);
    // a は消えている、b は前回のまま
    jest
      .spyOn(projectStore, 'getMyDataUpdatedAt')
      .mockResolvedValue({ isOK: true, message: '', data: new Map([['b_PRIVATE', 60]]) });
  });

  test('上げ直さないを選ぶと、そのレイヤは上げずに手元と基準値を残し、他のレイヤは上げる', async () => {
    const confirmSpy = jest.spyOn(AlertAsyncModule, 'ConfirmAsync').mockResolvedValue(false);
    const uploadSpy = jest
      .spyOn(projectStore, 'uploadDataHelper')
      .mockResolvedValue({ isOK: true, message: '', encryptedAt: 70 });
    const store = setup();
    const { result } = renderWithStore(store);
    let res: any;
    await act(async () => {
      res = await result.current.uploadDataToRepository(project, 'PublicAndPrivate');
    });
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toBe('hooks.message.confirmReuploadDeletedData');
    expect(uploadedLayerIds(uploadSpy)).toEqual(['b']);
    expect(res.warning).toContain('hooks.message.skippedDeletedLayers');
    const state = store.getState() as any;
    expect(state.dataSync.proj1).toEqual({ a_PRIVATE: 50, b_PRIVATE: 70 });
    expect(state.dataSet.find((d: any) => d.layerId === 'a').data.map((r: any) => r.id)).toEqual(['x']);
  });

  test('上げ直すを選ぶと、そのレイヤも上げる', async () => {
    jest.spyOn(AlertAsyncModule, 'ConfirmAsync').mockResolvedValue(true);
    const uploadSpy = jest
      .spyOn(projectStore, 'uploadDataHelper')
      .mockResolvedValue({ isOK: true, message: '', encryptedAt: 70 });
    const { result } = renderWithStore(setup());
    let res: any;
    await act(async () => {
      res = await result.current.uploadDataToRepository(project, 'PublicAndPrivate');
    });
    expect(uploadedLayerIds(uploadSpy)).toEqual(['a', 'b']);
    expect(res).toEqual({ isOK: true, message: '' });
  });

  test('基準値が無い（前回同期していない）なら確かめない', async () => {
    const confirmSpy = jest.spyOn(AlertAsyncModule, 'ConfirmAsync');
    const uploadSpy = jest
      .spyOn(projectStore, 'uploadDataHelper')
      .mockResolvedValue({ isOK: true, message: '', encryptedAt: 70 });
    jest.spyOn(projectStore, 'downloadPrivateData').mockResolvedValue({
      isOK: true,
      message: '',
      data: [{ layerId: 'b', userId: 'test-user', data: [rec('y', 'test-user')] }],
      unmarkedDekGroups: [],
      undecryptableGroups: [],
    });
    const { result } = renderWithStore(setup({}));
    await act(async () => {
      await result.current.uploadDataToRepository(project, 'PublicAndPrivate');
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(uploadedLayerIds(uploadSpy)).toEqual(['a', 'b']);
  });
});

describe('L4: データ取得で自分のクラウドデータも取り込む', () => {
  const pubLayer = { id: 'pub', name: 'PUB', permission: 'PUBLIC', field: [] } as any;
  const prvLayer = { id: 'prv', name: 'PRV', permission: 'PRIVATE', field: [] } as any;
  const idsOf = (store: any, layerId: string, userId: string) =>
    (store.getState().dataSet as any[])
      .find((d) => d.layerId === layerId && d.userId === userId)
      ?.data.map((r: any) => r.id);

  test('別端末で足した自分の記録を取り込み、手元にしか無い記録は残し、基準値を取得前の版にする', async () => {
    const markSpy = jest.spyOn(unsyncedChanges, 'markLayerUploaded').mockImplementation(() => undefined);
    const localOwnPub = { layerId: 'pub', userId: 'test-user', data: [rec('local', 'test-user', { uploaded: false })] };
    const localOwnPrv = { layerId: 'prv', userId: 'test-user', data: [rec('p1', 'test-user')] };
    const store = makeStore({ layers: [pubLayer, prvLayer], dataSet: [localOwnPub, localOwnPrv] });
    const { result } = renderWithStore(store);
    await act(async () => {
      await result.current.createMergedDataSet({
        privateData: [localOwnPrv],
        publicData: [{ layerId: 'pub', userId: 'other', data: [rec('o1', 'other')] }, localOwnPub],
        templateData: [],
        ownCloud: {
          projectId: 'proj1',
          fetchedAt: 500,
          versions: new Map([
            ['pub_PUBLIC', 111],
            ['prv_PRIVATE', 222],
          ]),
          privateData: [
            { layerId: 'prv', userId: 'test-user', data: [rec('p1', 'test-user'), rec('p2', 'test-user')] },
          ],
          publicData: [{ layerId: 'pub', userId: 'test-user', data: [rec('fromOtherDevice', 'test-user')] }],
        },
      });
    });
    expect(idsOf(store, 'pub', 'test-user')).toEqual(['local', 'fromOtherDevice']);
    expect(idsOf(store, 'pub', 'other')).toEqual(['o1']);
    expect(idsOf(store, 'prv', 'test-user')).toEqual(['p1', 'p2']);
    expect((store.getState() as any).dataSync.proj1).toEqual({ pub_PUBLIC: 111, prv_PRIVATE: 222 });
    // 手元がクラウドと同じになった prv だけ、Web版でアップロード済みとして記録する（pub には未アップロードの記録がある）
    expect(markSpy.mock.calls).toEqual([['proj1', 'prv', 500]]);
  });

  test('基準値と版が同じレイヤは手元のまま（取り込み済み・未アップロードの変更を残す）', async () => {
    const localOwn = { layerId: 'prv', userId: 'test-user', data: [rec('p1', 'test-user', { updatedAt: 900 })] };
    const store = makeStore({ layers: [prvLayer], dataSet: [localOwn], dataSync: { proj1: { prv_PRIVATE: 222 } } });
    const { result } = renderWithStore(store);
    await act(async () => {
      await result.current.createMergedDataSet({
        privateData: [localOwn],
        publicData: [],
        templateData: [],
        ownCloud: {
          projectId: 'proj1',
          fetchedAt: 500,
          versions: new Map([['prv_PRIVATE', 222]]),
          privateData: [
            { layerId: 'prv', userId: 'test-user', data: [rec('p1', 'test-user'), rec('p2', 'test-user')] },
          ],
          publicData: [],
        },
      });
    });
    expect(idsOf(store, 'prv', 'test-user')).toEqual(['p1']);
    expect((store.getState() as any).dataSet[0].data[0].updatedAt).toBe(900);
  });

  test('クラウドに自分のデータが無い・読めないレイヤは手元のまま（消さない）', async () => {
    const localPub = { layerId: 'pub', userId: 'test-user', data: [rec('m1', 'test-user')] };
    const localPrv = { layerId: 'prv', userId: 'test-user', data: [rec('m2', 'test-user')] };
    const store = makeStore({
      layers: [pubLayer, prvLayer],
      dataSet: [localPub, localPrv],
      dataSync: { proj1: { pub_PUBLIC: 1 } },
    });
    const { result } = renderWithStore(store);
    await act(async () => {
      await result.current.createMergedDataSet({
        privateData: [localPrv],
        publicData: [localPub],
        templateData: [],
        undecryptableGroups: [{ layerId: 'prv', userId: 'test-user', permission: 'PRIVATE' }],
        ownCloud: {
          projectId: 'proj1',
          fetchedAt: 500,
          // pub はクラウドに無い（前回同期したのに消えた → アップロードのときに確かめる）、prv は復号できなかった
          versions: new Map([['prv_PRIVATE', 222]]),
          privateData: [],
          publicData: [],
        },
      });
    });
    expect(idsOf(store, 'pub', 'test-user')).toEqual(['m1']);
    expect(idsOf(store, 'prv', 'test-user')).toEqual(['m2']);
    expect((store.getState() as any).dataSync.proj1).toEqual({ pub_PUBLIC: 1 });
  });
});

describe('M8: 他人の PRIVATE を取得しない管理者の取得でも、引き継ぎで打ち消された記録を残さない', () => {
  const pubLayer = { id: 'pub', name: 'PUB', permission: 'PUBLIC', field: [] } as any;
  const bucketOf = (store: any, userId: string) =>
    (store.getState().dataSet as any[]).find((d) => d.layerId === 'pub' && d.userId === userId)?.data ?? [];

  test('メンバーの記録がすべて別の管理者に引き継がれて消されたら、手元のメンバーの古い版を外す', async () => {
    const stale = rec('r', 'member', { updatedAt: 100 });
    const store = makeStore({
      layers: [pubLayer],
      dataSet: [
        { layerId: 'pub', userId: 'member', data: [stale] },
        { layerId: 'pub', userId: 'test-user', data: [] },
      ],
    });
    const { result } = renderWithStore(store);
    await act(async () => {
      await result.current.createMergedDataSet({
        privateData: [],
        publicData: [
          // メンバーのクラウドの doc には古い版が残り、別の管理者の doc に墓標がある
          { layerId: 'pub', userId: 'member', data: [stale] },
          { layerId: 'pub', userId: 'admin1', data: [rec('r', 'admin1', { updatedAt: 200, deleted: true, takenOverFrom: ['member'] })] },
          { layerId: 'pub', userId: 'test-user', data: [] },
        ],
        templateData: [],
        fetchedScope: { permissions: ['PUBLIC'], template: true, pruneOthers: false },
      });
    });
    expect(bucketOf(store, 'member')).toEqual([]);
    expect(bucketOf(store, 'admin1')[0]).toMatchObject({ id: 'r', deleted: true });
  });

  test('引き継ぎに関係しない他人の記録（PRIVATE から変えた直後の写しなど）は消さない', async () => {
    const kept = rec('k', 'member');
    const store = makeStore({
      layers: [pubLayer],
      dataSet: [{ layerId: 'pub', userId: 'member', data: [kept] }],
    });
    const { result } = renderWithStore(store);
    await act(async () => {
      await result.current.createMergedDataSet({
        privateData: [],
        publicData: [{ layerId: 'pub', userId: 'test-user', data: [rec('mine', 'test-user')] }],
        templateData: [],
        fetchedScope: { permissions: ['PUBLIC'], template: true, pruneOthers: false },
      });
    });
    expect(bucketOf(store, 'member')).toEqual([kept]);
  });
});
