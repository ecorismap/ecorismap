/**
 * 3D地形エンジンの座標変換。
 *
 * シーンはWebメルカトル(EPSG:3857)のメートルを単位とし、3D起動時のカメラ注視点を
 * ローカル原点に置く（float32のジッタ回避のため、原点差し引きはdoubleで行う）。
 * three.jsはY-up右手系: X=東、Y=上、Z=南。
 * メルカトルは高緯度ほど水平距離が1/cos(lat)に伸びるため、標高も1/cos(lat0)倍して
 * 見た目の凹凸比率を実距離と一致させる（maplibreと同じ扱い）。
 */
import { RegionType } from '../../types';
import { CAMERA_FOV_DEG, INITIAL_PITCH_DEG, MAX_TEX_ZOOM, MIN_TEX_ZOOM } from './constants';
import { Terrain3DCameraState } from './types';

/** メルカトル全周[m] */
export const MERCATOR_CIRCUMFERENCE = 2 * Math.PI * 6378137;

export interface MercatorPoint {
  mx: number;
  my: number;
}

export const lonLatToMercator = (longitude: number, latitude: number): MercatorPoint => {
  const mx = (longitude / 360) * MERCATOR_CIRCUMFERENCE;
  const rad = (latitude * Math.PI) / 180;
  const my = (Math.log(Math.tan(Math.PI / 4 + rad / 2)) / (2 * Math.PI)) * MERCATOR_CIRCUMFERENCE;
  return { mx, my };
};

export const mercatorToLonLat = (mx: number, my: number): { longitude: number; latitude: number } => {
  const longitude = (mx / MERCATOR_CIRCUMFERENCE) * 360;
  const n = (my / MERCATOR_CIRCUMFERENCE) * 2 * Math.PI;
  const latitude = ((2 * Math.atan(Math.exp(n)) - Math.PI / 2) * 180) / Math.PI;
  return { longitude, latitude };
};

/** タイル左上のメルカトル座標 */
export const tileToMercator = (z: number, x: number, y: number): MercatorPoint => {
  const size = MERCATOR_CIRCUMFERENCE / Math.pow(2, z);
  return { mx: x * size - MERCATOR_CIRCUMFERENCE / 2, my: MERCATOR_CIRCUMFERENCE / 2 - y * size };
};

/** タイル一辺のメルカトル長[m] */
export const tileSizeMeters = (z: number): number => MERCATOR_CIRCUMFERENCE / Math.pow(2, z);

export const lonToTileXFloat = (longitude: number, zoom: number): number =>
  ((longitude + 180) / 360) * Math.pow(2, zoom);

export const latToTileYFloat = (latitude: number, zoom: number): number => {
  const rad = (latitude * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom);
};

/**
 * ズームレベル→カメラ距離[メルカトルm]。
 * 「画面高さいっぱいに表示されるメルカトル距離」が2D地図の同ズームと一致するように決める。
 * @param viewportHeightPx 画面高さ（dp。devicePixelRatioは掛けない: 2Dのズーム定義と揃えるため）
 */
export const zoomToDistance = (zoom: number, viewportHeightPx: number): number => {
  const mercPerPx = MERCATOR_CIRCUMFERENCE / (256 * Math.pow(2, zoom));
  const visibleHeight = viewportHeightPx * mercPerPx;
  return visibleHeight / 2 / Math.tan(((CAMERA_FOV_DEG / 2) * Math.PI) / 180);
};

export const distanceToZoom = (distance: number, viewportHeightPx: number): number => {
  const visibleHeight = 2 * distance * Math.tan(((CAMERA_FOV_DEG / 2) * Math.PI) / 180);
  const mercPerPx = visibleHeight / viewportHeightPx;
  return Math.log2(MERCATOR_CIRCUMFERENCE / (256 * mercPerPx));
};

/** 2DのmapRegion→3Dカメラ初期状態 */
export const regionToCamera = (region: RegionType): Terrain3DCameraState => ({
  latitude: region.latitude,
  longitude: region.longitude,
  zoom: clampZoom(region.zoom ?? 12),
  heading: region.bearing ?? 0,
  pitch: region.pitch ?? INITIAL_PITCH_DEG,
});

/**
 * 3Dカメラ→擬似RegionType。
 * latitudeDelta/longitudeDeltaはズームからの近似（useViewportBounds等の既存機能向け）。
 */
export const cameraToRegion = (camera: Terrain3DCameraState, viewportWidthPx: number, viewportHeightPx: number): RegionType => {
  const mercPerPx = MERCATOR_CIRCUMFERENCE / (256 * Math.pow(2, camera.zoom));
  const cosLat = Math.cos((camera.latitude * Math.PI) / 180);
  // メルカトルm→度への換算。経度は一定、緯度はcos(lat)で縮む
  const lonPerMerc = 360 / MERCATOR_CIRCUMFERENCE;
  const latitudeDelta = viewportHeightPx * mercPerPx * lonPerMerc * cosLat;
  const longitudeDelta = viewportWidthPx * mercPerPx * lonPerMerc;
  return {
    latitude: camera.latitude,
    longitude: camera.longitude,
    latitudeDelta,
    longitudeDelta,
    zoom: camera.zoom,
    bearing: camera.heading,
    pitch: camera.pitch,
  };
};

export const clampZoom = (zoom: number): number => Math.min(MAX_TEX_ZOOM, Math.max(MIN_TEX_ZOOM, zoom));

/** 標高の表示倍率。exaggerationに加えメルカトルの水平伸長と揃えるための1/cos(lat0)を掛ける */
export const elevationScale = (originLatitude: number, exaggeration: number): number =>
  exaggeration / Math.cos((originLatitude * Math.PI) / 180);
