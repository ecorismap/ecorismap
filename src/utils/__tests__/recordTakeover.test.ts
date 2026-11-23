import { DataType, RecordType } from '../../types';
import {
  addTakenOverFrom,
  applyTakeoversToDataSet,
  dropRecordsResolvedAway,
  getRecordModifyBlock,
  resolveTakeoverCandidates,
  separateTemplateDeletionTombstones,
} from '../recordTakeover';

const rec = (id: string, userId: string | undefined, updatedAt: number, extra: Partial<RecordType> = {}): RecordType => ({
  id,
  userId,
  displayName: userId ?? null,
  visible: true,
  redraw: false,
  coords: { latitude: 35, longitude: 135 },
  field: { name: `${id}-${userId}` },
  updatedAt,
  ...extra,
});

describe('getRecordModifyBlock', () => {
  const base = { ownUserId: 'me', isRunningProject: true };

  it('自分の記録・ログイン前の記録はいつでも変えられる', () => {
    for (const recordUserId of ['me', undefined]) {
      expect(
        getRecordModifyBlock({ ...base, layer: { permission: 'PUBLIC' }, recordUserId, action: 'delete', isOwnerAdmin: false })
      ).toBeUndefined();
    }
  });

  it('一般メンバーは他人の記録もテンプレートの削除もできない。テンプレートの編集（自分の記録への持ち替え）はできる', () => {
    const layer = { permission: 'PUBLIC' as const };
    expect(getRecordModifyBlock({ ...base, layer, recordUserId: 'other', action: 'edit', isOwnerAdmin: false })).toBe(
      'adminOnly'
    );
    expect(getRecordModifyBlock({ ...base, layer, recordUserId: 'other', action: 'delete', isOwnerAdmin: false })).toBe(
      'adminOnly'
    );
    expect(getRecordModifyBlock({ ...base, layer, recordUserId: 'template', action: 'delete', isOwnerAdmin: false })).toBe(
      'adminOnly'
    );
    expect(
      getRecordModifyBlock({ ...base, layer, recordUserId: 'template', action: 'edit', isOwnerAdmin: false })
    ).toBeUndefined();
  });

  it('管理者は公開レイヤで他人・テンプレートの記録を変えられる。非公開レイヤ・共通データでは変えられない', () => {
    expect(
      getRecordModifyBlock({ ...base, layer: { permission: 'PUBLIC' }, recordUserId: 'other', action: 'delete', isOwnerAdmin: true })
    ).toBeUndefined();
    expect(
      getRecordModifyBlock({ ...base, layer: { permission: 'PRIVATE' }, recordUserId: 'other', action: 'edit', isOwnerAdmin: true })
    ).toBe('privateLayer');
    expect(
      getRecordModifyBlock({
        ...base,
        layer: { permission: 'PRIVATE' },
        recordUserId: 'template',
        action: 'delete',
        isOwnerAdmin: true,
      })
    ).toBe('privateLayer');
    expect(
      getRecordModifyBlock({ ...base, layer: { permission: 'COMMON' }, recordUserId: 'other', action: 'edit', isOwnerAdmin: true })
    ).toBe('commonLayer');
  });

  it('設定モード・閉じたプロジェクトでは従来どおり何も止めない', () => {
    expect(
      getRecordModifyBlock({
        layer: { permission: 'PUBLIC' },
        recordUserId: 'other',
        action: 'delete',
        ownUserId: 'me',
        isOwnerAdmin: false,
        isRunningProject: false,
      })
    ).toBeUndefined();
  });
});

describe('addTakenOverFrom', () => {
  it('重複を除いて順に足す', () => {
    expect(addTakenOverFrom(['a'], 'b', 'a', undefined, 'c')).toEqual(['a', 'b', 'c']);
    expect(addTakenOverFrom(undefined, 'a')).toEqual(['a']);
  });
});

describe('resolveTakeoverCandidates', () => {
  it('引き継いだ版のほうが新しければ、引き継ぎ元の版を打ち消す（競合にしない）', () => {
    const original = rec('x', 'owner', 100);
    const taken = rec('x', 'admin', 200, { takenOverFrom: ['owner'] });
    expect(resolveTakeoverCandidates([original, taken])).toEqual([taken]);
  });

  it('管理者の削除（墓標）も引き継ぎ元の版を打ち消す', () => {
    const original = rec('x', 'owner', 100);
    const tombstone = rec('x', 'admin', 200, { takenOverFrom: ['owner'], deleted: true });
    expect(resolveTakeoverCandidates([original, tombstone])).toEqual([tombstone]);
  });

  it('元の持ち主がその後さらに直していれば、そちらを採り、引き継いだ版を捨てる（レコード単位の最新勝ち）', () => {
    const later = rec('x', 'owner', 300);
    const taken = rec('x', 'admin', 200, { takenOverFrom: ['owner'] });
    expect(resolveTakeoverCandidates([later, taken])).toEqual([later]);
  });

  it('引き継ぎに関係ない人の版は残す（従来どおりの競合）', () => {
    const original = rec('x', 'owner', 100);
    const taken = rec('x', 'admin', 200, { takenOverFrom: ['owner'] });
    const third = rec('x', 'third', 150);
    expect(resolveTakeoverCandidates([original, taken, third])).toEqual([taken, third]);
  });

  it('引き継ぎが重なっても、途中の持ち主と最初の持ち主の版をどちらも打ち消す', () => {
    const first = rec('x', 'owner', 100);
    const second = rec('x', 'admin1', 200, { takenOverFrom: ['owner'] });
    const third = rec('x', 'admin2', 300, { takenOverFrom: ['owner', 'admin1'] });
    expect(resolveTakeoverCandidates([first, second, third])).toEqual([third]);
  });

  it('テンプレートからの引き継ぎはテンプレートの版を打ち消す', () => {
    const template = rec('x', 'template', 100);
    const tombstone = rec('x', 'admin', 200, { takenOverFrom: ['template'], deleted: true });
    expect(resolveTakeoverCandidates([template, tombstone])).toEqual([tombstone]);
  });
});

describe('applyTakeoversToDataSet / dropRecordsResolvedAway', () => {
  it('target の記録だけを除き、context は比べるためだけに使う', () => {
    const target: DataType[] = [{ layerId: 'L', userId: 'owner', data: [rec('x', 'owner', 100), rec('y', 'owner', 100)] }];
    const context: DataType[] = [{ layerId: 'L', userId: 'admin', data: [rec('x', 'admin', 200, { takenOverFrom: ['owner'] })] }];
    const result = applyTakeoversToDataSet(target, context);
    expect(result[0].data.map((r) => r.id)).toEqual(['y']);
  });

  it('別レイヤの同じ id には効かない。変わらない集合は同じ参照を返す', () => {
    const target: DataType[] = [{ layerId: 'L1', userId: 'owner', data: [rec('x', 'owner', 100)] }];
    const context: DataType[] = [{ layerId: 'L2', userId: 'admin', data: [rec('x', 'admin', 200, { takenOverFrom: ['owner'] })] }];
    const result = applyTakeoversToDataSet(target, context);
    expect(result[0]).toBe(target[0]);
  });

  it('アップロード前の衝突判定: クラウドの自分の版が、手元の引き継いだ版に打ち消されるなら除く', () => {
    const cloudOwn = [rec('x', 'owner', 100), rec('y', 'owner', 100)];
    const localOthers: DataType[] = [
      { layerId: 'L', userId: 'admin', data: [rec('x', 'admin', 200, { takenOverFrom: ['owner'], deleted: true })] },
    ];
    expect(dropRecordsResolvedAway('L', 'owner', cloudOwn, localOthers).map((r) => r.id)).toEqual(['y']);
  });
});

describe('separateTemplateDeletionTombstones', () => {
  const r = (userId: string, extra: Partial<RecordType> = {}): RecordType =>
    ({ id: 'x', userId, displayName: userId, visible: true, redraw: false, coords: undefined, field: {}, updatedAt: 1, ...extra }) as RecordType;

  it('利用者の版があるときだけ、テンプレートの削除の墓標を候補から外す', () => {
    const tomb = r('admin', { deleted: true, takenOverFrom: ['template'] });
    const copy = r('member');
    expect(separateTemplateDeletionTombstones([tomb, copy])).toEqual({ candidates: [copy], tombstones: [tomb] });
    expect(separateTemplateDeletionTombstones([tomb])).toEqual({ candidates: [tomb], tombstones: [] });
    expect(separateTemplateDeletionTombstones([tomb, r('template')])).toEqual({
      candidates: [tomb, r('template')],
      tombstones: [],
    });
  });

  it('他人から引き継いだ墓標・同じ名義の版どうしは対象外（ふつうの競合・打ち消しに任せる）', () => {
    const takeover = r('admin', { deleted: true, takenOverFrom: ['owner'] });
    expect(separateTemplateDeletionTombstones([takeover, r('member')]).tombstones).toEqual([]);
    const tomb = r('admin', { deleted: true, takenOverFrom: ['template'] });
    expect(separateTemplateDeletionTombstones([tomb, r('admin')]).tombstones).toEqual([]);
  });
});


// 写真監査 P-M12: 引き継いだ版の url:null の写真は、打ち消した元の版で上がっていればそれを受け継ぐ
describe('引き継ぎで元の版の上がっている写真を受け継ぐ', () => {
  const photo = (extra: Record<string, unknown> = {}) => ({
    id: 'p1',
    name: 'a.jpg',
    uri: 'file:///member-device/a.jpg',
    url: null,
    key: null,
    width: 1,
    height: 1,
    thumbnail: null,
    ...extra,
  });
  const uploaded = photo({ url: 'https://x/member/p1', key: 'k1' });
  // 管理者が引き継いだ版（写真は撮影者の端末で上がる前のまま）と、撮影者が後から写真を上げた版
  const taken = rec('r1', 'admin', 200, { takenOverFrom: ['member'], field: { 写真: [photo()], memo: 'edited' } });
  const original = rec('r1', 'member', 100, { field: { 写真: [uploaded], memo: 'orig' } });

  it('resolveTakeoverCandidates は引き継いだ版を残し、写真の url/key だけを元の版から写す（uri と他の欄は引き継いだ版のまま）', () => {
    const [kept] = resolveTakeoverCandidates([taken, original]);
    expect(kept.userId).toBe('admin');
    expect(kept.field.memo).toBe('edited');
    expect(kept.field['写真']).toEqual([photo({ url: 'https://x/member/p1', key: 'k1' })]);
    // 元の記録は変えない
    expect(taken.field['写真']).toEqual([photo()]);
  });

  it('引き継いだ版に url があれば変えない。元の版にも url が無ければそのまま返す', () => {
    const takenUploaded = { ...taken, field: { 写真: [photo({ url: 'https://x/admin/p1', key: 'ka' })] } };
    expect(resolveTakeoverCandidates([takenUploaded, original])[0]).toBe(takenUploaded);
    const originalNotUploaded = { ...original, field: { 写真: [photo()] } };
    expect(resolveTakeoverCandidates([taken, originalNotUploaded])[0]).toBe(taken);
  });

  it('元の持ち主が後から直した版が勝つときは、その版をそのまま返す', () => {
    const newer = { ...original, updatedAt: 300 };
    expect(resolveTakeoverCandidates([taken, newer])).toEqual([newer]);
  });

  it('applyTakeoversToDataSet は inheritUploadedPhotos を指定したときだけ受け継いだ版に差し替える', () => {
    const target: DataType[] = [
      { layerId: 'l1', userId: 'admin', data: [taken] },
      { layerId: 'l1', userId: 'member', data: [original] },
    ];
    const withInherit = applyTakeoversToDataSet(target, [], { inheritUploadedPhotos: true });
    expect(withInherit[0].data[0].field['写真']).toEqual([photo({ url: 'https://x/member/p1', key: 'k1' })]);
    expect(withInherit[1].data).toEqual([]);

    // 版の中身を比べる処理（COMMON の統合など）では差し替えない（同じ参照のまま）
    const plain = applyTakeoversToDataSet(target);
    expect(plain[0]).toBe(target[0]);
    expect(plain[1].data).toEqual([]);
  });
});
