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
import { AppState } from '../../modules';
import { useSelector } from 'react-redux';
import { now } from 'lodash';

interface Props {
  data: LineRecordType[];
  layer: LayerType;
  zoom: number;
  zIndex: number;
  selectedRecord: { layerId: string; record: RecordType } | undefined;
}

export const Line = React.memo((props: Props) => {
  //console.log('render Line', now());
  const { data, zoom: currentZoom, layer, zIndex, selectedRecord } = props;
  const tracking = useSelector((state: AppState) => state.settings.tracking);
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
        // const zoom = (feature.field._zoom as number) ?? currentZoom;
        // if (currentZoom > zoom + 2) return null;
        // if (currentZoom < zoom - 4) return null;
        if (feature.coords.length < 2) return null;

        // if (!booleanIntersects(regionArea, turf.lineString(latLonObjectsToLatLonArray(feature.coords)))) return null;

        const color = getColor(layer, feature, 0);
        const selected = selectedRecord !== undefined && feature.id === selectedRecord.record?.id;
        const lineColor = tracking?.dataId === feature.id ? COLOR.TRACK : selected ? COLOR.YELLOW : color;
        const labelPosition = feature.coords[feature.coords.length - 1];
        let label = generateLabel(layer, feature);
        let strokeWidth;
        if (tracking?.dataId === feature.id) {
          strokeWidth = 4;
          label = '';
        } else if (layer.colorStyle.colorType === 'INDIVIDUAL') {
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

        return (
          <PolylineComponent
            key={feature.id}
            label={label}
            color={color}
            lineColor={lineColor}
            strokeWidth={strokeWidth}
            labelPosition={labelPosition}
            zIndex={zIndex}
            feature={feature}
            tappable={false}
          />
        );
      })}
    </>
  );
});

const PolylineComponent = React.memo((props: any) => {
  const { label, color, lineColor, labelPosition, strokeWidth, zIndex, feature } = props;
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
