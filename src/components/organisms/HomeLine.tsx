import React, { useContext, useMemo } from 'react';
import { Polyline, LatLng } from 'react-native-maps';
import { LayerType, LineRecordType, RecordType } from '../../types';
import { LineLabel } from '../atoms';
import { getColor } from '../../utils/Layer';
import { View } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import dayjs from '../../i18n/dayjs';
import { HomeContext } from '../../contexts/Home';
import { useWindow } from '../../hooks/useWindow';
import booleanIntersects from '@turf/boolean-intersects';
import * as turf from '@turf/helpers';
import { latLonObjectsToLatLonArray } from '../../utils/Coords';

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
  const { zoom: currentZoom } = useContext(HomeContext);
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
        if (feature.coords.length === 0) return null;
        const zoom = (feature.field._zoom as number) ?? currentZoom;
        if (currentZoom > zoom + 2) return null;
        if (currentZoom < zoom - 4) return null;
        if (!booleanIntersects(regionArea, turf.lineString(latLonObjectsToLatLonArray(feature.coords)))) return null;

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
              strokeColor={lineColor}
              strokeWidth={(feature.field._strokeWidth as number) ?? 1.5}
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
