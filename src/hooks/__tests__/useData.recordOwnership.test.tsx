/**
 * データ一覧の一括削除と、他のメンバー・テンプレートの記録（docs/SYNC_AUDIT_2026-11.md の M8）
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import rootReducer from '../../modules';
import { useData } from '../useData';
import { DataType, LayerType, RecordType, RoleType } from '../../types';
import { t } from '../../i18n/config';

let mockIsOwnerAdmin = false;
jest.mock('../useProject', () => ({
  useProject: () => ({ isSettingProject: false, isOwnerAdmin: mockIsOwnerAdmin }),
}));

const rec = (id: string, userId: string): RecordType => ({
  id,
  userId,
  displayName: userId,
  visible: true,
  redraw: false,
  coords: { latitude: 0, longitude: 0 },
  field: { name: id },
  updatedAt: 100,
  uploaded: true,
});

const setup = (role: RoleType, dataSet: DataType[]) => {
  mockIsOwnerAdmin = role === 'OWNER' || role === 'ADMIN';
  const initial = rootReducer(undefined, { type: '@@INIT' });
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: {
      ...initial,
      dataSet,
      layers: [
        { id: 'L', name: 'L', type: 'POINT', permission: 'PUBLIC', field: [{ id: 'f', name: 'name', format: 'STRING' }], active: true } as unknown as LayerType,
      ],
      user: { uid: 'me', email: '', displayName: 'Me', photoURL: '' },
      settings: { ...initial.settings, projectId: 'p1', isSettingProject: false, role },
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ immutableCheck: false, serializableCheck: false }),
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const { result } = renderHook(() => useData('L'), { wrapper });
  return { store, result };
};

const bucket = (dataSet: DataType[], userId: string) => dataSet.find((d) => d.userId === userId)?.data ?? [];

describe('useData.deleteRecords と他のメンバーの記録', () => {
  const dataSet = (): DataType[] => [
    { layerId: 'L', userId: 'me', data: [rec('mine', 'me')] },
    { layerId: 'L', userId: 'owner', data: [rec('theirs', 'owner')] },
  ];

  it('一般メンバーは、他のメンバーの記録を含む一括削除ができず、自分の記録も消さずに理由を返す', () => {
    const { store, result } = setup('MEMBER', dataSet());
    act(() => {
      result.current.changeCheckedAll(true);
    });
    let res: { isOK: boolean; message: string } | undefined;
    act(() => {
      res = result.current.deleteRecords();
    });
    expect(res?.isOK).toBe(false);
    expect(res?.message).toContain(t('hooks.message.recordModifyAdminOnly'));
    expect(store.getState().dataSet).toEqual(dataSet());
  });

  it('管理者は、他のメンバーの記録も消せる（自分の名義に引き継いだ墓標を持つ）', () => {
    const { store, result } = setup('ADMIN', dataSet());
    act(() => {
      result.current.changeCheckedAll(true);
    });
    let res: { isOK: boolean; message: string } | undefined;
    act(() => {
      res = result.current.deleteRecords();
    });
    expect(res?.isOK).toBe(true);
    const state = store.getState().dataSet;
    expect(bucket(state, 'owner')).toEqual([]);
    const mine = bucket(state, 'me');
    expect(mine.find((r) => r.id === 'mine')).toMatchObject({ deleted: true });
    expect(mine.find((r) => r.id === 'theirs')).toMatchObject({ deleted: true, takenOverFrom: ['owner'] });
  });
});
