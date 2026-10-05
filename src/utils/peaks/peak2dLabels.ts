/**
 * 2D地図に重ねる山名（▲＋山名＋標高）の選定。地図一覧の「山名」（peaks://）を表示中に使う。
 *
 * 地形図と同じく、縮尺に応じて主要な山から順に出す（ランクごとの表示開始ズーム）。
 * 過密は「ワールドピクセル格子に1件」で間引く（seaLabels.tsと同じ方式）。格子は世界座標に
 * 固定なので、パンしてもラベルの選ばれ方が変わらない。同じ格子では重要な山・高い山を残す。
 * Web版はmaplibreのsymbolレイヤで同じ規則（PEAK_2D_MIN_ZOOM）を式にして使う。
 */
import { Peak } from './peakData';
import { ViewportBounds, expandBounds, isPointInBounds } from '../ViewportCulling';

/** 地図一覧の「山名」エントリのURL（タイルではなく、同梱の山頂データを重ねる印） */
export const PEAKS_URL = 'peaks://gsi';
export const isPeaksUrl = (url: string | undefined): boolean => url !== undefined && url.startsWith('peaks://');

/**
 * ランクごとの表示開始ズーム（1:3000m級の主要峰〜4:その他の山）。
 * 過密は間引き（ネイティブは格子、Webは衝突判定）で抑えるので、早めに出してよい
 * （地形図の縮尺より遅いと「拡大しないと出ない」と感じられた）
 */
export const PEAK_2D_MIN_ZOOM: Record<number, number> = { 1: 5, 2: 7, 3: 8, 4: 10, 5: 11 };
const DEFAULT_MIN_ZOOM = 11;
/** 間引き格子の一辺（256pxタイル基準のワールドピクセル） */
const GRID_PX = 96;
/** 1画面に出す最大件数（Markerを増やしすぎない） */
const MAX_FEATURES = 60;

export interface Peak2DLabel extends Peak {
  key: string;
  /** 表示する文字（例: 富士山 3776） */
  text: string;
}

export const peakLabelText = (peak: Peak): string => `${peak.name} ${Math.round(peak.ele)}`;

/** ビューポートとズームから表示する山名を選ぶ */
export const selectPeak2DLabels = (peaks: Peak[], bounds: ViewportBounds, zoomDecimal: number): Peak2DLabel[] => {
  const zoom = Math.floor(zoomDecimal);
  // 少し外側まで含めて、画面端に入りかけたときのポップインを軽減する
  const expanded = expandBounds(bounds, 10);
  const candidates = peaks
    .filter((peak) => zoom >= (PEAK_2D_MIN_ZOOM[peak.rank] ?? DEFAULT_MIN_ZOOM))
    .filter((peak) => isPointInBounds({ latitude: peak.latitude, longitude: peak.longitude }, expanded))
    .sort((a, b) => a.rank - b.rank || b.ele - a.ele);

  const worldSize = 256 * Math.pow(2, zoom);
  const usedCells = new Set<string>();
  const selected: Peak2DLabel[] = [];
  for (const peak of candidates) {
    const nx = (peak.longitude + 180) / 360;
    const latRad = (peak.latitude * Math.PI) / 180;
    const ny = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
    const cell = `${Math.floor((nx * worldSize) / GRID_PX)}:${Math.floor((ny * worldSize) / GRID_PX)}`;
    if (usedCells.has(cell)) continue;
    usedCells.add(cell);
    selected.push({ ...peak, key: `${peak.name}@${peak.latitude},${peak.longitude}`, text: peakLabelText(peak) });
    if (selected.length >= MAX_FEATURES) break;
  }
  return selected;
};
