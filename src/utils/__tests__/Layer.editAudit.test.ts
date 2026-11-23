import { COLOR } from '../../constants/AppConstants';
import { LayerType } from '../../types';
import { adaptDefaultValueToFormat, parseNumberDefaultValue, updateFieldReferences } from '../Layer';

//データ編集・作図の監査（docs/EDIT_AUDIT_2026-11.md）の修正

describe('E-M6 数値の既定値', () => {
  it('数値にならない入力は既定値なしにする（NaNを作らない）', () => {
    expect(parseNumberDefaultValue('', 'INTEGER')).toBeUndefined();
    expect(parseNumberDefaultValue('abc', 'DECIMAL')).toBeUndefined();
  });
  it('数値は従来どおり読む', () => {
    expect(parseNumberDefaultValue('12', 'INTEGER')).toBe(12);
    expect(parseNumberDefaultValue('-1.5', 'DECIMAL')).toBe(-1.5);
  });
});

describe('E-L2 形式を変えたときの既定値', () => {
  it('数値にならない既定値は数値の形式で外す', () => {
    expect(adaptDefaultValueToFormat('未確認', 'STRING', 'INTEGER')).toBeUndefined();
    expect(adaptDefaultValueToFormat('未確認', 'STRING', 'DECIMAL')).toBeUndefined();
    expect(adaptDefaultValueToFormat(1.5, 'DECIMAL', 'INTEGER')).toBeUndefined();
  });
  it('数値として読める既定値は数値にして残す', () => {
    expect(adaptDefaultValueToFormat('3', 'STRING', 'INTEGER')).toBe(3);
    expect(adaptDefaultValueToFormat(3, 'INTEGER', 'DECIMAL')).toBe(3);
    expect(adaptDefaultValueToFormat('2.5', 'STRING', 'DECIMAL')).toBe(2.5);
  });
  it('文字列の形式ではそのまま残す', () => {
    expect(adaptDefaultValueToFormat(3, 'INTEGER', 'STRING')).toBe(3);
    expect(adaptDefaultValueToFormat('未確認', 'STRING', 'STRING_MULTI')).toBe('未確認');
  });
  it('既定値の欄が無い・別の意味になる形式では外す', () => {
    expect(adaptDefaultValueToFormat('未確認', 'STRING', 'TIMESTRING')).toBeUndefined();
    expect(adaptDefaultValueToFormat('未確認', 'STRING', 'TIMERANGE')).toBeUndefined();
    expect(adaptDefaultValueToFormat('未確認', 'STRING', 'LIST')).toBeUndefined();
  });
  it('選択肢の形式どうしでは引き継ぐ', () => {
    expect(adaptDefaultValueToFormat('草地', 'LIST', 'RADIO')).toBe('草地');
  });
  it('選択肢にある値ならSTRINGからLIST・RADIOへ引き継ぐ', () => {
    const list = [{ value: '草地' }, { value: '森林' }];
    expect(adaptDefaultValueToFormat('草地', 'STRING', 'LIST', { list })).toBe('草地');
    expect(adaptDefaultValueToFormat('畑', 'STRING', 'RADIO', { list })).toBeUndefined();
  });
  it('保存済みの形式へ戻したときは、合わなくなった既定値の代わりに保存済みの既定値を戻す', () => {
    const saved = { format: 'TIMERANGE' as const, defaultValue: '09:00-10:00' };
    expect(adaptDefaultValueToFormat('09:00-10:00', 'STRING', 'TIMERANGE', { saved })).toBe('09:00-10:00');
    expect(adaptDefaultValueToFormat(undefined, 'DATESTRING', 'TIMERANGE', { saved })).toBe('09:00-10:00');
    //保存済みと違う形式へは戻さない
    expect(adaptDefaultValueToFormat('x', 'STRING', 'TIMESTRING', { saved })).toBeUndefined();
  });
  it('既定値が無い・形式が同じなら変えない', () => {
    expect(adaptDefaultValueToFormat(undefined, 'STRING', 'INTEGER')).toBeUndefined();
    expect(adaptDefaultValueToFormat('x', 'TIMESTRING', 'TIMESTRING')).toBe('x');
  });
});

describe('E-M17 消した列のソート設定', () => {
  const base: LayerType = {
    id: 'l1',
    name: 'L',
    type: 'POINT',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      color: COLOR.RED,
      fieldName: '',
      colorRamp: 'RANDOM',
      customFieldValue: '',
      colorList: [],
      transparency: 0.2,
    },
    label: '',
    visible: true,
    active: true,
    field: [
      { id: 'a', name: '樹種', format: 'STRING' },
      { id: 'b', name: '本数', format: 'INTEGER' },
    ],
    sortedName: '本数',
    sortedOrder: 'DESCENDING',
  };

  it('ソート中の列を消すとソートを外す', () => {
    const edited = { ...base, field: [base.field[0]] };
    const result = updateFieldReferences(edited, base, new Set(['本数']), new Map());
    expect(result.sortedName).toBeUndefined();
    expect(result.sortedOrder).toBe('UNSORTED');
  });

  it('改名には従来どおり追従する', () => {
    const edited = { ...base, field: [base.field[0], { ...base.field[1], name: '株数' }] };
    const result = updateFieldReferences(edited, base, new Set(), new Map([['本数', '株数']]));
    expect(result.sortedName).toBe('株数');
    expect(result.sortedOrder).toBe('DESCENDING');
  });

  it('別の列を消してもソートは残す', () => {
    const edited = { ...base, field: [base.field[1]] };
    const result = updateFieldReferences(edited, base, new Set(['樹種']), new Map());
    expect(result.sortedName).toBe('本数');
    expect(result.sortedOrder).toBe('DESCENDING');
  });
});
