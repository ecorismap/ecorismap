import { ElevationProfilePoint } from './trackStatistics';

// 標高グラフの座標計算。画面表示（TrackSummaryChart）とエクスポート画像（trackSummaryImage）で
// 同じ見た目になるよう共有する純関数

export interface ChartPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const CHART_PADDING: ChartPadding = { top: 10, right: 10, bottom: 22, left: 42 };

const Y_TICK_CANDIDATES = [5, 10, 20, 50, 100, 200, 500, 1000, 2000];
const X_TICK_CANDIDATES = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];

// レンジをtickCount以下で刻める「きりのいい」間隔を選ぶ
const pickTickInterval = (range: number, candidates: number[], maxTicks: number) => {
  for (const c of candidates) {
    if (range / c <= maxTicks) return c;
  }
  return candidates[candidates.length - 1];
};

export interface ElevationChart {
  points: { x: number; y: number }[];
  linePath: string;
  areaPath: string;
  yTicks: number[];
  xTicks: number[];
  toX: (distanceKm: number) => number;
  toY: (altitude: number) => number;
  baseY: number;
  maxDistance: number;
}

export const buildElevationChart = (
  profile: ElevationProfilePoint[],
  width: number,
  height: number,
  padding: ChartPadding = CHART_PADDING
): ElevationChart | null => {
  if (width === 0 || profile.length < 2) return null;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const maxDistance = profile[profile.length - 1].distanceKm;
  const altitudes = profile.map((p) => p.altitude);
  const minAlt = Math.min(...altitudes);
  const maxAlt = Math.max(...altitudes);
  // 標高レンジに10%（最低10m）のパディングを加える
  const altPadding = Math.max((maxAlt - minAlt) * 0.1, 10);
  const yTick = pickTickInterval(maxAlt - minAlt + altPadding * 2, Y_TICK_CANDIDATES, 5);
  const yMin = Math.floor((minAlt - altPadding) / yTick) * yTick;
  const yMax = Math.ceil((maxAlt + altPadding) / yTick) * yTick;
  const xTick = pickTickInterval(maxDistance, X_TICK_CANDIDATES, 6);

  const toX = (distanceKm: number) => padding.left + (maxDistance === 0 ? 0 : (distanceKm / maxDistance) * plotWidth);
  const toY = (altitude: number) => padding.top + (1 - (altitude - yMin) / (yMax - yMin)) * plotHeight;

  const points = profile.map((p) => ({ x: toX(p.distanceKm), y: toY(p.altitude) }));
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const baseY = padding.top + plotHeight;
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)} ${baseY} L${points[0].x.toFixed(
    1
  )} ${baseY} Z`;

  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax; v += yTick) yTicks.push(v);
  const xTicks: number[] = [];
  for (let v = 0; v <= maxDistance; v += xTick) xTicks.push(v);

  return { points, linePath, areaPath, yTicks, xTicks, toX, toY, baseY, maxDistance };
};
