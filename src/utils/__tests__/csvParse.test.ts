import { parseCsv } from '../csvParse';

describe('parseCsv', () => {
  it('フィールド途中の " は文字として扱い、後続の行を吸い込まない', () => {
    expect(parseCsv('name,h\nA,5\'10"\nB,6\'1"\nC,1')).toEqual([
      ['name', 'h'],
      ['A', '5\'10"'],
      ['B', '6\'1"'],
      ['C', '1'],
    ]);
  });

  it('途中の " の後のカンマ・改行は区切りとして扱う', () => {
    expect(parseCsv('a"b,c\r\nd,e"f"g')).toEqual([
      ['a"b', 'c'],
      ['d', 'e"f"g'],
    ]);
  });

  it('正しく引用された値の改行・カンマ・"" は従来どおり', () => {
    expect(parseCsv('k,v\n1,"a,b"\n2,"line1\nline2"\n3,"say ""hi"""\n4,""')).toEqual([
      ['k', 'v'],
      ['1', 'a,b'],
      ['2', 'line1\nline2'],
      ['3', 'say "hi"'],
      ['4', ''],
    ]);
  });

  it('先頭の空白の後の " は引用の開始とみなす（呼び出し側の trim と整合）', () => {
    expect(parseCsv('a, "x,y"\n')).toEqual([['a', ' x,y']]);
  });

  it('閉じ引用符の後の " で再び引用を始めない', () => {
    expect(parseCsv('"a"b"c,d\n1,2')).toEqual([
      ['ab"c', 'd'],
      ['1', '2'],
    ]);
  });

  it('BOM を除き、末尾改行で空レコードを作らない', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('閉じていない引用符は例外', () => {
    expect(() => parseCsv('a,"b\nc')).toThrow('unterminated');
  });
});
