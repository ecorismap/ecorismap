import { LayerType } from '../types';
import { getColorRule } from './Layer';
import { MEMO_ZOOM_OFFSET } from './memoZoom';

export const getColorExpression = (layer_: LayerType, displayName: string) => {
  const colorExpression = [
    'case',
    ['boolean', ['feature-state', 'clicked'], false],
    'rgba(255, 255, 0, 0.7)',
    ['boolean', ['feature-state', 'hover'], false],
    'rgba(255, 255, 0, 0.7)',
    getColorRule(layer_, displayName),
  ];

  return colorExpression;
};

//_displayNameは呼び出し側の互換のため残している（色はfeatureの_labelColorで決まる）
export const getLabelStyle = (layer_: LayerType, userId: string, _displayName?: string) => {
  //文字列と色はgenerateGeoJsonのCENTROID/LINEENDでgenerateLabel/getColorを通した値を使う。
  //式で組み立てるとカスタムラベルの区切りやDATETIMEの整形、個別色がネイティブとずれるため
  const colorExpression = [
    'case',
    ['boolean', ['feature-state', 'clicked'], false],
    'rgba(255, 255, 0, 0.7)',
    ['boolean', ['feature-state', 'hover'], false],
    'rgba(255, 255, 0, 0.7)',
    ['coalesce', ['get', '_labelColor'], 'rgba(0,0,0,1)'],
  ];
  const textField = ['coalesce', ['get', '_label'], ''];

  return {
    id: `${layer_.id}_${userId}-label`,
    type: 'symbol',
    layout: {
      'text-field': textField,
      'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
      //'text-radial-offset': 0.5,
      'text-size': 14,
      'text-justify': 'auto',
      'text-font': ['Noto Sans Universal Regular'],
      //'icon-image': ['get', 'icon']
    },
    paint: {
      'text-color': colorExpression,
      'text-halo-color': 'rgba(255,255,255,1)',
      'text-halo-width': 1,
    },
    filter: ['==', '_visible', true],
  };
};

export const getDataStyleLine = (layer_: LayerType, userId: string, displayName: string) => {
  const colorExpression = getColorExpression(layer_, displayName);

  //ストロークごとの太さ（_strokeWidth）は色分けが「個別」のレイヤでのみ使う。数値以外（未設定・空文字）はレイヤ既定値
  const layerWidth = layer_.colorStyle.lineWidth ?? 1.5;
  const fixedWidth =
    layer_.colorStyle.colorType === 'INDIVIDUAL' ? ['number', ['get', '_strokeWidth'], layerWidth] : layerWidth;
  //マップメモ(_zoom持ち)は描画時よりズームアウトした場合のみ2^(zoom - _zoom)倍で地理的に縮小し、
  //ズームアウトで線が地図を覆い尽くすのを防ぐ（ズームイン側は画面上の太さを維持）。
  //['zoom']はトップレベルのinterpolateでしか使えないため、整数ズームごとのストップ出力側で
  //min(固定幅, 2^(stop - _zoom) * 固定幅)を計算する（隣接ストップ間はexponential base2補間でほぼ正確）
  //_zoomはGoogle（256px）基準なので、maplibreのズーム（stop）を揃えてから比べる（作図監査 E-L8）
  const drawnZoom = ['number', ['get', '_zoom'], 0];
  const stops: unknown[] = [];
  for (let z = 0; z <= 24; z++) {
    stops.push(z, [
      'case',
      ['>', drawnZoom, 0],
      ['min', fixedWidth, ['*', fixedWidth, ['^', 2, ['-', z + MEMO_ZOOM_OFFSET, drawnZoom]]]],
      fixedWidth,
    ]);
  }
  //個別以外はレイヤ一律の太さ（ズーム連動もしない）
  const lineWidth =
    layer_.colorStyle.colorType === 'INDIVIDUAL' ? ['interpolate', ['exponential', 2], ['zoom'], ...stops] : layerWidth;

  return {
    id: `${layer_.id}_${userId}`,
    type: 'line',
    paint: {
      'line-color': colorExpression,
      'line-width': lineWidth,
    },
    layout: {
      visibility: 'visible',
      //描画中のSVGプレビュー(round)と揃える。デフォルトのbutt/miterだと保存された瞬間に両端が縮んで見え、角に尖りが出る
      'line-cap': 'round',
      'line-join': 'round',
    },
    filter: ['==', '_visible', true],
  };
};

export const getDataStylePolygon = (layer_: LayerType, userId: string, displayName: string) => {
  const transparency = Boolean(layer_.colorStyle.transparency);
  const fillColorExpression = getColorExpression(layer_, displayName);

  return {
    id: `${layer_.id}_${userId}`,
    type: 'fill',
    paint: {
      'fill-color': transparency ? 'rgba(0,0,0,0)' : fillColorExpression,
    },
    layout: {
      visibility: 'visible',
    },
    filter: ['==', '_visible', true],
  };
};

export const getDataStylePolygonOutline = (layer_: LayerType, userId: string, displayName: string) => {
  const colorExpression = getColorExpression(layer_, displayName);

  return {
    id: `outline-${layer_.id}_${userId}`,
    type: 'line',
    paint: {
      'line-color': colorExpression,
      //ストロークごとの太さ（_strokeWidth）は色分けが「個別」のレイヤでのみ使う
      'line-width':
        layer_.colorStyle.colorType === 'INDIVIDUAL'
          ? ['number', ['get', '_strokeWidth'], layer_.colorStyle.lineWidth ?? 1.5]
          : layer_.colorStyle.lineWidth ?? 1.5,
    },
    layout: {
      visibility: 'visible',
    },
    filter: ['==', '_visible', true],
  };
};
