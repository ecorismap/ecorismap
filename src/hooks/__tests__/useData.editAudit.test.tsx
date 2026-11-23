/**
 * データ一覧の監査修正（docs/EDIT_AUDIT_2026-11.md の E-H4・E-M15・E-M17・E-L14）
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { clearAllVisibilitySnapshots, useData } from '../useData';
import rootReducer from '../../modules';
import { setDataFilterForLayerAction } from '../../modules/settings';
import { updateLayerAction } from '../../modules/layers';
import * as DataUtils from '../../utils/Data';
import { LayerType, RecordType } from '../../types';

jest.mock('../useProject', () => ({
  useProject: () => ({ isSettingProject: false, isOwnerAdmin: false }),
}));

const layer = {
  id: 'layer1',
  name: 'L',
  type: 'POINT',
  permission: 'PRIVATE',
  field: [{ id: 'f1', name: 'Name', format: 'STRING' }],
  active: true,
} as unknown as LayerType;

const rec = (id: string, name: string): RecordType => ({
  id,
  userId: undefined,
  displayName: null,
  visible: true,
  redraw: false,
  coords: { latitude: 0, longitude: 0 },
  field: { Name: name },
  updatedAt: 1,
});

const setup = (records: RecordType[], layerOverrides: Partial<LayerType> = {}) => {
  const initial = rootReducer(undefined, { type: '@@INIT' });
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: {
      ...initial,
      dataSet: [{ layerId: 'layer1', userId: undefined, data: records }],
      layers: [{ ...layer, ...layerOverrides }],
      settings: { ...initial.settings, projectId: undefined, dataFilterPerLayer: {} },
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ immutableCheck: false, serializableCheck: false }),
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const { result } = renderHook(() => useData('layer1'), { wrapper });
  return { store, result };
};

const checkedIds = (records: RecordType[]) => records.map((r) => r.id);

beforeEach(() => {
  clearAllVisibilitySnapshots();
});

describe('E-H4 絞り込みを変えてもチェックは別の記録へ移らない', () => {
  it('2行目をチェックして絞り込むと、チェックした記録が外れれば何も選ばれない', () => {
    const { result } = setup([rec('r1', 'スギ'), rec('r2', 'ミズナラ'), rec('r3', 'スギナ')]);
    act(() => result.current.changeChecked('r2', true));
    expect(checkedIds(result.current.checkedRecords)).toEqual(['r2']);

    act(() => result.current.setFilter('スギ', 'Name'));
    expect(checkedIds(result.current.sortedRecordSet)).toEqual(['r1', 'r3']);
    //以前は旧一覧の位置1を引き継ぎ、r3がチェックされていた
    expect(checkedIds(result.current.checkedRecords)).toEqual([]);
    expect(result.current.isChecked).toBe(false);
  });

  it('絞り込みを解除すると、チェックした記録のチェックが残っている記録だけ選ばれる', () => {
    const { result } = setup([rec('r1', 'スギ'), rec('r2', 'ミズナラ'), rec('r3', 'スギナ')]);
    act(() => result.current.setFilter('スギ', 'Name'));
    act(() => result.current.changeCheckedAll(true));
    expect(checkedIds(result.current.checkedRecords)).toEqual(['r1', 'r3']);

    act(() => result.current.clearFilter());
    expect(checkedIds(result.current.sortedRecordSet)).toEqual(['r1', 'r2', 'r3']);
    expect(checkedIds(result.current.checkedRecords)).toEqual(['r1', 'r3']);
  });

  it('列ソートの向きを変えても、チェックは同じ記録に付いたまま', () => {
    const { result } = setup([rec('r1', 'A'), rec('r2', 'B'), rec('r3', 'C')]);
    act(() => result.current.changeChecked('r1', true));
    act(() => result.current.changeOrder('Name', 'DESCENDING'));
    expect(checkedIds(result.current.sortedRecordSet)).toEqual(['r3', 'r2', 'r1']);
    expect(checkedIds(result.current.checkedRecords)).toEqual(['r1']);
    //E-M15: 行の位置ではなく記録のidでチェックを切り替える
    act(() => result.current.changeChecked('r3', true));
    act(() => result.current.changeOrder('Name', 'ASCENDING'));
    expect(checkedIds(result.current.checkedRecords)).toEqual(['r1', 'r3']);
  });
});

describe('E-M17 対象列が無くなった絞り込み', () => {
  it('対象列が消えると絞り込み中の扱いをやめ、条件を解除する', () => {
    const { store, result } = setup([rec('r1', 'スギ'), rec('r2', 'ミズナラ')]);
    act(() => result.current.setFilter('スギ', 'Name'));
    expect(result.current.isFiltering).toBe(true);

    //同期などで、絞り込み中の列が無いレイヤ設定に置き換わった
    act(() => {
      store.dispatch(updateLayerAction({ ...layer, field: [{ id: 'f2', name: 'Other', format: 'STRING' }] }));
    });
    expect(result.current.isFiltering).toBe(false);
    expect(store.getState().settings.dataFilterPerLayer?.layer1).toEqual({ text: '', fieldName: '' });
    expect(checkedIds(result.current.sortedRecordSet)).toEqual(['r1', 'r2']);
  });

  it('条件だけ消えて地図表示の控えが残ったときは、表示を元に戻す', () => {
    const { store, result } = setup([rec('r1', 'スギ'), rec('r2', 'ミズナラ')]);
    act(() => result.current.setFilter('スギ', 'Name'));
    act(() => result.current.showOnlyFilteredRecords());
    const visible = () => store.getState().dataSet[0].data.map((r: RecordType) => r.visible);
    expect(visible()).toEqual([true, false]);

    //レイヤ設定で列を消して保存すると、条件だけが解除される
    act(() => {
      store.dispatch(setDataFilterForLayerAction({ layerId: 'layer1', text: '', fieldName: '' }));
    });
    expect(visible()).toEqual([true, true]);
  });
});

describe('E-L14 見出しのタップで並べ替えを二重に行わない', () => {
  it('ソート設定の保存で、同じ条件の並べ替えをもう一度走らせない', () => {
    const spy = jest.spyOn(DataUtils, 'sortData');
    const { result } = setup([rec('r1', 'B'), rec('r2', 'A')]);
    spy.mockClear();
    act(() => result.current.changeOrder('Name', 'ASCENDING'));
    expect(checkedIds(result.current.sortedRecordSet)).toEqual(['r2', 'r1']);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
