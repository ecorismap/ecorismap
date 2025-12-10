import React, { useMemo } from 'react';
import { Marker, MarkerDragStartEndEvent } from 'react-native-maps';
import { COLOR } from '../../constants/AppConstants';
import { LayerType, PointRecordType, RecordType } from '../../types';
import { PointView, PointLabel } from '../atoms';
import { generateLabel, getColor } from '../../utils/Layer';
import { ViewportBounds, cullPoints } from '../../utils/ViewportCulling';

interface Props {
  data: PointRecordType[];
  layer: LayerType;
  zoom: number;
  selectedRecord: { layerId: string; record: RecordType } | undefined;
  editPositionMode: boolean;
  editPositionRecord: RecordType | undefined;
  editPositionLayer: LayerType | undefined;
  currentDrawTool: string;
  bounds?: ViewportBounds | null;

  onDragEndPoint: (e: MarkerDragStartEndEvent, layer: LayerType, feature: RecordType) => void;
}

export const Point = React.memo(
  (props: Props) => {
    //console.log('render Point');
    const {
      data,
      layer,
      zoom,
      selectedRecord,
      editPositionMode,
      editPositionLayer,
      editPositionRecord,
      currentDrawTool,
      bounds,
      onDragEndPoint,
    } = props;

    const culledData = useMemo(() => {
      const visibleData = data.filter((feature) => feature.visible);
      return cullPoints(visibleData, bounds || null, zoom, {
        buffer: 20, // 20% buffer around viewport
        maxFeatures: 1000, // Maximum 1000 points
        minZoom: 10, // Only apply culling at zoom level 10 and above
      });
    }, [data, bounds, zoom]);

    return (
      <>
        {culledData.map((feature) => (
          <PointComponent
            key={`point-${feature.id}-${feature.redraw}-${selectedRecord?.record?.id === feature.id}`}
            feature={feature}
            selectedRecord={selectedRecord}
            editPositionMode={editPositionMode}
            editPositionRecord={editPositionRecord}
            editPositionLayer={editPositionLayer}
            currentDrawTool={currentDrawTool}
            onDragEndPoint={onDragEndPoint}
            layer={layer}
            zoom={zoom}
          />
        ))}
      </>
    );
  },
  (prevProps, nextProps) => {
    // 既存のプロパティの比較
    if (prevProps.data !== nextProps.data) return false;
    if (prevProps.layer !== nextProps.layer) return false;
    if (prevProps.zoom !== nextProps.zoom) return false;
    if (prevProps.bounds !== nextProps.bounds) return false;
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

    // 選択されている場合のみ、レイヤーIDの比較を行う
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

interface PointComponentProps {
  feature: PointRecordType;
  selectedRecord: { layerId: string; record: RecordType } | undefined;
  editPositionMode: boolean;
  editPositionRecord: RecordType | undefined;
  editPositionLayer: LayerType | undefined;
  currentDrawTool: string;
  onDragEndPoint: (e: MarkerDragStartEndEvent, layer: LayerType, feature: RecordType) => void;
  layer: LayerType;
  zoom: number;
}

const PointComponent = React.memo((props: PointComponentProps) => {
  const {
    feature,
    selectedRecord,
    onDragEndPoint,
    layer,
    zoom,
    editPositionLayer,
    editPositionMode,
    editPositionRecord,
    currentDrawTool,
  } = props;
  //console.log(feature.field[layer.label]);

  const selected = useMemo(() => feature.id === selectedRecord?.record?.id, [feature.id, selectedRecord?.record?.id]);
  const label = useMemo(() => generateLabel(layer, feature), [feature, layer]);

  const color = useMemo(() => getColor(layer, feature), [feature, layer]);

  const pointColor = useMemo(() => (selected ? COLOR.YELLOW : color), [color, selected]);
  const borderColor = useMemo(() => (selected ? COLOR.BLACK : COLOR.WHITE), [selected]);
  const draggable = useMemo(
    () =>
      currentDrawTool === 'MOVE_POINT' &&
      (!editPositionMode ||
        (editPositionMode &&
          editPositionRecord !== undefined &&
          editPositionLayer?.id === layer.id &&
          editPositionRecord.id === feature.id)),
    [currentDrawTool, editPositionLayer?.id, editPositionMode, editPositionRecord, feature.id, layer.id]
  );
  if (!feature.coords) return null;
  return (
    <Marker
      tracksViewChanges={true} //色変更を反映するため常にtrue
      draggable={draggable}
      onDragEnd={(e) => onDragEndPoint(e, layer, feature)}
      coordinate={feature.coords}
      opacity={0.8}
      anchor={{ x: 0.5, y: 0.8 }}
      style={{ zIndex: selected ? 1000 : 1, alignItems: 'center' }}
      //zIndex={selected ? 1000 : 1}
    >
      {/*Textのcolorにcolorを適用しないとなぜかマーカーの色も変わらない*/}
      {/*labelの表示非表示でanchorがずれないようにzoom<=8でラベルを空白にする*/}
      {/*label表示で縦位置ずれるため、anchorで調整。sizeを変更すると調整必要 */}

      <PointLabel label={zoom > 8 ? label : ''} size={15} color={color} borderColor={COLOR.WHITE} />
      <PointView size={15} color={pointColor} borderColor={borderColor} />
    </Marker>
  );
});
