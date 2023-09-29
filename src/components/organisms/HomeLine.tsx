import React, { useContext, useMemo } from 'react';
import { Polyline, LatLng } from 'react-native-maps';
import { LayerType, LineRecordType, LocationType, RecordType } from '../../types';
import { LineLabel } from '../atoms';
import { getColor } from '../../utils/Layer';
import { COLOR } from '../../constants/AppConstants';
import { HomeContext } from '../../contexts/Home';
import { useWindow } from '../../hooks/useWindow';
import booleanIntersects from '@turf/boolean-intersects';
import * as turf from '@turf/helpers';
import { latLonObjectsToLatLonArray } from '../../utils/Coords';
import { generateLabel } from '../../hooks/useLayers';

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
  //const { mapRegion } = useWindow();

  // const regionArea = useMemo(() => {
  //   const { latitude, longitude, latitudeDelta, longitudeDelta } = mapRegion;
  //   const topleft = [longitude - longitudeDelta / 2, latitude + latitudeDelta / 2];
  //   const topright = [longitude + longitudeDelta / 2, latitude + latitudeDelta / 2];
  //   const bottomright = [longitude + longitudeDelta / 2, latitude - latitudeDelta / 2];
  //   const bottomleft = [longitude - longitudeDelta / 2, latitude - latitudeDelta / 2];
  //   return turf.polygon([[topleft, topright, bottomright, bottomleft, topleft]]);
  // }, [mapRegion]);

  if (data === undefined) return null;
  return (
    <>
      {data.map((feature) => {
        if (!feature.visible) return null;
        const zoom = (feature.field._zoom as number) ?? currentZoom;
        // if (currentZoom > zoom + 2) return null;
        // if (currentZoom < zoom - 4) return null;
        if (feature.coords.length < 2) return null;

        // if (!booleanIntersects(regionArea, turf.lineString(latLonObjectsToLatLonArray(feature.coords)))) return null;

        const label = generateLabel(layer, feature);
        const color = getColor(layer, feature, 0);
        const selected = selectedRecord !== undefined && feature.id === selectedRecord.record?.id;
        const lineColor = selected ? COLOR.YELLOW : color;
        const labelPosition = feature.coords[feature.coords.length - 1];
        const strokeWidth = (feature.field._strokeWidth as number)
          ? 2 ** (currentZoom - zoom) * (feature.field._strokeWidth as number)
          : 1.5;

        return (
          <PolylineComponent
            key={feature.id}
            label={label}
            color={color}
            lineColor={lineColor}
            strokeWidth={strokeWidth}
            labelPosition={labelPosition}
            zIndex={zIndex}
            layer={layer}
            feature={feature}
            tappable={false}
            onPressLine={onPressLine}
          />
        );
      })}
    </>
  );
});

const PolylineComponent = React.memo((props: any) => {
  const { label, color, lineColor, labelPosition, strokeWidth, zIndex, layer, feature, onPressLine } = props;
  return (
    <>
      <Polyline
        key={'polyline' + feature.id}
        tappable={false}
        coordinates={feature.coords as LatLng[]}
        strokeColor={lineColor}
        strokeWidth={strokeWidth}
        // lineCap="round"
        // lineJoin="round"
        zIndex={zIndex}
        onPress={() => onPressLine(layer, feature)}
      />
      <LineLabel
        key={'label' + feature.id}
        coordinate={labelPosition}
        label={label}
        size={15}
        color={color}
        borderColor={COLOR.WHITE}
      />
    </>
  );
});
