import React from 'react';
import { Polyline, LatLng } from 'react-native-maps';
import { ArrowStyleType, LayerType, LineRecordType, RecordType } from '../../types';
import { LineLabel } from '../atoms';
import { generateLabel, getColor } from '../../utils/Layer';
import { COLOR } from '../../constants/AppConstants';
import { isBrushTool } from '../../utils/General';
import LineArrow from '../atoms/LineArrow';
import { HomeMapMemoStamp } from './HomeMapMemoStamp';
import { HomeMapMemoBrush } from './HomeMapMemoBrush';

interface Props {
  data: LineRecordType[];
  layer: LayerType;
  zoom: number;
  zIndex: number;
  selectedRecord: { layerId: string; record: RecordType } | undefined;
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

export const Line = React.memo(
  (props: Props) => {
    //console.log('render Line', now());
    const { data, layer, zoom, zIndex, selectedRecord } = props;

    if (data === undefined || data.length === 0) return null;

    return (
      <>
        {data.map((feature) => {
          if (feature.coords === undefined) return null;
          const color = getColor(layer, feature);
          const selected =
            selectedRecord?.record?.id !== undefined &&
            (feature.id === selectedRecord?.record?.id || feature.field._group === selectedRecord?.record.id);

          const lineColor = selected ? COLOR.YELLOW : color;
          const labelPosition = feature.coords[feature.coords.length - 1];
          const label = generateLabel(layer, feature);

          if (!feature.visible) return null;
          if (feature.coords.length === 0) return null;
          if (feature.coords.length === 1) {
            return (
              <HomeMapMemoStamp
                key={'stamp' + feature.id}
                feature={{ ...feature, coords: feature.coords[0] }}
                lineColor={lineColor}
                selected={selected}
              />
            );
          } else if (isBrushTool(feature.field._strokeStyle as string)) {
            return (
              <HomeMapMemoBrush
                key={'brush' + feature.id}
                lineColor={lineColor}
                feature={feature}
                zoom={zoom}
                selected={selected}
              />
            );
          } else {
            const strokeWidth = getStrokeWidth(layer, feature);
            return (
              <PolylineComponent
                key={'line' + feature.id}
                label={label}
                color={color}
                lineColor={lineColor}
                strokeWidth={strokeWidth}
                labelPosition={labelPosition}
                zIndex={zIndex}
                feature={feature}
                zoom={zoom}
                selected={selected}
              />
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

interface PolylineProps {
  label: string;
  color: string;
  lineColor: string;
  labelPosition: LatLng;
  strokeWidth: number;
  zIndex: number;
  feature: LineRecordType;
  zoom: number;
  selected: boolean;
}
const PolylineComponent = React.memo((props: PolylineProps) => {
  const { label, color, lineColor, labelPosition, strokeWidth, zIndex, feature, zoom, selected } = props;
  const arrowStyle = feature.field._strokeStyle as ArrowStyleType | undefined;

  return (
    <>
      {arrowStyle && (
        <LineArrow
          selected={selected}
          coordinates={feature.coords as LatLng[]}
          strokeColor={lineColor}
          strokeWidth={strokeWidth}
          arrowStyle={arrowStyle}
        />
      )}
      <Polyline
        key={'polyline' + feature.id}
        tappable={false}
        coordinates={feature.coords as LatLng[]}
        strokeColor={lineColor}
        strokeWidth={strokeWidth}
        lineCap="butt"
        zIndex={zIndex}
      />
      <LineLabel
        key={'label' + feature.id}
        coordinate={labelPosition}
        label={zoom > 10 ? label : ''}
        size={15}
        color={color}
        borderColor={COLOR.WHITE}
      />
    </>
  );
});
