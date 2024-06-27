import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { Marker, MarkerDragStartEndEvent } from 'react-native-maps';
import { COLOR } from '../../constants/AppConstants';
import { LayerType, PointRecordType, RecordType } from '../../types';
import { PointView, PointLabel } from '../atoms';
import { getColor } from '../../utils/Layer';
import { generateLabel } from '../../hooks/useLayers';

interface Props {
  data: PointRecordType[];
  layer: LayerType;
  zoom: number;
  selectedRecord: { layerId: string; record: RecordType } | undefined;
  draggable: boolean;
  onDragEndPoint: (e: MarkerDragStartEndEvent, layer: LayerType, feature: RecordType) => void;
}

export const Point = React.memo(
  (props: Props) => {
    //console.log('render Point');
    const { data, layer, zoom, selectedRecord, draggable, onDragEndPoint } = props;

    return (
      <>
        {data.map((feature) =>
          feature.visible ? (
            <PointComponent
              key={`point-${feature.id}-${feature.redraw}`}
              feature={feature}
              selectedRecord={selectedRecord}
              draggable={draggable}
              onDragEndPoint={onDragEndPoint}
              layer={layer}
              zoom={zoom}
            />
          ) : null
        )}
      </>
    );
  },
  (prevProps, nextProps) => {
    // 既存のプロパティの比較
    if (prevProps.data !== nextProps.data) return false;
    if (prevProps.layer !== nextProps.layer) return false;
    if (prevProps.zoom !== nextProps.zoom) return false;
    if (prevProps.draggable !== nextProps.draggable) return false;
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
  draggable: boolean;
  onDragEndPoint: (e: MarkerDragStartEndEvent, layer: LayerType, feature: RecordType) => void;
  layer: LayerType;
  zoom: number;
}

const PointComponent = React.memo((props: PointComponentProps) => {
  const { feature, selectedRecord, draggable, onDragEndPoint, layer, zoom } = props;
  //console.log(feature.field[layer.label]);

  const selected = useMemo(() => feature.id === selectedRecord?.record?.id, [feature.id, selectedRecord?.record?.id]);
  const label = useMemo(() => generateLabel(layer, feature), [feature, layer]);

  const color = useMemo(() => getColor(layer, feature, 0), [feature, layer]);

  const pointColor = useMemo(() => (selected ? COLOR.YELLOW : color), [color, selected]);
  const borderColor = useMemo(() => (selected ? COLOR.BLACK : COLOR.WHITE), [selected]);

  if (!feature.coords) return null;
  return (
    <Marker
      tracksViewChanges={Platform.OS === 'ios' ? true : selected} //ラベル変更と色変更を反映するため.androidは常にtrueだとパフォーマンスが落ちるため選択時のみtrue
      draggable={draggable}
      onDragEnd={(e) => onDragEndPoint(e, layer, feature)}
      coordinate={feature.coords}
      opacity={0.8}
      anchor={{ x: 0.5, y: 0.8 }}
      style={{ zIndex: selected ? 1000 : -1, alignItems: 'center' }}
    >
      {/*Textのcolorにcolorを適用しないとなぜかマーカーの色も変わらない*/}
      {/*labelの表示非表示でanchorがずれないようにzoom<=8でラベルを空白にする*/}
      {/*label表示で縦位置ずれるため、anchorで調整。sizeを変更すると調整必要 */}

      <PointLabel label={zoom > 8 ? label : ''} size={15} color={color} borderColor={COLOR.WHITE} />
      <PointView size={15} color={pointColor} borderColor={borderColor} />
    </Marker>
  );
});
