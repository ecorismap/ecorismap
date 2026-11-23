/**
 * データ編集画面の監査修正（docs/EDIT_AUDIT_2026-11.md の E-H1・E-M1）
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import rootReducer from '../../modules';
import { useDataEdit } from '../useDataEdit';
import { DataType, LayerType, RecordType, RoleType } from '../../types';

jest.mock('../useProject', () => ({
  useProject: () => ({ isSettingProject: false }),
}));

jest.mock('../useRecord', () => ({
  useRecord: () => ({ selectRecord: jest.fn(), setIsEditingRecord: jest.fn() }),
}));

jest.mock('../../contexts/BottomSheetNavigationContext', () => ({
  useBottomSheetNavigation: () => ({
    currentScreen: { name: 'DataEdit', params: {} },
    navigate: jest.fn(),
    goBack: jest.fn(),
  }),
}));

const layer = {
  id: 'L',
  name: 'L',
  type: 'LINE',
  permission: 'PRIVATE',
  field: [{ id: 'f', name: 'comment', format: 'STRING' }],
  active: true,
} as unknown as LayerType;

const line = (id: string, coords: { latitude: number; longitude: number }[], field: RecordType['field'] = {}) =>
  ({
    id,
    userId: undefined,
    displayName: null,
    visible: true,
    redraw: false,
    coords,
    field: { comment: '', ...field },
    updatedAt: 100,
  }) as RecordType;

const setup = (dataSet: DataType[], record: RecordType) => {
  const initial = rootReducer(undefined, { type: '@@INIT' });
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: {
      ...initial,
      dataSet,
      layers: [layer],
      settings: { ...initial.settings, projectId: undefined },
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ immutableCheck: false, serializableCheck: false }),
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const { result } = renderHook(() => useDataEdit(record, layer), { wrapper });
  return { store, result };
};

describe('E-H1 位置を直して戻った後の属性の保存', () => {
  it('画面に渡された古い写しではなく、ストアの最新の形を保存する（レイヤの先頭の記録）', async () => {
    const before = line('r1', [
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 1 },
    ]);
    const after = { ...before, coords: [...(before.coords as []), { latitude: 2, longitude: 2 }], updatedAt: 200 };
    //地図で位置を直した後のストア。DataEditには位置編集前の写し（before）が渡される
    const { store, result } = setup([{ layerId: 'L', userId: undefined, data: [after, line('r2', [])] }], before);
    expect(result.current.targetRecord.coords).toEqual(after.coords);

    act(() => {
      result.current.changeField('comment', '修正');
    });
    await act(async () => {
      expect((await result.current.saveData()).isOK).toBe(true);
    });
    const saved = store.getState().dataSet[0].data.find((r: RecordType) => r.id === 'r1');
    expect(saved?.coords).toEqual(after.coords);
    expect(saved?.field.comment).toBe('修正');
  });
});

describe('E-M1 データ編集から親を削除すると子も消える', () => {
  it('マップメモでない作図レイヤ（飛翔線と行動記号）でも、ぶら下がる子を消す', () => {
    const parent = line('p1', [{ latitude: 0, longitude: 0 }]);
    const child = line('c1', [{ latitude: 0, longitude: 0 }], { _group: 'p1' });
    const other = line('p2', [{ latitude: 0, longitude: 0 }]);
    const { store, result } = setup([{ layerId: 'L', userId: undefined, data: [parent, child, other] }], parent);
    act(() => {
      expect(result.current.deleteRecord().isOK).toBe(true);
    });
    expect(store.getState().dataSet[0].data.map((r: RecordType) => r.id)).toEqual(['p2']);
  });

  it('子が別の名義の集合にあっても、その集合から消す', () => {
    const parent = { ...line('p1', [{ latitude: 0, longitude: 0 }]), userId: 'me' } as RecordType;
    const child = { ...line('c1', [], { _group: 'p1' }), userId: 'me2' } as RecordType;
    const initial = rootReducer(undefined, { type: '@@INIT' });
    const store = configureStore({
      reducer: rootReducer,
      preloadedState: {
        ...initial,
        dataSet: [
          { layerId: 'L', userId: 'me', data: [parent] },
          { layerId: 'L', userId: 'me2', data: [child] },
        ],
        layers: [layer],
        user: { uid: 'me', email: '', displayName: 'Me', photoURL: '' },
        //プロジェクトの設定中（管理者が全員の記録を扱える状態）
        settings: { ...initial.settings, projectId: 'p', isSettingProject: true, role: 'OWNER' as RoleType },
      },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware({ immutableCheck: false, serializableCheck: false }),
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
    const { result } = renderHook(() => useDataEdit(parent, layer), { wrapper });
    act(() => {
      expect(result.current.deleteRecord().isOK).toBe(true);
    });
    const alive = store
      .getState()
      .dataSet.flatMap((d: DataType) => d.data)
      .filter((r: RecordType) => !r.deleted)
      .map((r: RecordType) => r.id);
    expect(alive).toEqual([]);
  });
});

describe('E-M1（残り） 消せない子があるときは削除全体を止める', () => {
  it('一般メンバーが自分の飛翔線を消すとき、テンプレート名義の子が残るなら何も消さずに理由を返す', () => {
    const parent = { ...line('p1', [{ latitude: 0, longitude: 0 }]), userId: 'me' } as RecordType;
    const child = { ...line('c1', [], { _group: 'p1' }), userId: 'template' } as RecordType;
    const initial = rootReducer(undefined, { type: '@@INIT' });
    const store = configureStore({
      reducer: rootReducer,
      preloadedState: {
        ...initial,
        dataSet: [
          { layerId: 'L', userId: 'me', data: [parent] },
          { layerId: 'L', userId: 'template', data: [child] },
        ],
        layers: [layer],
        user: { uid: 'me', email: '', displayName: 'Me', photoURL: '' },
        //実行中のプロジェクトの一般メンバー
        settings: { ...initial.settings, projectId: 'p', isSettingProject: false, role: 'MEMBER' as RoleType },
      },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware({ immutableCheck: false, serializableCheck: false }),
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
    const { result } = renderHook(() => useDataEdit(parent, layer), { wrapper });
    let res: { isOK: boolean; message: string } | undefined;
    act(() => {
      res = result.current.deleteRecord();
    });
    expect(res?.isOK).toBe(false);
    expect(res?.message).toContain('hooks.message.childRecordDeleteBlocked');
    const alive = store
      .getState()
      .dataSet.flatMap((d: DataType) => d.data)
      .filter((r: RecordType) => !r.deleted)
      .map((r: RecordType) => r.id);
    expect(alive).toEqual(['p1', 'c1']);
  });
});
