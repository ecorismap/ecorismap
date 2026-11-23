import type { LngLat, Map as MaplibreMap } from 'maplibre-gl';
import { createBehindCameraTest, isUsableLngLat, queryTerrainElevationSafe } from '../webCamera';

class FakeLngLat {
  constructor(public lng: number, public lat: number) {}
}

/** 真北を水平（pitch 90）に見ている地図。queryTerrainElevationの振る舞いだけ差し替える */
const mockMap = (queryTerrainElevation: () => number | null, fallback: number | null = 123): MaplibreMap => {
  const camera = { lng: 140, lat: 40 };
  return {
    getPitch: () => 90,
    getBearing: () => 0,
    getZoom: () => 20.5,
    getCenter: () => new FakeLngLat(0, 0),
    transform: { getCameraLngLat: () => camera, getCameraAltitude: () => 1000 },
    queryTerrainElevation: jest.fn(queryTerrainElevation),
    terrain:
      fallback === null
        ? null
        : { tileManager: { maxzoom: 22 }, getElevationForLngLatZoom: jest.fn(() => fallback) },
  } as unknown as MaplibreMap;
};

const outOfBounds = () => {
  throw new Error('x=59809281, y=25825791, z=26 outside of bounds.');
};

describe('queryTerrainElevationSafe（Web眺望のz26例外）', () => {
  it('通常はqueryTerrainElevationの値を返す', () => {
    expect(queryTerrainElevationSafe(mockMap(() => 500), 140, 40)).toBe(500);
  });

  it('例外のときは固定ズームの読み出しで代える', () => {
    const map = mockMap(outOfBounds, 321);
    expect(queryTerrainElevationSafe(map, 140, 40)).toBe(321);
    const terrain = (map as unknown as { terrain: { getElevationForLngLatZoom: jest.Mock } }).terrain;
    // ズームはmaplibreの上限（地形タイルのmaxzoom）以内に抑える
    expect(terrain.getElevationForLngLatZoom).toHaveBeenCalledWith({ lng: 140, lat: 40 }, 20);
  });

  it('例外で代わりも無ければnull（地形なし・NaN・座標が数でない）', () => {
    expect(queryTerrainElevationSafe(mockMap(outOfBounds, null), 140, 40)).toBeNull();
    expect(queryTerrainElevationSafe(mockMap(() => NaN), 140, 40)).toBeNull();
    expect(queryTerrainElevationSafe(mockMap(() => null), 140, 40)).toBeNull();
    expect(queryTerrainElevationSafe(mockMap(() => 1), NaN, 40)).toBeNull();
  });
});

describe('createBehindCameraTest（位置未取得の現在地ドット）', () => {
  it('位置の無い点は判定せず表示側（false）にする', () => {
    const map = mockMap(() => 0);
    const isBehind = createBehindCameraTest(map);
    expect(isBehind).not.toBeNull();
    expect(isBehind?.(undefined)).toBe(false);
    expect(isBehind?.(null)).toBe(false);
    expect(map.queryTerrainElevation).not.toHaveBeenCalled();
  });

  it('標高の読み出しが例外でも判定を続ける', () => {
    const isBehind = createBehindCameraTest(mockMap(outOfBounds, null));
    // 北（前方）は見える、南（後方）は後ろ
    expect(isBehind?.({ lng: 140, lat: 40.1 } as LngLat)).toBe(false);
    expect(isBehind?.({ lng: 140, lat: 39.9 } as LngLat)).toBe(true);
  });

  it('isUsableLngLatは有限の座標だけ通す', () => {
    expect(isUsableLngLat({ lng: 1, lat: 2 } as LngLat)).toBe(true);
    expect(isUsableLngLat(undefined)).toBe(false);
    expect(isUsableLngLat({ lng: NaN, lat: 2 } as LngLat)).toBe(false);
  });
});
