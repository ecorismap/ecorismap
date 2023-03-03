import { TileRegionType } from '../../types';
import { tileGridForRegion } from '../Tile';

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
