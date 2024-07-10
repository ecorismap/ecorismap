import React from 'react';
import { View } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { RecordType, LayerType } from '../../types';
import { PointView, PointLabel } from '../atoms';
import { Marker, MarkerDragEvent } from 'react-map-gl';
import { getColor } from '../../utils/Layer';
import { generateLabel } from '../../hooks/useLayers';

interface Props {
  data: RecordType[];
  layer: LayerType;
  zoom: number;
  selectedRecord: { layerId: string; record: RecordType } | undefined;

  editPositionMode: boolean;
  editPositionRecord: RecordType | undefined;
  editPositionLayer: LayerType | undefined;
  currentDrawTool: string;
  onDragEndPoint: (e: MarkerDragEvent, layer: LayerType, feature: RecordType) => void;
}

export const Point = React.memo(
  (props: Props) => {
    //console.log('render Point');
    const {
      data,
      selectedRecord,
      onDragEndPoint,
      layer,
      zoom,
      editPositionLayer,
      editPositionMode,
      editPositionRecord,
      currentDrawTool,
    } = props;
    if (data === undefined) return null;

    return (
      <>
        {data.map((feature) => {
          if (!feature.visible) return null;
          if (!feature.coords) return null;
          const label = generateLabel(layer, feature);

          const labelColor = getColor(layer, feature, 0);
          const selected = selectedRecord !== undefined && feature.id === selectedRecord.record?.id;
          const color = selected ? COLOR.YELLOW : labelColor;
          const borderColor = selected ? COLOR.BLACK : COLOR.WHITE;
          const draggable =
            currentDrawTool === 'MOVE_POINT' &&
            (!editPositionMode ||
              (editPositionMode &&
                editPositionRecord !== undefined &&
                editPositionLayer?.id === layer.id &&
                editPositionRecord.id === feature.id));

          return (
            // @ts-ignore */
            <Marker
              key={`${feature.id}-${feature.redraw}`}
              {...feature.coords}
              offset={[-15 / 2, -15 / 2]}
              anchor={'top-left'}
              draggable={draggable}
              onDragEnd={(e) => onDragEndPoint(e, layer, feature)}
            >
              <div>
                <View style={{ alignItems: 'flex-start' }}>
                  <PointView size={15} color={color} borderColor={borderColor} />
                  <PointLabel label={zoom > 8 ? label : ''} size={15} color={labelColor} borderColor={COLOR.WHITE} />
                </View>
              </div>
            </Marker>
          );
        })}
      </>
    );
  },
  (prevProps, nextProps) => {
    if (prevProps.data !== nextProps.data) return false;
    if (prevProps.layer !== nextProps.layer) return false;
    if (prevProps.zoom !== nextProps.zoom) return false;
    if (prevProps.editPositionMode !== nextProps.editPositionMode) return false;
    if (prevProps.editPositionRecord !== nextProps.editPositionRecord) return false;
    if (prevProps.editPositionLayer !== nextProps.editPositionLayer) return false;
    if (prevProps.currentDrawTool !== nextProps.currentDrawTool) return false;
    if (prevProps.onDragEndPoint !== nextProps.onDragEndPoint) return false;

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
