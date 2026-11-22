/**
 * 同期監査（docs/SYNC_AUDIT_2026-11.md）の M11・L12 の回帰テスト（設定の保存と辞書）。
 * - M11: 辞書は版付きのパスへ書き、設定の書き込みに成功してから古い版を消す。手元に辞書表が無いレイヤは上げない。
 *        辞書を取得できなければ利用者に知らせる
 * - L12: 設定から消えたレイヤのクラウドのデータを、設定の書き込みに成功してから片付ける（利用者の削除と確かめられたときだけ）
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

import React from 'react';
import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useRepository } from '../useRepository';
import * as projectStore from '../../lib/firebase/firestore';
import * as projectStorage from '../../lib/firebase/storage';
import * as AlertAsyncModule from '../../components/molecules/AlertAsync';
import { exportDatabase, hasDictionaryTables, importDictionary } from '../../utils/SQLite';
import type { LayerType, ProjectSettingsType } from '../../types';

const mockedHasDictionaryTables = hasDictionaryTables as jest.Mock;
const mockedExportDatabase = exportDatabase as jest.Mock;
const mockedImportDictionary = importDictionary as jest.Mock;

const project = { id: 'proj1' } as never;
const dictField = { id: 'f1', name: 'species', format: 'STRING_DICTIONARY', list: [], defaultValue: '' };
const layer = (id: string, extra: Partial<LayerType> = {}): LayerType =>
  ({ id, name: id.toUpperCase(), type: 'POINT', permission: 'PRIVATE', field: [], ...extra } as unknown as LayerType);
const settingsOf = (layers: LayerType[]): ProjectSettingsType =>
  ({ layers, tileMaps: [], mapType: 'none', mapRegion: {}, plugins: {}, updatedAt: 'x' } as unknown as ProjectSettingsType);

const makeStore = (layers: LayerType[]) => {
  const initialState = {
    user: { uid: 'test-user', email: 'a@b.c', displayName: 'U' },
    dataSet: [],
    layers,
    settings: { isSettingProject: true, updatedAt: '2026-11-22T00:00:00.000Z', mapRegion: {}, mapType: 'none', plugins: {} },
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
const renderWithStore = (store: ReturnType<typeof makeStore>) =>
  renderHook(() => useRepository(), {
    wrapper: (props: { children?: React.ReactNode }) => <Provider store={store}>{props.children}</Provider>,
  });

/** 呼ばれた順の記録（設定の書き込みと、辞書・データの削除の前後を確かめる） */
const calls: string[] = [];
let uploadSettingsSpy: jest.SpyInstance;
let alertSpy: jest.SpyInstance;

const setup = (opts: { cloudLayers: LayerType[]; localLayers: LayerType[]; settingsOK?: boolean; current?: boolean }) => {
  jest.spyOn(projectStore, 'downloadProjectSettings').mockResolvedValue({
    isOK: true,
    message: '',
    data: settingsOf(opts.cloudLayers),
  });
  jest.spyOn(projectStore, 'isSettingsUpdatedAtCurrent').mockResolvedValue(opts.current ?? true);
  uploadSettingsSpy = jest.spyOn(projectStore, 'uploadProjectSettings').mockImplementation(async () => {
    calls.push('settings');
    return opts.settingsOK === false
      ? { isOK: false, message: 'failSettings', timestamp: undefined }
      : { isOK: true, message: '', timestamp: new Date(1000) };
  });
  jest.spyOn(projectStore, 'updateLayerDataPermission').mockResolvedValue({ isOK: true, message: '' } as never);
  jest.spyOn(projectStore, 'deleteData').mockImplementation(async (_p, layerId) => {
    calls.push(`deleteData:${layerId}`);
    return { isOK: true, message: '' };
  });
  jest.spyOn(projectStorage, 'deleteProjectPDF').mockResolvedValue(undefined as never);
  jest.spyOn(projectStorage, 'deleteProjectStyle').mockResolvedValue(undefined as never);
  jest.spyOn(projectStorage, 'uploadDictionary').mockImplementation(async (_p, layerId, _d, version) => {
    calls.push(`uploadDictionary:${layerId}:${version}`);
    return { isOK: true, message: '', key: 'NEWKEY', encdata: 'ENC' as unknown as Blob };
  });
  jest.spyOn(projectStorage, 'uploadDictionaryLegacyCopy').mockImplementation(async (_p, layerId) => {
    calls.push(`legacyCopy:${layerId}`);
    return { isOK: true, message: '' };
  });
  jest.spyOn(projectStorage, 'deleteDictionaryFile').mockImplementation(async (_p, layerId, version) => {
    calls.push(`deleteDictionaryFile:${layerId}:${version}`);
    return { isOK: true, message: '' };
  });
  jest.spyOn(projectStorage, 'deleteLayerPhotos').mockImplementation(async (_p, layerId) => {
    calls.push(`deleteLayerPhotos:${layerId}`);
    return { isOK: true, message: '' };
  });
  jest.spyOn(projectStorage, 'deleteLayerDictionaries').mockImplementation(async (_p, layerId) => {
    calls.push(`deleteLayerDictionaries:${layerId}`);
    return { isOK: true, message: '' };
  });
  return renderWithStore(makeStore(opts.localLayers));
};

const savedLayers = (): LayerType[] => (uploadSettingsSpy.mock.calls[0][2] as ProjectSettingsType).layers;

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  calls.length = 0;
  mockedHasDictionaryTables.mockResolvedValue(true);
  mockedExportDatabase.mockResolvedValue('file:///tmp/dict.sqlite');
  alertSpy = jest.spyOn(AlertAsyncModule, 'AlertAsync').mockResolvedValue(undefined as never);
});

describe('M11: 辞書を版付きのパスへ書き、設定の書き込みに成功してから古い版を消す', () => {
  const cloudDictLayer = layer('d1', { field: [dictField], dictionaryKey: 'OLDKEY', dictionaryVersion: 'v-old' } as never);
  const localDictLayer = layer('d1', { field: [dictField], dictionaryKey: 'OLDKEY', dictionaryVersion: 'v-old' } as never);

  test('新しい版の鍵と版を設定に書き、成功したあとで旧形式へ写して古い版を消す', async () => {
    const { result } = setup({ cloudLayers: [cloudDictLayer], localLayers: [localDictLayer] });
    let res: { isOK: boolean } | undefined;
    await act(async () => {
      res = await result.current.uploadProjectSettings(project);
    });
    expect(res?.isOK).toBe(true);
    const saved = savedLayers()[0];
    expect(saved.dictionaryKey).toBe('NEWKEY');
    expect(saved.dictionaryVersion).toEqual(expect.any(String));
    expect(saved.dictionaryVersion).not.toBe('v-old');
    expect(calls).toEqual([
      `uploadDictionary:d1:${saved.dictionaryVersion}`,
      'settings',
      'legacyCopy:d1',
      'deleteDictionaryFile:d1:v-old',
    ]);
  });

  test('設定の書き込みに失敗したら、古い版を消さず旧形式へも写さない（設定が指す辞書と鍵の組を壊さない）', async () => {
    const { result } = setup({ cloudLayers: [cloudDictLayer], localLayers: [localDictLayer], settingsOK: false });
    let res: { isOK: boolean; message: string } | undefined;
    await act(async () => {
      res = await result.current.uploadProjectSettings(project);
    });
    expect(res).toEqual({ isOK: false, message: 'failSettings' });
    expect(calls.filter((c) => c.startsWith('legacyCopy') || c.startsWith('deleteDictionaryFile'))).toEqual([]);
  });

  test('旧形式（版の無い）設定から保存したときは、旧形式のファイルを消さずに上書きの写しだけ作る', async () => {
    const legacyLayer = layer('d1', { field: [dictField], dictionaryKey: 'OLDKEY' } as never);
    const { result } = setup({ cloudLayers: [legacyLayer], localLayers: [legacyLayer] });
    await act(async () => {
      await result.current.uploadProjectSettings(project);
    });
    expect(calls.filter((c) => c.startsWith('deleteDictionaryFile'))).toEqual([]);
    expect(calls).toContain('legacyCopy:d1');
  });

  test('手元に辞書表が無いレイヤは上げず、クラウドの設定にある鍵と版を保つ', async () => {
    mockedHasDictionaryTables.mockResolvedValue(false);
    // 手元のレイヤは鍵を持っていない（例: 開く途中で辞書を取得できなかった）
    const localWithoutKey = layer('d1', { field: [dictField] } as never);
    const { result } = setup({ cloudLayers: [cloudDictLayer], localLayers: [localWithoutKey] });
    await act(async () => {
      await result.current.uploadProjectSettings(project);
    });
    expect(projectStorage.uploadDictionary).not.toHaveBeenCalled();
    expect(mockedExportDatabase).not.toHaveBeenCalled();
    expect(savedLayers()[0]).toMatchObject({ dictionaryKey: 'OLDKEY', dictionaryVersion: 'v-old' });
    expect(calls.filter((c) => c.startsWith('deleteDictionaryFile') || c.startsWith('legacyCopy'))).toEqual([]);
  });

  test('辞書の書き出しが例外になっても保存を止めず、クラウドの鍵と版を保つ', async () => {
    mockedExportDatabase.mockRejectedValue(new Error('export failed'));
    const { result } = setup({ cloudLayers: [cloudDictLayer], localLayers: [localDictLayer] });
    let res: { isOK: boolean } | undefined;
    await act(async () => {
      res = await result.current.uploadProjectSettings(project);
    });
    expect(res?.isOK).toBe(true);
    expect(alertSpy).toHaveBeenCalledWith('hooks.message.failUploadDictionary');
    expect(savedLayers()[0]).toMatchObject({ dictionaryKey: 'OLDKEY', dictionaryVersion: 'v-old' });
  });

  test('辞書のアップロードに失敗したら、クラウドの鍵と版を保つ', async () => {
    const { result } = setup({ cloudLayers: [cloudDictLayer], localLayers: [localDictLayer] });
    (projectStorage.uploadDictionary as unknown as jest.SpyInstance).mockResolvedValue({
      isOK: false,
      message: 'failUpload',
      key: undefined,
      encdata: undefined,
    });
    await act(async () => {
      await result.current.uploadProjectSettings(project);
    });
    expect(alertSpy).toHaveBeenCalledWith('failUpload');
    expect(savedLayers()[0]).toMatchObject({ dictionaryKey: 'OLDKEY', dictionaryVersion: 'v-old' });
    expect(calls.filter((c) => c.startsWith('deleteDictionaryFile'))).toEqual([]);
  });

  test('辞書を取得できなかったレイヤを利用者に知らせ、版を渡して読む', async () => {
    jest.spyOn(projectStore, 'downloadProjectSettings').mockResolvedValue({
      isOK: true,
      message: '',
      data: settingsOf([cloudDictLayer, layer('d2', { field: [dictField], dictionaryKey: 'K2' } as never)]),
    });
    const downloadSpy = jest
      .spyOn(projectStorage, 'downloadDictionary')
      .mockImplementation(async (_p, layerId) =>
        layerId === 'd1' ? { isOK: false, message: 'x' } : { isOK: true, message: '', data: '' }
      );
    const { result } = renderWithStore(makeStore([]));
    await act(async () => {
      await result.current.downloadProjectSettings(project);
    });
    expect(downloadSpy).toHaveBeenCalledWith('proj1', 'd1', 'OLDKEY', 'v-old');
    expect(downloadSpy).toHaveBeenCalledWith('proj1', 'd2', 'K2', undefined);
    expect(mockedImportDictionary).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith('hooks.message.failDownloadDictionaries');
  });

  test('辞書をすべて取得できたら知らせない', async () => {
    jest.spyOn(projectStore, 'downloadProjectSettings').mockResolvedValue({
      isOK: true,
      message: '',
      data: settingsOf([cloudDictLayer]),
    });
    jest.spyOn(projectStorage, 'downloadDictionary').mockResolvedValue({ isOK: true, message: '', data: '' });
    const { result } = renderWithStore(makeStore([]));
    await act(async () => {
      await result.current.downloadProjectSettings(project);
    });
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe('L12: 設定から消えたレイヤのクラウドのデータを片付ける', () => {
  const kept = layer('kept');
  const gone = layer('gone', { permission: 'COMMON' } as never);
  const group = layer('grp', { type: 'LAYERGROUP' } as never);
  const track = layer('track', { type: 'LINE' } as never);

  test('旧設定にあって新設定に無いレイヤの doc・写真・辞書を、設定の書き込みのあとで消す', async () => {
    const { result } = setup({ cloudLayers: [kept, gone], localLayers: [kept] });
    await act(async () => {
      await result.current.uploadProjectSettings(project);
    });
    expect(calls).toEqual(['settings', 'deleteData:gone', 'deleteLayerPhotos:gone', 'deleteLayerDictionaries:gone']);
    // 権限・利用者を問わずレイヤの全 doc を消す
    expect(projectStore.deleteData).toHaveBeenCalledWith('proj1', 'gone');
    expect(projectStorage.deleteLayerPhotos).toHaveBeenCalledWith('proj1', 'gone');
  });

  test('グループと軌跡のレイヤは、設定から消えていても片付けない', async () => {
    const { result } = setup({ cloudLayers: [kept, group, track], localLayers: [kept] });
    await act(async () => {
      await result.current.uploadProjectSettings(project);
    });
    expect(projectStore.deleteData).not.toHaveBeenCalled();
    expect(projectStorage.deleteLayerPhotos).not.toHaveBeenCalled();
  });

  test('開いた後に別の端末が設定を保存していたら（足されたレイヤかもしれないので）片付けない', async () => {
    const { result } = setup({ cloudLayers: [kept, gone], localLayers: [kept], current: false });
    await act(async () => {
      await result.current.uploadProjectSettings(project);
    });
    expect(uploadSettingsSpy).toHaveBeenCalled();
    expect(projectStore.deleteData).not.toHaveBeenCalled();
  });

  test('確かめられないときも片付けない', async () => {
    const { result } = setup({ cloudLayers: [kept, gone], localLayers: [kept] });
    jest.spyOn(projectStore, 'isSettingsUpdatedAtCurrent').mockRejectedValue(new Error('offline'));
    await act(async () => {
      await result.current.uploadProjectSettings(project);
    });
    expect(projectStore.deleteData).not.toHaveBeenCalled();
  });

  test('設定の書き込みに失敗したら片付けない', async () => {
    const { result } = setup({ cloudLayers: [kept, gone], localLayers: [kept], settingsOK: false });
    await act(async () => {
      await result.current.uploadProjectSettings(project);
    });
    expect(projectStore.deleteData).not.toHaveBeenCalled();
  });

  test('旧設定を取得できなかったら片付けない', async () => {
    const { result } = setup({ cloudLayers: [], localLayers: [kept] });
    jest
      .spyOn(projectStore, 'downloadProjectSettings')
      .mockResolvedValue({ isOK: false, message: 'fail' } as never);
    await act(async () => {
      await result.current.uploadProjectSettings(project);
    });
    expect(projectStore.isSettingsUpdatedAtCurrent).not.toHaveBeenCalled();
    expect(projectStore.deleteData).not.toHaveBeenCalled();
  });
});
