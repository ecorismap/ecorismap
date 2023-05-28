import React from 'react';
import { Polyline, LatLng } from 'react-native-maps';
import { LayerType, LineRecordType, RecordType } from '../../types';
import { LineLabel } from '../atoms';
import { getColor } from '../../utils/Layer';
import { View } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import dayjs from '../../i18n/dayjs';

interface Props {
  data: LineRecordType[];
  layer: LayerType;
  zoom: number;
  zIndex: number;
  selectedRecord: { layerId: string; record: RecordType } | undefined;
  onPressLine: (layer: LayerType, feature: LineRecordType) => void;
}

export const Line = React.memo((props: Props) => {
  //console.log('render Line');
  const { data, layer, zIndex, selectedRecord, onPressLine } = props;
  if (data === undefined) return null;

  return (
    <>
      {data.map((feature) => {
        if (!feature.visible) return null;
        if (feature.coords.length === 0) return null;
        const label =
          layer.label === ''
            ? ''
            : feature.field[layer.label]
            ? layer.field.find((f) => f.name === layer.label)?.format === 'DATETIME'
              ? dayjs(feature.field[layer.label].toString()).format('L HH:mm')
              : feature.field[layer.label].toString()
            : '';
        const color = getColor(layer, feature, 0);
        const selected = selectedRecord !== undefined && feature.id === selectedRecord.record?.id;
        const lineColor = selected ? COLOR.YELLOW : color;
        const labelPosition = feature.coords[feature.coords.length - 1];
        return (
          <View key={feature.id}>
            <Polyline
              tappable={false}
              coordinates={feature.coords as LatLng[]}
              strokeColor={feature.field.strokeColor ?? lineColor}
              strokeWidth={feature.field.strokeWidth ?? 2}
              zIndex={zIndex}
              onPress={() => onPressLine(layer, feature)}
            />
            <LineLabel coordinate={labelPosition} label={label} size={15} color={color} borderColor={COLOR.WHITE} />
          </View>
        );
      })}
    </>
  );
});
