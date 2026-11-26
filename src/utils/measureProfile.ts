/**
 * 二点間距離測定の「起伏に沿った距離（沿面距離）」と標高差。
 *
 * 2点を結ぶ線上を標高タイル（demSource）から等間隔に採取し、区間ごとの斜距離を足し合わせる。
 * 採取間隔は線の長さに合わせて粗くする（長い線でタイルを何十枚も取りに行かないため）。
 * 間隔が細かいほど小さな起伏まで拾って沿面距離は長くなるので、値は採取間隔に依存する目安である。
 */
import { LocationType } from '../types';
import { DEM_SOURCE_TILE_SIZE, getDemTile } from './demSource';
import { CoveringDemTile, findCoveringDemTile } from './demSourceCommon';
import { haversineKm } from './Location';
import { getDemElevation, POINT_ELEVATION_DEM_ZOOM } from './viewshed';

const TILE_SIZE = DEM_SOURCE_TILE_SIZE;
/** 線上の採取点の上限（区間数）。タイル1画素≒採取間隔となるズームを選ぶので、取得は数枚で済む */
const MAX_SEGMENTS = 512;
const MIN_PROFILE_ZOOM = 5;
/** 国外などで細かい段が無いとき親タイルを何段まで遡るか（getDemElevationと同じ） */
const ANCESTOR_DEPTH = 7;

const lonToPx = (lon: number, zoom: number) => ((lon + 180) / 360) * TILE_SIZE * Math.pow(2, zoom);
const latToPx = (lat: number, zoom: number) => {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * TILE_SIZE * Math.pow(2, zoom);
};

export interface MeasureProfile {
  /** 水平距離[m] */
  horizontalM: number;
  /** 起伏に沿った距離[m] */
  surfaceM: number;
  /** 標高差[m]（B−A。Bが高ければ正） */
  elevationDiffM: number | null;
}

/**
 * 等間隔に並んだ標高列から沿面距離を求める（純関数）。
 * 標高が欠けている（NaN）区間は水平距離のまま数える。
 */
export const surfaceDistanceFromElevations = (elevations: number[], horizontalM: number): number => {
  const segments = elevations.length - 1;
  if (segments < 1) return horizontalM;
  const step = horizontalM / segments;
  let total = 0;
  for (let i = 0; i < segments; i++) {
    const dh = elevations[i + 1] - elevations[i];
    total += Number.isFinite(dh) ? Math.sqrt(step * step + dh * dh) : step;
  }
  return total;
};

/** 線の長さから、タイル1画素が採取間隔程度になるズームを選ぶ */
export const selectProfileZoom = (latitude: number, horizontalM: number): number => {
  const spacing = horizontalM / MAX_SEGMENTS;
  const metersPerPxAtZ0 = (40075017 * Math.cos((latitude * Math.PI) / 180)) / TILE_SIZE;
  if (spacing <= 0) return POINT_ELEVATION_DEM_ZOOM;
  const zoom = Math.floor(Math.log2(metersPerPxAtZ0 / spacing));
  return Math.max(MIN_PROFILE_ZOOM, Math.min(POINT_ELEVATION_DEM_ZOOM, zoom));
};

/** タイル内をバイリニアで採取する（端は内側へ寄せる） */
const sampleBilinear = (covering: CoveringDemTile, lon: number, lat: number): number => {
  const { tile } = covering;
  const size = tile.size;
  const fx = Math.min(size - 1, Math.max(0, lonToPx(lon, tile.z) - tile.x * size - 0.5));
  const fy = Math.min(size - 1, Math.max(0, latToPx(lat, tile.z) - tile.y * size - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const e = tile.elev;
  const top = e[y0 * size + x0] * (1 - tx) + e[y0 * size + x1] * tx;
  const bottom = e[y1 * size + x0] * (1 - tx) + e[y1 * size + x1] * tx;
  return top * (1 - ty) + bottom * ty;
};

/**
 * 2点間の水平距離・沿面距離・標高差を求める。
 * 標高タイルが取れない（通信エラー等）ときはnullを返す。
 */
export const getMeasureProfile = async (a: LocationType, b: LocationType): Promise<MeasureProfile | null> => {
  const horizontalM = haversineKm(a, b) * 1000;
  const zoom = selectProfileZoom((a.latitude + b.latitude) / 2, horizontalM);
  const metersPerPx = (40075017 * Math.cos((a.latitude * Math.PI) / 180)) / (TILE_SIZE * Math.pow(2, zoom));
  const segments = Math.max(1, Math.min(MAX_SEGMENTS, Math.ceil(horizontalM / metersPerPx)));

  const points: { lon: number; lat: number; key: string }[] = [];
  const tiles = new Map<string, { x: number; y: number }>();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const lon = a.longitude + (b.longitude - a.longitude) * t;
    const lat = a.latitude + (b.latitude - a.latitude) * t;
    const x = Math.floor(lonToPx(lon, zoom) / TILE_SIZE);
    const y = Math.floor(latToPx(lat, zoom) / TILE_SIZE);
    const key = `${x}/${y}`;
    tiles.set(key, { x, y });
    points.push({ lon, lat, key });
  }

  const [coverings, elevA, elevB] = await Promise.all([
    Promise.all(
      [...tiles.entries()].map(async ([key, { x, y }]) => {
        const covering = await findCoveringDemTile(getDemTile, zoom, x, y, ANCESTOR_DEPTH);
        return [key, covering] as const;
      })
    ),
    // 標高差は線の採取（長い線では粗い段）ではなく、端点を一番細かい段で読んだ値で出す
    getDemElevation(a.latitude, a.longitude),
    getDemElevation(b.latitude, b.longitude),
  ]);
  const coveringByKey = new Map<string, CoveringDemTile | null>();
  for (const [key, covering] of coverings) {
    if (covering === undefined) return null;
    coveringByKey.set(key, covering);
  }

  // どの段にもタイルが無い外洋は海面0m（getDemElevationと同じ扱い）
  const elevations = points.map(({ lon, lat, key }) => {
    const covering = coveringByKey.get(key);
    return covering ? sampleBilinear(covering, lon, lat) : 0;
  });

  return {
    horizontalM,
    surfaceM: surfaceDistanceFromElevations(elevations, horizontalM),
    elevationDiffM: elevA !== null && elevB !== null ? elevB - elevA : null,
  };
};
