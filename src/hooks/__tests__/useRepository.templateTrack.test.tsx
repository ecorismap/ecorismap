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
 * 軌跡監査 T-M9: 設定の保存で軌跡をテンプレートとして配らない
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

describe('T-M9: 設定の保存（Template）で軌跡レイヤを配らない', () => {
  const trackLayer = { id: 'track', name: 'Track', permission: 'PRIVATE', field: [] } as any;
  const pointLayer = { id: 'p', name: 'P', permission: 'PRIVATE', field: [] } as any;
  const publicLayer = { id: 'q', name: 'Q', permission: 'PUBLIC', field: [] } as any;
  const setup = () =>
    makeStore({
      layers: [trackLayer, pointLayer, publicLayer],
      dataSet: [
        { layerId: 'track', userId: 'test-user', data: [rec('t1', 'test-user')] },
        { layerId: 'track', userId: 'template', data: [rec('t0', 'template')] },
        { layerId: 'p', userId: 'test-user', data: [rec('x', 'test-user')] },
        { layerId: 'q', userId: 'template', data: [rec('y', 'template')] },
      ],
    });

  test('Template のアップロードは軌跡以外のレイヤだけを TEMPLATE として送る', async () => {
    const uploadSpy = jest
      .spyOn(projectStore, 'uploadDataHelper')
      .mockResolvedValue({ isOK: true, message: '', encryptedAt: 11 });
    const { result } = renderWithStore(setup());
    let res: any;
    await act(async () => {
      res = await result.current.uploadDataToRepository(project, 'Template');
    });
    expect(res.isOK).toBe(true);
    expect(uploadedLayerIds(uploadSpy)).toEqual(['p', 'q']);
    uploadSpy.mock.calls.forEach((c) => expect((c[1] as any).permission).toBe('TEMPLATE'));
  });

  test('テンプレートの削除には軌跡を残し、既に配った軌跡テンプレートを消す', async () => {
    const deleteSpy = jest.spyOn(projectStore, 'deleteData').mockResolvedValue(undefined as any);
    const { result } = renderWithStore(setup());
    await act(async () => {
      await result.current.deleteCommonAndTemplateData(project);
    });
    expect(deleteSpy.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ['track', 'TEMPLATE'],
      ['p', 'TEMPLATE'],
      ['q', 'TEMPLATE'],
    ]);
  });

  test('通常のアップロード（PublicAndPrivate）では軌跡も従来どおり送る', async () => {
    jest.spyOn(projectStore, 'isSettingsUpdatedAtCurrent').mockResolvedValue(true);
    jest.spyOn(projectStore, 'getMyDataUpdatedAt').mockResolvedValue({ isOK: true, message: '', data: new Map() });
    const uploadSpy = jest
      .spyOn(projectStore, 'uploadDataHelper')
      .mockResolvedValue({ isOK: true, message: '', encryptedAt: 11 });
    const { result } = renderWithStore(setup());
    await act(async () => {
      await result.current.uploadDataToRepository(project, 'PublicAndPrivate');
    });
    expect(uploadedLayerIds(uploadSpy)).toContain('track');
  });
});
