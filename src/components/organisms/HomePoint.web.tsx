import React from 'react';
import { View } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { RecordType, LayerType } from '../../types';
import { PointView, PointLabel } from '../atoms';
import { Marker } from 'react-map-gl';
import { getColor } from '../../utils/Layer';
import dayjs from '../../i18n/dayjs';

interface Props {
  data: RecordType[];
  layer: LayerType;
  zoom: number;
  selectedRecord: { layerId: string; record: RecordType | undefined } | undefined;
}

export const Point = React.memo((props: Props) => {
  //console.log('render Point');
  const { data, layer, zoom, selectedRecord } = props;
  if (data === undefined) return null;

  return (
    <>
      {data.map((feature) => {
        if (!feature.visible) return null;
        const label =
          layer.label === ''
            ? ''
            : feature.field[layer.label]
            ? layer.field.find((f) => f.name === layer.label)?.format === 'DATETIME'
              ? dayjs(feature.field[layer.label].toString()).format('L HH:mm')
              : feature.field[layer.label].toString()
            : '';

        const labelColor = getColor(layer, feature);
        const color =
          selectedRecord !== undefined && feature.id === selectedRecord.record?.id ? COLOR.YELLOW : labelColor;
        const borderColor =
          selectedRecord !== undefined && feature.id === selectedRecord.record?.id ? COLOR.BLACK : COLOR.WHITE;

        return (
          // @ts-ignore */
          <Marker
            key={`${feature.id}-${feature.redraw}`}
            {...feature.coords}
            offset={[-15 / 2, -15 / 2]}
            anchor={'top-left'}
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
