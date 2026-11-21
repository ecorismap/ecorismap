// GPX入出力の監査テスト（gpx2Data / generateGPX / generateTrackGPXWithPhotos）
// 期待値は「あるべき挙動」。赤になったものは不具合候補。
import dayjs from 'dayjs';
import { gpx2Data, generateGPX, generateTrackGPXWithPhotos } from '../../Geometry';
import { LocationType, PhotoType, RecordType } from '../../../types';

let mockIdCounter = 0;
jest.mock('ulid', () => ({ ulid: () => `id${mockIdCounter++}` }));

const wrap = (body: string, root = 'gpx') =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<${root} version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">${body}</${root}>`;

const importPoints = (gpx: string) => gpx2Data(gpx, 'POINT', 'test.gpx', 'u1', 'user1');
const importLines = (gpx: string) => gpx2Data(gpx, 'LINE', 'test.gpx', 'u1', 'user1');

const pointRecord = (field: RecordType['field'], coords: LocationType, displayName: string | null = null): RecordType => ({
  id: 'p',
  userId: undefined,
  displayName,
  visible: true,
  redraw: false,
  coords,
  field,
});

const lineRecord = (field: RecordType['field'], coords: LocationType[]): RecordType => ({
  id: 'l',
  userId: undefined,
  displayName: null,
  visible: true,
  redraw: false,
  coords,
  field,
});

const photo = (name: string): PhotoType => ({
  id: name,
  name,
  uri: null,
  url: null,
  key: null,
  width: 1,
  height: 1,
  thumbnail: null,
});

// ---------------------------------------------------------------------------
// 取り込み: 正常系（回帰防止）
// ---------------------------------------------------------------------------
describe('gpx2Data 取り込み 正常系', () => {
  it('複数のwptをname/time/cmt/eleつきで取り込む', () => {
    const gpx = wrap(`
      <wpt lat="35.5" lon="139.25"><ele>12.5</ele><time>2024-05-01T03:04:05Z</time><name>地点A</name><cmt>メモ</cmt></wpt>
      <wpt lat="-33.9" lon="-70.1"><ele>-3</ele><name>B</name></wpt>`);
    const data = importPoints(gpx)!;
    expect(data.recordSet).toHaveLength(2);
    const [a, b] = data.recordSet;
    expect(a.coords).toEqual({ latitude: 35.5, longitude: 139.25, altitude: 12.5 });
    expect(a.field.name).toBe('地点A');
    expect(a.field.cmt).toBe('メモ');
    expect(dayjs(a.field.time as string).valueOf()).toBe(Date.parse('2024-05-01T03:04:05Z'));
    expect(b.coords).toEqual({ latitude: -33.9, longitude: -70.1, altitude: -3 });
    expect(data.layer.field.map((f) => [f.name, f.format])).toEqual([
      ['name', 'STRING'],
      ['time', 'DATETIME'],
      ['cmt', 'STRING'],
    ]);
  });

  it('timeの無いwptは時刻が空になる（取り込んだ時刻を入れない）', () => {
    const data = importPoints(wrap('<wpt lat="1" lon="2"><name>no-time</name></wpt>'))!;
    expect(data.recordSet[0].field.time).toBe('');
  });

  it('wptが1件（配列でない）でも取り込める', () => {
    const data = importPoints(wrap('<wpt lat="1" lon="2"><name>x</name></wpt>'))!;
    expect(data.recordSet).toHaveLength(1);
    expect(data.recordSet[0].coords).toEqual({ latitude: 1, longitude: 2, altitude: undefined });
  });

  it('ele=0 は 0 として残り、ele欠落・空・文字列は undefined になる', () => {
    const data = importPoints(
      wrap(`
      <wpt lat="1" lon="1"><ele>0</ele></wpt>
      <wpt lat="1" lon="1"></wpt>
      <wpt lat="1" lon="1"><ele></ele></wpt>
      <wpt lat="1" lon="1"><ele>abc</ele></wpt>`)
    )!;
    expect(data.recordSet.map((r) => (r.coords as LocationType).altitude)).toEqual([0, undefined, undefined, undefined]);
  });

  it('標高は数値型で入る', () => {
    const data = importLines(wrap('<trk><trkseg><trkpt lat="1" lon="1"><ele>100.25</ele></trkpt><trkpt lat="2" lon="2"><ele>7</ele></trkpt></trkseg></trk>'))!;
    const coords = data.recordSet[0].coords as LocationType[];
    expect(coords.map((c) => typeof c.altitude)).toEqual(['number', 'number']);
  });

  it('複数trk・複数trksegを取り込み、セグメントは連結される', () => {
    const gpx = wrap(`
      <trk><name>T1</name>
        <trkseg><trkpt lat="1" lon="1"><time>2024-01-01T00:00:00Z</time></trkpt><trkpt lat="1.1" lon="1.1"/></trkseg>
        <trkseg><trkpt lat="2" lon="2"/><trkpt lat="2.1" lon="2.1"/></trkseg>
      </trk>
      <trk><name>T2</name><trkseg><trkpt lat="3" lon="3"/><trkpt lat="3.1" lon="3.1"/></trkseg></trk>`);
    const data = importLines(gpx)!;
    expect(data.recordSet.map((r) => r.field.name)).toEqual(['T1', 'T2']);
    expect((data.recordSet[0].coords as LocationType[]).map((c) => c.latitude)).toEqual([1, 1.1, 2, 2.1]);
    expect((data.recordSet[0].coords as LocationType[])[0].timestamp).toBe(Date.parse('2024-01-01T00:00:00Z'));
    expect((data.recordSet[0].coords as LocationType[])[1].timestamp).toBeUndefined();
    // trk.timeが無いときは最初の点の時刻
    expect(dayjs(data.recordSet[0].field.time as string).valueOf()).toBe(Date.parse('2024-01-01T00:00:00Z'));
    expect(data.recordSet[1].field.time).toBe('');
  });

  it('拡張要素（extensions・名前空間つき子要素）があっても取り込める', () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata><name>meta</name></metadata>
  <wpt lat="10" lon="20"><name>w</name><extensions><gpxtpx:foo>1</gpxtpx:foo></extensions></wpt>
  <trk><name>t</name><extensions><x>1</x></extensions><trkseg>
    <trkpt lat="1" lon="2"><ele>3</ele><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>120</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
    <trkpt lat="1.5" lon="2.5"/>
  </trkseg></trk>
</gpx>`;
    expect(importPoints(gpx)!.recordSet).toHaveLength(1);
    const lines = importLines(gpx)!;
    expect(lines.recordSet).toHaveLength(1);
    expect((lines.recordSet[0].coords as LocationType[])[0]).toMatchObject({ latitude: 1, longitude: 2, altitude: 3 });
  });

  it('ルート要素が大文字GPXでも取り込める', () => {
    const data = importPoints(wrap('<wpt lat="1" lon="2"><name>x</name></wpt>', 'GPX'))!;
    expect(data.recordSet).toHaveLength(1);
  });

  it('CDATAのnameは中身の文字列として入る', () => {
    const data = importPoints(wrap('<wpt lat="1" lon="2"><name><![CDATA[A & <B>]]></name></wpt>'))!;
    expect(data.recordSet[0].field.name).toBe('A & <B>');
  });
});

// ---------------------------------------------------------------------------
// 取り込み: 壊れた・悪意ある・境界の入力
// ---------------------------------------------------------------------------
describe('gpx2Data 取り込み 異常系・境界', () => {
  it('空文字列でも例外を投げない', () => {
    expect(() => importPoints('')).not.toThrow();
    expect(() => importLines('')).not.toThrow();
  });

  it('壊れたXMLでも例外を投げない', () => {
    expect(() => importPoints('<gpx><wpt lat="1"')).not.toThrow();
    expect(() => importLines('<gpx><trk><trkseg><trkpt lat="1" lon="2"></trk>')).not.toThrow();
    expect(() => importLines('not xml at all')).not.toThrow();
  });

  it('DOCTYPE内のエンティティは展開しない（billion laughs対策）', () => {
    const lol = `<?xml version="1.0"?>
<!DOCTYPE gpx [
  <!ENTITY a "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">
  <!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">
  <!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<gpx version="1.1"><wpt lat="1" lon="2"><name>&c;</name><cmt>&xxe;</cmt></wpt></gpx>`;
    const data = importPoints(lol);
    // 例外で全体が落ちても、展開されてもいけない
    if (data !== undefined) {
      const name = String(data.recordSet[0]?.field.name ?? '');
      expect(name.length).toBeLessThan(100);
      expect(String(data.recordSet[0]?.field.cmt ?? '')).not.toMatch(/root:/);
    }
  });

  it('1点だけのtrksegを含むtrkも取り込める（他のtrkも巻き添えで消えない）', () => {
    const gpx = wrap(`
      <trk><name>one</name><trkseg><trkpt lat="1" lon="1"/></trkseg></trk>
      <trk><name>two</name><trkseg><trkpt lat="2" lon="2"/><trkpt lat="2.1" lon="2.1"/></trkseg></trk>`);
    const data = importLines(gpx);
    expect(data).toBeDefined();
    expect(data!.recordSet.map((r) => r.field.name)).toEqual(['one', 'two']);
  });

  it('複数セグメントの一部が1点でも、そのtrkの他セグメントは取り込める', () => {
    const gpx = wrap(`
      <trk><name>t</name>
        <trkseg><trkpt lat="1" lon="1"/><trkpt lat="1.1" lon="1.1"/></trkseg>
        <trkseg><trkpt lat="2" lon="2"/></trkseg>
      </trk>`);
    const data = importLines(gpx);
    expect(data).toBeDefined();
    expect((data!.recordSet[0].coords as LocationType[]).map((c) => c.latitude)).toEqual([1, 1.1, 2]);
  });

  it('空のtrkseg（<trkseg/>）があっても他のtrkは取り込める', () => {
    const gpx = wrap(`
      <trk><name>empty</name><trkseg/></trk>
      <trk><name>ok</name><trkseg><trkpt lat="2" lon="2"/><trkpt lat="2.1" lon="2.1"/></trkseg></trk>`);
    const data = importLines(gpx);
    expect(data).toBeDefined();
    expect(data!.recordSet.map((r) => r.field.name)).toContain('ok');
  });

  it('trksegの無いtrkがあっても他のtrkは取り込める', () => {
    const gpx = wrap(`
      <trk><name>noseg</name></trk>
      <trk><name>ok</name><trkseg><trkpt lat="2" lon="2"/><trkpt lat="2.1" lon="2.1"/></trkseg></trk>`);
    const data = importLines(gpx);
    expect(data).toBeDefined();
    expect(data!.recordSet.map((r) => r.field.name)).toContain('ok');
  });

  it('rte（ルート）は黙って捨てずにラインとして取り込む', () => {
    const gpx = wrap(`
      <rte><name>route1</name><rtept lat="1" lon="1"/><rtept lat="2" lon="2"/><rtept lat="3" lon="3"/></rte>`);
    const data = importLines(gpx);
    expect(data).toBeDefined();
    expect(data!.recordSet).toHaveLength(1);
    expect(data!.recordSet[0].field.name).toBe('route1');
    expect(data!.recordSet[0].coords).toHaveLength(3);
  });

  it('lat属性の無いwptが1件あっても、他のwptは取り込める', () => {
    const data = importPoints(wrap('<wpt lon="10"><name>missing</name></wpt><wpt lat="35" lon="139"><name>ok</name></wpt>'));
    expect(data).toBeDefined();
    expect(data!.recordSet.map((r) => r.field.name)).toContain('ok');
  });

  it('lat属性の無いtrkptが1点あっても、軌跡は取り込める', () => {
    const data = importLines(wrap('<trk><trkseg><trkpt lon="10"/><trkpt lat="35" lon="139"/><trkpt lat="35.1" lon="139.1"/></trkseg></trk>'));
    expect(data).toBeDefined();
    expect(data!.recordSet).toHaveLength(1);
  });

  it('緯度経度が範囲外・文字列の点は(0,0)にせず取り込まない', () => {
    const gpx = wrap(`
      <wpt lat="91" lon="10"><name>bad-lat</name></wpt>
      <wpt lat="10" lon="181"><name>bad-lon</name></wpt>
      <wpt lat="abc" lon="10"><name>str</name></wpt>
      <wpt lat="35" lon="139"><name>ok</name></wpt>`);
    const data = importPoints(gpx)!;
    const hasNullIsland = data.recordSet.some((r) => {
      const c = r.coords as LocationType;
      return c.latitude === 0 || c.longitude === 0;
    });
    expect(hasNullIsland).toBe(false);
  });

  it('軌跡の点の緯度経度が不正なとき(0,0)を混ぜない', () => {
    const gpx = wrap('<trk><trkseg><trkpt lat="35" lon="139"/><trkpt lat="999" lon="139"/><trkpt lat="35.1" lon="139.1"/></trkseg></trk>');
    const coords = importLines(gpx)!.recordSet[0].coords as LocationType[];
    expect(coords.some((c) => c.latitude === 0 || c.longitude === 0)).toBe(false);
  });

  it('境界値の緯度経度（±90, ±180）は取り込める', () => {
    const data = importPoints(
      wrap('<wpt lat="90" lon="180"/><wpt lat="-90" lon="-180"/><wpt lat="+45.5" lon="-0.000001"/>')
    )!;
    expect(data.recordSet.map((r) => [(r.coords as LocationType).latitude, (r.coords as LocationType).longitude])).toEqual([
      [90, 180],
      [-90, -180],
      [45.5, -0.000001],
    ]);
  });

  it('数字だけのname/cmtは文字列のまま（先頭ゼロ・巨大数も保つ）', () => {
    const data = importPoints(
      wrap(`
      <wpt lat="1" lon="1"><name>007</name><cmt>12345678901234567890123</cmt></wpt>
      <wpt lat="1" lon="1"><name>0</name><cmt>1.50</cmt></wpt>
      <wpt lat="1" lon="1"><name>-12</name><cmt>1e3</cmt></wpt>`)
    )!;
    expect(data.recordSet.map((r) => r.field.name)).toEqual(['007', '0', '-12']);
    expect(data.recordSet.map((r) => r.field.cmt)).toEqual(['12345678901234567890123', '1.50', '1e3']);
  });

  it('trkのnameが数字でも文字列のまま', () => {
    const data = importLines(wrap('<trk><name>0012</name><trkseg><trkpt lat="1" lon="1"/><trkpt lat="2" lon="2"/></trkseg></trk>'))!;
    expect(data.recordSet[0].field.name).toBe('0012');
  });

  it('XMLの定義済み実体参照（&amp; &lt; &gt; &quot; &apos;）と数値文字参照は復号する', () => {
    const data = importPoints(
      wrap('<wpt lat="1" lon="1"><name>A&amp;B &lt;c&gt; &quot;d&quot; &apos;e&apos;</name><cmt>&#26085;&#x672C;</cmt></wpt>')
    )!;
    expect(data.recordSet[0].field.name).toBe('A&B <c> "d" \'e\'');
    expect(data.recordSet[0].field.cmt).toBe('日本');
  });

  it('不正な時刻は空文字・undefinedになり例外にならない', () => {
    const data = importLines(
      wrap('<trk><time>xxxx</time><trkseg><trkpt lat="1" lon="1"><time>notatime</time></trkpt><trkpt lat="2" lon="2"/></trkseg></trk>')
    )!;
    expect((data.recordSet[0].coords as LocationType[])[0].timestamp).toBeUndefined();
    expect(data.recordSet[0].field.time).toBe('');
  });

  it('wptもtrkも無いGPXは空のrecordSetを返す', () => {
    expect(importPoints(wrap('<metadata/>'))!.recordSet).toEqual([]);
    expect(importLines(wrap('<metadata/>'))!.recordSet).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 往復: generateGPX → gpx2Data
// ---------------------------------------------------------------------------
const TRICKY_STRINGS = [
  '日本語の地点',
  '絵文字🦅🌲',
  'カンマ,あり',
  'ダブル"クォート"',
  "シングル'クォート'",
  '<tag> & </tag>',
  'A&amp;B（すでにエスケープ済みに見える文字列）',
  'タブ\tあり',
  '改行\nあり',
  'CRLF\r\nあり',
];

describe('往復 generateGPX(POINT) → gpx2Data', () => {
  it('座標・標高・時刻・name/cmtが戻る（素直な値）', () => {
    const records = [
      pointRecord({ name: 'A', time: '2024-05-01T12:34:56+09:00', cmt: 'c' }, { latitude: 35.123456789, longitude: 139.987654321, altitude: 12.34 }),
      pointRecord({ name: 'B', time: '', cmt: '' }, { latitude: -45, longitude: -170, altitude: 0 }),
      pointRecord({ name: 'C', time: '', cmt: '' }, { latitude: 1, longitude: 2, altitude: -8.5 }),
      pointRecord({ name: 'D', time: '', cmt: '' }, { latitude: 1, longitude: 2, altitude: null }),
    ];
    const back = importPoints(generateGPX(records, 'POINT'))!;
    expect(back.recordSet).toHaveLength(4);
    expect(back.recordSet.map((r) => r.coords)).toEqual([
      { latitude: 35.123456789, longitude: 139.987654321, altitude: 12.34 },
      { latitude: -45, longitude: -170, altitude: 0 },
      { latitude: 1, longitude: 2, altitude: -8.5 },
      { latitude: 1, longitude: 2, altitude: undefined },
    ]);
    expect(dayjs(back.recordSet[0].field.time as string).valueOf()).toBe(dayjs('2024-05-01T12:34:56+09:00').valueOf());
    expect(back.recordSet[1].field.time).toBe('');
    expect(back.recordSet.map((r) => r.field.name)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('name/cmtが undefined・空でも書き出せて空文字で戻る', () => {
    const records = [pointRecord({}, { latitude: 1, longitude: 2 }), pointRecord({ name: '', cmt: '' }, { latitude: 1, longitude: 2 })];
    const back = importPoints(generateGPX(records, 'POINT'))!;
    expect(back.recordSet.map((r) => [r.field.name, r.field.cmt, r.field.time])).toEqual([
      ['', '', ''],
      ['', '', ''],
    ]);
  });

  it.each(TRICKY_STRINGS)('nameに特殊文字を含んでも同じ文字列で戻る: %j', (s) => {
    const back = importPoints(generateGPX([pointRecord({ name: s, cmt: s }, { latitude: 1, longitude: 2 })], 'POINT'))!;
    // XMLは属性外のCRLFをLFに正規化するのでそこだけは許容
    const norm = (v: unknown) => String(v).replace(/\r\n/g, '\n');
    expect(norm(back.recordSet[0].field.name)).toBe(norm(s));
    expect(norm(back.recordSet[0].field.cmt)).toBe(norm(s));
  });

  it('前後の空白を含むnameも保たれる', () => {
    const back = importPoints(generateGPX([pointRecord({ name: '  前後空白  ' }, { latitude: 1, longitude: 2 })], 'POINT'))!;
    expect(back.recordSet[0].field.name).toBe('  前後空白  ');
  });

  it('数字だけのname（先頭ゼロ・0）は文字列のまま戻る', () => {
    const records = [
      pointRecord({ name: '007', cmt: '0' }, { latitude: 1, longitude: 2 }),
      pointRecord({ name: '0', cmt: '-1.50' }, { latitude: 1, longitude: 2 }),
    ];
    const back = importPoints(generateGPX(records, 'POINT'))!;
    expect(back.recordSet.map((r) => r.field.name)).toEqual(['007', '0']);
    expect(back.recordSet.map((r) => r.field.cmt)).toEqual(['0', '-1.50']);
  });

  it('数値型のname（INTEGER/SERIAL由来など）も書き出せて文字列で戻る', () => {
    const back = importPoints(generateGPX([pointRecord({ name: 0, cmt: 12 }, { latitude: 1, longitude: 2 })], 'POINT'))!;
    expect(back.recordSet[0].field.name).toBe('0');
    expect(back.recordSet[0].field.cmt).toBe('12');
  });

  it('XMLで使えない制御文字を含んでも書き出しが例外にならない', () => {
    const rec = pointRecord({ name: 'ベル\u0007文字', note: '垂直タブ\u000Bと\u0000ヌル' }, { latitude: 1, longitude: 2 });
    expect(() => generateGPX([rec], 'POINT')).not.toThrow();
  });

  it('全形式の項目値がdescに書き出され、例外にならない', () => {
    const field: RecordType['field'] = {
      name: 'n',
      time: '2024-01-01T00:00:00+09:00',
      cmt: '',
      STRING: '文字<&>"',
      STRING_MULTI: '1行目\n2行目',
      STRING_DICTIONARY: 'ヒノキ',
      SERIAL: 3,
      INTEGER: -2147483648,
      DECIMAL: 0.1,
      BIG: 1e21,
      DATETIME: '2024-01-01T00:00:00+09:00',
      DATESTRING: '2024/01/01',
      TIMESTRING: '12:34',
      TIMERANGE: '09:00-10:00',
      NUMBERRANGE: '1-2',
      LIST: 'A',
      RADIO: 'B',
      CHECK: 'A,B',
      PHOTO: [photo('p1.jpg'), photo('写真2.jpg')],
      REFERENCE: '',
      ZERO: 0,
    };
    const xml = generateGPX([pointRecord(field, { latitude: 1, longitude: 2 }, 'ユーザー&1')], 'POINT');
    expect(xml).toContain('<desc>');
    expect(xml).toContain('User: ユーザー&amp;1');
    expect(xml).toContain('PHOTO: p1.jpg,写真2.jpg');
    expect(xml).toContain('ZERO: 0');
    expect(xml).toContain('STRING: 文字&lt;&amp;&gt;"');
  });

  it('name/time/cmt以外の項目（descに書いたもの）も取り込み直すと失われない', () => {
    const rec = pointRecord({ name: 'n', time: '', cmt: '', 種別: 'ヒノキ', 本数: 3 }, { latitude: 1, longitude: 2 });
    const back = importPoints(generateGPX([rec], 'POINT'))!;
    const all = JSON.stringify(back.recordSet[0].field);
    expect(all).toContain('ヒノキ');
    expect(all).toContain('3');
  });

  it('外部GNSSで測ったポイントの測位品質・楕円体高がGPXに残る', () => {
    const rec = pointRecord(
      { name: 'gnss' },
      {
        latitude: 35,
        longitude: 139,
        altitude: 10,
        accuracy: 0.02,
        gnss: { fixQuality: 4, satellites: 18, hdop: 0.7, diffAge: 1.2, ellipsoidHeight: 48.5 },
      }
    );
    const xml = generateGPX([rec], 'POINT');
    // GPX 1.1 には fix / sat / hdop / ageofdgpsdata / geoidheight の要素がある
    expect(xml).toMatch(/<fix>|<sat>|<hdop>|<geoidheight>|Fix/i);
  });
});

describe('往復 generateGPX(LINE) → gpx2Data', () => {
  const coords: LocationType[] = [
    { latitude: 35.0, longitude: 139.0, altitude: 100.5, timestamp: Date.parse('2024-05-01T00:00:00.123Z') },
    { latitude: 35.001, longitude: 139.001, altitude: 0, timestamp: Date.parse('2024-05-01T00:00:01.456Z') },
    { latitude: 35.002, longitude: 139.002, altitude: -1.25, timestamp: Date.parse('2024-05-01T00:00:02Z') },
    { latitude: 35.003, longitude: 139.003, altitude: null, timestamp: undefined },
  ];

  it('座標・標高・時刻（ミリ秒まで）・name/time/cmtが戻る', () => {
    const rec = lineRecord({ name: '軌跡1', time: '2024-05-01T09:00:00+09:00', cmt: 'コメント' }, coords);
    const back = importLines(generateGPX([rec], 'LINE'))!;
    expect(back.recordSet).toHaveLength(1);
    const r = back.recordSet[0];
    expect(r.coords).toEqual([
      { latitude: 35.0, longitude: 139.0, altitude: 100.5, timestamp: coords[0].timestamp },
      { latitude: 35.001, longitude: 139.001, altitude: 0, timestamp: coords[1].timestamp },
      { latitude: 35.002, longitude: 139.002, altitude: -1.25, timestamp: coords[2].timestamp },
      { latitude: 35.003, longitude: 139.003, altitude: undefined, timestamp: undefined },
    ]);
    expect(r.field.name).toBe('軌跡1');
    expect(r.field.cmt).toBe('コメント');
    expect(dayjs(r.field.time as string).valueOf()).toBe(dayjs('2024-05-01T09:00:00+09:00').valueOf());
  });

  it('複数の軌跡を書き出すと件数・順序が戻る', () => {
    const recs = [lineRecord({ name: 'a' }, coords.slice(0, 2)), lineRecord({ name: 'b' }, coords.slice(1, 3))];
    const back = importLines(generateGPX(recs, 'LINE'))!;
    expect(back.recordSet.map((r) => r.field.name)).toEqual(['a', 'b']);
  });

  it.each(TRICKY_STRINGS)('軌跡名に特殊文字を含んでも同じ文字列で戻る: %j', (s) => {
    const back = importLines(generateGPX([lineRecord({ name: s, cmt: s }, coords.slice(0, 2))], 'LINE'))!;
    const norm = (v: unknown) => String(v).replace(/\r\n/g, '\n');
    expect(norm(back.recordSet[0].field.name)).toBe(norm(s));
    expect(norm(back.recordSet[0].field.cmt)).toBe(norm(s));
  });

  it('1点だけの軌跡を含めて書き出しても、取り込み直すと全軌跡が戻る', () => {
    const recs = [lineRecord({ name: 'one' }, coords.slice(0, 1)), lineRecord({ name: 'many' }, coords)];
    const back = importLines(generateGPX(recs, 'LINE'));
    expect(back).toBeDefined();
    expect(back!.recordSet.map((r) => r.field.name)).toEqual(['one', 'many']);
  });

  it('点が0個の軌跡を含めて書き出しても、他の軌跡は取り込み直せる', () => {
    const recs = [lineRecord({ name: 'empty' }, []), lineRecord({ name: 'many' }, coords)];
    const back = importLines(generateGPX(recs, 'LINE'));
    expect(back).toBeDefined();
    expect(back!.recordSet.map((r) => r.field.name)).toContain('many');
  });

  it('timestamp=0（1970-01-01T00:00:00Z）の点も時刻が書き出される', () => {
    const xml = generateGPX([lineRecord({ name: 'epoch' }, [{ latitude: 1, longitude: 1, timestamp: 0 }, { latitude: 2, longitude: 2, timestamp: 1000 }])], 'LINE');
    expect(xml).toContain('<time>1970-01-01T00:00:00.000Z</time>');
  });

  it('GNSS点の楕円体高はgeoidheightとして書き出される（現行仕様）', () => {
    const xml = generateGPX(
      [lineRecord({ name: 'g' }, [{ latitude: 1, longitude: 1, altitude: 10, ellipsoidHeight: 48.5, fixQuality: 4 }, { latitude: 2, longitude: 2 }])],
      'LINE'
    );
    expect(xml).toContain('<geoidheight>38.5</geoidheight>');
  });

  it('GNSS点の楕円体高（geoidheight）は取り込み直すと戻る', () => {
    const back = importLines(
      generateGPX(
        [lineRecord({ name: 'g' }, [{ latitude: 1, longitude: 1, altitude: 10, ellipsoidHeight: 48.5, fixQuality: 4 }, { latitude: 2, longitude: 2 }])],
        'LINE'
      )
    )!;
    expect((back.recordSet[0].coords as LocationType[])[0].ellipsoidHeight).toBeCloseTo(48.5, 3);
  });

  it('軌跡の点の測位品質（fixQuality）がGPXに残る', () => {
    const xml = generateGPX(
      [lineRecord({ name: 'g' }, [{ latitude: 1, longitude: 1, altitude: 10, fixQuality: 4 }, { latitude: 2, longitude: 2, fixQuality: 5 }])],
      'LINE'
    );
    // GPX 1.1 の <fix> は none|2d|3d|dgps|pps しか無いが、少なくとも何らかの形で残っているべき
    expect(xml).toMatch(/<fix>|fixQuality|RTK|<extensions>/i);
  });

  it('軌跡のname/time/cmt以外の項目も取り込み直すと失われない', () => {
    const back = importLines(generateGPX([lineRecord({ name: 't', 調査者: '山田', 距離: 1.5 }, coords.slice(0, 2))], 'LINE'))!;
    const all = JSON.stringify(back.recordSet[0].field);
    expect(all).toContain('山田');
  });
});

// ---------------------------------------------------------------------------
// 往復: generateTrackGPXWithPhotos → gpx2Data
// ---------------------------------------------------------------------------
describe('往復 generateTrackGPXWithPhotos → gpx2Data', () => {
  const coords: LocationType[] = [
    { latitude: 35, longitude: 139, altitude: 50, timestamp: Date.parse('2024-06-01T01:00:00Z'), ellipsoidHeight: 88.25, fixQuality: 4 },
    { latitude: 35.01, longitude: 139.01, altitude: 51, timestamp: Date.parse('2024-06-01T01:00:10Z') },
    { latitude: 35.02, longitude: 139.02, timestamp: Date.parse('2024-06-01T01:00:20Z') },
  ];
  const photos = [
    { filename: 'IMG_0001.jpg', timestamp: Date.parse('2024-06-01T01:00:05Z'), latitude: 35.005, longitude: 139.005 },
    { filename: '写真 & <2>.jpg', timestamp: Date.parse('2024-06-01T01:00:15Z'), latitude: 35.015, longitude: 139.015 },
  ];

  it('軌跡の座標・標高・時刻が戻る', () => {
    const back = importLines(generateTrackGPXWithPhotos(coords, '軌跡', photos))!;
    expect(back.recordSet).toHaveLength(1);
    expect(back.recordSet[0].field.name).toBe('軌跡');
    expect((back.recordSet[0].coords as LocationType[]).map(({ latitude, longitude, altitude, timestamp }) => ({ latitude, longitude, altitude, timestamp }))).toEqual(
      coords.map(({ latitude, longitude, altitude, timestamp }) => ({ latitude, longitude, altitude, timestamp }))
    );
    // trk.timeは書かないので最初の点の時刻になる
    expect(dayjs(back.recordSet[0].field.time as string).valueOf()).toBe(coords[0].timestamp);
  });

  it('写真のwptは名前・位置・時刻つきでポイントとして戻る（素直なファイル名）', () => {
    const back = importPoints(generateTrackGPXWithPhotos(coords, 't', photos.slice(0, 1)))!;
    expect(back.recordSet).toHaveLength(1);
    expect(back.recordSet[0].field.name).toBe('IMG_0001.jpg');
    expect(back.recordSet[0].coords).toMatchObject({ latitude: 35.005, longitude: 139.005 });
    expect(dayjs(back.recordSet[0].field.time as string).valueOf()).toBe(photos[0].timestamp);
  });

  it('記号を含む写真ファイル名・軌跡名も同じ文字列で戻る', () => {
    const xml = generateTrackGPXWithPhotos(coords, 'A&B <軌跡>', photos);
    expect(importPoints(xml)!.recordSet[1].field.name).toBe('写真 & <2>.jpg');
    expect(importLines(xml)!.recordSet[0].field.name).toBe('A&B <軌跡>');
  });

  it('1点だけの軌跡でも取り込み直せる', () => {
    const back = importLines(generateTrackGPXWithPhotos(coords.slice(0, 1), 'single'));
    expect(back).toBeDefined();
    expect(back!.recordSet).toHaveLength(1);
  });

  it('楕円体高はgeoidheightとして書き出され、取り込み直すと戻る', () => {
    const xml = generateTrackGPXWithPhotos(coords, 't');
    expect(xml).toContain('<geoidheight>38.25</geoidheight>');
    const back = importLines(xml)!;
    expect((back.recordSet[0].coords as LocationType[])[0].ellipsoidHeight).toBeCloseTo(88.25, 3);
  });

  it('写真なしでもwptは出ずtrkだけになる', () => {
    const xml = generateTrackGPXWithPhotos(coords, 't');
    expect(xml).not.toContain('<wpt');
    expect(importPoints(xml)!.recordSet).toEqual([]);
  });
});
