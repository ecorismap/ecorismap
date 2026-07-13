import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { useProjectBackup } from '../useProjectBackup';
import dataSetReducer from '../../modules/dataSet';
import layersReducer from '../../modules/layers';
import tileMapsReducer from '../../modules/tileMaps';
import settingsReducer, { settingsInitialState } from '../../modules/settings';
import userReducer from '../../modules/user';
import projectsReducer from '../../modules/projects';
import dataSyncReducer from '../../modules/dataSync';
import { BackupSnapshotType } from '../../utils/projectBackup';

const mockSaveProjectBackup = jest.fn();
const mockLoadBackup = jest.fn();
const mockListBackups = jest.fn(() => []);

jest.mock('../../utils/projectBackup', () => ({
  isBackupAvailable: true,
  saveProjectBackup: (state: unknown, trigger: unknown) => mockSaveProjectBackup(state, trigger),
  loadBackup: (id: string) => mockLoadBackup(id),
  listBackups: () => mockListBackups(),
  deleteBackup: jest.fn(),
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
  });

  test('restoreBackupで各sliceが復元されregionが返る', () => {
    const store = createTestStore();
    const snapshot = createSnapshot();
    mockLoadBackup.mockReturnValue(snapshot);

    const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });

    let restoreResult: { isOK: boolean; region?: unknown } = { isOK: false };
    act(() => {
      restoreResult = result.current.restoreBackup('backup-id');
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

  test('復元前に現在の状態をbeforeRestoreトリガーでバックアップする', () => {
    const store = createTestStore();
    mockLoadBackup.mockReturnValue(createSnapshot());

    const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
    act(() => {
      result.current.restoreBackup('backup-id');
    });

    expect(mockSaveProjectBackup).toHaveBeenCalledTimes(1);
    expect(mockSaveProjectBackup.mock.calls[0][1]).toBe('beforeRestore');
  });

  test('スナップショットが読めない場合はisOK falseで状態は変更されない', () => {
    const store = createTestStore();
    mockLoadBackup.mockReturnValue(undefined);
    const before = store.getState();

    const { result } = renderHook(() => useProjectBackup(), { wrapper: createWrapper(store) });
    let restoreResult: { isOK: boolean } = { isOK: true };
    act(() => {
      restoreResult = result.current.restoreBackup('missing-id');
    });

    expect(restoreResult.isOK).toBe(false);
    expect(mockSaveProjectBackup).not.toHaveBeenCalled();
    expect(store.getState()).toEqual(before);
  });

  test('プロジェクトなしのバックアップはmapRegionを返す', () => {
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
    act(() => {
      restoreResult = result.current.restoreBackup('backup-id');
    });
    expect(restoreResult.region).toEqual(snapshot.state.settings.mapRegion);
  });
});
