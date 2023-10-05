import React, { useMemo } from 'react';
import { View } from 'react-native';
import { LatLng, Marker, Polygon as Poly } from 'react-native-maps';
import { LayerType, PolygonRecordType, RecordType } from '../../types';
import { PointLabel, PointView, PolygonLabel } from '../atoms';
import { COLOR } from '../../constants/AppConstants';
import { getColor } from '../../utils/Layer';
import { useWindow } from '../../hooks/useWindow';
import booleanIntersects from '@turf/boolean-intersects';
import * as turf from '@turf/helpers';
import { latLonObjectsToLatLonArray } from '../../utils/Coords';
import { generateLabel } from '../../hooks/useLayers';

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
  const { data, layer, zoom: currentZoom, zIndex, selectedRecord, onPressPolygon } = props;
  const { mapRegion } = useWindow();

  const regionArea = useMemo(() => {
    const { latitude, longitude, latitudeDelta, longitudeDelta } = mapRegion;
    const topleft = [longitude - longitudeDelta / 2, latitude + latitudeDelta / 2];
    const topright = [longitude + longitudeDelta / 2, latitude + latitudeDelta / 2];
    const bottomright = [longitude + longitudeDelta / 2, latitude - latitudeDelta / 2];
    const bottomleft = [longitude - longitudeDelta / 2, latitude - latitudeDelta / 2];
    return turf.polygon([[topleft, topright, bottomright, bottomleft, topleft]]);
  }, [mapRegion]);

  if (data === undefined) return null;

  return (
    <>
      {data.map((feature) => {
        if (!feature.visible) return null;
        const zoom = (feature.field._zoom as number) ?? currentZoom;
        // if (currentZoom > zoom + 2) return null;
        // if (currentZoom < zoom - 4) return null;
        if (feature.coords.length < 3) return null;

        // if (!booleanIntersects(regionArea, turf.lineString(latLonObjectsToLatLonArray(feature.coords)))) return null;

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

const PolygonComponent = React.memo((props: any) => {
  const { label, color, featureColor, strokeWidth, layer, zIndex, feature, onPressPolygon } = props;
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
        onPress={() => onPressPolygon(layer, feature)}
      />
      <PolygonLabel key={'label' + feature.id} coordinate={feature.centroid} label={label} size={15} color={color} />
    </>
  );
});
