// タイル監査 M-M18（Web）: PMTiles のソースの maxzoom はアーカイブの最大ズームを超えない
import { getPmtilesSource } from '../vectorTileStyle';
import { TileMapType } from '../../types';

jest.mock('../db', () => ({ db: { pmtiles: { get: jest.fn() } } }));
jest.mock('pmtiles', () => ({ PMTiles: jest.fn(), Protocol: jest.fn() }));

const map = (extra: Partial<TileMapType>): TileMapType =>
  ({
    id: 'P',
    name: 'P',
    url: 'pmtiles://https://example.com/a.pmtiles',
    attribution: '',
    maptype: 'none',
    visible: true,
    transparency: 0,
    overzoomThreshold: 18,
    highResolutionEnabled: false,
    minimumZ: 0,
    maximumZ: 15,
    flipY: false,
    isVector: true,
    ...extra,
  } as TileMapType);

describe('getPmtilesSource の maxzoom', () => {
  it('保存済みの overzoomThreshold がアーカイブの最大ズームより大きければ最大ズームに抑える', () => {
    expect(getPmtilesSource(map({}), {})).toMatchObject({ maxzoom: 15 });
  });

  it('overzoomThreshold の方が小さければそれを使う', () => {
    expect(getPmtilesSource(map({ overzoomThreshold: 12 }), {})).toMatchObject({ maxzoom: 12 });
  });
});
