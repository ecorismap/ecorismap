import { FieldType, RecordType } from '../../types';
import {
  changeFieldValue,
  checkFieldInput,
  getHeaderToggleState,
  isFilterTargetAvailable,
  isRecordNumberChangeable,
  sortData,
} from '../Data';
import { formattedInputs } from '../Format';
import { LayerType } from '../../types';

//データ編集・作図の監査（docs/EDIT_AUDIT_2026-11.md）の修正

const rec = (id: string, field: RecordType['field']): RecordType => ({
  id,
  userId: 'u1',
  displayName: 'u1',
  visible: true,
  redraw: false,
  coords: { latitude: 0, longitude: 0 },
  field,
});

const ids = (records: RecordType[]) => records.map((r) => r.id);

describe('E-H2 属性のキーが無い記録', () => {
  it('並べ替えで2行目以降にキーが無くても例外にならず、空欄として並ぶ', () => {
    const data = [rec('a', { 個体数: 3 }), rec('b', {}), rec('c', { 個体数: 1 })];
    expect(() => sortData(data, '個体数', 'ASCENDING', 'INTEGER')).not.toThrow();
    expect(ids(sortData(data, '個体数', 'ASCENDING', 'INTEGER').data)).toEqual(['b', 'c', 'a']);
  });

  it('先頭の行にキーが無くても並べ替える', () => {
    const data = [rec('a', {}), rec('b', { name: 'イ' }), rec('c', { name: 'ア' })];
    expect(ids(sortData(data, 'name', 'ASCENDING', 'STRING').data)).toEqual(['a', 'c', 'b']);
  });

  it('nullの値（再起動でNaNがnullになったもの）でも例外にならない', () => {
    const data = [rec('a', { 個体数: 2 }), rec('b', { 個体数: null as unknown as number })];
    expect(() => sortData(data, '個体数', 'DESCENDING', 'INTEGER')).not.toThrow();
  });

  it('どの記録にも列が無いときは並べ替えない', () => {
    const data = [rec('a', {}), rec('b', {})];
    expect(sortData(data, 'gone', 'ASCENDING', 'STRING')).toEqual({ data, idx: [0, 1] });
  });

  it('DATETIMEで先頭の行にキーが無くても時刻で並べ、未入力は末尾に置く', () => {
    const data = [
      rec('a', {}),
      rec('b', { 日時: '2026-11-02T10:00:00+09:00' }),
      rec('c', { 日時: '2026-11-01T10:00:00+09:00' }),
    ];
    expect(ids(sortData(data, '日時', 'ASCENDING', 'DATETIME').data)).toEqual(['c', 'b', 'a']);
  });

  it('数値の形式でキーが無い・nullの値は未入力として保存の検査を通す', () => {
    (['INTEGER', 'DECIMAL', 'SERIAL'] as const).forEach((format) => {
      expect(formattedInputs(undefined as unknown as string, format, false)).toEqual({ isOK: true, result: '' });
      expect(formattedInputs(null as unknown as string, format, false)).toEqual({ isOK: true, result: '' });
    });
  });

  it('データ編集の保存の検査で、キーの無い数値列があっても通る', () => {
    const layer = {
      field: [
        { id: 'f1', name: '名前', format: 'STRING' },
        { id: 'f2', name: '個体数', format: 'INTEGER' },
      ],
    } as LayerType;
    expect(checkFieldInput(layer, rec('a', { 名前: 'スギ' })).isOK).toBe(true);
  });

  it('形式の変更で元の値が無い（undefined・null）ときは空欄にする', () => {
    expect(changeFieldValue(undefined, 'STRING', 'LIST')).toBe('');
    expect(changeFieldValue(null, 'STRING', 'CHECK')).toBe('');
    expect(changeFieldValue(undefined, 'STRING', 'STRING_DICTIONARY')).toBe('');
    expect(changeFieldValue(undefined, 'STRING', 'PHOTO')).toEqual([]);
  });
});

describe('E-H3 形式が同じなら値を残す', () => {
  it('TABLEの列を編集しても値は消えない', () => {
    const list = [
      { value: '種名', isOther: false },
      { value: '個体数', isOther: false },
      { value: '備考', isOther: false },
    ];
    expect(changeFieldValue('種A|3,種B|1', 'TABLE', 'TABLE', list)).toBe('種A|3,種B|1');
  });

  it('LISTTABLEの選択肢を編集しても値は消えない', () => {
    expect(changeFieldValue('スギ|2', 'LISTTABLE', 'LISTTABLE', [{ value: 'スギ', isOther: false }])).toBe(
      'スギ|2'
    );
  });

  it('数値や写真も形式が同じなら変えない', () => {
    expect(changeFieldValue(5, 'INTEGER', 'INTEGER')).toBe(5);
    const photos = [{ id: 'p', name: 'a.jpg', uri: 'file://a.jpg', url: null, key: null, width: 1, height: 1, thumbnail: null }];
    expect(changeFieldValue(photos, 'PHOTO', 'PHOTO')).toBe(photos);
  });
});

describe('E-M5 STRINGから数値への変更で空欄をNaNにしない', () => {
  it('空欄・空白だけの値は空欄のまま', () => {
    expect(changeFieldValue('', 'STRING', 'INTEGER')).toBe('');
    expect(changeFieldValue('  ', 'STRING', 'DECIMAL')).toBe('');
    expect(changeFieldValue('', 'STRING', 'SERIAL')).toBe('');
  });

  it('数値の文字列は従来どおり数値にする', () => {
    expect(changeFieldValue('12', 'STRING', 'INTEGER')).toBe(12);
    expect(changeFieldValue('1.5', 'STRING', 'DECIMAL')).toBe(1.5);
    expect(changeFieldValue('7', 'STRING', 'SERIAL')).toBe(7);
  });
});

describe('E-M16 数値列は数値順に並べる', () => {
  const data = [rec('a', { v: 1.5 }), rec('b', { v: 1.25 }), rec('c', { v: -5 }), rec('d', { v: -10 })];

  it('小数・負の数を数値順に並べる', () => {
    expect(sortData(data, 'v', 'ASCENDING', 'DECIMAL').data.map((r) => r.field.v)).toEqual([-10, -5, 1.25, 1.5]);
    expect(sortData(data, 'v', 'DESCENDING', 'DECIMAL').data.map((r) => r.field.v)).toEqual([1.5, 1.25, -5, -10]);
  });

  it('文字列で入った数値も数値として比べる', () => {
    const mixed = [rec('a', { v: '10' }), rec('b', { v: 9 }), rec('c', { v: '-1' })];
    expect(ids(sortData(mixed, 'v', 'ASCENDING', 'INTEGER').data)).toEqual(['c', 'b', 'a']);
  });

  it('文字列の列は従来どおり自然順（数字の並びを整数として比べる）', () => {
    const text = [rec('a', { v: 'No.10' }), rec('b', { v: 'No.9' })];
    expect(ids(sortData(text, 'v', 'ASCENDING', 'STRING').data)).toEqual(['b', 'a']);
  });

  it('同じ値は元の並びを保つ', () => {
    const same = [rec('a', { v: 1 }), rec('b', { v: 1 }), rec('c', { v: 0 })];
    expect(ids(sortData(same, 'v', 'DESCENDING', 'INTEGER').data)).toEqual(['a', 'b', 'c']);
  });
});

describe('E-M17 絞り込みの対象列', () => {
  const fields: FieldType[] = [
    { id: '1', name: '樹種', format: 'STRING' },
    { id: '2', name: '写真', format: 'PHOTO' },
  ];
  it('すべての列とUser列は常に有効', () => {
    expect(isFilterTargetAvailable(fields, '')).toBe(true);
    expect(isFilterTargetAvailable(fields, '_user_')).toBe(true);
  });
  it('今ある絞り込める列だけ有効', () => {
    expect(isFilterTargetAvailable(fields, '樹種')).toBe(true);
    expect(isFilterTargetAvailable(fields, '旧樹種')).toBe(false);
    expect(isFilterTargetAvailable(fields, '写真')).toBe(false);
  });
});

describe('E-L12 見出しの全選択・全表示の状態', () => {
  it('実際のチェックと表示から決める', () => {
    expect(getHeaderToggleState([{ checked: true }, { checked: true }], [{ visible: true }])).toEqual({
      checkedAll: true,
      visibleAll: true,
    });
    expect(getHeaderToggleState([{ checked: true }, { checked: false }], [{ visible: true }, { visible: false }])).toEqual({
      checkedAll: false,
      visibleAll: false,
    });
  });
  it('空の一覧は未選択・全表示', () => {
    expect(getHeaderToggleState([], [])).toEqual({ checkedAll: false, visibleAll: true });
  });
});

describe('E-M2 データ編集の←→', () => {
  it('同じ番号・範囲外では切り替えない', () => {
    expect(isRecordNumberChangeable(1, 1, 3)).toBe(false);
    expect(isRecordNumberChangeable(0, 1, 3)).toBe(false);
    expect(isRecordNumberChangeable(4, 3, 3)).toBe(false);
    expect(isRecordNumberChangeable(2, 1, 3)).toBe(true);
  });
});
