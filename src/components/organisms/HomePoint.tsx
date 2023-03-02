import React from 'react';
import { Platform, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { COLOR } from '../../constants/AppConstants';
import { LayerType, PointRecordType, RecordType } from '../../types';
import { PointView, PointLabel } from '../atoms';
import { getColor } from '../../utils/Layer';
import dayjs from '../../i18n/dayjs';

interface Props {
  data: PointRecordType[];
  layer: LayerType;
  zoom: number;
  selectedRecord: { layerId: string; record: RecordType } | undefined;
}

export const Point = React.memo((props: Props) => {
  //console.log('render Point');
  const { data, layer, zoom, selectedRecord } = props;
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
          selectedRecord !== undefined && feature.id === selectedRecord.record?.id
            ? COLOR.YELLOW
            : getColor(layer, feature);
        const borderColor =
          selectedRecord !== undefined && feature.id === selectedRecord.record?.id ? COLOR.BLACK : COLOR.WHITE;
        return (
          <Marker
            key={`${feature.id}-${feature.redraw}`}
            tracksViewChanges={Platform.OS === 'ios' ? true : false} //iosでラベル変更を表示に反映するため
            coordinate={feature.coords}
            opacity={0.8}
            anchor={{ x: 0.5, y: 0.8 }}
            style={{ zIndex: -1 }}
          >
            {/*Textのcolorにcolorを適用しないとなぜかマーカーの色も変わらない*/}
            {/*labelの表示非表示でanchorがずれないようにzoom<=8でラベルを空白にする*/}
            {/*label表示で縦位置ずれるため、anchorで調整。sizeを変更すると調整必要 */}
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
