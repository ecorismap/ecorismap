import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { useProjectBackup } from '../useProjectBackup';
import dataSetReducer from '../../modules/dataSet';
import layersReducer from '../../modules/layers';
import tileMapsReducer from '../../modules/tileMaps';
import settingsReducer, { editSettingsAction, settingsInitialState } from '../../modules/settings';
import userReducer from '../../modules/user';
import projectsReducer from '../../modules/projects';
import dataSyncReducer from '../../modules/dataSync';
import { BackupMetaType, BackupSnapshotType } from '../../utils/projectBackup';

const mockSaveProjectBackup = jest.fn();
const mockLoadBackup = jest.fn();
const mockListBackups = jest.fn<BackupMetaType[], []>(() => []);
const mockGetAuthUid = jest.fn<string | undefined, []>(() => undefined);

jest.mock('../../utils/projectBackup', () => ({
  isBackupAvailable: true,
  saveProjectBackupWithResult: (state: unknown, trigger: unknown) => mockSaveProjectBackup(state, trigger) ?? 'saved',
  loadBackup: (id: string) => mockLoadBackup(id),
  listBackups: () => mockListBackups(),
  deleteBackup: jest.fn(),
}));

const mockConfirmProceed = jest.fn<Promise<boolean>, [string]>(() => Promise.resolve(true));
jest.mock('../../utils/backupBeforeReplace', () => ({
  ...jest.requireActual('../../utils/backupBeforeReplace'),
  confirmProceedWithoutBackup: (result: string) => mockConfirmProceed(result),
}));
jest.mock('../../components/molecules/AlertAsync', () => ({
  ConfirmAsync: jest.fn(),
  waitForModalTransition: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../lib/firebase/sign-in', () => ({
  getAuthUid: () => mockGetAuthUid(),
}));

const mockFlushPersistence = jest.fn(() => Promise.resolve());
jest.mock('../../utils/persistFlush', () => ({
  flushPersistence: () => mockFlushPersistence(),
}));

//写真uriの付け替えは復元したdataSetに対して走る必要があるので、呼ばれた時点のstateを控える
const mockRebaseSeenDataSet: unknown[] = [];
jest.mock('../../utils/photoUriRebase', () => ({
  runPhotoUriRebase: (store: { getState: () => { dataSet: unknown } }) => {
    mockRebaseSeenDataSet.push(store.getState().dataSet);
  },
}));

const createTestStore = () =>
  configureStore({
    reducer: {
      dataSet: dataSetReducer,
      layers: layersReducer,
      tileMaps: tileMapsReducer,
      settings: settingsReducer,
      user: userReducer,
      projects: projectsReducer,
      dataSync: dataSyncReducer,
    },
  });

const createWrapper =
  (store: ReturnType<typeof createTestStore>) =>
  ({ children }: { children: React.ReactNode }) =>
    <Provider store={store}>{children}</Provider>;

const createSnapshot = (): BackupSnapshotType =>
  ({
    version: 1,
    createdAt: 1700000000000,
    trigger: 'projectClose',
    state: {
      settings: {
        ...settingsInitialState,
        projectId: 'p1',
        projectName: 'テストプロジェクト',
        projectRegion: { latitude: 40, longitude: 140, latitudeDelta: 0.01, longitudeDelta: 0.01, zoom: 15 },
      },
      layers: [{ id: 'layer1', name: 'restored' }],
      tileMaps: [],
      dataSet: [{ layerId: 'layer1', userId: 'u1', data: [{ id: 'r1', field: {} }] }],
      user: { uid: 'u1', email: 'a@b.c', displayName: 'user', photoURL: null },
      projects: [{ id: 'p1', name: 'テストプロジェクト' }],
      dataSync: { p1: { layer1_PRIVATE: 123 } },
    },
  } as unknown as BackupSnapshotType);

describe('useProjectBackup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    //mockReturnValueはclearAllMocksで消えないため毎回デフォルトに戻す
    mockListBackups.mockReturnValue([]);
    mockGetAuthUid.mockReturnValue(undefined);
  });

  test('restoreBackupで各sliceが復元されregionが返る', async () => {
    const store = createTestStore();
    const snapshot = createSnapshot();
    mockLoadBackup.mockReturnValue(snapshot);

    const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });

    let restoreResult: { isOK: boolean; region?: unknown } = { isOK: false };
    await act(async () => {
      restoreResult = await result.current.restoreBackup('backup-id');
    });

    expect(restoreResult.isOK).toBe(true);
    expect(restoreResult.region).toEqual(snapshot.state.settings.projectRegion);

    const state = store.getState();
    expect(state.settings.projectId).toBe('p1');
    expect(state.settings.projectName).toBe('テストプロジェクト');
    expect(state.dataSet).toEqual(snapshot.state.dataSet);
    expect(state.layers).toEqual(snapshot.state.layers);
    expect(state.user.uid).toBe('u1');
    expect(state.projects).toEqual(snapshot.state.projects);
    expect(state.dataSync).toEqual(snapshot.state.dataSync);
  });

  test('復元後に写真uriの付け替えを復元したdataSetに対して走らせる（写真監査 P-L10）', async () => {
    mockRebaseSeenDataSet.length = 0;
    const store = createTestStore();
    const snapshot = createSnapshot();
    mockLoadBackup.mockReturnValue(snapshot);

    const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
    await act(async () => {
      await result.current.restoreBackup('backup-id');
    });

    expect(mockRebaseSeenDataSet).toEqual([snapshot.state.dataSet]);
  });

  test('復元しないときは写真uriの付け替えも走らせない', async () => {
    mockRebaseSeenDataSet.length = 0;
    const store = createTestStore();
    mockLoadBackup.mockReturnValue(undefined);

    const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
    await act(async () => {
      await result.current.restoreBackup('missing-id');
    });

    expect(mockRebaseSeenDataSet).toEqual([]);
  });

  test('保存先フォルダの外を指すIDの地図は復元しない', async () => {
    const store = createTestStore();
    const snapshot = createSnapshot();
    const tileMap = { name: 'map', url: 'https://example.com/{z}/{x}/{y}.png', maptype: 'none', visible: true };
    snapshot.state.tileMaps = [
      { ...tileMap, id: 'safe1' },
      { ...tileMap, id: '../SQLite' },
      { ...tileMap, id: '../projects?' },
    ] as unknown as BackupSnapshotType['state']['tileMaps'];
    mockLoadBackup.mockReturnValue(snapshot);

    const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
    await act(async () => {
      await result.current.restoreBackup('backup-id');
    });

    expect(store.getState().tileMaps.map((m) => m.id)).toEqual(['safe1']);
  });

  test('復元前に現在の状態をbeforeRestoreトリガーでバックアップする', async () => {
    const store = createTestStore();
    mockLoadBackup.mockReturnValue(createSnapshot());

    const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
    await act(async () => {
      await result.current.restoreBackup('backup-id');
    });

    expect(mockSaveProjectBackup).toHaveBeenCalledTimes(1);
    expect(mockSaveProjectBackup.mock.calls[0][1]).toBe('beforeRestore');
  });

  test('スナップショットが読めない場合はisOK falseで状態は変更されない', async () => {
    const store = createTestStore();
    mockLoadBackup.mockReturnValue(undefined);
    const before = store.getState();

    const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
    let restoreResult: { isOK: boolean } = { isOK: true };
    await act(async () => {
      restoreResult = await result.current.restoreBackup('missing-id');
    });

    expect(restoreResult.isOK).toBe(false);
    expect(mockSaveProjectBackup).not.toHaveBeenCalled();
    expect(store.getState()).toEqual(before);
  });

  test('別ユーザーのログイン中はdifferentUserで復元をブロックし状態を変更しない', async () => {
    const store = createTestStore();
    mockLoadBackup.mockReturnValue(createSnapshot()); //スナップショットのuidは'u1'
    mockGetAuthUid.mockReturnValue('u2');
    const before = store.getState();

    const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
    let restoreResult: { isOK: boolean; reason?: string } = { isOK: true };
    await act(async () => {
      restoreResult = await result.current.restoreBackup('backup-id');
    });

    expect(restoreResult.isOK).toBe(false);
    expect(restoreResult.reason).toBe('differentUser');
    expect(mockSaveProjectBackup).not.toHaveBeenCalled();
    expect(store.getState()).toEqual(before);
  });

  test('同一ユーザーのログイン中は復元できる', async () => {
    const store = createTestStore();
    mockLoadBackup.mockReturnValue(createSnapshot());
    mockGetAuthUid.mockReturnValue('u1');

    const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
    let restoreResult: { isOK: boolean } = { isOK: false };
    await act(async () => {
      restoreResult = await result.current.restoreBackup('backup-id');
    });

    expect(restoreResult.isOK).toBe(true);
    expect(store.getState().user.uid).toBe('u1');
  });

  test('認証セッションなし（ログアウト後の救済）は他ユーザーのスナップショットも復元できる', async () => {
    const store = createTestStore();
    mockLoadBackup.mockReturnValue(createSnapshot());
    mockGetAuthUid.mockReturnValue(undefined);

    const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
    let restoreResult: { isOK: boolean } = { isOK: false };
    await act(async () => {
      restoreResult = await result.current.restoreBackup('backup-id');
    });

    expect(restoreResult.isOK).toBe(true);
  });

  describe('canRestoreBackup（記録を止める前の判定、軌跡監査 T-M8）', () => {
    test('別ユーザーのスナップショットは differentUser を返し、状態もバックアップも変えない', () => {
      const store = createTestStore();
      mockLoadBackup.mockReturnValue(createSnapshot());
      mockGetAuthUid.mockReturnValue('u2');
      const before = store.getState();

      const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
      expect(result.current.canRestoreBackup('backup-id')).toEqual({ isOK: false, reason: 'differentUser' });
      expect(mockSaveProjectBackup).not.toHaveBeenCalled();
      expect(store.getState()).toEqual(before);
    });

    test('読めないスナップショットは isOK false を返し、一覧を読み直す', () => {
      const store = createTestStore();
      mockLoadBackup.mockReturnValue(undefined);

      const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
      const listCalls = mockListBackups.mock.calls.length;
      let check: { isOK: boolean; reason?: string } = { isOK: true };
      act(() => {
        check = result.current.canRestoreBackup('missing-id');
      });
      expect(check).toEqual({ isOK: false });
      expect(mockListBackups.mock.calls.length).toBe(listCalls + 1);
      expect(mockSaveProjectBackup).not.toHaveBeenCalled();
    });

    test('同じユーザー・未ログインなら isOK true を返すが、状態は変えない', () => {
      const store = createTestStore();
      mockLoadBackup.mockReturnValue(createSnapshot());
      const before = store.getState();
      const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });

      mockGetAuthUid.mockReturnValue('u1');
      expect(result.current.canRestoreBackup('backup-id')).toEqual({ isOK: true });
      mockGetAuthUid.mockReturnValue(undefined);
      expect(result.current.canRestoreBackup('backup-id')).toEqual({ isOK: true });
      expect(mockSaveProjectBackup).not.toHaveBeenCalled();
      expect(store.getState()).toEqual(before);
    });
  });

  test('ログイン中の一覧は自分と未ログイン時のバックアップのみ表示する', () => {
    const store = createTestStore();
    const metas = [
      { id: 'b1', createdAt: 1, trigger: 'projectClose', recordCount: 1, uid: 'u1' },
      { id: 'b2', createdAt: 2, trigger: 'projectClose', recordCount: 1, uid: 'u2' },
      { id: 'b3', createdAt: 3, trigger: 'projectClose', recordCount: 1, uid: null },
    ] as BackupMetaType[];
    mockListBackups.mockReturnValue(metas);
    mockGetAuthUid.mockReturnValue('u1');

    const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
    expect(result.current.backupList.map((m) => m.id)).toEqual(['b1', 'b3']);
  });

  test('未ログイン時の一覧は全てのバックアップを表示する', () => {
    const store = createTestStore();
    const metas = [
      { id: 'b1', createdAt: 1, trigger: 'projectClose', recordCount: 1, uid: 'u1' },
      { id: 'b2', createdAt: 2, trigger: 'projectClose', recordCount: 1, uid: 'u2' },
    ] as BackupMetaType[];
    mockListBackups.mockReturnValue(metas);
    mockGetAuthUid.mockReturnValue(undefined);

    const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
    expect(result.current.backupList.map((m) => m.id)).toEqual(['b1', 'b2']);
  });

  test('プロジェクトなしのバックアップはmapRegionを返す', async () => {
    const store = createTestStore();
    const snapshot = createSnapshot();
    snapshot.state.settings = {
      ...snapshot.state.settings,
      projectId: undefined,
      projectName: undefined,
      mapRegion: { latitude: 1, longitude: 2, latitudeDelta: 0.01, longitudeDelta: 0.01, zoom: 10 },
    };
    mockLoadBackup.mockReturnValue(snapshot);

    const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
    let restoreResult: { isOK: boolean; region?: unknown } = { isOK: false };
    await act(async () => {
      restoreResult = await result.current.restoreBackup('backup-id');
    });
    expect(restoreResult.region).toEqual(snapshot.state.settings.mapRegion);
  });
  test('ログイン中に未ログイン時のスナップショットを復元しても、今のユーザーとプロジェクト一覧は残す（設定監査 S-L1）', async () => {
    const store = createTestStore();
    act(() => {
      store.dispatch({
        type: 'user/setUserAction',
        payload: { uid: 'me', email: 'me@x.y', displayName: 'me', photoURL: null },
      });
      store.dispatch({ type: 'projects/setProjectsAction', payload: [{ id: 'mine', name: 'mine' }] });
    });
    const snapshot = createSnapshot();
    snapshot.state.user = { ...snapshot.state.user, uid: undefined };
    snapshot.state.projects = [];
    mockLoadBackup.mockReturnValue(snapshot);
    mockGetAuthUid.mockReturnValue('me');

    const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
    await act(async () => {
      await result.current.restoreBackup('backup-id');
    });

    const state = store.getState();
    expect(state.user.uid).toBe('me');
    expect(state.projects).toEqual([{ id: 'mine', name: 'mine' }]);
    // ほかのスライスは戻す
    expect(state.dataSet).toEqual(snapshot.state.dataSet);
    expect(state.layers).toEqual(snapshot.state.layers);
  });

  test('未ログインのまま未ログイン時のスナップショットを復元すると、ユーザーとプロジェクト一覧も戻す', async () => {
    const store = createTestStore();
    // 復元前とスナップショットで値を変えておかないと、戻さない退行でも通ってしまう
    act(() => {
      store.dispatch({
        type: 'user/setUserAction',
        payload: { uid: undefined, email: null, displayName: 'before', photoURL: null },
      });
      store.dispatch({ type: 'projects/setProjectsAction', payload: [{ id: 'old', name: 'old' }] });
    });
    const snapshot = createSnapshot();
    snapshot.state.user = { ...snapshot.state.user, uid: undefined, displayName: 'snap' };
    snapshot.state.projects = [{ id: 'snap', name: 'snap' }] as unknown as BackupSnapshotType['state']['projects'];
    mockLoadBackup.mockReturnValue(snapshot);

    const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
    await act(async () => {
      await result.current.restoreBackup('backup-id');
    });
    expect(store.getState().user.uid).toBeUndefined();
    expect(store.getState().user.displayName).toBe('snap');
    expect(store.getState().projects).toEqual([{ id: 'snap', name: 'snap' }]);
  });

  test('復元の直後に永続化の書き込み待ちを書き出す（設定監査 S-L3）', async () => {
    const store = createTestStore();
    mockLoadBackup.mockReturnValue(createSnapshot());
    const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
    await act(async () => {
      await result.current.restoreBackup('backup-id');
    });
    expect(mockFlushPersistence).toHaveBeenCalledTimes(1);
  });

  describe('復元で端末ローカルの設定を巻き戻さない（永続化監査 S-M1）', () => {
    const gnss = {
      baudRate: 115200,
      antennaHeight: 1.8,
      ntrip: { enabled: true, host: 'h', port: 2101, mountpoint: 'm', username: 'u', password: 'p', sendGga: true },
    };
    const createSnapshotWithSettings = () => {
      const snapshot = createSnapshot();
      snapshot.state.settings = {
        ...snapshot.state.settings,
        isSynced: true,
        memberLocation: [{ uid: 'other', coords: { latitude: 1, longitude: 1 } }],
        tileRegions: [{ id: 'old', tileMapId: 'm-old', coords: [], centroid: { latitude: 0, longitude: 0 } }],
        agreedTermsVersion: 'old-terms',
        lastSeenVersion: '0.1.0',
        gpsAccuracy: 'LOW',
        externalGnss: undefined,
        proximityAlert: { enabled: false, targetLayerIds: ['layer1'], distanceThreshold: 50 },
      } as unknown as typeof snapshot.state.settings;
      return snapshot;
    };

    test('位置共有は切り、保存範囲・既読・同意・GNSS・GPS精度・接近通知は今の値を引き継ぐ', async () => {
      const store = createTestStore();
      store.dispatch(
        editSettingsAction({
          tileRegions: [],
          agreedTermsVersion: 'current-terms',
          lastSeenVersion: '0.7.0',
          gpsAccuracy: 'HIGH',
          externalGnss: gnss as unknown as typeof settingsInitialState.externalGnss,
          proximityAlert: { enabled: true, targetLayerIds: ['now-layer'], distanceThreshold: 20 },
        })
      );
      mockLoadBackup.mockReturnValue(createSnapshotWithSettings());
      const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
      await act(async () => {
        await result.current.restoreBackup('backup-id');
      });
      const settings = store.getState().settings;
      //データ側（プロジェクト）はスナップショットから戻る
      expect(settings.projectId).toBe('p1');
      expect(settings.isSynced).toBe(false);
      expect(settings.memberLocation).toEqual([]);
      expect(settings.tileRegions).toEqual([]);
      expect(settings.agreedTermsVersion).toBe('current-terms');
      expect(settings.lastSeenVersion).toBe('0.7.0');
      expect(settings.gpsAccuracy).toBe('HIGH');
      expect(settings.externalGnss?.antennaHeight).toBe(1.8);
      //接近通知の有効・距離は今の値、対象レイヤは復元したレイヤを指すスナップショット側
      expect(settings.proximityAlert).toEqual({ enabled: true, targetLayerIds: ['layer1'], distanceThreshold: 20 });
    });
  });

  describe('復元前の自動バックアップを作れなかったとき（永続化監査 S-M5・S-L2）', () => {
    test('続けるのを取りやめたら cancelled を返し、何も置き換えない', async () => {
      const store = createTestStore();
      mockLoadBackup.mockReturnValue(createSnapshot());
      mockSaveProjectBackup.mockReturnValueOnce('failed');
      mockConfirmProceed.mockResolvedValueOnce(false);
      const before = store.getState();
      const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
      let restoreResult: { isOK: boolean; reason?: string } = { isOK: true };
      await act(async () => {
        restoreResult = await result.current.restoreBackup('backup-id');
      });
      expect(mockConfirmProceed).toHaveBeenCalledWith('failed');
      expect(restoreResult).toEqual({ isOK: false, reason: 'cancelled' });
      expect(store.getState()).toEqual(before);
      expect(mockFlushPersistence).not.toHaveBeenCalled();
    });

    test('続けると選んだら復元する', async () => {
      const store = createTestStore();
      mockLoadBackup.mockReturnValue(createSnapshot());
      mockSaveProjectBackup.mockReturnValueOnce('failed');
      mockConfirmProceed.mockResolvedValueOnce(true);
      const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
      let restoreResult: { isOK: boolean } = { isOK: false };
      await act(async () => {
        restoreResult = await result.current.restoreBackup('backup-id');
      });
      expect(restoreResult.isOK).toBe(true);
      expect(store.getState().settings.projectId).toBe('p1');
    });
  });
});
