/**
 * 管理者が他のメンバーの記録を引き継いだ（編集・削除した）あとの取得とマージ（docs/SYNC_AUDIT_2026-11.md の M8・L1）
 */
jest.mock('../../i18n/config', () => ({ t: (key: string) => key }));
import { buildCommonAbsorption, getTargetRecordSet, mergeCommonRecords, mergeLayerData } from '../Data';
import { dropRecordsResolvedAway } from '../recordTakeover';
import { DataType, LayerType, RecordType, UserType } from '../../types';

const rec = (id: string, userId: string, updatedAt: number, extra: Partial<RecordType> = {}): RecordType => ({
  id,
  userId,
  displayName: userId,
  visible: true,
  redraw: false,
  coords: undefined,
  field: { v: `${id}-${userId}` },
  updatedAt,
  uploaded: true,
  ...extra,
});

const publicLayer = { id: 'L', permission: 'PUBLIC' } as LayerType;
const user = (uid: string): UserType => ({ uid, email: '', displayName: uid, photoURL: '' });

describe('mergeLayerData と引き継ぎ', () => {
  test('管理者の削除（墓標）を取得したメンバーは、元の持ち主の版を競合にせず消す', async () => {
    const conflictsResolver = jest.fn();
    const [merged] = await mergeLayerData({
      layerData: [
        { layerId: 'L', userId: 'owner', data: [rec('x', 'owner', 100), rec('y', 'owner', 100)] },
        { layerId: 'L', userId: 'admin', data: [rec('x', 'admin', 200, { deleted: true, takenOverFrom: ['owner'] })] },
      ],
      templateData: undefined,
      ownUserId: 'member',
      strategy: 'manual',
      conflictsResolver,
    });
    expect(conflictsResolver).not.toHaveBeenCalled();
    expect(merged.find((d) => d.userId === 'owner')?.data.map((r) => r.id)).toEqual(['y']);
    expect(merged.find((d) => d.userId === 'admin')?.data[0]).toMatchObject({ id: 'x', deleted: true });
  });

  test('元の持ち主の端末では、引き継がれた記録が自分の名義から外れる（次のアップロードで送らない）', async () => {
    const conflictsResolver = jest.fn();
    const [merged] = await mergeLayerData({
      layerData: [
        { layerId: 'L', userId: 'admin', data: [rec('x', 'admin', 200, { takenOverFrom: ['owner'] })] },
        // 手元の自分の記録（Home の取得は手元の自分の分を加えて渡す）
        { layerId: 'L', userId: 'owner', data: [rec('x', 'owner', 100)] },
      ],
      templateData: undefined,
      ownUserId: 'owner',
      strategy: 'manual',
      conflictsResolver,
    });
    expect(conflictsResolver).not.toHaveBeenCalled();
    expect(merged.some((d) => d.userId === 'owner')).toBe(false);
    expect(merged.find((d) => d.userId === 'admin')?.data[0].field.v).toBe('x-admin');
  });

  test('元の持ち主が引き継ぎより後に直していれば、その版を採る（最新勝ち）', async () => {
    const [merged] = await mergeLayerData({
      layerData: [
        { layerId: 'L', userId: 'admin', data: [rec('x', 'admin', 200, { takenOverFrom: ['owner'] })] },
        { layerId: 'L', userId: 'owner', data: [rec('x', 'owner', 300)] },
      ],
      templateData: undefined,
      ownUserId: 'admin',
      strategy: 'manual',
      conflictsResolver: jest.fn(),
    });
    expect(merged.map((d) => d.userId)).toEqual(['owner']);
  });

  test('引き継ぎに関係ない人どうしの同じ id は、従来どおり競合として尋ねる', async () => {
    const conflictsResolver = jest.fn(async (candidates: RecordType[]) => candidates[0]);
    await mergeLayerData({
      layerData: [
        { layerId: 'L', userId: 'a', data: [rec('x', 'a', 100)] },
        { layerId: 'L', userId: 'b', data: [rec('x', 'b', 200)] },
      ],
      templateData: undefined,
      ownUserId: 'a',
      strategy: 'manual',
      conflictsResolver,
    });
    expect(conflictsResolver).toHaveBeenCalledTimes(1);
  });
});

describe('mergeLayerData とテンプレートの削除', () => {
  const tombstone = rec('t', 'admin', 300, { deleted: true, takenOverFrom: ['template'] });
  const memberCopy = rec('t', 'member', 200);
  const template = (): DataType => ({ layerId: 'L', userId: 'template', data: [rec('t', 'template', 100)] });

  test('テンプレートを自分の記録にしたメンバーの版と管理者の墓標は競合にせず、両方を残す（テンプレートは打ち消す）', async () => {
    const conflictsResolver = jest.fn();
    const [merged, mergedTemplate] = await mergeLayerData({
      layerData: [
        { layerId: 'L', userId: 'admin', data: [tombstone] },
        { layerId: 'L', userId: 'member', data: [memberCopy] },
      ],
      templateData: template(),
      ownUserId: 'member',
      strategy: 'manual',
      conflictsResolver,
    });
    expect(conflictsResolver).not.toHaveBeenCalled();
    expect(merged.find((d) => d.userId === 'member')?.data).toEqual([memberCopy]);
    expect(merged.find((d) => d.userId === 'admin')?.data).toEqual([tombstone]);
    expect(mergedTemplate).toBeUndefined();
  });

  test('管理者の端末でも同じ（取得のたびに競合が出ず、墓標が手元に残ってアップロードされ続ける）', async () => {
    const conflictsResolver = jest.fn();
    const [merged] = await mergeLayerData({
      layerData: [
        { layerId: 'L', userId: 'member', data: [memberCopy] },
        { layerId: 'L', userId: 'admin', data: [tombstone] },
      ],
      templateData: template(),
      ownUserId: 'admin',
      strategy: 'manual',
      conflictsResolver,
    });
    expect(conflictsResolver).not.toHaveBeenCalled();
    expect(merged.find((d) => d.userId === 'admin')?.data).toEqual([tombstone]);
    expect(merged.find((d) => d.userId === 'member')?.data).toEqual([memberCopy]);
  });

  test('利用者の版が無ければ、墓標がテンプレートを打ち消す（従来どおり）', async () => {
    const [merged, mergedTemplate] = await mergeLayerData({
      layerData: [{ layerId: 'L', userId: 'admin', data: [tombstone] }],
      templateData: template(),
      ownUserId: 'other',
      strategy: 'manual',
      conflictsResolver: jest.fn(),
    });
    expect(merged.find((d) => d.userId === 'admin')?.data).toEqual([tombstone]);
    expect(mergedTemplate).toBeUndefined();
  });

  test('利用者どうしの版は従来どおり競合として尋ねる（墓標は候補に入れない）', async () => {
    const other = rec('t', 'other', 250);
    const conflictsResolver = jest.fn(async (candidates: RecordType[]) => candidates[0]);
    await mergeLayerData({
      layerData: [
        { layerId: 'L', userId: 'admin', data: [tombstone] },
        { layerId: 'L', userId: 'member', data: [memberCopy] },
        { layerId: 'L', userId: 'other', data: [other] },
      ],
      templateData: template(),
      ownUserId: 'member',
      strategy: 'manual',
      conflictsResolver,
    });
    expect(conflictsResolver).toHaveBeenCalledTimes(1);
    expect(conflictsResolver.mock.calls[0][0]).toEqual([memberCopy, other]);
  });
});

describe('アップロードと引き継ぎ', () => {
  test('引き継ぎ元は自分の名義の doc にそのまま入る（取得した人の手元で打ち消すため）', () => {
    const dataSet: DataType[] = [
      { layerId: 'L', userId: 'admin', data: [rec('x', 'admin', 200, { deleted: true, takenOverFrom: ['owner'] })] },
    ];
    const [sent] = getTargetRecordSet(dataSet, publicLayer, user('admin'));
    expect(sent).toMatchObject({ id: 'x', deleted: true, takenOverFrom: ['owner'] });
  });

  test('テンプレートとして送るときは引き継ぎ元を持たせない', () => {
    const dataSet: DataType[] = [
      { layerId: 'L', userId: 'template', data: [rec('t', 'template', 100, { takenOverFrom: ['someone'] })] },
    ];
    const [sent] = getTargetRecordSet(dataSet, publicLayer, user('admin'), true);
    expect(sent.takenOverFrom).toBeUndefined();
  });

  test('元の持ち主のクラウドに残る古い版は、衝突の判定に使わない', () => {
    const cloudOwn = [rec('x', 'owner', 100)];
    const localOthers: DataType[] = [
      { layerId: 'L', userId: 'admin', data: [rec('x', 'admin', 200, { deleted: true, takenOverFrom: ['owner'] })] },
    ];
    expect(dropRecordsResolvedAway('L', 'owner', cloudOwn, localOthers)).toEqual([]);
  });
});

describe('COMMON のまとめと引き継ぎ', () => {
  test('mergeCommonRecords は、引き継いで消した記録を元の持ち主の古い版で戻さない', () => {
    const dataSet: DataType[] = [
      { layerId: 'L', userId: 'owner', data: [rec('x', 'owner', 100)] },
      { layerId: 'L', userId: 'admin', data: [rec('x', 'admin', 200, { deleted: true, takenOverFrom: ['owner'] })] },
    ];
    const merged = mergeCommonRecords(dataSet, 'L', 'admin');
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ userId: 'admin', deleted: true });
  });

  test('buildCommonAbsorption は、引き継がれた記録の元の版を別 id で取り込まない', () => {
    const cloud: DataType[] = [
      { layerId: 'L', userId: 'owner', data: [rec('x', 'owner', 100)] },
      { layerId: 'L', userId: 'admin', data: [rec('x', 'admin', 200, { takenOverFrom: ['owner'] })] },
    ];
    const result = buildCommonAbsorption({
      localDataSet: [],
      cloudCommonDataSet: cloud,
      layerIds: ['L'],
      ownUserId: 'me',
      newId: () => 'NEW',
    });
    const absorbed = result.extraCommonDataSet[0].data;
    expect(absorbed.map((r) => r.id)).toEqual(['x']);
    expect(absorbed[0].field.v).toBe('x-admin');
  });
});
