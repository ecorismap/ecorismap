import React, { useCallback } from 'react';
import { View } from 'react-native';
import { Layer, Source } from 'react-map-gl';
import { RecordType, LayerType } from '../../types';
import { generateGeoJson } from '../../utils/Geometry';
import { COLOR } from '../../constants/AppConstants';
import { getColorRule } from '../../utils/Layer';
import { t } from '../../i18n/config';

interface Props {
  data: RecordType[];
  layer: LayerType;
  zoom: number;
  zIndex: number;
  selectedRecord: { layerId: string; record: RecordType } | undefined;
}

export const Line = React.memo((props: Props) => {
  const { data, layer, zoom } = props;
  const displayName = data.length === 0 ? '' : data[0].displayName ? data[0].displayName : '';
  const userId = data.length === 0 ? '' : data[0].userId ? data[0].userId : '';

  const getColorExpression = useCallback(
    (layer_: LayerType) => {
      const colorExpression = [
        'case',
        ['boolean', ['feature-state', 'clicked'], false],
        COLOR.YELLOW,
        ['boolean', ['feature-state', 'hover'], false],
        COLOR.YELLOW,
        getColorRule(layer_, 0, displayName),
      ];

      return colorExpression;
    },
    [displayName]
  );

  const labelStyle = useCallback(
    (layer_: LayerType) => {
      const colorExpression = getColorExpression(layer_);

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
    },
    [getColorExpression, userId]
  );

  const dataStyle = useCallback(
    (layer_: LayerType) => {
      const colorExpression = getColorExpression(layer_);

      return {
        id: `${layer_.id}_${userId}`,
        type: 'line',
        paint: {
          'line-color': colorExpression,
          'line-width': [
            'coalesce',
            layer.colorStyle.colorType === 'INDIVIDUAL' ? ['get', '_strokeWidth'] : layer_.colorStyle.lineWidth ?? 1.5,
            layer_.colorStyle.lineWidth ?? 1.5,
          ],
        },
        layout: {
          visibility: 'visible',
        },
        filter: ['==', '_visible', true],
      };
    },
    [getColorExpression, layer.colorStyle, userId]
  );

  if (data === undefined || data.length === 0) return null;

  const geojsonData = generateGeoJson(data, layer.field, 'LINE', layer.name);
  const geojsonLabel = generateGeoJson(data, layer.field, 'LINEEND', layer.name);
  //console.log(geojsonLabel);

  return (
    <View>
      {zoom >= 11 && (
        //@ts-ignore
        <Source type="geojson" data={geojsonLabel}>
          {/*// @ts-ignore*/}
          <Layer {...labelStyle(layer)} />
        </Source>
      )}
      {/*
                  //@ts-ignore*/}
      <Source id={`${layer.id}_${userId}`} type="geojson" data={geojsonData} promoteId={'_id'}>
        {/*
                  //@ts-ignore*/}
        <Layer {...dataStyle(layer)} />
      </Source>
    </View>
  );
});
