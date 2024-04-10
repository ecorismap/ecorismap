import { t } from '../i18n/config';
import { LayerType } from '../types';
import { getColorRule } from './Layer';

export const getColorExpression = (layer_: LayerType, displayName: string, transparency: number) => {
  const colorExpression = [
    'case',
    ['boolean', ['feature-state', 'clicked'], false],
    'rgba(255, 255, 0, 0.7)',
    ['boolean', ['feature-state', 'hover'], false],
    'rgba(255, 255, 0, 0.7)',
    getColorRule(layer_, transparency, displayName),
  ];

  return colorExpression;
};

export const getLabelStyle = (layer_: LayerType, userId: string, displayName: string) => {
  const colorExpression = getColorExpression(layer_, displayName, 0);

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

export const getDataStyleLine = (layer_: LayerType, userId: string, displayName: string) => {
  const colorExpression = getColorExpression(layer_, displayName, 0);

  return {
    id: `${layer_.id}_${userId}`,
    type: 'line',
    paint: {
      'line-color': colorExpression,
      'line-width': [
        'coalesce',
        layer_.colorStyle.colorType === 'INDIVIDUAL' ? ['get', '_strokeWidth'] : layer_.colorStyle.lineWidth ?? 1.5,
        layer_.colorStyle.lineWidth ?? 1.5,
      ],
    },
    layout: {
      visibility: 'visible',
    },
    filter: ['==', '_visible', true],
  };
};

export const getDataStylePolygon = (layer_: LayerType, userId: string, displayName: string) => {
  const fillColorExpression = getColorExpression(layer_, displayName, layer_.colorStyle.transparency);

  return {
    id: `${layer_.id}_${userId}`,
    type: 'fill',
    paint: {
      'fill-color': fillColorExpression,
    },
    layout: {
      visibility: 'visible',
    },
    filter: ['==', '_visible', true],
  };
};

export const getDataStylePolygonOutline = (layer_: LayerType, userId: string, displayName: string) => {
  const colorExpression = getColorExpression(layer_, displayName, 0);

  return {
    id: `outline-${layer_.id}_${userId}`,
    type: 'line',
    paint: {
      'line-color': colorExpression,
      'line-width': [
        'coalesce',
        layer_.colorStyle.colorType === 'INDIVIDUAL' ? ['get', '_strokeWidth'] : layer_.colorStyle.lineWidth ?? 1.5,
        layer_.colorStyle.lineWidth ?? 1.5,
      ],
    },
    layout: {
      visibility: 'visible',
    },
    filter: ['==', '_visible', true],
  };
};
