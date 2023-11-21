import React from 'react';
import { Polyline, LatLng } from 'react-native-maps';
import { LayerType, LineRecordType, RecordType } from '../../types';
import { LineLabel } from '../atoms';
import { getColor } from '../../utils/Layer';
import { COLOR } from '../../constants/AppConstants';
import { generateLabel } from '../../hooks/useLayers';
import { AppState } from '../../modules';
import { useSelector } from 'react-redux';

interface Props {
  data: LineRecordType[];
  layer: LayerType;
  zoom: number;
  zIndex: number;
  selectedRecord: { layerId: string; record: RecordType } | undefined;
}

export const Line = React.memo(
  (props: Props) => {
    //console.log('render Line', now());
    const { data, layer, zoom, zIndex, selectedRecord } = props;
    const tracking = useSelector((state: AppState) => state.settings.tracking);

    if (data === undefined) return null;
    return (
      <>
        {data.map((feature) => {
          if (!feature.visible) return null;
          if (feature.coords.length < 2) return null;

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
              zoom={zoom}
            />
          );
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

const PolylineComponent = React.memo((props: any) => {
  const { label, color, lineColor, labelPosition, strokeWidth, zIndex, feature, zoom } = props;
  return (
    <>
      <Polyline
        key={'polyline' + feature.id}
        tappable={false}
        coordinates={feature.coords as LatLng[]}
        strokeColor={lineColor}
        strokeWidth={strokeWidth}
        lineCap="round"
        lineJoin="round"
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
