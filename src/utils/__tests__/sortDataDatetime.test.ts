import { RecordType } from '../../types';
import dayjs from 'dayjs';
import { sortData } from '../Data';

//ロケール形式は端末のローカル時刻なので、ISO側も実行環境のタイムゾーンで作って比較を揃える
const iso = (local: string) => dayjs(local).format();

const makeRecord = (id: string, time: string): RecordType => ({
  id,
  userId: '0',
  displayName: 'user',
  visible: true,
  redraw: false,
  coords: { latitude: 0, longitude: 0 },
  field: { time },
});

describe('sortData (DATETIME)', () => {
  //ISOと旧ネイティブ版のロケール形式（ja/en）が混在していても時系列に並ぶこと
  const records = [
    makeRecord('a', iso('2026-11-21 12:00')),
    makeRecord('b', '2026/11/21 10:00'),
    makeRecord('c', ''),
    makeRecord('d', '11/20/2026 09:00'),
    makeRecord('e', iso('2026-11-21 11:00')),
    makeRecord('f', 'invalid'),
  ];

  it('sorts ascending by time and puts unparsable values last', () => {
    const result = sortData(records, 'time', 'ASCENDING', 'DATETIME');
    expect(result.data.map((d) => d.id)).toEqual(['d', 'b', 'e', 'a', 'c', 'f']);
    expect(result.idx).toEqual([3, 1, 4, 0, 2, 5]);
  });

  it('sorts descending by time and still puts unparsable values last', () => {
    const result = sortData(records, 'time', 'DESCENDING', 'DATETIME');
    expect(result.data.map((d) => d.id)).toEqual(['a', 'e', 'b', 'd', 'c', 'f']);
  });

  it('keeps original order for equal times', () => {
    const same = [makeRecord('x', iso('2026-11-21 10:00')), makeRecord('y', '2026/11/21 10:00')];
    expect(sortData(same, 'time', 'DESCENDING', 'DATETIME').idx).toEqual([0, 1]);
  });
});
