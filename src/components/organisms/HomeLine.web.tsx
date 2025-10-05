import React from 'react';
import { View } from 'react-native';
import { Layer, Source } from 'react-map-gl/maplibre';
import { RecordType, LayerType, LineRecordType, ArrowStyleType } from '../../types';
import { generateGeoJson } from '../../utils/Geometry';
import { getDataStyleLine, getLabelStyle } from '../../utils/MapGl.web';
import { isBrushTool } from '../../utils/General';
import { HomeMapMemoStamp } from './HomeMapMemoStamp';
import { HomeMapMemoBrush } from './HomeMapMemoBrush';
import { COLOR } from '../../constants/AppConstants';
import { getColor } from '../../utils/Layer';
import { LineArrow } from '../atoms';

interface Props {
  data: LineRecordType[];
  layer: LayerType;
  zoom: number;
  zIndex: number;
  selectedRecord: { layerId: string; record: RecordType } | undefined;
  editingLineId?: string;
}

const getStrokeWidth = (layer: LayerType, feature: LineRecordType) => {
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
  return strokeWidth;
};

export const Line = React.memo((props: Props & { editingLineId?: string }) => {
  const { data, layer, zoom, selectedRecord, editingLineId } = props;
  if (data === undefined || data.length === 0) return null;

  const stampRecords: LineRecordType[] = [];
  const brushRecords: LineRecordType[] = [];
  const arrowRecords: LineRecordType[] = [];
  const lineRecords: LineRecordType[] = [];
  data.forEach((feature) => {
    if (!feature.visible) return;
    if (!feature.coords) return;
    if (feature.coords.length === 1) {
      stampRecords.push(feature);
    } else if (isBrushTool(feature.field._strokeStyle as string)) {
      brushRecords.push(feature);
    } else {
      const arrowStyle = feature.field._strokeStyle as ArrowStyleType;
      if (arrowStyle === 'ARROW_BOTH' || arrowStyle === 'ARROW_END') {
        arrowRecords.push(feature);
      }
      lineRecords.push(feature);
    }
  });

  const displayName = data[0].displayName ? data[0].displayName : '';
  const userId = data[0].userId ? data[0].userId : '';

  //console.log(geojsonLabel);

  return (
    <>
      {stampRecords.map((feature) => {
        if (feature.coords === undefined) return null;

        const selected =
          feature.id === selectedRecord?.record?.id || feature.field._group === selectedRecord?.record.id;
        const lineColor = selected ? COLOR.YELLOW : getColor(layer, feature);
        return (
          <HomeMapMemoStamp
            key={'stamp' + feature.id}
            feature={{ ...feature, coords: feature.coords[0] }}
            lineColor={lineColor}
            selected={selected}
          />
        );
      })}
      {brushRecords.map((feature) => {
        const selected =
          feature.id === selectedRecord?.record?.id || feature.field._group === selectedRecord?.record.id;
        const lineColor = selected ? COLOR.YELLOW : getColor(layer, feature);
        return (
          <HomeMapMemoBrush
            key={'brush' + feature.id}
            lineColor={lineColor}
            feature={feature}
            zoom={zoom}
            selected={selected}
          />
        );
      })}
      {arrowRecords.map((feature) => {
        if (feature.coords === undefined) return null;
        const selected =
          feature.id === selectedRecord?.record?.id || feature.field._group === selectedRecord?.record.id;
        const lineColor = selected ? COLOR.YELLOW : getColor(layer, feature);
        const arrowStyle = feature.field._strokeStyle as ArrowStyleType;
        const strokeWidth = getStrokeWidth(layer, feature);
        return (
          <LineArrow
            key={'arrow' + feature.id}
            selected={selected}
            coordinates={feature.coords}
            strokeColor={lineColor}
            strokeWidth={strokeWidth}
            arrowStyle={arrowStyle}
          />
        );
      })}
      <PolylineComponent
        data={lineRecords}
        layer={layer}
        userId={userId}
        displayName={displayName}
        zoom={zoom}
        editingLineId={editingLineId}
      />
    </>
  );
});

interface PolylineProps {
  data: LineRecordType[];
  layer: LayerType;
  userId: string;
  displayName: string;
  zoom: number;
  editingLineId?: string; // 追加
}

const PolylineComponent = React.memo((props: PolylineProps) => {
  const { data, layer, userId, displayName, zoom, editingLineId } = props;

  const labelStyle = getLabelStyle(layer, userId, displayName);

  const dataStyle = getDataStyleLine(layer, userId, displayName, editingLineId);

  const geojsonData = generateGeoJson(data, layer.field, 'LINE', layer.name, layer.permission);
  const geojsonLabel = generateGeoJson(data, layer.field, 'LINEEND', layer.name, layer.permission);

  return (
    <View>
      {zoom >= 11 && (
        //@ts-ignore
        <Source type="geojson" data={geojsonLabel}>
          {/*// @ts-ignore*/}
          <Layer {...labelStyle} />
        </Source>
      )}

      {/*//@ts-ignore*/}
      <Source id={`${layer.id}_${userId}`} type="geojson" data={geojsonData} promoteId={'_id'}>
        {/*// @ts-ignore*/}
        <Layer {...dataStyle} />
      </Source>
    </View>
  );
});
