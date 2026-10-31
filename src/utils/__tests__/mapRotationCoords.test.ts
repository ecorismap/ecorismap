import * as turf from '@turf/turf';
import { latLonToXY, xyToLatLon } from '../Coords';
import { isMapRotated } from '../mapHeadingStore';
import { RegionType } from '../../types';

const mapSize = { width: 400, height: 800 };

// 回転した画面の外接矩形として、react-native-mapsが返すのと同じ形のregionを作る
const makeRotatedRegion = (center: [number, number], mercPerPx: number, bearing: number): RegionType => {
  const [cx, cy] = turf.toMercator(center);
  const rad = (bearing * Math.PI) / 180;
  const halfW = ((mapSize.width * Math.abs(Math.cos(rad)) + mapSize.height * Math.abs(Math.sin(rad))) * mercPerPx) / 2;
  const halfH = ((mapSize.width * Math.abs(Math.sin(rad)) + mapSize.height * Math.abs(Math.cos(rad))) * mercPerPx) / 2;
  const [west, south] = turf.toWgs84([cx - halfW, cy - halfH]);
  const [east, north] = turf.toWgs84([cx + halfW, cy + halfH]);
  return {
    latitude: (north + south) / 2,
    longitude: (east + west) / 2,
    latitudeDelta: north - south,
    longitudeDelta: east - west,
    zoom: 15,
    bearing,
  };
};

describe('isMapRotated', () => {
  it('北が上と、ごくわずかな傾きは回転とみなさない', () => {
    expect(isMapRotated(undefined)).toBe(false);
    expect(isMapRotated(0)).toBe(false);
    expect(isMapRotated(0.3)).toBe(false);
    expect(isMapRotated(359.8)).toBe(false);
    expect(isMapRotated(-0.2)).toBe(false);
    expect(isMapRotated(NaN)).toBe(false);
  });

  it('それ以上の傾きは回転とみなす', () => {
    expect(isMapRotated(1)).toBe(true);
    expect(isMapRotated(90)).toBe(true);
    expect(isMapRotated(359)).toBe(true);
  });
});

describe('回転した2D地図の座標変換（ネイティブ）', () => {
  const center: [number, number] = [139.7, 35.6];
  const mercPerPx = 2;

  it('東が上（90°）のとき、東の点は画面の上、北の点は画面の左に来る', () => {
    const region = makeRotatedRegion(center, mercPerPx, 90);
    const [cx, cy] = turf.toMercator(center);
    const east = turf.toWgs84([cx + 100 * mercPerPx, cy]);
    const north = turf.toWgs84([cx, cy + 100 * mercPerPx]);

    const [ex, ey] = latLonToXY(east, region, mapSize, null);
    expect(ex).toBeCloseTo(200, 3);
    expect(ey).toBeCloseTo(300, 3);

    const [nx, ny] = latLonToXY(north, region, mapSize, null);
    expect(nx).toBeCloseTo(100, 3);
    expect(ny).toBeCloseTo(400, 3);
  });

  it('画面中心は地図の中心になる', () => {
    const region = makeRotatedRegion(center, mercPerPx, 37);
    const [lon, lat] = xyToLatLon([200, 400], region, mapSize, null);
    expect(lon).toBeCloseTo(center[0], 8);
    expect(lat).toBeCloseTo(center[1], 8);
  });

  it.each([30, 135, 250, 330])('%d°で画面→緯度経度→画面が一致する', (bearing) => {
    const region = makeRotatedRegion(center, mercPerPx, bearing);
    const xy: [number, number] = [37, 712];
    const latlon = xyToLatLon(xy, region, mapSize, null);
    const [x, y] = latLonToXY(latlon, region, mapSize, null);
    expect(x).toBeCloseTo(xy[0], 6);
    expect(y).toBeCloseTo(xy[1], 6);
  });

  it('北が上なら従来の計算と同じ結果になる', () => {
    const region = makeRotatedRegion(center, mercPerPx, 0);
    const withoutBearing = { ...region, bearing: undefined };
    expect(latLonToXY([139.701, 35.601], region, mapSize, null)).toEqual(
      latLonToXY([139.701, 35.601], withoutBearing, mapSize, null)
    );
  });
});
