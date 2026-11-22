/**
 * データ編集画面での、他のメンバーの記録の編集・削除（docs/SYNC_AUDIT_2026-11.md の M8・L1）
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import rootReducer from '../../modules';
import { useDataEdit } from '../useDataEdit';
import { DataType, LayerType, RecordType, RoleType } from '../../types';
import { t } from '../../i18n/config';

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
  type: 'NONE',
  permission: 'PUBLIC',
  field: [{ id: 'f', name: 'name', format: 'STRING' }],
  active: true,
} as unknown as LayerType;

const theirs: RecordType = {
  id: 'theirs',
  userId: 'owner',
  displayName: 'Owner',
  visible: true,
  redraw: false,
  coords: undefined,
  field: { name: 'original' },
  updatedAt: 100,
  uploaded: true,
};

const setup = (role: RoleType) => {
  const initial = rootReducer(undefined, { type: '@@INIT' });
  const dataSet: DataType[] = [
    { layerId: 'L', userId: 'owner', data: [theirs] },
    { layerId: 'L', userId: 'me', data: [] },
  ];
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: {
      ...initial,
      dataSet,
      layers: [layer],
      user: { uid: 'me', email: '', displayName: 'Me', photoURL: '' },
      settings: { ...initial.settings, projectId: 'p1', isSettingProject: false, role },
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ immutableCheck: false, serializableCheck: false }),
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const { result } = renderHook(() => useDataEdit(theirs, layer), { wrapper });
  return { store, result };
};

const bucket = (dataSet: DataType[], userId: string) => dataSet.find((d) => d.userId === userId)?.data ?? [];

describe('useDataEdit と他のメンバーの記録', () => {
  it('一般メンバーには変更・削除できない理由を示し、保存も削除もしない', () => {
    const { store, result } = setup('MEMBER');
    expect(result.current.modifyBlockMessage).toBe(t('hooks.message.recordModifyAdminOnly'));
    expect(result.current.deleteBlockMessage).toBe(t('hooks.message.recordModifyAdminOnly'));
    act(() => {
      result.current.changeField('name', 'edited');
    });
    let saved: { isOK: boolean; message: string } | undefined;
    act(() => {
      saved = result.current.saveData();
    });
    expect(saved?.isOK).toBe(false);
    let deleted: { isOK: boolean; message: string } | undefined;
    act(() => {
      deleted = result.current.deleteRecord();
    });
    expect(deleted?.isOK).toBe(false);
    expect(bucket(store.getState().dataSet, 'owner')).toEqual([theirs]);
    expect(bucket(store.getState().dataSet, 'me')).toEqual([]);
  });

  it('管理者が編集すると、引き継ぎ元付きで自分の名義へ移す（元の持ち主の名義には残さない）', () => {
    const { store, result } = setup('ADMIN');
    expect(result.current.modifyBlockMessage).toBeUndefined();
    act(() => {
      result.current.changeField('name', 'edited');
    });
    act(() => {
      expect(result.current.saveData().isOK).toBe(true);
    });
    expect(bucket(store.getState().dataSet, 'owner')).toEqual([]);
    expect(bucket(store.getState().dataSet, 'me')[0]).toMatchObject({
      id: 'theirs',
      userId: 'me',
      field: { name: 'edited' },
      takenOverFrom: ['owner'],
    });
  });

  it('管理者が削除すると、自分の名義に墓標を持つ', () => {
    const { store, result } = setup('OWNER');
    act(() => {
      expect(result.current.deleteRecord().isOK).toBe(true);
    });
    expect(bucket(store.getState().dataSet, 'owner')).toEqual([]);
    expect(bucket(store.getState().dataSet, 'me')[0]).toMatchObject({ id: 'theirs', deleted: true, takenOverFrom: ['owner'] });
  });

  it('管理者が編集中のまま削除すると、編集を保存せずに元の記録を墓標にする（編集版を残さない）', () => {
    const { store, result } = setup('ADMIN');
    act(() => {
      result.current.changeField('name', 'edited');
    });
    act(() => {
      expect(result.current.deleteRecord().isOK).toBe(true);
    });
    const dataSet = store.getState().dataSet;
    expect(bucket(dataSet, 'owner')).toEqual([]);
    const mine = bucket(dataSet, 'me');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: 'theirs', deleted: true, takenOverFrom: ['owner'], field: { name: 'original' } });
  });
});
