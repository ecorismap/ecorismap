import { LayerType, RecordType } from '../../types';
import { getDefaultField, getNumberingRecordSets } from '../Data';

//連番と前回値の数え方を一覧と地図で揃える（docs/DECISIONS_2026-11.md E-L1）

const rec = (id: string, userId: string | undefined, field: RecordType['field'], extra?: Partial<RecordType>): RecordType => ({
  id,
  userId,
  displayName: null,
  visible: true,
  redraw: false,
  coords: { latitude: 35, longitude: 139 },
  field,
  ...extra,
});

const layer = {
  id: 'L',
  name: 'L',
  type: 'POINT',
  permission: 'PRIVATE',
  field: [
    { id: 's', name: 'no', format: 'SERIAL' },
    { id: 'n', name: 'name', format: 'STRING', useLastValue: true },
  ],
} as unknown as LayerType;

describe('getNumberingRecordSets', () => {
  const own1 = rec('o1', 'me', { no: 1, name: '自分1' });
  const own2 = rec('o2', 'me', { no: 2, name: '自分2' });
  const template = [1, 2, 3, 4, 5].map((n) => rec(`t${n}`, 'template', { no: n, name: `テンプレ${n}` }));
  const other = rec('x', 'other', { no: 9, name: '他人' });
  const deleted = rec('d', 'me', { no: 20, name: '削除' }, { deleted: true });

  it('前回値は自分の記録の末尾、連番はレイヤの全記録の最大値（削除済みを除く）', () => {
    const sets = getNumberingRecordSets([own1, ...template, own2], [own1, own2, ...template, other, deleted], 'me');
    expect(sets.lastValueRecords.map((r) => r.id)).toEqual(['o1', 'o2']);
    expect(sets.serialRecords.map((r) => r.id).sort()).toEqual(['o1', 'o2', 't1', 't2', 't3', 't4', 't5', 'x'].sort());
  });

  it('一覧（全記録）と地図（自分・名義なし・テンプレート）の入口で同じ連番・前回値になる', () => {
    const displayed = [own1, own2, ...template, other];
    //一覧: 全ユーザーの記録、地図: テンプレートを後ろに連結した集合
    const fromList = getDefaultField(layer, [own1, own2], 'new1', {
      numbering: getNumberingRecordSets(displayed, displayed, 'me'),
    });
    const fromMap = getDefaultField(layer, [own1, own2, ...template], 'new2', {
      numbering: getNumberingRecordSets([own1, own2, ...template], displayed, 'me'),
    });
    expect(fromList).toEqual({ no: 10, name: '自分2' });
    expect(fromMap).toEqual({ no: 10, name: '自分2' });
  });

  it('作図の連続追加でまだストアに無い記録も連番に数える', () => {
    const pending = rec('p', 'me', { no: 3, name: '追加中' });
    const field = getDefaultField(layer, [own1, own2, pending], 'new', {
      numbering: getNumberingRecordSets([own1, own2, pending], [own1, own2], 'me'),
    });
    expect(field).toEqual({ no: 4, name: '追加中' });
  });

  it('numberingが無いときは従来どおり渡された集合で数える', () => {
    expect(getDefaultField(layer, [own1, own2], 'new')).toEqual({ no: 3, name: '自分2' });
  });
});
