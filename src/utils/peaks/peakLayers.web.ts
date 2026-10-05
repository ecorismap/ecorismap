/**
 * Web版（maplibre）の2D山名レイヤ。地図一覧の「山名」（peaks://）に対応する。
 *
 * ネイティブ（HomePeakLabels）と同じく、ランクごとの表示開始ズーム（PEAK_2D_MIN_ZOOM）から
 * 主要な山を先に出す。重なりはmaplibreの衝突判定に任せる。ランクごとにレイヤを分け、
 * 主要な山のレイヤを上に置く（maplibreは上のレイヤのラベルから先に配置するので、重なったら主要な山が残る）。
 */
import type { FeatureCollection, Point } from 'geojson';
import type { LayerSpecification } from 'maplibre-gl';
import { COLOR } from '../../constants/AppConstants';
import { TileMapType } from '../../types';
import { PeakIndex } from './peakData';
import { PEAK_2D_MIN_ZOOM } from './peak2dLabels';

export type PeakFeatureCollection = FeatureCollection<Point, { name: string; ele: number; rank: number }>;

export const EMPTY_PEAKS: PeakFeatureCollection = { type: 'FeatureCollection', features: [] };

export const toPeakGeoJSON = (index: PeakIndex): PeakFeatureCollection => ({
  type: 'FeatureCollection',
  features: index.all.map((peak) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [peak.longitude, peak.latitude] },
    properties: { name: peak.name, ele: Math.round(peak.ele), rank: peak.rank },
  })),
});

/** ランクの低い（小さな山の）レイヤから順に返す（後のものほど上に重なる） */
export const getPeakLayers = (tileMap: TileMapType): LayerSpecification[] => {
  const opacity = 1 - (tileMap.transparency ?? 0);
  const ranks = Object.keys(PEAK_2D_MIN_ZOOM)
    .map(Number)
    .sort((a, b) => b - a);
  return ranks.map((rank, i) => ({
    id: `${tileMap.id}_${i}`,
    type: 'symbol',
    source: tileMap.id,
    minzoom: PEAK_2D_MIN_ZOOM[rank],
    filter: ['==', ['get', 'rank'], rank],
    layout: {
      // ▲を1行目、山名と標高を2行目にして、▲が山頂に乗るよう上へずらす
      'text-field': [
        'format',
        '▲',
        { 'font-scale': 0.8 },
        '\n',
        {},
        ['concat', ['get', 'name'], ' ', ['to-string', ['get', 'ele']]],
        {},
      ],
      'text-font': ['Noto Sans CJK JP Bold'],
      'text-size': 12,
      'text-anchor': 'top',
      'text-offset': [0, -0.55],
      // 同じランクの中では高い山を先に置く
      'symbol-sort-key': ['-', 10000, ['get', 'ele']],
    },
    paint: {
      'text-color': COLOR.PEAK_LABEL,
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.2,
      'text-opacity': opacity,
    },
  }));
};
