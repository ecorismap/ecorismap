import { t } from '../i18n/config';
import { LayerType } from '../types';
import { getColorRule } from './Layer';

export const getColorExpression = (layer_: LayerType, displayName: string, editingLineId?: string) => {
  const colorExpression = [
    'case',
    ['boolean', ['feature-state', 'clicked'], false],
    'rgba(255, 255, 0, 0.7)',
    ['boolean', ['feature-state', 'hover'], false],
    'rgba(255, 255, 0, 0.7)',
    ['==', ['get', '_id'], editingLineId || ''],
    'rgba(151, 151, 151, 0.61)',
    getColorRule(layer_, displayName),
  ];

  return colorExpression;
};

export const getLabelStyle = (layer_: LayerType, userId: string, displayName: string) => {
  const colorExpression = getColorExpression(layer_, displayName);

  // Prepare the text-field based on the label value
  let textField;
  if (layer_.label === t('common.custom') && layer_.customLabel) {
    // Split the customLabel into fields and create a Mapbox expression
    const fieldNames = layer_.customLabel.split('|');
    const fields = fieldNames.reduce((acc, field, index) => {
      const fieldName = field.trim(); // Remove leading and trailing whitespaces
      if (fieldName.startsWith('"') || fieldName.startsWith("'")) {
        //@ts-ignore
        acc.push(fieldName.substring(1, fieldName.length - 1)); // Remove quotes
      } else {
        //@ts-ignore
        acc.push(['get', fieldName]);
      }
      // Do not add " " after the last field
      if (index < fieldNames.length - 1) {
        //@ts-ignore
        acc.push(' ');
      }
      return acc;
    }, []);
    textField = ['concat', ...fields];
  } else {
    textField = ['get', layer_.label];
  }

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

// editingLineIdを受け取れるように引数追加
export const getDataStyleLine = (
  layer_: LayerType,
  userId: string,
  displayName: string,
  editingLineId?: string,
  widthZoomLinked?: boolean
) => {
  const colorExpression = getColorExpression(layer_, displayName, editingLineId);

  //レコードが太さを持つならレイヤ一律の太さより優先する。数値以外（未設定・空文字）はレイヤ既定値
  const fixedWidth = ['number', ['get', '_strokeWidth'], layer_.colorStyle.lineWidth ?? 1.5];
  //ズーム連動: 描画時ズーム(_zoom)での見た目を基準に2^(zoom - _zoom)倍する。
  //['zoom']はトップレベルのinterpolateでしか使えないため、各ストップの出力側で_zoom有無のフォールバックを分岐する。
  //exponential base2補間により式全体は正確に 2^(zoom - _zoom) * width になる。
  const drawnZoom = ['number', ['get', '_zoom'], 0];
  const zoomLinkedWidthAt = (stopZoom: number) => [
    'case',
    ['>', drawnZoom, 0],
    ['*', fixedWidth, ['^', 2, ['-', stopZoom, drawnZoom]]],
    fixedWidth,
  ];
  const lineWidth = widthZoomLinked
    ? ['interpolate', ['exponential', 2], ['zoom'], 0, zoomLinkedWidthAt(0), 24, zoomLinkedWidthAt(24)]
    : fixedWidth;

  return {
    id: `${layer_.id}_${userId}`,
    type: 'line',
    paint: {
      'line-color': colorExpression,
      'line-width': lineWidth,
    },
    layout: {
      visibility: 'visible',
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
      //レコードが太さを持つならレイヤ一律の太さより優先する。数値以外（未設定・空文字）はレイヤ既定値
      'line-width': ['number', ['get', '_strokeWidth'], layer_.colorStyle.lineWidth ?? 1.5],
    },
    layout: {
      visibility: 'visible',
    },
    filter: ['==', '_visible', true],
  };
};
