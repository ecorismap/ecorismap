import { TileRegionType } from '../../types';
import { latToTileY, lonToTileX, tileGridForRegion, tileToLatLon } from '../Tile';

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

describe('tileToLatLon', () => {
  it('return lat lon', () => {
    expect(tileToLatLon(447, 201, 9)).toStrictEqual({ lat: 36.03133177633187, lon: 134.296875 });
    expect(tileToLatLon(448, 203, 9)).toStrictEqual({ lat: 34.88593094075317, lon: 135 });
  });
});
