import { RecordType } from '../../types';
import { sortData, getInitialFieldValue } from '../Data';

describe('sortData', () => {
  const recordExt: RecordType[] = [
    {
      id: '0',
      userId: '0',
      displayName: 'mizutani',
      visible: true,
      redraw: false,
      coords: [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
      ],
      field: { no: 1, name: 'みやぎ' },
    },
    {
      id: '1',
      userId: '0',
      displayName: 'mizutani',
      visible: true,
      redraw: false,
      coords: [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
      ],
      field: { no: 2, name: 'あいち' },
    },
  ];

  it('return DESCENDING recordSet sorted by no', () => {
    expect(sortData(recordExt, 'no', 'DESCENDING')).toStrictEqual({
      data: [
        {
          coords: [
            { latitude: 0, longitude: 0 },
            { latitude: 1, longitude: 1 },
          ],
          displayName: 'mizutani',
          field: { name: 'あいち', no: 2 },
          id: '1',
          redraw: false,
          userId: '0',
          visible: true,
        },
        {
          coords: [
            { latitude: 0, longitude: 0 },
            { latitude: 1, longitude: 1 },
          ],
          displayName: 'mizutani',
          field: { name: 'みやぎ', no: 1 },
          id: '0',
          redraw: false,
          userId: '0',
          visible: true,
        },
      ],
      idx: [1, 0],
    });
  });
  it('return ASCENDING recordSet sorted by name', () => {
    expect(sortData(recordExt, 'name', 'ASCENDING')).toStrictEqual({
      data: [
        {
          coords: [
            { latitude: 0, longitude: 0 },
            { latitude: 1, longitude: 1 },
          ],
          displayName: 'mizutani',
          field: { name: 'あいち', no: 2 },
          id: '1',
          redraw: false,
          userId: '0',
          visible: true,
        },
        {
          coords: [
            { latitude: 0, longitude: 0 },
            { latitude: 1, longitude: 1 },
          ],
          displayName: 'mizutani',
          field: { name: 'みやぎ', no: 1 },
          id: '0',
          redraw: false,
          userId: '0',
          visible: true,
        },
      ],
      idx: [1, 0],
    });
  });
  it('return UNSORTED recordSet', () => {
    expect(sortData(recordExt, 'name')).toStrictEqual({
      data: [
        {
          coords: [
            { latitude: 0, longitude: 0 },
            { latitude: 1, longitude: 1 },
          ],
          displayName: 'mizutani',
          field: { name: 'みやぎ', no: 1 },
          id: '0',
          redraw: false,
          userId: '0',
          visible: true,
        },
        {
          coords: [
            { latitude: 0, longitude: 0 },
            { latitude: 1, longitude: 1 },
          ],
          displayName: 'mizutani',
          field: { name: 'あいち', no: 2 },
          id: '1',
          redraw: false,
          userId: '0',
          visible: true,
        },
      ],
      idx: [0, 1],
    });
  });
});

describe('getInitialFieldValue', () => {
  it('return default value', () => {
    expect(getInitialFieldValue('STRING')).toStrictEqual('');
    expect(getInitialFieldValue('SERIAL')).toStrictEqual(0);
    expect(getInitialFieldValue('INTEGER')).toStrictEqual(0);
    expect(getInitialFieldValue('DECIMAL')).toStrictEqual(0);
    expect(getInitialFieldValue('DATETIME')).toStrictEqual('1970-01-01T00:00:00+09:00');
    expect(getInitialFieldValue('PHOTO')).toStrictEqual([]);
    expect(
      getInitialFieldValue('CHECK', [
        { value: 'a', isOther: false },
        { value: 'b', isOther: false },
        { value: 'c', isOther: false },
      ])
    ).toStrictEqual('');
    expect(
      getInitialFieldValue('RADIO', [
        { value: 'a', isOther: false },
        { value: 'b', isOther: false },
        { value: 'c', isOther: false },
      ])
    ).toStrictEqual('a');
    expect(
      getInitialFieldValue('LIST', [
        { value: 'a', isOther: false },
        { value: 'b', isOther: false },
        { value: 'c', isOther: false },
      ])
    ).toStrictEqual('a');
    expect(getInitialFieldValue('CHECK')).toStrictEqual('');
    expect(getInitialFieldValue('RADIO', [])).toStrictEqual('');
    expect(getInitialFieldValue('LIST')).toStrictEqual('');
  });
});
