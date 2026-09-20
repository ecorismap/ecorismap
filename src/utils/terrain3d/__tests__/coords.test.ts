import {
  cameraToRegion,
  distanceToZoom,
  elevationScale,
  latToTileYFloat,
  lonLatToMercator,
  lonToTileXFloat,
  mercatorToLonLat,
  regionToCamera,
  tileSizeMeters,
  tileToMercator,
  zoomToDistance,
} from '../coords';
import { INITIAL_PITCH_DEG } from '../constants';
import { RegionType } from '../../../types';

describe('lonLatToMercator / mercatorToLonLat', () => {
  it('原点(0,0)はメルカトル(0,0)', () => {
    const m = lonLatToMercator(0, 0);
    expect(m.mx).toBeCloseTo(0);
    expect(m.my).toBeCloseTo(0);
  });

  it('往復変換で元の緯度経度に戻る', () => {
    const m = lonLatToMercator(138.73, 35.36);
    const ll = mercatorToLonLat(m.mx, m.my);
    expect(ll.longitude).toBeCloseTo(138.73, 8);
    expect(ll.latitude).toBeCloseTo(35.36, 8);
  });

  it('東経・北緯で正の値', () => {
    const m = lonLatToMercator(139, 35);
    expect(m.mx).toBeGreaterThan(0);
    expect(m.my).toBeGreaterThan(0);
  });
});

describe('tileToMercator / tileSizeMeters', () => {
  it('z0タイル(0,0)の左上は世界の左上', () => {
    const m = tileToMercator(0, 0, 0);
    expect(m.mx).toBeCloseTo(-Math.PI * 6378137);
    expect(m.my).toBeCloseTo(Math.PI * 6378137);
  });

  it('タイル左上とタイル座標floatの整合', () => {
    const lon = 138.73;
    const lat = 35.36;
    const z = 12;
    const tx = Math.floor(lonToTileXFloat(lon, z));
    const ty = Math.floor(latToTileYFloat(lat, z));
    const corner = tileToMercator(z, tx, ty);
    const point = lonLatToMercator(lon, lat);
    // タイル内に収まっている（左上から一辺以内）
    expect(point.mx).toBeGreaterThanOrEqual(corner.mx);
    expect(point.mx).toBeLessThan(corner.mx + tileSizeMeters(z));
    expect(point.my).toBeLessThanOrEqual(corner.my);
    expect(point.my).toBeGreaterThan(corner.my - tileSizeMeters(z));
  });
});

describe('zoomToDistance / distanceToZoom', () => {
  it('往復変換でズームが戻る', () => {
    const d = zoomToDistance(13.5, 800);
    expect(distanceToZoom(d, 800)).toBeCloseTo(13.5, 6);
  });

  it('ズームが上がると距離は縮む', () => {
    expect(zoomToDistance(14, 800)).toBeLessThan(zoomToDistance(12, 800));
  });
});

describe('regionToCamera / cameraToRegion', () => {
  const region: RegionType = {
    latitude: 35.36,
    longitude: 138.73,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
    zoom: 13,
  };

  it('bearing/pitch未指定はheading0・初期ピッチ', () => {
    const cam = regionToCamera(region);
    expect(cam.heading).toBe(0);
    expect(cam.pitch).toBe(INITIAL_PITCH_DEG);
    expect(cam.zoom).toBe(13);
  });

  it('cameraToRegionは位置とズームを保持しbearror/pitchを反映する', () => {
    const cam = { latitude: 35.36, longitude: 138.73, zoom: 13, heading: 45, pitch: 60 };
    const out = cameraToRegion(cam, 400, 800);
    expect(out.latitude).toBe(35.36);
    expect(out.longitude).toBe(138.73);
    expect(out.zoom).toBe(13);
    expect(out.bearing).toBe(45);
    expect(out.pitch).toBe(60);
    expect(out.latitudeDelta).toBeGreaterThan(0);
    expect(out.longitudeDelta).toBeGreaterThan(0);
  });
});

describe('elevationScale', () => {
  it('赤道でexaggerationそのまま、高緯度で拡大', () => {
    expect(elevationScale(0, 1.5)).toBeCloseTo(1.5);
    expect(elevationScale(60, 1.5)).toBeCloseTo(3.0, 5);
  });
});
