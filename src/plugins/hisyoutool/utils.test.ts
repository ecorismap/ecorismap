import { Position } from '@turf/turf';
import { RecordType } from '../../types';
import { getSplitPoints, getSplittedLinesByLine, getSplittedLinesByPoint } from './utils';

describe('getSplitPoints', () => {
  let lineLatLon: Position[] = [];
  let lineActions: {
    id: string;
    record: RecordType | undefined;
    xy: Position[];
    latlon: Position[];
    properties: string[];
  }[] = [];

  it('return splitPoints that are lines start and end', () => {
    lineLatLon = [
      [0, 0],
      [130, 35],
    ];
    lineActions = [
      {
        id: '1',
        record: undefined,
        xy: [
          [0, 0],
          [100, 100],
        ],
        latlon: [
          [0, 0],
          [130, 35],
        ],
        properties: ['SENKAI'],
      },
    ];
    const splitPoints = getSplitPoints(lineLatLon, lineActions);
    expect(splitPoints).toStrictEqual([
      { distance: 0, index: 0, location: 0, position: [0, 0], properties: ['SENKAI'], type: 'start' },
      { distance: 0, index: 1, location: 13540.450216744977, position: [130, 35], properties: ['SENKAI'], type: 'end' },
    ]);
  });

  it('return no splitPoints', () => {
    lineLatLon = [];
    lineActions = [];
    const splitPoints = getSplitPoints(lineLatLon, lineActions);
    expect(splitPoints).toStrictEqual([]);
  });
});

describe('getSplittedLinesByLine', () => {
  let hisyouLatLon: Position[] = [];
  let lineActions: {
    id: string;
    record: RecordType | undefined;
    xy: Position[];
    latlon: Position[];
    properties: string[];
  }[] = [];

  it('return no splitLines', () => {
    hisyouLatLon = [
      [0, 0],
      [130, 35],
    ];
    lineActions = [
      {
        id: '1',
        record: undefined,
        xy: [
          [0, 0],
          [100, 100],
        ],
        latlon: [
          [0, 0],
          [130, 35],
        ],
        properties: ['SENKAI'],
      },
    ];
    const splittedLinesByLine = getSplittedLinesByLine(hisyouLatLon, lineActions);

    expect(splittedLinesByLine).toStrictEqual([
      {
        latlon: [
          [0, 0],
          [130, 35],
        ],
        properties: ['HISYOU', 'SENKAI'],
      },
    ]);
  });

  it('return splitedLines', () => {
    hisyouLatLon = [];
    lineActions = [];
    const splittedLinesByLine = getSplittedLinesByLine(hisyouLatLon, lineActions);

    expect(splittedLinesByLine).toStrictEqual([{ latlon: [], properties: ['HISYOU'] }]);
  });

  it('return just hisyouLine', () => {
    hisyouLatLon = [
      [0, 0],
      [130, 35],
    ];
    lineActions = [];
    const splittedLinesByLine = getSplittedLinesByLine(hisyouLatLon, lineActions);

    expect(splittedLinesByLine).toStrictEqual([
      {
        latlon: [
          [0, 0],
          [130, 35],
        ],
        properties: ['HISYOU'],
      },
    ]);
  });
});

describe('getSplittedLinesByPoint', () => {
  let splittedLinesByLine: {
    latlon: Position[];
    properties: string[];
  }[];
  let tomariActions: {
    id: string;
    record: RecordType | undefined;
    xy: Position[];
    latlon: Position[];
    properties: string[];
  }[] = [];

  it('return splitedLines', () => {
    splittedLinesByLine = [];
    tomariActions = [];
    const splittedLines = getSplittedLinesByPoint(splittedLinesByLine, tomariActions);

    expect(splittedLines).toStrictEqual([]);
  });

  it('return no splitLines', () => {
    splittedLinesByLine = [
      {
        latlon: [
          [0, 0],
          [130, 35],
        ],
        properties: ['HISYOU'],
      },
    ];
    tomariActions = [];
    const splittedLines = getSplittedLinesByPoint(splittedLinesByLine, tomariActions);

    expect(splittedLines).toStrictEqual([
      {
        latlon: [
          [0, 0],
          [130, 35],
        ],
        properties: ['HISYOU'],
      },
    ]);
  });
});
