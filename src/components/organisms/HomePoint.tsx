import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { Marker, MarkerDragStartEndEvent } from 'react-native-maps';
import { COLOR } from '../../constants/AppConstants';
import { LayerType, PointRecordType, RecordType } from '../../types';
import { PointMarkerContent, getMarkerContentLayout, getMaxLabelWidth } from '../atoms';
import { generateLabel, getColor } from '../../utils/Layer';
import { ViewportBounds, cullPoints } from '../../utils/ViewportCulling';
import { DEFAULT_LABEL_LAYOUT_OPTIONS, LabelPlacement, layoutPointLabels } from '../../utils/pointLabelGroups';
import { MARKER_BAND, SELECTED_MARKER_ZINDEX, markerZIndex } from '../../utils/markerZIndex';

interface Props {
  data: PointRecordType[];
  layer: LayerType;
  zoom: number;
  /** グループ化の距離計算用。整数のzoomだと最大2倍過小評価するため端数込みの値を使う */
  zoomDecimal: number;
  selectedRecord: { layerId: string; record: RecordType } | undefined;
  editPositionMode: boolean;
  editPositionRecord: RecordType | undefined;
  editPositionLayer: LayerType | undefined;
  currentDrawTool: string;
  bounds?: ViewportBounds | null;

  onDragEndPoint: (e: MarkerDragStartEndEvent, layer: LayerType, feature: RecordType) => void;
}

const POINT_SIZE = 15;
// マーカー画像の大きさ上限（iOS Google Maps SDK）に収まるラベル幅。超える分は…で省略される
const MAX_LABEL_WIDTH = getMaxLabelWidth(POINT_SIZE, Math.max(...DEFAULT_LABEL_LAYOUT_OPTIONS.leaderRadii));

export const Point = React.memo(
  (props: Props) => {
    //console.log('render Point');
    const {
      data,
      layer,
      zoom,
      zoomDecimal,
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

    // ラベルの置き場所を決める。重なるものは通常位置→引き出し線→非表示の順で解決する。
    // 選択中のポイントのラベルは優先して残す。zoom<=8はラベル自体を出さない
    const selectedId = selectedRecord?.layerId === layer.id ? selectedRecord.record?.id : undefined;
    const labelById = useMemo(() => {
      const result = new Map<string, { label: string; placement: LabelPlacement }>();
      if (zoom <= 8) return result;
      const labeled = culledData.map((f) => ({ id: f.id, coords: f.coords, label: generateLabel(layer, f) }));
      const placements = layoutPointLabels(labeled, zoomDecimal, {
        tileSize: 256,
        labelPosition: 'above',
        pointSize: POINT_SIZE,
        maxLabelWidth: MAX_LABEL_WIDTH,
        priorityIds: selectedId ? [selectedId] : undefined,
      });
      for (const item of labeled) {
        const placement = placements.get(item.id);
        if (placement) result.set(item.id, { label: item.label, placement });
      }
      return result;
    }, [culledData, layer, zoom, zoomDecimal, selectedId]);

    return (
      <>
        {culledData.map((feature) => (
          <PointComponent
            key={`point-${feature.id}-${feature.redraw}-${selectedRecord?.record?.id === feature.id}`}
            feature={feature}
            labelPlacement={labelById.get(feature.id)}
            selectedRecord={selectedRecord}
            editPositionMode={editPositionMode}
            editPositionRecord={editPositionRecord}
            editPositionLayer={editPositionLayer}
            currentDrawTool={currentDrawTool}
            onDragEndPoint={onDragEndPoint}
            layer={layer}
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
    if (prevProps.zoomDecimal !== nextProps.zoomDecimal) return false;
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
      if (prevProps.selectedRecord?.record?.id !== nextProps.selectedRecord?.record?.id) return false;
    }

    return true;
  }
);

interface PointComponentProps {
  feature: PointRecordType;
  /** このマーカーに描くラベルと置き場所（間引かれたらundefined） */
  labelPlacement: { label: string; placement: LabelPlacement } | undefined;
  selectedRecord: { layerId: string; record: RecordType } | undefined;
  editPositionMode: boolean;
  editPositionRecord: RecordType | undefined;
  editPositionLayer: LayerType | undefined;
  currentDrawTool: string;
  onDragEndPoint: (e: MarkerDragStartEndEvent, layer: LayerType, feature: RecordType) => void;
  layer: LayerType;
}

const PointComponent = React.memo((props: PointComponentProps) => {
  const {
    feature,
    labelPlacement,
    selectedRecord,
    onDragEndPoint,
    layer,
    editPositionMode,
    currentDrawTool,
  } = props;
  //console.log(feature.field[layer.label]);

  const selected = useMemo(() => feature.id === selectedRecord?.record?.id, [feature.id, selectedRecord?.record?.id]);
  const color = useMemo(() => getColor(layer, feature), [feature, layer]);

  const pointColor = useMemo(() => (selected ? COLOR.YELLOW : color), [color, selected]);
  const borderColor = useMemo(() => (selected ? COLOR.BLACK : COLOR.WHITE), [selected]);
  // editPositionモードではタップで移動するため、長押しドラッグは無効
  // 通常モードではMOVE_POINTツール有効時に長押しドラッグ可能
  const draggable = useMemo(
    () => currentDrawTool === 'MOVE_POINT' && !editPositionMode,
    [currentDrawTool, editPositionMode]
  );

  // tracksViewChangesは両OSでfalse固定。
  // - iOS(Google Maps)はtrueだとGMSMarkerのiconViewが毎フレーム再描画され、
  //   同一座標のマーカー同士でz順が入れ替わって点滅する（rnmaps#1159）上、CPU/電池を消費し続ける
  // - AndroidはGoogle Maps SDKのIllegalStateException回避のためfalseが必須
  // falseだとラベル・色の変更がアイコンに反映されないため、見た目に影響する値を
  // keyに含めてremountで再ラスタライズさせる（選択変化は親のkeyでもremountされる）。
  // iOSはFabricでマーカー挿入後に子のレイアウトが確定するため、撮影がレイアウト前になり
  // ラベル欠け・偽ポイント（格子）が出る。AIRGoogleMapMarkerのpatchでレイアウト後に撮り直している。
  // 一時的にtrueにして戻す方法は、ライブ描画用ビューが取り残されて二重表示になるので使わない
  const pl = labelPlacement?.placement;
  const placementKey = pl
    ? `${labelPlacement!.label}@${pl.dx.toFixed(1)},${pl.dy.toFixed(1)}${pl.leader ? `L${pl.leader.angle.toFixed(2)}` : ''}`
    : '';
  const markerContentKey = `${placementKey}|${color}|${pointColor}|${borderColor}`;
  // コンテナは記号＋ラベルの外接矩形なので、記号中心の位置をanchorで伝える
  const contentLayout = getMarkerContentLayout(pl, POINT_SIZE);
  const anchor = { x: contentLayout.cx / contentLayout.width, y: contentLayout.cy / contentLayout.height };

  if (!feature.coords) return null;
  return (
    <Marker
      key={markerContentKey}
      tracksViewChanges={false}
      draggable={draggable}
      onDragEnd={(e) => onDragEndPoint(e, layer, feature)}
      coordinate={feature.coords}
      opacity={0.8}
      anchor={anchor}
      style={{ zIndex: selected ? 1000 : 1, alignItems: 'center' }}
      // style.zIndexはGMSMarkerに届かないため、iOSはネイティブのzIndexプロップも指定する。
      // Google Maps SDKは同一zIndexのマーカーの描画順を保証せず、再描画のたびに入れ替わって
      // 点滅の原因になるため、レイヤをまたいでも衝突しないidハッシュで一意な順序を与える（選択中は最前面）
      zIndex={
        Platform.OS === 'ios'
          ? selected
            ? SELECTED_MARKER_ZINDEX
            : markerZIndex(MARKER_BAND.POINT, feature.id)
          : undefined
      }
    >
      {/*Textのcolorにcolorを適用しないとなぜかマーカーの色も変わらない*/}
      {/*記号＋ラベル＋引き出し線の外接矩形をコンテナにし、記号中心をanchorで合わせる。
         Markerの直接の子は単一のViewにまとめる（New ArchのAndroidで
         先頭の子のサイズでビットマップが切り出され、他の子がクリップされるため）*/}
      <PointMarkerContent
        label={labelPlacement?.label ?? ''}
        placement={pl}
        size={POINT_SIZE}
        color={color}
        pointColor={pointColor}
        borderColor={borderColor}
        labelBorderColor={COLOR.WHITE}
      />
    </Marker>
  );
});
