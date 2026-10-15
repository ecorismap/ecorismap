import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { COLOR } from '../../constants/AppConstants';
import { RecordType, LayerType, PointRecordType } from '../../types';
import { PointMarkerContent, getMarkerContentLayout } from '../atoms';
import { Marker, MarkerDragEvent, useMap } from 'react-map-gl/maplibre';
import type { Marker as MaplibreMarker } from 'maplibre-gl';
import { generateLabel, getColor } from '../../utils/Layer';
import { ViewportBounds, cullPoints } from '../../utils/ViewportCulling';
import { LabelPlacement, layoutPointLabels } from '../../utils/pointLabelGroups';
import { createBehindCameraTest, createTerrainOcclusionTest } from '../../utils/terrain3d/webCamera';

/** 地形による遮蔽の判定間隔[ms]（カメラが動いている間の間引き） */
const OCCLUSION_INTERVAL_MS = 200;

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
      zoomDecimal,
      editPositionLayer,
      editPositionMode,
      editPositionRecord,
      currentDrawTool,
      bounds,
    } = props;

    // 各ポイントがDOM要素(Marker)になるため、モバイル版と同様にviewport cullingで描画数を制限する
    const culledData = useMemo(() => {
      const visibleData = (data ?? []).filter((feature) => feature.visible);
      return cullPoints(visibleData, bounds || null, zoom, {
        buffer: 20,
        maxFeatures: 1000,
        minZoom: 10,
      });
    }, [data, bounds, zoom]);

    // 傾けた3Dでは、カメラの後ろの地点と地形に隠れた地点を隠す。
    // ・maplibreのマーカーは後ろの地点も投影してしまい、眺望のように水平に見ると
    //   背後の地点が空に浮いて見える
    // ・地形に隠れた地点はmaplibreが薄く（20%）表示するが、その判定は眺望の遠方で甘く、
    //   尾根の向こうの地点が見えてしまう。山名と同じ視線判定に置き換え、隠れた地点は消す
    //   （maplibreの薄くする処理は止める）。詳しくはwebCamera.ts
    // 後ろかどうかは描画のたびに判定する（位置はmaplibreが描画ごとに動かす）。
    // 視線判定は重いので間引き、カメラが止まったら最後に必ずやり直す。
    // 真上から見ているとき（判定関数がnull）はmaplibreの既定の見せ方のまま
    const { current: mapRef } = useMap();
    const markersRef = useRef(new Map<string, MaplibreMarker>());
    const occludedRef = useRef(new Set<string>());
    const lastOcclusionRef = useRef(0);
    const pitchedRef = useRef(false);
    const updateMarkerVisibility = useCallback(
      (forceOcclusion = false) => {
        const map = mapRef?.getMap();
        if (!map) return;
        const isBehind = createBehindCameraTest(map);
        const pitched = isBehind !== null;
        if (pitched !== pitchedRef.current) {
          pitchedRef.current = pitched;
          // 傾けている間は自前の判定で消すので、maplibreの「隠れたら薄く」は止める
          markersRef.current.forEach((marker) => (pitched ? marker.setOpacity('1', '1') : marker.setOpacity()));
          forceOcclusion = true;
        }
        const now = Date.now();
        if (pitched && (forceOcclusion || now - lastOcclusionRef.current >= OCCLUSION_INTERVAL_MS)) {
          lastOcclusionRef.current = now;
          const isOccluded = createTerrainOcclusionTest(map);
          const occluded = new Set<string>();
          if (isOccluded !== null) {
            markersRef.current.forEach((marker, key) => {
              const lngLat = marker.getLngLat();
              if (!isBehind(lngLat) && isOccluded(lngLat)) occluded.add(key);
            });
          }
          occludedRef.current = occluded;
        }
        markersRef.current.forEach((marker, key) => {
          const hidden = pitched && (occludedRef.current.has(key) || isBehind(marker.getLngLat()));
          const element = marker.getElement();
          const visibility = hidden ? 'hidden' : '';
          if (element.style.visibility !== visibility) element.style.visibility = visibility;
        });
      },
      [mapRef]
    );
    useEffect(() => {
      const map = mapRef?.getMap();
      if (!map) return;
      const onRender = () => updateMarkerVisibility();
      // 止まった時点の視線で判定し直す（間引きで最後の位置を取りこぼさないように）
      const onIdle = () => updateMarkerVisibility(true);
      map.on('render', onRender);
      map.on('idle', onIdle);
      return () => {
        map.off('render', onRender);
        map.off('idle', onIdle);
      };
    }, [mapRef, updateMarkerVisibility]);
    // マーカーが作り直されたら、次の描画を待たずに判定する
    useEffect(() => updateMarkerVisibility(true), [culledData, updateMarkerVisibility]);
    const setMarkerRef = useCallback((key: string, marker: MaplibreMarker | null) => {
      if (marker) {
        // 新しいマーカーにも、いまの見せ方（傾けている間は薄くしない）を揃える
        if (pitchedRef.current && !markersRef.current.has(key)) marker.setOpacity('1', '1');
        markersRef.current.set(key, marker);
      } else {
        markersRef.current.delete(key);
      }
    }, []);

    // ラベルの置き場所を決める。重なるものは通常位置→引き出し線→非表示の順で解決する。
    // 選択中のポイントのラベルは優先して残す。zoom<=8はラベル自体を出さない
    // （maplibreのズームは512pxタイル基準）
    const selectedId = selectedRecord?.layerId === layer.id ? selectedRecord.record?.id : undefined;
    const labelById = useMemo(() => {
      const result = new Map<string, { label: string; placement: LabelPlacement }>();
      if (zoom <= 8) return result;
      const labeled = culledData.map((f) => ({ id: f.id, coords: f.coords, label: generateLabel(layer, f) }));
      const placements = layoutPointLabels(labeled, zoomDecimal, {
        tileSize: 512,
        labelPosition: 'below',
        priorityIds: selectedId ? [selectedId] : undefined,
      });
      for (const item of labeled) {
        const placement = placements.get(item.id);
        if (placement) result.set(item.id, { label: item.label, placement });
      }
      return result;
    }, [culledData, layer, zoom, zoomDecimal, selectedId]);

    if (data === undefined) return null;

    return (
      <>
        {culledData.map((feature) => {
          if (!feature.coords) return null;
          const labelPlacement = labelById.get(feature.id);
          // コンテナは記号＋ラベルの外接矩形。左上を座標に置き、記号中心ぶんoffsetで戻す
          const contentLayout = getMarkerContentLayout(labelPlacement?.placement, 15);

          const labelColor = getColor(layer, feature);
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
              ref={(marker: MaplibreMarker | null) => setMarkerRef(`${feature.id}-${feature.redraw}`, marker)}
              {...feature.coords}
              anchor={'top-left'}
              offset={[-contentLayout.cx, -contentLayout.cy]}
              draggable={draggable}
              onDragEnd={(e) => onDragEndPoint(e, layer, feature)}
            >
              {/*コンテナはpointer-events noneで、記号とラベル以外は地図のクリックを遮らない*/}
              <div>
                <PointMarkerContent
                  label={labelPlacement?.label ?? ''}
                  placement={labelPlacement?.placement}
                  size={15}
                  color={labelColor}
                  pointColor={color}
                  borderColor={borderColor}
                  labelBorderColor={COLOR.WHITE}
                />
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
    // 選択されたレイヤーIDが自分のレイヤーIDと一致するか？
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
