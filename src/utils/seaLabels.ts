/**
 * GEBCO海底地形図に重ねる島名・海底地形名（海しる由来の同梱データ）の選定ロジック。
 *
 * ネイティブではタイル焼き込みではなくMarkerオーバーレイで描く（鮮明・正立・境界切れなし）。
 * 過密を防ぐ間引きは「ワールドピクセル格子に1件」方式:
 * 画面ではなく世界座標に固定した格子なので、パンしてもラベルの選ばれ方が変わらず、
 * タイル境界の概念もないため隣接タイル間の重なり問題が構造的に起きない。
 */
import { PRESET_LAYER_DATA } from '../constants/Presets';
import { ViewportBounds, expandBounds, isPointInBounds } from './ViewportCulling';

export type SeaLabelPoint = {
  lon: number;
  lat: number;
  name: string;
  key: string;
};

/** 表示ズーム範囲（Web版のGeoJSONレイヤと同じ） */
export const SEA_LABEL_MIN_ZOOM = 4;
export const SEA_LABEL_MAX_ZOOM = 15;
/** 間引き格子の一辺（256pxタイル基準のワールドピクセル） */
const GRID_PX = 128;
/** 1画面に出す最大件数 */
const MAX_FEATURES = 50;

function normalize(): SeaLabelPoint[] {
  const points: SeaLabelPoint[] = [];
  const sources: [keyof typeof PRESET_LAYER_DATA & string, string][] = [
    ['msil_islands', '島名'],
    ['msil_undersea_features', '海底地形名'],
  ];
  for (const [dataKey, nameKey] of sources) {
    const data = PRESET_LAYER_DATA[dataKey];
    if (!data) continue;
    for (const feature of data.features) {
      if (!feature.geometry || feature.geometry.type !== 'Point') continue;
      const name = String((feature.properties as Record<string, unknown> | null)?.[nameKey] ?? '');
      if (name === '') continue;
      const [lon, lat] = feature.geometry.coordinates;
      points.push({ lon, lat, name, key: `${name}:${lon}:${lat}` });
    }
  }
  return points;
}

const ALL_POINTS = normalize();

/** ビューポートとズームから表示するラベルを選ぶ。z4〜15以外は空 */
export function selectSeaLabels(bounds: ViewportBounds, zoomDecimal: number): SeaLabelPoint[] {
  const zoom = Math.floor(zoomDecimal);
  if (zoom < SEA_LABEL_MIN_ZOOM || zoom > SEA_LABEL_MAX_ZOOM) return [];

  // 少し外側まで含めて、ラベルが画面端に入りかけたときのポップインを軽減する
  const expanded = expandBounds(bounds, 10);
  const worldSize = 256 * Math.pow(2, zoom);
  const usedCells = new Set<string>();
  const selected: SeaLabelPoint[] = [];

  for (const point of ALL_POINTS) {
    if (!isPointInBounds({ latitude: point.lat, longitude: point.lon }, expanded)) continue;
    const nx = (point.lon + 180) / 360;
    const latRad = (point.lat * Math.PI) / 180;
    const ny = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
    const cell = `${Math.floor((nx * worldSize) / GRID_PX)}:${Math.floor((ny * worldSize) / GRID_PX)}`;
    if (usedCells.has(cell)) continue;
    usedCells.add(cell);
    selected.push(point);
    if (selected.length >= MAX_FEATURES) break;
  }
  return selected;
}
