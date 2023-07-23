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

export const Point = (props: Props) => {
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
};

const PointComponent = React.memo((props: any) => {
  const { feature, selectedRecord, draggable, onDragEndPoint, layer, zoom } = props;
  //console.log(feature.field[layer.label]);

  const selected = useMemo(() => feature.id === selectedRecord?.record?.id, [feature.id, selectedRecord?.record?.id]);
  const label = useMemo(() => generateLabel(layer, feature), [feature, layer]);

  const color = useMemo(() => getColor(layer, feature, 0), [feature, layer]);

  const pointColor = useMemo(() => (selected ? COLOR.YELLOW : color), [color, selected]);
  const borderColor = useMemo(() => (selected ? COLOR.BLACK : COLOR.WHITE), [selected]);

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
