import reducer, { addTileMapAction, createTileMapsInitialState, setTileMapsAction } from '../../modules/tileMaps';
import { TileMapType } from '../../types';

describe('modules/tileMaps', () => {
  test('should set the tileMaps to state', () => {
    const state = createTileMapsInitialState();
    const tileMaps: TileMapType[] = [
      {
        id: 'hillshademap',
        name: '陰影起伏図',
        url: 'https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png',
        attribution: '国土地理院',
        maptype: 'none',
        visible: true,
        transparency: 0.7,
        overzoomThreshold: 16,
        highResolutionEnabled: true,
        minimumZ: 0,
        maximumZ: 17,
        flipY: false,
      },
    ];
    const action = setTileMapsAction(tileMaps);
    expect(reducer(state, action)).toEqual(tileMaps);
  });

  test('should added the tileMap to state', () => {
    const state = [] as TileMapType[];
    const tileMaps: TileMapType = {
      id: 'hillshademap',
      name: '陰影起伏図',
      url: 'https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png',
      attribution: '国土地理院',
      maptype: 'none',
      visible: true,
      transparency: 0.7,
      overzoomThreshold: 16,
      highResolutionEnabled: true,
      minimumZ: 0,
      maximumZ: 17,
      flipY: false,
    };
    const action = addTileMapAction(tileMaps);
    expect(reducer(state, action)).toEqual([tileMaps]);
  });
});
