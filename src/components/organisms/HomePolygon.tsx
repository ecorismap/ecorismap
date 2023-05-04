import React from 'react';
import { View } from 'react-native';
import { LatLng, Marker, Polygon as Poly } from 'react-native-maps';
import { LayerType, PolygonRecordType, RecordType } from '../../types';
import { PointLabel, PointView, PolygonLabel } from '../atoms';
import { COLOR } from '../../constants/AppConstants';
import { getColor } from '../../utils/Layer';
import dayjs from '../../i18n/dayjs';

interface Props {
  data: PolygonRecordType[];
  layer: LayerType;
  zoom: number;
  zIndex: number;
  selectedRecord: { layerId: string; record: RecordType } | undefined;
  onPressPolygon: (layer: LayerType, feature: PolygonRecordType) => void;
}

export const Polygon = React.memo((props: Props) => {
  //console.log('render Polygon');
  const { data, layer, zoom, zIndex, selectedRecord, onPressPolygon } = props;
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
        const transparency = layer.colorStyle.transparency;
        const color = getColor(layer, feature, 0);
        const selected = selectedRecord !== undefined && feature.id === selectedRecord.record?.id;
        const pointColor = selected ? COLOR.YELLOW : color;
        const polygonColor = selected ? COLOR.ALFAYELLOW : getColor(layer, feature, transparency);
        const borderColor = selected ? COLOR.BLACK : COLOR.WHITE;

        if (zoom >= 11) {
          return (
            <PolygonComponent
              key={feature.id}
              label={label}
              color={color}
              featureColor={polygonColor}
              zIndex={zIndex}
              layer={layer}
              feature={feature}
              onPressPolygon={onPressPolygon}
            />
          );
        } else {
          return (
            <Marker key={feature.id} coordinate={feature.centroid ?? feature.coords[0]} tracksViewChanges={selected}>
              <View style={{ alignItems: 'center' }}>
                {/*Textのcolorにcolorを適用しないとなぜかマーカーの色も変わらない*/}
                <PointLabel label={label} size={15} color={color} borderColor={COLOR.WHITE} />
                <PointView size={10} color={pointColor} borderColor={borderColor} style={{ borderRadius: 0 }} />
              </View>
            </Marker>
          );
        }
      })}
    </>
  );
});

const PolygonComponent = (props: any) => {
  const { label, color, featureColor, layer, zIndex, feature, onPressPolygon } = props;
  return (
    <>
      <Poly
        key={'poly' + feature.id}
        tappable={true} //ボタンの種類でtrueにしても良い
        coordinates={feature.coords as LatLng[]}
        //Firestoreがネストした配列を受け付けないため、表示するときに一元から二次元配列に変換する
        holes={feature.holes ? (Object.values(feature.holes) as LatLng[][]) : undefined}
        strokeColor={color}
        fillColor={featureColor}
        strokeWidth={1.5}
        zIndex={zIndex}
        onPress={() => onPressPolygon(layer, feature)}
      />
      <PolygonLabel key={'label' + feature.id} coordinate={feature.centroid} label={label} size={15} color={color} />
    </>
  );
};
