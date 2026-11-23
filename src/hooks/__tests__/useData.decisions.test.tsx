/**
 * データ一覧の判断事項（docs/DECISIONS_2026-11.md の E-L13・E-L1）
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { clearAllVisibilitySnapshots, useData } from '../useData';
import rootReducer from '../../modules';
import { DataType, LayerType, RecordType } from '../../types';

jest.mock('../useProject', () => ({
  useProject: () => ({ isSettingProject: false, isOwnerAdmin: false }),
}));

const layer = {
  id: 'layer1',
  name: 'L',
  type: 'POINT',
  permission: 'PRIVATE',
  field: [
    { id: 'f1', name: 'Name', format: 'STRING' },
    { id: 'f2', name: 'No', format: 'SERIAL' },
  ],
  active: true,
} as unknown as LayerType;

const rec = (id: string, name: string, extra: Partial<RecordType> = {}): RecordType => ({
  id,
  userId: undefined,
  displayName: null,
  visible: true,
  redraw: false,
  coords: { latitude: 0, longitude: 0 },
  field: { Name: name, No: 0 },
  updatedAt: 1,
  ...extra,
});

const setup = (dataSet: DataType[]) => {
  const initial = rootReducer(undefined, { type: '@@INIT' });
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: {
      ...initial,
      dataSet,
      layers: [layer],
      settings: { ...initial.settings, projectId: undefined, dataFilterPerLayer: {} },
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ immutableCheck: false, serializableCheck: false }),
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const { result } = renderHook(() => useData('layer1'), { wrapper });
  const visibleOf = () =>
    Object.fromEntries(store.getState().dataSet.flatMap((d) => d.data).map((r) => [r.id, r.visible]));
  return { store, result, visibleOf };
};

beforeEach(() => {
  clearAllVisibilitySnapshots();
});

describe('E-L13 絞り込み中の見出しの目ボタン', () => {
  it('絞り込み中は一覧に出ている記録と子の記号だけを切り替える', () => {
    const child = rec('c1', '子', { field: { Name: '子', No: 0, _group: 'r1' } });
    const { result, visibleOf } = setup([
      { layerId: 'layer1', userId: undefined, data: [rec('r1', 'スギ'), rec('r2', 'ミズナラ'), child] },
    ]);
    act(() => result.current.setFilter('スギ', 'Name'));
    act(() => result.current.changeVisibleAll(false));
    expect(visibleOf()).toEqual({ r1: false, c1: false, r2: true });
  });

  it('絞り込んでいなければレイヤ全体を切り替える', () => {
    const { result, visibleOf } = setup([
      { layerId: 'layer1', userId: undefined, data: [rec('r1', 'スギ'), rec('r2', 'ミズナラ')] },
    ]);
    act(() => result.current.changeVisibleAll(false));
    expect(visibleOf()).toEqual({ r1: false, r2: false });
  });
});

describe('E-L1 一覧からの追加の連番', () => {
  it('テンプレートを含むレイヤの全記録の最大値+1を振る', () => {
    const template = [1, 2, 3, 4, 5].map((n) =>
      rec(`t${n}`, `テンプレ${n}`, { userId: 'template', field: { Name: `テンプレ${n}`, No: n } })
    );
    const { result } = setup([
      { layerId: 'layer1', userId: undefined, data: [rec('r1', '自分', { field: { Name: '自分', No: 0 } })] },
      { layerId: 'layer1', userId: 'template', data: template },
    ]);
    let added: RecordType | undefined;
    act(() => {
      added = result.current.addDefaultRecord();
    });
    //以前は自分の記録だけで数え1が振られ、テンプレートの1と重複していた
    expect(added?.field.No).toBe(6);
  });
});
