import React from 'react';
import { View } from 'react-native';
import { LatLng, Marker, Polygon as Poly } from 'react-native-maps';
import { LayerType, PolygonRecordType, RecordType } from '../../types';
import { PointLabel, PointView, PolygonLabel } from '../atoms';
import { COLOR } from '../../constants/AppConstants';
import { generateLabel, getColor } from '../../utils/Layer';

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
          if (!feature.coords) return null;
          if (feature.coords.length < 3) return null;
          const label = generateLabel(layer, feature);
          const transparency = Boolean(layer.colorStyle.transparency);
          const strokeColor = getColor(layer, feature);
          const selected = selectedRecord !== undefined && feature.id === selectedRecord.record?.id;
          const pointColor = selected ? COLOR.YELLOW : strokeColor;
          const fillColor = selected ? COLOR.ALFAYELLOW : transparency ? 'rgba(0,0,0,0)' : getColor(layer, feature);
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
                strokeColor={strokeColor}
                fillColor={fillColor}
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
                  <PointLabel label={label} size={15} color={strokeColor} borderColor={COLOR.WHITE} />
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

interface PolygonComponentProps {
  label: string;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  zIndex: number;
  feature: PolygonRecordType;
}

const PolygonComponent = React.memo((props: PolygonComponentProps) => {
  const { label, strokeColor, fillColor, strokeWidth, zIndex, feature } = props;
  if (!feature.coords || !feature.centroid) return null;
  return (
    <>
      <Poly
        key={'poly' + feature.id}
        tappable={false}
        coordinates={feature.coords as LatLng[]}
        //Firestoreがネストした配列を受け付けないため、表示するときに一元から二次元配列に変換する
        holes={feature.holes ? (Object.values(feature.holes) as LatLng[][]) : undefined}
        strokeColor={strokeColor}
        fillColor={fillColor}
        strokeWidth={strokeWidth}
        zIndex={zIndex}
      />
      <PolygonLabel
        key={'label' + feature.id}
        coordinate={feature.centroid}
        label={label}
        size={15}
        color={strokeColor}
      />
    </>
  );
});
