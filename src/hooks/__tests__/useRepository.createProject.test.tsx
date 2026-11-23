/**
 * A-M3（ACCOUNT_AUDIT_2026-11）: 新規作成で既定の設定のアップロードに失敗したら、作ったプロジェクトを消して一覧にも載せない。
 * settings/default が無いプロジェクトは開くことも設定することもできず、同じ id でのやり直しは Rules に拒否される。
 */
jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  getAuth: jest.fn(() => ({ currentUser: { uid: 'test-user' } })),
  default: {},
}));
jest.mock('@react-native-firebase/app', () => ({ __esModule: true, getApp: jest.fn().mockReturnValue({}) }));
jest.mock('@react-native-firebase/functions', () => ({ __esModule: true, getFunctions: jest.fn().mockReturnValue({}) }));
jest.mock('@react-native-firebase/app-check', () => ({
  __esModule: true,
  default: jest.fn(),
  initializeAppCheck: jest.fn(),
  getToken: jest.fn(),
  getAppCheck: jest.fn().mockReturnValue({ activate: jest.fn(), setTokenAutoRefreshEnabled: jest.fn() }),
  ReactNativeFirebaseAppCheckProvider: jest.fn(() => ({ configure: jest.fn() })),
}));
jest.mock('@react-native-firebase/firestore', () => ({ __esModule: true, getFirestore: jest.fn().mockReturnValue({}) }));
jest.mock('@react-native-firebase/storage', () => ({ __esModule: true, getStorage: jest.fn().mockReturnValue({}) }));
jest.mock('i18next', () => ({
  __esModule: true,
  default: { use: jest.fn().mockReturnThis(), init: jest.fn().mockReturnThis(), language: 'ja' },
}));
jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
jest.mock('../../modules/tileMaps', () => ({
  createTileMapsInitialState: jest.fn(() => []),
  tileMapsInitialState: [],
  setTileMapsAction: jest.fn((payload: unknown) => ({ type: 'tileMaps/setTileMapsAction', payload })),
}));
jest.mock('../../utils/SQLite', () => ({
  exportDatabase: jest.fn(async () => 'file:///tmp/dict.sqlite'),
  hasDictionaryTables: jest.fn(async () => true),
  importDictionary: jest.fn(async () => undefined),
}));
jest.mock('../../utils/projectBackup', () => ({ saveProjectBackup: jest.fn() }));
jest.mock('../../utils/tileSourceCleanup', () => ({ discardStaleTileSources: jest.fn() }));

import React from 'react';
import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useRepository } from '../useRepository';
import * as projectStore from '../../lib/firebase/firestore';
import type { ProjectType } from '../../types';

const project = { id: 'proj-new', name: 'New', ownerUid: 'test-user', members: [] } as unknown as ProjectType;

const makeStore = () => {
  const initialState = {
    user: { uid: 'test-user', email: 'a@b.c', displayName: 'U' },
    dataSet: [],
    layers: [],
    settings: { isSettingProject: false, updatedAt: '2026-11-23T00:00:00.000Z', mapRegion: {}, mapType: 'none', plugins: {} },
    tileMaps: [],
    dataSync: {},
    projects: [],
  };
  const store = configureStore({
    reducer: {
      user: (state = initialState.user) => state,
      dataSet: (state = initialState.dataSet) => state,
      layers: (state = initialState.layers) => state,
      settings: (state = initialState.settings) => state,
      tileMaps: (state = initialState.tileMaps) => state,
      dataSync: (state = initialState.dataSync) => state,
      projects: (state = initialState.projects) => state,
    } as never,
    preloadedState: initialState as never,
  });
  store.dispatch = jest.fn() as never;
  return store;
};

const dispatchedTypes = (store: ReturnType<typeof makeStore>) =>
  (store.dispatch as unknown as jest.Mock).mock.calls.map(([action]) => action.type);

const renderWithStore = (store: ReturnType<typeof makeStore>) =>
  renderHook(() => useRepository(), {
    wrapper: (props: { children: React.ReactNode }) => <Provider store={store}>{props.children}</Provider>,
  });

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(projectStore, 'addProject').mockResolvedValue({ isOK: true, message: '' });
  jest.spyOn(projectStore, 'discardCreatedProject').mockResolvedValue(undefined);
});

describe('createProject', () => {
  it('設定のアップロードに成功したら一覧へ追加し、消さない', async () => {
    jest
      .spyOn(projectStore, 'uploadProjectSettings')
      .mockResolvedValue({ isOK: true, message: '', timestamp: new Date() });
    const store = makeStore();
    const { result } = renderWithStore(store);
    let res: { isOK: boolean; message: string } | undefined;
    await act(async () => {
      res = await result.current.createProject(project);
    });
    expect(res).toEqual({ isOK: true, message: '' });
    expect(dispatchedTypes(store)).toContain('projects/addProjectAction');
    expect(projectStore.discardCreatedProject).not.toHaveBeenCalled();
  });

  it('設定のアップロードに失敗したら作ったプロジェクトを消し、一覧に載せない', async () => {
    jest
      .spyOn(projectStore, 'uploadProjectSettings')
      .mockResolvedValue({ isOK: false, message: 'firebase.message.failUploadProjectSettings', timestamp: undefined });
    const store = makeStore();
    const { result } = renderWithStore(store);
    let res: { isOK: boolean; message: string } | undefined;
    await act(async () => {
      res = await result.current.createProject(project);
    });
    expect(res).toEqual({ isOK: false, message: 'firebase.message.failUploadProjectSettings' });
    expect(projectStore.discardCreatedProject).toHaveBeenCalledWith('proj-new');
    expect(dispatchedTypes(store)).not.toContain('projects/addProjectAction');
  });

  it('作成自体に失敗したら設定を上げない', async () => {
    (projectStore.addProject as jest.Mock).mockResolvedValue({ isOK: false, message: 'firebase.message.failAddProject' });
    const upload = jest.spyOn(projectStore, 'uploadProjectSettings');
    const store = makeStore();
    const { result } = renderWithStore(store);
    let res: { isOK: boolean; message: string } | undefined;
    await act(async () => {
      res = await result.current.createProject(project);
    });
    expect(res).toEqual({ isOK: false, message: 'firebase.message.failAddProject' });
    expect(upload).not.toHaveBeenCalled();
    expect(dispatchedTypes(store)).not.toContain('projects/addProjectAction');
  });
});
