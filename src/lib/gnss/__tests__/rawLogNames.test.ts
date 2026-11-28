import { formatDuration, formatRawBytes, groupRawLogFiles, makeRawLogBaseName } from '../rawLogNames';

describe('makeRawLogBaseName', () => {
  it('日時と受信機名から名前を作り、ファイル名に使えない文字と空白を除く', () => {
    const date = new Date(2026, 10, 28, 9, 3, 5);
    expect(makeRawLogBaseName(date, 'DROGGER GPS/1')).toBe('20261128_090305_DROGGER-GPS1');
  });

  it('受信機名がなければ日時だけ', () => {
    expect(makeRawLogBaseName(new Date(2026, 0, 2, 3, 4, 5), null)).toBe('20260102_030405');
  });
});

describe('groupRawLogFiles', () => {
  const file = (name: string, size: number, mtime: number) => ({ name, path: `/d/${name}`, size, mtime });

  it('同じ名前のファイルを1つの記録にまとめ、新しい順に並べる', () => {
    const groups = groupRawLogFiles([
      file('a.ubx', 100, 10),
      file('a.rtcm3', 20, 11),
      file('a.json', 1, 9),
      file('b.raw', 50, 30),
      file('b.json', 1, 30),
    ]);
    expect(groups.map((g) => g.baseName)).toEqual(['b', 'a']);
    expect(groups[1].files.map((f) => f.name).sort()).toEqual(['a.json', 'a.rtcm3', 'a.ubx']);
    expect(groups[1].totalBytes).toBe(121);
  });

  it('記録と関係ないファイルと、情報（.json）だけが残った組は出さない', () => {
    const groups = groupRawLogFiles([file('x.txt', 1, 1), file('c.json', 1, 1), file('noext', 1, 1)]);
    expect(groups).toEqual([]);
  });
});

describe('表示の整形', () => {
  it('経過時間を mm:ss、1時間以上は h:mm:ss で出す', () => {
    expect(formatDuration(65_000)).toBe('01:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(-1)).toBe('00:00');
  });

  it('サイズを KB / MB で出す', () => {
    expect(formatRawBytes(2048)).toBe('2.0KB');
    expect(formatRawBytes(5 * 1024 * 1024)).toBe('5.0MB');
  });
});
