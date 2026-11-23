import { FieldType, RecordType } from '../../types';
import { changeFieldValue, countFieldValuesLostOnFormatChange, isFieldValueLostOnFormatChange } from '../Data';

//形式変更で値を残す・消えるときに確認する（docs/DECISIONS_2026-11.md E-M4、E-M5）

const rec = (id: string, field: RecordType['field']): RecordType => ({
  id,
  userId: 'u1',
  displayName: 'u1',
  visible: true,
  redraw: false,
  coords: { latitude: 35, longitude: 139 },
  field,
});

describe('changeFieldValue 数値形式への変更で値を残す', () => {
  it('DECIMAL→INTEGER/SERIALは四捨五入して残す', () => {
    expect(changeFieldValue(1.5, 'DECIMAL', 'INTEGER')).toBe(2);
    expect(changeFieldValue(2.4, 'DECIMAL', 'SERIAL')).toBe(2);
    expect(changeFieldValue(-1.2, 'DECIMAL', 'INTEGER')).toBe(-1);
  });

  it('整数系どうし・整数→小数はそのまま', () => {
    expect(changeFieldValue(3, 'INTEGER', 'DECIMAL')).toBe(3);
    expect(changeFieldValue(3, 'INTEGER', 'SERIAL')).toBe(3);
    expect(changeFieldValue(4, 'SERIAL', 'INTEGER')).toBe(4);
  });

  it('文字列系（複数行・辞書・選択肢）→数値は数値として読める値を残す', () => {
    expect(changeFieldValue('12', 'STRING_MULTI', 'INTEGER')).toBe(12);
    expect(changeFieldValue(' 3.25 ', 'STRING_DICTIONARY', 'DECIMAL')).toBe(3.25);
    expect(changeFieldValue('5', 'LIST', 'INTEGER')).toBe(5);
    expect(changeFieldValue('1.6', 'STRING', 'INTEGER')).toBe(2);
  });

  it('数値にならない値（abc）と空欄はNaNにせず空欄にする（E-M5）', () => {
    expect(changeFieldValue('abc', 'STRING', 'INTEGER')).toBe('');
    expect(changeFieldValue('abc', 'STRING', 'DECIMAL')).toBe('');
    expect(changeFieldValue('abc', 'LIST', 'SERIAL')).toBe('');
    expect(changeFieldValue('', 'STRING_MULTI', 'INTEGER')).toBe('');
  });
});

describe('isFieldValueLostOnFormatChange', () => {
  it('そのまま残る値は対象外', () => {
    expect(isFieldValueLostOnFormatChange('12', 'STRING', 'INTEGER')).toBe(false);
    expect(isFieldValueLostOnFormatChange(3, 'INTEGER', 'STRING')).toBe(false);
    expect(isFieldValueLostOnFormatChange(2, 'DECIMAL', 'INTEGER')).toBe(false);
    expect(isFieldValueLostOnFormatChange('高', 'STRING', 'LIST')).toBe(false);
  });

  it('空欄だった値は対象外', () => {
    expect(isFieldValueLostOnFormatChange('', 'DATETIME', 'DATESTRING')).toBe(false);
    expect(isFieldValueLostOnFormatChange(0, 'SERIAL', 'DATESTRING')).toBe(false);
    expect(isFieldValueLostOnFormatChange(undefined, 'STRING', 'INTEGER')).toBe(false);
    expect(isFieldValueLostOnFormatChange([], 'PHOTO', 'STRING')).toBe(false);
  });

  it('消える値・丸められる値は対象', () => {
    expect(isFieldValueLostOnFormatChange('abc', 'STRING', 'INTEGER')).toBe(true);
    expect(isFieldValueLostOnFormatChange(1.5, 'DECIMAL', 'INTEGER')).toBe(true);
    expect(isFieldValueLostOnFormatChange('2026-11-23T10:00:00+09:00', 'DATETIME', 'DATESTRING')).toBe(true);
    expect(isFieldValueLostOnFormatChange('2026-11-23', 'DATESTRING', 'INTEGER')).toBe(true);
    expect(isFieldValueLostOnFormatChange(0, 'INTEGER', 'DATESTRING')).toBe(true);
  });
});

describe('countFieldValuesLostOnFormatChange', () => {
  const initial: FieldType[] = [
    { id: 'a', name: '個体数', format: 'STRING' },
    { id: 'b', name: '面積', format: 'DECIMAL' },
    { id: 'c', name: 'メモ', format: 'STRING' },
  ];
  const records = [
    rec('r1', { 個体数: '3', 面積: 1.5, メモ: 'x' }),
    rec('r2', { 個体数: 'abc', 面積: 2, メモ: 'y' }),
    rec('r3', { 個体数: '', 面積: 2.7, メモ: 'z' }),
  ];

  it('形式を変えた列だけ、変更前の名前で数える', () => {
    const updated: FieldType[] = [
      { id: 'a', name: 'count', format: 'INTEGER' },
      { id: 'b', name: '面積', format: 'INTEGER' },
      { id: 'c', name: 'メモ', format: 'STRING_MULTI' },
    ];
    //個体数: abc の1件、面積: 1.5 と 2.7 の2件
    expect(countFieldValuesLostOnFormatChange(records, initial, updated)).toBe(3);
  });

  it('形式を変えていなければ0', () => {
    expect(countFieldValuesLostOnFormatChange(records, initial, initial)).toBe(0);
  });

  it('削除済み（墓標）の記録は数えない', () => {
    const updated: FieldType[] = [{ id: 'a', name: '個体数', format: 'INTEGER' }];
    const withTombstone = [...records, { ...rec('r4', { 個体数: 'xyz' }), deleted: true }];
    //r2 の abc だけ。墓標の xyz は画面に出ないので確認の件数に入れない
    expect(countFieldValuesLostOnFormatChange(withTombstone, initial, updated)).toBe(1);
  });
});
