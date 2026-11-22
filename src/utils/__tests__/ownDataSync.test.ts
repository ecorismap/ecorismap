import { findSettingsMismatchedLayers, mergeOwnCloudRecords } from '../ownDataSync';
import { LayerType, RecordType } from '../../types';

const layer = (id: string, permission: LayerType['permission']) => ({ id, name: id, permission }) as LayerType;
const rec = (id: string, extra: Partial<RecordType> = {}): RecordType =>
  ({
    id,
    userId: 'me',
    displayName: 'me',
    visible: true,
    redraw: false,
    coords: [],
    field: {},
    updatedAt: 100,
    uploaded: true,
    ...extra,
  }) as RecordType;

describe('findSettingsMismatchedLayers（M10）', () => {
  it('クラウドの設定と権限が違うレイヤを返す', () => {
    const local = [layer('a', 'PRIVATE'), layer('b', 'PUBLIC')];
    const cloud = [layer('a', 'PUBLIC'), layer('b', 'PUBLIC')];
    expect(findSettingsMismatchedLayers(local, cloud).map((l) => l.id)).toEqual(['a']);
  });

  it('クラウドの設定から消えたレイヤも返す。track は旧プロジェクトの設定に無いことがあるので返さない', () => {
    const local = [layer('a', 'PUBLIC'), layer('track', 'PRIVATE')];
    expect(findSettingsMismatchedLayers(local, []).map((l) => l.id)).toEqual(['a']);
  });

  it('食い違いが無ければ空', () => {
    const local = [layer('a', 'PUBLIC')];
    expect(findSettingsMismatchedLayers(local, [layer('a', 'PUBLIC')])).toEqual([]);
  });
});

describe('mergeOwnCloudRecords（L4）', () => {
  const neverResolve = jest.fn(async (): Promise<RecordType> => {
    throw new Error('競合解決は呼ばれないはず');
  });

  beforeEach(() => neverResolve.mockClear());

  it('手元にしか無い記録は残し、クラウドにしか無い記録は足す', async () => {
    const res = await mergeOwnCloudRecords({
      localRecords: [rec('local', { uploaded: false })],
      cloudRecords: [rec('cloud')],
      resolve: neverResolve,
      now: 1000,
    });
    expect(res.records.map((r) => r.id)).toEqual(['local', 'cloud']);
    expect(res.hasLocalOnly).toBe(true);
    expect(neverResolve).not.toHaveBeenCalled();
  });

  it('同じ版なら手元を採り、手元はクラウドと同じとみなす', async () => {
    const local = rec('a');
    const res = await mergeOwnCloudRecords({
      localRecords: [local],
      cloudRecords: [rec('a')],
      resolve: neverResolve,
      now: 1000,
    });
    expect(res.records[0]).toBe(local);
    expect(res.hasLocalOnly).toBe(false);
  });

  it('手元の方が新しければ手元を採る（未アップロードの変更を消さない）', async () => {
    const local = rec('a', { updatedAt: 200 });
    const res = await mergeOwnCloudRecords({
      localRecords: [local],
      cloudRecords: [rec('a', { updatedAt: 150 })],
      resolve: neverResolve,
      now: 1000,
    });
    expect(res.records[0]).toBe(local);
    expect(res.hasLocalOnly).toBe(true);
  });

  it('クラウドの方が新しければ競合解決に手元・クラウドの順で渡し、クラウドを選べばそれを採る', async () => {
    const local = rec('a', { updatedAt: 100 });
    const cloud = rec('a', { updatedAt: 300, field: { name: 'cloud' } });
    const resolve = jest.fn(async (candidates: RecordType[]) => candidates[1]);
    const res = await mergeOwnCloudRecords({ localRecords: [local], cloudRecords: [cloud], resolve, now: 1000 });
    expect(resolve).toHaveBeenCalledWith([local, cloud], 'a');
    expect(res.records[0]).toBe(cloud);
    expect(res.hasLocalOnly).toBe(false);
  });

  it('クラウドの墓標の方が新しいときも競合解決で選ばせる', async () => {
    const local = rec('a', { updatedAt: 100 });
    const cloud = rec('a', { updatedAt: 300, deleted: true });
    const resolve = jest.fn(async (candidates: RecordType[]) => candidates[1]);
    const res = await mergeOwnCloudRecords({ localRecords: [local], cloudRecords: [cloud], resolve, now: 1000 });
    expect(res.records[0].deleted).toBe(true);
  });

  it('手元を選んだら、更新日時をクラウドの版より後に進める（次のアップロードで再び競合にならない）', async () => {
    const local = rec('a', { updatedAt: 100 });
    const cloud = rec('a', { updatedAt: 5000 });
    const resolve = jest.fn(async (candidates: RecordType[]) => candidates[0]);
    const res = await mergeOwnCloudRecords({ localRecords: [local], cloudRecords: [cloud], resolve, now: 1000 });
    expect(res.records[0].id).toBe('a');
    expect(res.records[0].updatedAt).toBe(5001);
    expect(res.hasLocalOnly).toBe(true);

    const later = await mergeOwnCloudRecords({
      localRecords: [local],
      cloudRecords: [rec('a', { updatedAt: 300 })],
      resolve,
      now: 1000,
    });
    expect(later.records[0].updatedAt).toBe(1000);
  });
});
