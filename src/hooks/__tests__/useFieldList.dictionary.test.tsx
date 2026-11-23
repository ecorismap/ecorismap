import React from 'react';
import { act, renderHook } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useFieldList } from '../useFieldList';
import layersReducer from '../../modules/layers';
import { FieldType, LayerType } from '../../types';

// 値の設定画面を開くたびに、辞書型でない項目でも辞書の表を照会して no such table を console.log していた（Pixel 確認 2）

const mockQueries: string[] = [];
const mockExistingTables = new Set<string>();
const mockGetAllSync = jest.fn((sql: string, params?: unknown[]) => {
  mockQueries.push(sql);
  if (sql.includes('sqlite_master')) {
    const name = String(params?.[0]);
    return mockExistingTables.has(name) ? [{ name }] : [];
  }
  const match = /FROM "(.+)"/.exec(sql);
  if (match === null || !mockExistingTables.has(match[1])) throw new Error(`no such table: ${match?.[1]}`);
  return [{ value: 'ススキ' }, { value: 'ヨシ' }];
});

jest.mock('../../utils/SQLite', () => ({
  getDatabase: jest.fn(async () => ({ getAllSync: mockGetAllSync })),
  isValidTableName: () => true,
}));

const layerOf = (field: FieldType): LayerType =>
  ({
    id: 'layer1',
    name: 'L',
    type: 'POINT',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      transparency: false,
      color: 'rgba(0,0,0,1)',
      fieldName: '',
      customFieldValue: '',
      colorRamp: 'RANDOM',
      colorList: [],
    },
    label: '',
    visible: true,
    active: true,
    field: [field],
  }) as LayerType;

const renderFieldList = (field: FieldType) => {
  const layer = layerOf(field);
  const store = configureStore({ reducer: { layers: layersReducer }, preloadedState: { layers: [layer] } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  return renderHook(() => useFieldList(layer, layer.field[0], 0, false), { wrapper });
};

//辞書の読み込みは非同期なので、待ってから結果を見る
const flushAsync = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe('useFieldList 辞書の読み込み', () => {
  let logSpy: jest.SpyInstance;
  beforeEach(() => {
    mockQueries.length = 0;
    mockExistingTables.clear();
    mockGetAllSync.mockClear();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  it('辞書型でない項目では辞書の表を照会しない', async () => {
    const { result } = renderFieldList({ id: 'f1', name: '文字', format: 'STRING' });
    await flushAsync();
    expect(result.current.isLoading).toBe(false);
    expect(mockGetAllSync).not.toHaveBeenCalled();
    expect(result.current.dictionaryData).toEqual([]);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('辞書型でも表がまだ無ければ空の一覧にし、例外を出さない', async () => {
    const { result } = renderFieldList({ id: 'f1', name: '種名', format: 'STRING_DICTIONARY' });
    await flushAsync();
    expect(mockQueries).toHaveLength(1);
    expect(mockQueries[0]).toContain('sqlite_master');
    expect(result.current.dictionaryData).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('辞書型で表があれば語彙を読み込む', async () => {
    mockExistingTables.add('_layer1_f1');
    const { result } = renderFieldList({ id: 'f1', name: '種名', format: 'STRING_DICTIONARY' });
    await flushAsync();
    expect(result.current.dictionaryData).toEqual(['ススキ', 'ヨシ']);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
