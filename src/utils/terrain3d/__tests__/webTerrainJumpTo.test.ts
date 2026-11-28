import type { JumpToOptions, Map as MaplibreMap } from 'maplibre-gl';
import { keepTerrainElevationOnJumpTo, withTerrainElevation } from '../webTerrainJumpTo';

describe('withTerrainElevation', () => {
  const elevationAt = (lng: number, lat: number) => lng + lat;

  it('地形があれば、行き先の地面の標高を足す', () => {
    expect(withTerrainElevation({ center: [135, 35], zoom: 14.93 }, elevationAt, [0, 0])).toEqual({
      center: [135, 35],
      zoom: 14.93,
      elevation: 170,
    });
    expect(withTerrainElevation({ center: { lng: 135, lat: 35 } }, elevationAt, [0, 0]).elevation).toBe(170);
    expect(withTerrainElevation({ center: { lon: 135, lat: 35 } }, elevationAt, [0, 0]).elevation).toBe(170);
  });

  it('行き先の指定が無ければ、いまの注視点の標高を足す', () => {
    expect(withTerrainElevation({ zoom: 12.5 }, elevationAt, [140, 38])).toEqual({ zoom: 12.5, elevation: 178 });
  });

  it('地形が無いとき・標高が指定されているとき・標高が求まらないときは、そのまま渡す', () => {
    const options: JumpToOptions = { center: [135, 35], zoom: 14.93 };
    expect(withTerrainElevation(options, null, [0, 0])).toBe(options);
    const withElevation: JumpToOptions = { center: [135, 35], elevation: 12 };
    expect(withTerrainElevation(withElevation, elevationAt, [0, 0])).toBe(withElevation);
    expect(withTerrainElevation(options, () => NaN, [0, 0])).toBe(options);
  });
});

describe('keepTerrainElevationOnJumpTo', () => {
  class FakeLngLat {
    constructor(
      public lng: number,
      public lat: number
    ) {}
  }
  const createMap = (withTerrain: boolean) => {
    const jumpTo = jest.fn();
    const getElevationForLngLatZoom = jest.fn(() => 300);
    const map = {
      jumpTo,
      terrain: withTerrain ? { getElevationForLngLatZoom } : null,
      transform: { center: new FakeLngLat(135, 35), tileZoom: 14 },
    };
    keepTerrainElevationOnJumpTo(map as unknown as MaplibreMap);
    return { map: map as unknown as MaplibreMap, jumpTo, getElevationForLngLatZoom };
  };

  it('3Dでは、読み込まれているズーム（整数）で求めた標高を渡す', () => {
    const { map, jumpTo, getElevationForLngLatZoom } = createMap(true);
    map.jumpTo({ center: [135.1, 35.1], zoom: 14.93 }, { source: 'test' });
    expect(getElevationForLngLatZoom).toHaveBeenCalledWith(expect.objectContaining({ lng: 135.1, lat: 35.1 }), 14);
    expect(jumpTo).toHaveBeenCalledWith({ center: [135.1, 35.1], zoom: 14.93, elevation: 300 }, { source: 'test' });
  });

  it('2Dでは、そのまま渡す', () => {
    const { map, jumpTo } = createMap(false);
    map.jumpTo({ center: [135.1, 35.1], zoom: 14.93 });
    expect(jumpTo).toHaveBeenCalledWith({ center: [135.1, 35.1], zoom: 14.93 }, undefined);
  });

  it('同じ地図に二度かけても、二重には包まない', () => {
    const { map, getElevationForLngLatZoom } = createMap(true);
    keepTerrainElevationOnJumpTo(map);
    map.jumpTo({ zoom: 13.2 });
    expect(getElevationForLngLatZoom).toHaveBeenCalledTimes(1);
  });
});
