import React from 'react';
import { View } from 'react-native';
import { LatLng, Marker, Polygon as Poly } from 'react-native-maps';
import { LayerType, PolygonRecordType, RecordType } from '../../types';
import { PointLabel, PointView, PolygonLabel } from '../atoms';
import { COLOR } from '../../constants/AppConstants';
import { getColor } from '../../utils/Layer';
import { generateLabel } from '../../hooks/useLayers';

interface Props {
  data: PolygonRecordType[];
  layer: LayerType;
  zoom: number;
  zIndex: number;
  selectedRecord: { layerId: string; record: RecordType } | undefined;
}

export const Polygon = React.memo(
  (props: Props) => {
    //console.log('render Polygon');
    const { data, layer, zoom: currentZoom, zIndex, selectedRecord } = props;

    if (data === undefined) return null;

    return (
      <>
        {data.map((feature) => {
          if (!feature.visible) return null;
          if (feature.coords.length < 3) return null;
          const label = generateLabel(layer, feature);
          const transparency = layer.colorStyle.transparency;
          const color = getColor(layer, feature, 0);
          const selected = selectedRecord !== undefined && feature.id === selectedRecord.record?.id;
          const pointColor = selected ? COLOR.YELLOW : color;
          const polygonColor = selected ? COLOR.ALFAYELLOW : getColor(layer, feature, transparency);
          const borderColor = selected ? COLOR.BLACK : COLOR.WHITE;
          let strokeWidth;
          if (layer.colorStyle.colorType === 'INDIVIDUAL') {
            if (feature.field._strokeWidth !== undefined) {
              strokeWidth = feature.field._strokeWidth as number;
            } else {
              strokeWidth = 1.5;
            }
          } else if (layer.colorStyle.lineWidth !== undefined) {
            strokeWidth = layer.colorStyle.lineWidth;
          } else {
            strokeWidth = 1.5;
          }

          if (currentZoom >= 11) {
            return (
              <PolygonComponent
                key={feature.id}
                label={label}
                color={color}
                featureColor={polygonColor}
                strokeWidth={strokeWidth}
                zIndex={zIndex}
                feature={feature}
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
  },
  (prevProps, nextProps) => {
    if (prevProps.data !== nextProps.data) return false;
    if (prevProps.layer !== nextProps.layer) return false;
    if (prevProps.zoom !== nextProps.zoom) return false;
    if (prevProps.zIndex !== nextProps.zIndex) return false;

    // もし以前選択されていたレコードが現在選択されていない場合、かつ、そのレコードが現在のレイヤと関連していたならば更新する
    if (
      prevProps.selectedRecord &&
      !nextProps.selectedRecord &&
      prevProps.selectedRecord.layerId === prevProps.layer.id
    ) {
      return false;
    }
    // 選択されたレイヤーIDが自分のレイヤーIDと一致するか？
    const isSelectedLayer = nextProps.selectedRecord?.layerId === nextProps.layer.id;

    if (isSelectedLayer) {
      // 選択レイヤが変更された場合
      if (prevProps.selectedRecord?.layerId !== nextProps.selectedRecord?.layerId) return false;

      // 選択レイヤが変更されていないが、選択レコードが変更された場合
      if (prevProps.selectedRecord?.record.id !== nextProps.selectedRecord?.record.id) return false;
    }

    return true;
  }
);

const PolygonComponent = React.memo((props: any) => {
  const { label, color, featureColor, strokeWidth, zIndex, feature } = props;
  return (
    <>
      <Poly
        key={'poly' + feature.id}
        tappable={false}
        coordinates={feature.coords as LatLng[]}
        //Firestoreがネストした配列を受け付けないため、表示するときに一元から二次元配列に変換する
        holes={feature.holes ? (Object.values(feature.holes) as LatLng[][]) : undefined}
        strokeColor={color}
        fillColor={featureColor}
        strokeWidth={strokeWidth}
        zIndex={zIndex}
      />
      <PolygonLabel key={'label' + feature.id} coordinate={feature.centroid} label={label} size={15} color={color} />
    </>
  );
});
