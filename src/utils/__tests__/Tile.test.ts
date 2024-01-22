import { TileRegionType } from '../../types';
import { latToTileY, lonToTileX, tileGridForRegion, tileToWebMercator } from '../Tile';
import * as turf from '@turf/turf';

describe('tileGridForRegion', () => {
  const tileRegion: TileRegionType = {
    id: '0',
    tileMapId: '0',
    coords: [
      { latitude: 35, longitude: 135 },
      { latitude: 35.2, longitude: 135 },
      { latitude: 35.2, longitude: 135.2 },
      { latitude: 35, longitude: 135.2 },
    ],
    centroid: {
      latitude: 35.1,
      longitude: 135.1,
    },
  };
  it('return tile list for region', () => {
    expect(tileGridForRegion(tileRegion, 8, 9)).toStrictEqual([
      { x: 224, y: 101, z: 8 },
      { x: 224, y: 102, z: 8 },
      { x: 225, y: 101, z: 8 },
      { x: 225, y: 102, z: 8 },
      { x: 448, y: 202, z: 9 },
      { x: 448, y: 203, z: 9 },
      { x: 449, y: 202, z: 9 },
      { x: 449, y: 203, z: 9 },
    ]);
  });
});

describe('lonToTileX', () => {
  it('return tile x', () => {
    expect(lonToTileX(134.43321973085403, 9)).toBe(447);
    expect(lonToTileX(135.02348240464926, 9)).toBe(448);
  });
});

describe('latToTileY', () => {
  it('return tile y', () => {
    expect(latToTileY(35.58172857314284, 9)).toBe(201);
    expect(latToTileY(34.621287920331895, 9)).toBe(203);
  });
});

describe('latLonToWebMercator', () => {
  it('returns correct Web Mercator coordinates when latitude and longitude are 0, zoom level is 0, and tile size is 256', () => {
    const result = turf.toMercator([-180, 0]);
    expect(result[0]).toBe(-Math.PI * 6378137);
    expect(result[1]).toBe(0);
  });
});

describe('tileToWebMercator', () => {
  it('returns correct Web Mercator coordinates when x, y, and z are 0', () => {
    const result = tileToWebMercator(0, 0, 0);
    expect(result.mercatorX).toBe(-Math.PI * 6378137);
    expect(result.mercatorY).toBe(Math.PI * 6378137);
  });
});
