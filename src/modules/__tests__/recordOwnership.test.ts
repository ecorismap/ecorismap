import rootReducer from '..';
import {
  deleteRecordsAction,
  moveRecordsToUserAction,
  updateRecordsAction,
  updateRecordsLocallyAction,
} from '../dataSet';
import { DataType, LayerType, PhotoType, RecordType, RoleType } from '../../types';
import { RootState } from '../../store';

const rec = (id: string, userId: string | undefined, extra: Partial<RecordType> = {}): RecordType => ({
  id,
  userId,
  displayName: userId ?? null,
  visible: true,
  redraw: false,
  coords: { latitude: 35, longitude: 135 },
  field: { name: id },
  updatedAt: 100,
  uploaded: true,
  ...extra,
});

const layer = (permission: LayerType['permission']): LayerType =>
  ({ id: 'L', name: 'L', type: 'POINT', permission, field: [], active: true }) as unknown as LayerType;

const makeState = ({
  role = 'MEMBER',
  permission = 'PUBLIC',
  isSettingProject = false,
  projectId = 'p1',
  dataSet,
}: {
  role?: RoleType;
  permission?: LayerType['permission'];
  isSettingProject?: boolean;
  projectId?: string | undefined;
  dataSet: DataType[];
}): RootState => {
  const initial = rootReducer(undefined, { type: '@@INIT' });
  return {
    ...initial,
    dataSet,
    layers: [layer(permission)],
    user: { uid: 'me', email: '', displayName: 'Me', photoURL: '' },
    settings: { ...initial.settings, projectId, isSettingProject, role },
  };
};

const bucket = (state: RootState, userId: string | undefined) =>
  state.dataSet.find((d) => d.layerId === 'L' && d.userId === userId)?.data ?? [];

describe('所有権の規則（他のメンバー・テンプレートの記録の変更と削除）', () => {
  const others = (): DataType[] => [
    { layerId: 'L', userId: 'owner', data: [rec('x', 'owner'), rec('y', 'owner')] },
    { layerId: 'L', userId: 'me', data: [] },
  ];

  it('管理者が他人の記録を消すと、元の名義から外し、自分の名義に引き継ぎ元付きの墓標を持つ（M8）', () => {
    const state = makeState({ role: 'ADMIN', dataSet: others() });
    const next = rootReducer(state, deleteRecordsAction({ layerId: 'L', userId: 'owner', data: [rec('x', 'owner')] }));
    expect(bucket(next, 'owner').map((r) => r.id)).toEqual(['y']);
    const [tombstone] = bucket(next, 'me');
    expect(tombstone).toMatchObject({ id: 'x', userId: 'me', displayName: 'Me', deleted: true, takenOverFrom: ['owner'] });
    expect(tombstone.updatedAt).toBeGreaterThan(100);
  });

  it('一般メンバーが他人の記録を消そうとしても何も変わらない', () => {
    const state = makeState({ role: 'MEMBER', dataSet: others() });
    const next = rootReducer(state, deleteRecordsAction({ layerId: 'L', userId: 'owner', data: [rec('x', 'owner')] }));
    expect(next.dataSet).toBe(state.dataSet);
  });

  it('一般メンバーはテンプレートの記録を消せない', () => {
    const state = makeState({
      role: 'MEMBER',
      dataSet: [{ layerId: 'L', userId: 'template', data: [rec('t', 'template')] }],
    });
    const next = rootReducer(state, deleteRecordsAction({ layerId: 'L', userId: 'template', data: [rec('t', 'template')] }));
    expect(next.dataSet).toBe(state.dataSet);
  });

  it('管理者が公開レイヤでテンプレートの記録を消すと、テンプレートを打ち消す墓標を自分の名義に持つ', () => {
    const state = makeState({
      role: 'OWNER',
      dataSet: [{ layerId: 'L', userId: 'template', data: [rec('t', 'template')] }],
    });
    const next = rootReducer(state, deleteRecordsAction({ layerId: 'L', userId: 'template', data: [rec('t', 'template')] }));
    expect(bucket(next, 'template')).toEqual([]);
    expect(bucket(next, 'me')[0]).toMatchObject({ id: 't', deleted: true, takenOverFrom: ['template'] });
  });

  it('管理者が他人の記録を編集すると、引き継ぎ元付きで自分の名義へ移す（L1）', () => {
    const state = makeState({ role: 'ADMIN', dataSet: others() });
    const edited = { ...rec('x', 'owner'), field: { name: 'edited' }, updatedAt: 500 };
    const next = rootReducer(
      state,
      moveRecordsToUserAction({ layerId: 'L', fromUserId: 'owner', toUserId: 'me', toDisplayName: 'Me', data: [edited] })
    );
    expect(bucket(next, 'owner').map((r) => r.id)).toEqual(['y']);
    expect(bucket(next, 'me')[0]).toMatchObject({
      id: 'x',
      userId: 'me',
      field: { name: 'edited' },
      takenOverFrom: ['owner'],
      updatedAt: 500,
    });
    expect(bucket(next, 'me')[0].deleted).toBeUndefined();
  });

  it('作図などで他人の名義のまま書き換えても、管理者なら引き継ぎになる', () => {
    const state = makeState({ role: 'ADMIN', dataSet: others() });
    const next = rootReducer(
      state,
      updateRecordsAction({ layerId: 'L', userId: 'owner', data: [{ ...rec('x', 'owner'), coords: { latitude: 1, longitude: 2 } }] })
    );
    expect(bucket(next, 'owner').map((r) => r.id)).toEqual(['y']);
    expect(bucket(next, 'me')[0]).toMatchObject({ id: 'x', takenOverFrom: ['owner'], coords: { latitude: 1, longitude: 2 } });
  });

  it('一般メンバーの他人の記録の編集は、移しも書き換えもしない', () => {
    const state = makeState({ role: 'MEMBER', dataSet: others() });
    const edited = { ...rec('x', 'owner'), field: { name: 'edited' } };
    const moved = rootReducer(
      state,
      moveRecordsToUserAction({ layerId: 'L', fromUserId: 'owner', toUserId: 'me', toDisplayName: 'Me', data: [edited] })
    );
    expect(moved.dataSet).toBe(state.dataSet);
    const updated = rootReducer(state, updateRecordsAction({ layerId: 'L', userId: 'owner', data: [edited] }));
    expect(updated.dataSet).toBe(state.dataSet);
  });

  it('表示の切り替えや手元の写真のパスだけの変更は、他人の記録でもそのまま通す', () => {
    const photo = { id: 'p', name: 'a.jpg', url: 'https://x', uri: null, width: 1, height: 1, thumbnail: null, key: null };
    const withPhoto = rec('x', 'owner', { field: { name: 'x', photo: [photo as unknown as PhotoType] } });
    const state = makeState({ role: 'MEMBER', dataSet: [{ layerId: 'L', userId: 'owner', data: [withPhoto] }] });
    const next = rootReducer(
      state,
      updateRecordsAction({
        layerId: 'L',
        userId: 'owner',
        data: [{ ...withPhoto, visible: false, field: { name: 'x', photo: [{ ...photo, uri: 'file:///a.jpg' } as unknown as PhotoType] } }],
      })
    );
    expect(bucket(next, 'owner')[0].visible).toBe(false);
    expect((bucket(next, 'owner')[0].field.photo as PhotoType[])[0].uri).toBe('file:///a.jpg');
  });

  it('テンプレートの記録の編集は、一般メンバーでも従来どおり自分の記録に持ち替える（引き継ぎ元は付けない）', () => {
    const state = makeState({
      role: 'MEMBER',
      dataSet: [{ layerId: 'L', userId: 'template', data: [rec('t', 'template')] }],
    });
    const next = rootReducer(
      state,
      updateRecordsAction({ layerId: 'L', userId: 'template', data: [{ ...rec('t', 'template'), field: { name: 'mine' } }] })
    );
    expect(bucket(next, 'template')[0]).toMatchObject({ id: 't', deleted: true });
    expect(bucket(next, 'me')[0]).toMatchObject({ id: 't', userId: 'me', field: { name: 'mine' } });
    expect(bucket(next, 'me')[0].takenOverFrom).toBeUndefined();
  });

  it('非公開レイヤでは管理者でも他人の記録を変えられない', () => {
    const state = makeState({ role: 'ADMIN', permission: 'PRIVATE', dataSet: others() });
    const next = rootReducer(state, deleteRecordsAction({ layerId: 'L', userId: 'owner', data: [rec('x', 'owner')] }));
    expect(next.dataSet).toBe(state.dataSet);
  });

  it('設定モード・閉じたプロジェクトでは従来どおり元の集合を書き換える', () => {
    const setting = makeState({ role: 'ADMIN', isSettingProject: true, dataSet: others() });
    const next = rootReducer(setting, deleteRecordsAction({ layerId: 'L', userId: 'owner', data: [rec('x', 'owner')] }));
    expect(bucket(next, 'owner')[0]).toMatchObject({ id: 'x', deleted: true });
    expect(bucket(next, 'me')).toEqual([]);
  });

  it('updateRecordsLocallyAction は規則を通さず、手元の写しだけを書き換える', () => {
    const state = makeState({ role: 'ADMIN', dataSet: others() });
    const next = rootReducer(
      state,
      updateRecordsLocallyAction({ layerId: 'L', userId: 'owner', data: [{ ...rec('x', 'owner'), field: { name: 'renamed' } }] })
    );
    expect(bucket(next, 'owner')[0].field.name).toBe('renamed');
    expect(bucket(next, 'me')).toEqual([]);
  });

  it('引き継いだ記録を直しても引き継ぎ元は残り、消すと未同期でも墓標が残る', () => {
    const taken = rec('x', 'me', { takenOverFrom: ['owner'], uploaded: undefined });
    const state = makeState({ role: 'ADMIN', dataSet: [{ layerId: 'L', userId: 'me', data: [taken] }] });
    const edited = rootReducer(
      state,
      updateRecordsAction({ layerId: 'L', userId: 'me', data: [{ ...rec('x', 'me'), field: { name: 'again' } }] })
    );
    expect(bucket(edited, 'me')[0].takenOverFrom).toEqual(['owner']);
    const deleted = rootReducer(edited, deleteRecordsAction({ layerId: 'L', userId: 'me', data: [rec('x', 'me')] }));
    expect(bucket(deleted, 'me')[0]).toMatchObject({ id: 'x', deleted: true, takenOverFrom: ['owner'] });
  });
});
