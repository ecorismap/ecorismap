/**
 * 記録中の軌跡を3Dのドレープ描画指定へ変換する。
 *
 * 2Dは精度の悪い区間を破線（TRACK_DASH_PATTERN）で描き分けているが、
 * 3Dの軌跡は地形に貼るリボンなので破線パターンを持てない。
 * 代わりに同じ色の半透明で描き、実線との違いを出す。
 * GPU非依存の純関数（jestでテスト可能）。
 */
import { TrackSegmentType } from '../../types';
import { Rgba } from './colorUtils';
import { DataOverlaySpec } from './TerrainScene';
import { MERCATOR_CIRCUMFERENCE } from './coords';

/** 低精度区間のアルファ倍率（2Dの破線に代わる区別） */
export const LOW_ACCURACY_ALPHA_RATIO = 0.35;

/** 軌跡の線幅[px]。2DのPolyline(strokeWidth=4)と揃える */
export const TRACK_LINE_WIDTH_PX = 4;

/** 線幅[px]をメルカトルm換算する（HomeTerrain3Dのライン幅と同じ式） */
export const trackWidthMeters = (zoom: number): number =>
  (TRACK_LINE_WIDTH_PX * MERCATOR_CIRCUMFERENCE) / (256 * Math.pow(2, zoom));

/**
 * 精度で分割済みの軌跡セグメントをドレープ指定へ変換する。
 *
 * @param segments splitTrackByAccuracy()の出力
 * @param idPrefix spec idの接頭辞（チャンク番号など、系統内で一意になる文字列）
 * @param widthMeters リボン幅[メルカトルm]
 * @param color 実線部分の色
 */
export const buildTrackOverlaySpecs = (
  segments: TrackSegmentType[],
  idPrefix: string,
  widthMeters: number,
  color: Rgba
): DataOverlaySpec[] => {
  const specs: DataOverlaySpec[] = [];
  segments.forEach((segment, index) => {
    // 1点だけの区間はリボンにならない（buildRibbonもnullを返す）
    if (segment.coordinates.length < 2) return;
    const segmentColor: Rgba = segment.isLowAccuracy
      ? [color[0], color[1], color[2], color[3] * LOW_ACCURACY_ALPHA_RATIO]
      : color;
    specs.push({
      id: `${idPrefix}-${index}`,
      kind: 'line',
      coords: segment.coordinates,
      color: segmentColor,
      widthMeters,
    });
  });
  return specs;
};
