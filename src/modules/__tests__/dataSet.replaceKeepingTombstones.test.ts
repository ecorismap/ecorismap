import reducer, { replaceRecordsKeepingTombstonesAction } from '../dataSet';
import { DataType, RecordType } from '../../types';

const rec = (id: string, extra: Partial<RecordType> = {}): RecordType => ({
  id,
  userId: 'u1',
  displayName: 'U',
  visible: true,
  redraw: false,
  coords: undefined,
  field: {},
  ...extra,
});

test('置き換えで消えるアップロード済みの記録は墓標で残し、未アップロードの記録は消す（同期監査 S3 の再レビュー）', () => {
  const state: DataType[] = [
    { layerId: 'l1', userId: 'u1', data: [rec('old', { uploaded: true }), rec('local'), rec('keep', { uploaded: true }), rec('tomb', { deleted: true })] },
  ];
  const next = reducer(state, replaceRecordsKeepingTombstonesAction({ layerId: 'l1', userId: 'u1', data: [rec('keep', { field: { v: 'new' } }), rec('fresh')] }));
  expect(next[0].data.map((r) => [r.id, r.deleted ?? false])).toEqual([
    ['keep', false],
    ['fresh', false],
    ['old', true],
    ['tomb', true],
  ]);
  expect(next[0].data[2].updatedAt).toEqual(expect.any(Number));
});

test('集合が無ければ追加する', () => {
  const next = reducer([], replaceRecordsKeepingTombstonesAction({ layerId: 'l1', userId: 'u1', data: [rec('a')] }));
  expect(next).toEqual([{ layerId: 'l1', userId: 'u1', data: [rec('a')] }]);
});
