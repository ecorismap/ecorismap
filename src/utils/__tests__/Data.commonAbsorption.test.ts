/**
 * 設定の保存で COMMON をまとめるときの取り込み（docs/SYNC_AUDIT_2026-11.md の S2・S3）
 */
jest.mock('../../i18n/config', () => ({ t: (key: string) => key }));
import { buildCommonAbsorption, mergeCommonRecords, mergeLayerData } from '../Data';
import { DataType, RecordType } from '../../types';

const rec = (id: string, extra: Partial<RecordType> = {}): RecordType => ({
  id,
  userId: 'u1',
  displayName: 'U',
  visible: true,
  redraw: false,
  coords: undefined,
  field: {},
  updatedAt: 100,
  ...extra,
});

let counter = 0;
const newId = () => `NEW${++counter}`;
beforeEach(() => {
  counter = 0;
});

describe('buildCommonAbsorption', () => {
  test('手元に無いクラウドの記録だけを取り込み、手元で削除した（墓標のある）記録は戻さない', () => {
    const local: DataType[] = [{ layerId: 'c1', userId: 'me', data: [rec('a'), rec('d', { deleted: true })] }];
    const cloud: DataType[] = [
      { layerId: 'c1', userId: 'other', data: [rec('a', { field: { v: 'stale' } }), rec('d'), rec('b')] },
    ];
    const result = buildCommonAbsorption({ localDataSet: local, cloudCommonDataSet: cloud, layerIds: ['c1'], ownUserId: 'me', newId });
    expect(result.extraCommonDataSet).toEqual([{ layerId: 'c1', userId: 'me', data: [rec('b')] }]);
    expect(result.representedUserIds).toEqual({ c1: ['other'] });
  });

  test('別々のメンバーが同じ id（テンプレート由来）の記録を持つときは、新しい id を振って両方残し、_group も付け替える', () => {
    const cloud: DataType[] = [
      { layerId: 'c1', userId: 'm1', data: [rec('T', { field: { v: 'm1' } })] },
      {
        layerId: 'c1',
        userId: 'm2',
        data: [rec('T', { field: { v: 'm2' } }), rec('child', { field: { _group: 'T' } })],
      },
    ];
    const result = buildCommonAbsorption({ localDataSet: [], cloudCommonDataSet: cloud, layerIds: ['c1'], ownUserId: 'me', newId });
    const data = result.extraCommonDataSet[0].data;
    expect(data.map((r) => r.id)).toEqual(['T', 'NEW1', 'child']);
    expect(data[1].field).toEqual({ v: 'm2' });
    expect(data[2].field._group).toBe('NEW1');
    expect(result.representedUserIds.c1.sort()).toEqual(['m1', 'm2']);
  });

  test('編集版の無いテンプレートの記録は共通データへ移し、メンバーが編集した id のテンプレートは移さない', () => {
    const local: DataType[] = [{ layerId: 'c1', userId: 'template', data: [rec('t1'), rec('t2'), rec('t3', { deleted: true })] }];
    const cloud: DataType[] = [{ layerId: 'c1', userId: 'm1', data: [rec('t1', { field: { v: 'edited' } })] }];
    const result = buildCommonAbsorption({ localDataSet: local, cloudCommonDataSet: cloud, layerIds: ['c1'], ownUserId: 'me', newId });
    expect(result.extraCommonDataSet[0].data.map((r) => r.id)).toEqual(['t1', 't2']);
    expect(result.extraCommonDataSet[0].data[0].field).toEqual({ v: 'edited' });
  });

  test('復号できず結果に無い人は、片付けの対象に入れない', () => {
    const local: DataType[] = [{ layerId: 'c1', userId: 'admin1', data: [rec('x')] }];
    const result = buildCommonAbsorption({ localDataSet: local, cloudCommonDataSet: [], layerIds: ['c1'], ownUserId: 'me', newId });
    // 手元にある（開いたときに取得済みの）人は消してよい。クラウドの結果に無く手元にも無い人は対象にならない
    expect(result.representedUserIds).toEqual({ c1: ['admin1'] });
    expect(result.extraCommonDataSet).toEqual([]);
  });
});

describe('mergeCommonRecords', () => {
  test('墓標と編集して移った版の組は、削除されていない版を採る', () => {
    const dataSet: DataType[] = [
      { layerId: 'c1', userId: 'admin1', data: [rec('X', { deleted: true, updatedAt: 200 })] },
      { layerId: 'c1', userId: 'me', data: [rec('X', { field: { v: 'edited' }, updatedAt: 200 }), rec('Y')] },
    ];
    const merged = mergeCommonRecords(dataSet, 'c1', 'me');
    expect(merged.map((r) => [r.id, r.deleted ?? false, r.field.v])).toEqual([
      ['X', false, 'edited'],
      ['Y', false, undefined],
    ]);
  });
});

describe('mergeLayerData の latest', () => {
  test('updatedAt の無い手元の版は、クラウドの新しい編集に勝たない', async () => {
    const local: DataType = { layerId: 'l1', userId: 'u1', data: [rec('x', { updatedAt: undefined, field: { v: 'old' } })] };
    const cloud: DataType = { layerId: 'l1', userId: 'u1', data: [rec('x', { updatedAt: 100, field: { v: 'new' } })] };
    const [merged] = await mergeLayerData({ layerData: [local, cloud], templateData: undefined, ownUserId: 'u1', strategy: 'latest' });
    expect(merged[0].data[0].field.v).toBe('new');
  });

  test('同じ時刻なら先頭（手元）を採る', async () => {
    const local: DataType = { layerId: 'l1', userId: 'u1', data: [rec('x', { field: { v: 'local' } })] };
    const cloud: DataType = { layerId: 'l1', userId: 'u1', data: [rec('x', { field: { v: 'cloud' } })] };
    const [merged] = await mergeLayerData({ layerData: [local, cloud], templateData: undefined, ownUserId: 'u1', strategy: 'latest' });
    expect(merged[0].data[0].field.v).toBe('local');
  });
});

describe('buildCommonAbsorption（再レビューの場面）', () => {
  test('管理者が設定モードでテンプレートを編集していても、メンバーの編集版は新しい id で残す', () => {
    const local: DataType[] = [
      { layerId: 'c1', userId: 'template', data: [rec('T', { deleted: true })] },
      { layerId: 'c1', userId: 'me', data: [rec('T', { field: { v: 'admin' }, updatedAt: 5 })] },
    ];
    const cloud: DataType[] = [
      { layerId: 'c1', userId: 'A', data: [rec('T', { field: { v: 'member' }, updatedAt: 10 }), rec('N1')] },
    ];
    const result = buildCommonAbsorption({ localDataSet: local, cloudCommonDataSet: cloud, layerIds: ['c1'], ownUserId: 'me', newId });
    const data = result.extraCommonDataSet[0].data;
    expect(data.map((r) => [r.id, r.field.v])).toEqual([
      ['NEW1', 'member'],
      ['N1', undefined],
    ]);
  });

  test('メンバーがテンプレートを自分の表示から消した墓標は取り込まず、テンプレートは共通データに移す', () => {
    const local: DataType[] = [{ layerId: 'c1', userId: 'template', data: [rec('T', { field: { v: 'tpl' } })] }];
    const cloud: DataType[] = [{ layerId: 'c1', userId: 'A', data: [rec('T', { deleted: true, updatedAt: 300 })] }];
    const result = buildCommonAbsorption({ localDataSet: local, cloudCommonDataSet: cloud, layerIds: ['c1'], ownUserId: 'me', newId });
    expect(result.extraCommonDataSet[0].data.map((r) => [r.id, r.deleted ?? false, r.field.v])).toEqual([['T', false, 'tpl']]);
  });

  test('片付けに失敗して保存し直しても、前回取り込んだ記録を複製しない', () => {
    const local: DataType[] = [{ layerId: 'c1', userId: 'template', data: [rec('T')] }];
    const m1T = rec('T', { field: { v: 'm1' }, updatedAt: 10 });
    const m2T = rec('T', { field: { v: 'm2' }, updatedAt: 20 });
    // 1回目: m1・m2 の doc から取り込み、m2 の T は NEW1 になる
    const first = buildCommonAbsorption({
      localDataSet: local,
      cloudCommonDataSet: [
        { layerId: 'c1', userId: 'm1', data: [rec('R1'), m1T] },
        { layerId: 'c1', userId: 'm2', data: [rec('R2'), m2T] },
      ],
      layerIds: ['c1'],
      ownUserId: 'me',
      newId,
    });
    const ownDoc = first.extraCommonDataSet[0].data;
    expect(ownDoc.map((r) => r.id)).toEqual(['R1', 'T', 'R2', 'NEW1']);
    // 2回目: 自分の doc は書けたが他人名義の doc が残っている（手元はそろえ損ねた最悪の場合でも重ねない）
    const retry = buildCommonAbsorption({
      localDataSet: local,
      cloudCommonDataSet: [
        { layerId: 'c1', userId: 'm2', data: [rec('R2'), m2T] },
        { layerId: 'c1', userId: 'me', data: ownDoc },
        { layerId: 'c1', userId: 'm1', data: [rec('R1'), m1T] },
      ],
      layerIds: ['c1'],
      ownUserId: 'me',
      newId,
    });
    expect(retry.extraCommonDataSet[0].data.map((r) => r.id)).toEqual(['R1', 'T', 'R2', 'NEW1']);
  });
});
