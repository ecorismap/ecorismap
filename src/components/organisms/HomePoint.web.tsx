import React from 'react';
import { View } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { RecordType, LayerType } from '../../types';
import { PointView, PointLabel } from '../atoms';
import { Marker, MarkerDragEvent } from 'react-map-gl';
import { getColor } from '../../utils/Layer';
import dayjs from '../../i18n/dayjs';
import { t } from '../../i18n/config';

interface Props {
  data: RecordType[];
  layer: LayerType;
  zoom: number;
  selectedRecord: { layerId: string; record: RecordType | undefined } | undefined;
  draggable: boolean;
  onDragEndPoint: (e: MarkerDragEvent, layer: LayerType, feature: RecordType) => void;
}

export const Point = React.memo((props: Props) => {
  //console.log('render Point');
  const { data, layer, zoom, selectedRecord, draggable, onDragEndPoint } = props;
  if (data === undefined) return null;

  return (
    <>
      {data.map((feature) => {
        if (!feature.visible) return null;
        const label =
          layer.label === t('common.custom')
            ? layer.customLabel
                ?.split('|')
                .map((f) => feature.field[f])
                .join(' ') || ''
            : layer.label === ''
            ? ''
            : feature.field[layer.label]
            ? layer.field.find((f) => f.name === layer.label)?.format === 'DATETIME'
              ? dayjs(feature.field[layer.label].toString()).format('L HH:mm')
              : feature.field[layer.label].toString()
            : '';

        const labelColor = getColor(layer, feature, 0);
        const selected = selectedRecord !== undefined && feature.id === selectedRecord.record?.id;
        const color = selected ? COLOR.YELLOW : labelColor;
        const borderColor = selected ? COLOR.BLACK : COLOR.WHITE;

        return (
          // @ts-ignore */
          <Marker
            key={`${feature.id}-${feature.redraw}`}
            {...feature.coords}
            offset={[-15 / 2, -15 / 2]}
            anchor={'top-left'}
            draggable={draggable}
            onDragEnd={(e) => onDragEndPoint(e, layer, feature)}
          >
            <div>
              <View style={{ alignItems: 'flex-start' }}>
                <PointView size={15} color={color} borderColor={borderColor} />
                <PointLabel label={zoom > 8 ? label : ''} size={15} color={labelColor} borderColor={COLOR.WHITE} />
              </View>
            </div>
          </Marker>
        );
      })}
    </>
  );
});
