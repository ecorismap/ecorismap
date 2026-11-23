/**
 * タイル監査（docs/TILE_AUDIT_2026-11.md）の medium の回帰テスト（useRepository の地図まわり）。
 * - M-M4: 共有スタイルは地図ごとに取り込み、1つ目で抜けない。一時ファイルを残さない
 * - M-M17: Web で取り込んだ PMTiles（blob:）はスタイル付きでも共有設定に載せない
 * - M-M11: PDF の判定は url の拡張子でなく attribution 'PDF' も見る（複数ページのページ地図）
 * - M-M20: mapType は地図一覧の standard/hybrid の表示から導く
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
jest.mock('../../modules/tileMaps', () => {
  const visible = (id: string, v: boolean) => ({ id, visible: v });
  return {
    // 英語の初期一覧（標準地図を表示）を模す。以前は一覧に関係なく 'none' で作っていた
    tileMapsInitialState: [visible('hybrid', false), visible('standard', true)],
    setTileMapsAction: jest.fn((payload: unknown) => ({ type: 'tileMaps/setTileMapsAction', payload })),
  };
});
jest.mock('../../utils/SQLite', () => ({
  exportDatabase: jest.fn(async () => 'file:///tmp/dict.sqlite'),
  hasDictionaryTables: jest.fn(async () => false),
  importDictionary: jest.fn(async () => undefined),
}));
jest.mock('../../utils/projectBackup', () => ({ saveProjectBackup: jest.fn() }));
jest.mock('../../utils/tileSourceCleanup', () => ({ discardStaleTileSources: jest.fn() }));
jest.mock('../../utils/pmtilesLocalStore', () => ({ saveStyleToPmtilesDb: jest.fn(async () => undefined) }));
jest.mock('expo-file-system/legacy', () => ({
  makeDirectoryAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
  cacheDirectory: 'file:///cache/',
}));

import React from 'react';
import { Platform } from 'react-native';
import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useRepository } from '../useRepository';
import * as projectStore from '../../lib/firebase/firestore';
import * as projectStorage from '../../lib/firebase/storage';
import * as AlertAsyncModule from '../../components/molecules/AlertAsync';
import type { ProjectSettingsType, TileMapType } from '../../types';
import { saveStyleToPmtilesDb } from '../../utils/pmtilesLocalStore';

const FileSystem = jest.requireMock('expo-file-system/legacy') as { copyAsync: jest.Mock; deleteAsync: jest.Mock };

const project = { id: 'proj1' } as never;
const tileMap = (id: string, extra: Partial<TileMapType> = {}): TileMapType => ({
  id,
  name: id.toUpperCase(),
  url: `https://example.com/${id}/{z}/{x}/{y}.png`,
  attribution: '',
  maptype: 'none',
  visible: true,
  transparency: 0,
  overzoomThreshold: 18,
  highResolutionEnabled: false,
  minimumZ: 0,
  maximumZ: 22,
  flipY: false,
  ...extra,
});

const makeStore = (tileMaps: TileMapType[], mapType = 'none') => {
  const initialState = {
    user: { uid: 'test-user', email: 'a@b.c', displayName: 'U' },
    dataSet: [],
    layers: [],
    settings: { isSettingProject: true, updatedAt: '2026-11-22T00:00:00.000Z', mapRegion: {}, mapType, plugins: {} },
    tileMaps,
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
const render = (store: ReturnType<typeof makeStore>) =>
  renderHook(() => useRepository(), {
    wrapper: (props: { children?: React.ReactNode }) => <Provider store={store}>{props.children}</Provider>,
  });

const settingsWith = (tileMaps: TileMapType[], mapType = 'none'): ProjectSettingsType =>
  ({ layers: [], tileMaps, mapType, mapRegion: {}, plugins: {}, updatedAt: 'x' } as unknown as ProjectSettingsType);

let uploadSettingsSpy: jest.SpyInstance;
const savedSettings = () => uploadSettingsSpy.mock.calls[0][2] as ProjectSettingsType;
const dispatched = (store: ReturnType<typeof makeStore>) =>
  (store.dispatch as unknown as jest.Mock).mock.calls.map(([a]) => a as { type: string; payload: Record<string, unknown> });

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  Platform.OS = 'ios';
  jest.spyOn(AlertAsyncModule, 'AlertAsync').mockResolvedValue(undefined as never);
  jest.spyOn(projectStore, 'isSettingsUpdatedAtCurrent').mockResolvedValue(true);
  uploadSettingsSpy = jest
    .spyOn(projectStore, 'uploadProjectSettings')
    .mockResolvedValue({ isOK: true, message: '', timestamp: new Date(1000) } as never);
  jest.spyOn(projectStorage, 'deleteProjectPDF').mockResolvedValue(undefined as never);
  jest.spyOn(projectStorage, 'deleteProjectStyle').mockResolvedValue(undefined as never);
});

describe('M-M4: 共有スタイルを地図ごとに取り込む', () => {
  const styled = [
    tileMap('a', { styleURL: 'style://https://s/a', encryptKey: 'k' }),
    tileMap('b', { styleURL: 'style://https://s/b', encryptKey: 'k' }),
    tileMap('c', { styleURL: 'style://https://s/c', encryptKey: 'k' }),
  ];

  const open = async (store: ReturnType<typeof makeStore>, tileMaps: TileMapType[]) => {
    jest.spyOn(projectStore, 'downloadProjectSettings').mockResolvedValue({
      isOK: true,
      message: '',
      data: settingsWith(tileMaps),
    });
    const { result } = render(store);
    await act(async () => {
      await result.current.downloadProjectSettings(project);
    });
  };

  test('ネイティブ: 1つ目で抜けずに全部の地図の style.json を置き、一時ファイルを消す', async () => {
    jest
      .spyOn(projectStorage, 'downloadStyle')
      .mockImplementation(async (url: string) => ({ isOK: true, styleJson: `file:///cache/dec-${url.slice(-1)}` }));
    await open(makeStore([]), styled);
    const targets = FileSystem.copyAsync.mock.calls.map(([arg]) => (arg as { to: string }).to);
    expect(targets.map((p) => p.split('/').slice(-2).join('/'))).toEqual(['a/style.json', 'b/style.json', 'c/style.json']);
    const deleted = FileSystem.deleteAsync.mock.calls.map(([p]) => p);
    expect(deleted).toEqual(expect.arrayContaining(['file:///cache/dec-a', 'file:///cache/dec-c', 'file:///cache/temp_style.json']));
  });

  test('途中の地図の取得に失敗しても、残りの地図は取り込む', async () => {
    Platform.OS = 'web';
    jest.spyOn(projectStorage, 'downloadStyle').mockImplementation(async (url: string) =>
      url.endsWith('b') ? { isOK: false } : { isOK: true, styleJson: `{"id":"${url.slice(-1)}"}` }
    );
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await open(makeStore([]), styled);
    warnSpy.mockRestore();
    expect((saveStyleToPmtilesDb as jest.Mock).mock.calls.map(([id]) => id)).toEqual(['a', 'c']);
  });
});

describe('M-M17・M-M11: 設定の保存で地図を共有用に変える', () => {
  test('Web: スタイル付きでも blob: の PMTiles は載せず、スタイルも上げない', async () => {
    Platform.OS = 'web';
    jest.spyOn(projectStore, 'downloadProjectSettings').mockResolvedValue({ isOK: true, message: '', data: settingsWith([]) });
    const uploadStyle = jest
      .spyOn(projectStorage, 'uploadStyle')
      .mockResolvedValue({ isOK: true, message: '', url: 'style://u', key: 'k' } as never);
    const local = tileMap('local', { url: 'pmtiles://blob:http://localhost/abc', styleURL: 'style://local' });
    const remote = tileMap('remote', { url: 'pmtiles://https://example.com/a.pmtiles', styleURL: 'style://remote' });
    const { result } = render(makeStore([local, remote]));
    await act(async () => {
      await result.current.uploadProjectSettings(project);
    });
    expect(savedSettings().tileMaps.map((m) => m.id)).toEqual(['remote']);
    expect(uploadStyle).toHaveBeenCalledTimes(1);
    expect(uploadStyle).toHaveBeenCalledWith('proj1', 'remote');
  });

  test('複数ページの PDF のページ地図（url が .pdf で終わらない）も PDF として上げる', async () => {
    Platform.OS = 'web';
    jest.spyOn(projectStore, 'downloadProjectSettings').mockResolvedValue({ isOK: true, message: '', data: settingsWith([]) });
    const uploadPDF = jest
      .spyOn(projectStorage, 'uploadPDF')
      .mockResolvedValue({ isOK: true, message: '', url: 'pdf://https://s/p1', key: 'k' } as never);
    const page = tileMap('p1', { url: 'file://現地植生図', attribution: 'PDF', name: '現地植生図_page01' });
    const { result } = render(makeStore([page]));
    await act(async () => {
      await result.current.uploadProjectSettings(project);
    });
    expect(uploadPDF).toHaveBeenCalledWith('proj1', 'p1');
    expect(savedSettings().tileMaps[0]).toMatchObject({ id: 'p1', url: 'pdf://https://s/p1', encryptKey: 'k' });
  });

  test('ネイティブ: 元の PDF が無いので上げず、ページ数分でなく1回だけ知らせ、一覧には残す', async () => {
    Platform.OS = 'android';
    jest.spyOn(projectStore, 'downloadProjectSettings').mockResolvedValue({ isOK: true, message: '', data: settingsWith([]) });
    const uploadPDF = jest.spyOn(projectStorage, 'uploadPDF');
    const pages = [1, 2, 3].map((n) =>
      tileMap(`p${n}`, { url: 'file://現地植生図', attribution: 'PDF', name: `現地植生図_page0${n}` })
    );
    const { result } = render(makeStore(pages));
    await act(async () => {
      await result.current.uploadProjectSettings(project);
    });
    expect(uploadPDF).not.toHaveBeenCalled();
    const alerts = (AlertAsyncModule.AlertAsync as jest.Mock).mock.calls.map(([m]) => String(m));
    expect(alerts.filter((m) => m.includes('pdfMapNotShared'))).toHaveLength(1);
    expect(savedSettings().tileMaps.map((m) => m.id)).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('M-M20: mapType を地図一覧から導く', () => {
  test('新規プロジェクトの既定の設定は初期一覧と同じ mapType で作る', async () => {
    jest.spyOn(projectStore, 'addProject').mockResolvedValue({ isOK: true, message: '' } as never);
    const { result } = render(makeStore([]));
    await act(async () => {
      await result.current.createProject(project);
    });
    expect(savedSettings().mapType).toBe('standard');
  });

  test('開いたとき、保存された mapType でなく一覧の表示（衛星写真）から決める', async () => {
    jest.spyOn(projectStorage, 'downloadStyle').mockResolvedValue({ isOK: false });
    const maps = [tileMap('hybrid', { visible: true, maptype: 'hybrid' }), tileMap('standard', { visible: false })];
    jest.spyOn(projectStore, 'downloadProjectSettings').mockResolvedValue({
      isOK: true,
      message: '',
      data: settingsWith(maps, 'none'),
    });
    const store = makeStore([]);
    const { result } = render(store);
    await act(async () => {
      await result.current.downloadProjectSettings(project);
    });
    const settingsAction = dispatched(store).find((a) => a.type === 'settings/editSettingsAction' && 'mapType' in a.payload);
    expect(settingsAction?.payload.mapType).toBe('hybrid');
  });

  test('一覧に standard も hybrid も無ければ保存された mapType を使う', async () => {
    jest.spyOn(projectStore, 'downloadProjectSettings').mockResolvedValue({
      isOK: true,
      message: '',
      data: settingsWith([tileMap('x')], 'standard'),
    });
    const store = makeStore([]);
    const { result } = render(store);
    await act(async () => {
      await result.current.downloadProjectSettings(project);
    });
    const settingsAction = dispatched(store).find((a) => a.type === 'settings/editSettingsAction' && 'mapType' in a.payload);
    expect(settingsAction?.payload.mapType).toBe('standard');
  });
});
