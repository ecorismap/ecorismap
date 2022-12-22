import React from 'react';
import { View } from 'react-native';
import { MapEvent, Marker } from 'react-native-maps';
import { COLOR } from '../../constants/AppConstants';
import { RecordType, LayerType, LocationType } from '../../types';
import { PointView, PointLabel } from '../atoms';
import { getColor } from '../../utils/Layer';
import dayjs from '../../i18n/dayjs';

interface Props {
  data: RecordType[];
  layer: LayerType;
  zoom: number;
  draggable: boolean;
  selectedRecord: { layerId: string; record: RecordType } | undefined;
  onDragEndPoint: (e: MapEvent<{}>, layer: LayerType, feature: RecordType) => void;
  onPressPoint: (layer: LayerType, feature: RecordType) => void;
}

export const Point = React.memo((props: Props) => {
  //console.log('render Point');
  const { data, layer, zoom, draggable, selectedRecord, onDragEndPoint, onPressPoint } = props;
  if (data === undefined) return null;
  //console.log('#', data);
  return (
    <>
      {data.map((feature) => {
        if (!feature.visible) return null;
        //console.log(feature.field[layer.label]);
        const label =
          layer.label === ''
            ? ''
            : feature.field[layer.label]
            ? layer.field.find((f) => f.name === layer.label)?.format === 'DATETIME'
              ? dayjs(feature.field[layer.label].toString()).format('L HH:mm')
              : feature.field[layer.label].toString()
            : '';
        const color = getColor(layer, feature);
        const pointColor =
          selectedRecord !== undefined && feature.id === selectedRecord.record.id
            ? COLOR.YELLOW
            : getColor(layer, feature);
        const borderColor =
          selectedRecord !== undefined && feature.id === selectedRecord.record.id ? COLOR.BLACK : COLOR.WHITE;
        return (
          <Marker
            key={`${feature.id}-${feature.redraw}`}
            draggable={draggable}
            tracksViewChanges={true} //iosでラベル変更を表示に反映するため
            coordinate={feature.coords as LocationType}
            opacity={0.8}
            anchor={{ x: 0.5, y: 0.75 }}
            onDragEnd={(e) => onDragEndPoint(e, layer, feature)}
            onPress={() => onPressPoint(layer, feature)}
            style={{ zIndex: -1 }}
          >
            {/*Textのcolorにcolorを適用しないとなぜかマーカーの色も変わらない*/}
            {/*labelの表示非表示でanchorがずれないようにzoom<=8でラベルを空白にする*/}
            <View style={{ alignItems: 'center' }}>
              <PointLabel label={zoom > 8 ? label : ''} size={15} color={color} borderColor={COLOR.WHITE} />
              <PointView size={15} color={pointColor} borderColor={borderColor} />
            </View>
          </Marker>
        );
      })}
    </>
  );
});
