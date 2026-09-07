import { TERRAIN_EXAGGERATION } from '../constants/DemSources';
import { Dispatch, RefObject, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, Platform } from 'react-native';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import MapView from 'react-native-maps';
import { ulid } from 'ulid';
import { t } from '../i18n/config';
import {
  DrawLineStyleType,
  DrawLineType,
  DrawToolType,
  FeatureButtonType,
  HandwritingPenStyleType,
  HandwritingSubToolType,
  InfoToolType,
  LayerType,
  LineRecordType,
  LineToolType,
  PointRecordType,
  PointToolType,
  PolygonRecordType,
  PolygonToolType,
  RecordType,
  UndoLineType,
} from '../types';
import {
  latLonObjectsToLatLonArray,
  latLonObjectsToXYArray,
  calcDegreeRadius,
  latlonArrayToLatLonObjects,
  latLonArrayToXYArray,
  xyArrayToLatLonArray,
  xyToLatLon,
  selectLineFeatureByLatLon,
  selectPolygonFeatureByLatLon,
  selectPointFeatureByLatLon,
  selectPointFeaturesByArea,
  selectLineFeaturesByArea,
  selectPolygonFeaturesByArea,
  isValidPoint,
  isValidLine,
  isValidPolygon,
  calcCentroid,
  calcLineMidPoint,
  checkDistanceFromLine,
  findNearNodeIndex,
  getSnappedPositionWithLine,
  modifyLineWithSource,
  smoothJunctions,
  closeFreehandPolygonSeam,
  getSnappedLine,
  refineArrowStroke,
  getRotatedPointsTransformFrame,
  POINTS_TRANSFORM_HANDLE_RADIUS_PX,
} from '../utils/Coords';
import { useWindow } from './useWindow';
import { deleteRecordsAction } from '../modules/dataSet';
import { MapRef } from 'react-map-gl/maplibre';
import { editSettingsAction } from '../modules/settings';
import { useRecord } from './useRecord';
import { isBrushTool, isHandwritingTool, isPlotTool, isPointTool, isStampTool } from '../utils/General';
import { PositionFilter } from '../utils/OneEuroFilter';
import { Position } from 'geojson';
import { RootState } from '../store';

//ピンチ開始時にGrant以降の移動距離がこの値未満なら描画意図なしとみなして破棄する
const PINCH_DISCARD_DISTANCE_PX = 10;
//手書きペンの矢印整形パラメータ（マップメモのペンと同値）
const PEN_SIMPLIFY_TOLERANCE_PX = 1.0;
const MIN_POINTS_FOR_REFINE = 5;
//手書きポリゴンの長押し→なぞり修正（マップメモの引き直しと同値）
const HANDWRITING_LONG_PRESS_MS = 500;
const HANDWRITING_LONG_PRESS_MOVE_PX = 20;
//編集選択時にこの頂点数以上のオブジェクトは手書き（フリーハンド）由来とみなし、手書きモードで編集する
const HANDWRITING_SELECT_MIN_POINTS = 15;

//色分けが「個別（_strokeColor参照）」のレイヤか。
//このレイヤでは手書き以外（プロット・フリーハンド）で作る新規レコードにも現在の色・太さを書き込む
const isIndividualStrokeLayer = (layer: LayerType) =>
  layer.colorStyle.colorType === 'INDIVIDUAL' &&
  layer.colorStyle.fieldName === '__CUSTOM' &&
  layer.colorStyle.customFieldValue === '_strokeColor';

//手書きストロークの隠しフィールドを書き込んでマップメモのレコードと互換にする。
//withIndividualStyle=false（レイヤの色分けが個別でない）の場合は色・太さを書かず、
//表示はレイヤのスタイル設定に従わせる。スタンプ・ブラシの記号情報と消しゴム互換フィールドは常に書く
const applyHandwritingStyleField = (
  record: RecordType,
  style: DrawLineStyleType,
  groupId: string | undefined,
  withIndividualStyle: boolean
) => {
  if (withIndividualStyle) {
    record.field._strokeWidth = style.strokeWidth;
    record.field._strokeColor = style.strokeColor;
    record.field._zoom = style.zoom;
  } else if (style.stamp !== '' || isBrushTool(style.strokeStyle)) {
    //レイヤスタイルに従う場合も、記号サイズのズーム連動には_zoomを使う
    record.field._zoom = style.zoom;
  }
  record.field._strokeStyle = style.strokeStyle;
  record.field._stamp = style.stamp;
  record.field._group = groupId ?? '';
};

export type UseDrawToolReturnType = {
  isEditingDraw: boolean;
  isAreaSelected: boolean;
  isUndoable: boolean;
  isRedoable: boolean;
  isEditingObject: boolean;
  isSelectedDraw: boolean;
  drawLine: React.RefObject<DrawLineType[]>;
  editingLineXY: React.RefObject<Position[]>;
  selectLine: React.RefObject<Position[]>;
  currentDrawTool: DrawToolType;
  currentPointTool: PointToolType;
  currentLineTool: LineToolType;
  currentPolygonTool: PolygonToolType;
  featureButton: FeatureButtonType;
  isDrawLineVisible: boolean;
  visibleInfoPicker: boolean;
  currentInfoTool: InfoToolType;
  isPencilTouch: RefObject<boolean | undefined>;
  featuresTransformAngle: RefObject<number>;
  isPinch: boolean;
  isTerrainActive: boolean;
  isInfoToolActive: boolean;
  setCurrentInfoTool: (tool: InfoToolType) => void;
  setVisibleInfoPicker: React.Dispatch<React.SetStateAction<boolean>>;
  setDrawTool: React.Dispatch<React.SetStateAction<DrawToolType>>;
  setPointTool: React.Dispatch<React.SetStateAction<PointToolType>>;
  setLineTool: React.Dispatch<React.SetStateAction<LineToolType>>;
  setPolygonTool: React.Dispatch<React.SetStateAction<PolygonToolType>>;
  setFeatureButton: React.Dispatch<React.SetStateAction<FeatureButtonType>>;
  savePoint: () => {
    isOK: boolean;
    message: string;
    layer: LayerType | undefined;
    recordSet: RecordType[] | undefined;
  };
  saveLine: (
    defaultStyle?: DrawLineStyleType,
    applyStyleToSelected?: { color: boolean; width: boolean; arrow?: boolean }
  ) => {
    isOK: boolean;
    message: string;
    layer: LayerType | undefined;
    recordSet: RecordType[] | undefined;
  };
  savePolygon: (
    defaultStyle?: DrawLineStyleType,
    applyStyleToSelected?: { color: boolean; width: boolean; arrow?: boolean }
  ) => {
    isOK: boolean;
    message: string;
    layer: LayerType | undefined;
    recordSet: RecordType[] | undefined;
  };

  deleteDraw: () => {
    isOK: boolean;
    message: string;
    layer?: LayerType;
  };
  undoDraw: () => true | undefined;
  finishEditObject: () => boolean;
  selectSingleFeature: (event: GestureResponderEvent) =>
    | {
        layer: undefined;
        feature: undefined;
        recordSet: undefined;
        recordIndex: undefined;
      }
    | {
        layer: LayerType;
        feature: PointRecordType | LineRecordType | PolygonRecordType;
        recordSet: PointRecordType[] | LineRecordType[] | PolygonRecordType[] | undefined;
        recordIndex: number | undefined;
      };
  resetDrawTools: () => void;

  hideDrawLine: () => void;
  showDrawLine: () => void;
  toggleTerrain: (activate?: boolean) => void;
  convertPointFeatureToDrawLine: (layerId: string, features: PointRecordType[]) => void;
  setIsPinch: Dispatch<SetStateAction<boolean>>;
  getPXY: (event: GestureResponderEvent) => Position;
  handleGrantPlot: (pXY: Position) => void;
  handwritingSubTool: HandwritingSubToolType;
  setHandwritingSubTool: Dispatch<SetStateAction<HandwritingSubToolType>>;
  handleGrantHandwriting: (pXY: Position, penStyle: HandwritingPenStyleType) => void;
  convertSelectionToHandwriting: (penStyle: HandwritingPenStyleType) => void;
  switchSelectionToSplit: () => boolean;
  convertSessionToPlot: (featureType: FeatureButtonType) => void;
  applySelectionStylePreview: (style: { strokeColor?: string; strokeWidth?: number; strokeStyle?: string }) => void;
  handleMoveHandwriting: (pXY: Position, timestampMs: number) => void;
  handleReleaseHandwriting: () => void;
  commitHandwritingStroke: () => void;
  cancelHandwritingStroke: () => void;
  handleMovePlot: (pXY: Position) => void;
  handleGrantSelect: (pXY: Position) => void;
  handleMoveSelect: (pXY: Position) => void;
  handleReleaseSelect: (pXY: Position) => void;
  cancelPlotGrant: () => void;
  redoDraw: () => void;
  handleReleasePlotPoint: () => void;
  handleReleasePlotLinePolygon: () => boolean;
  selectObjectByFeature: (layer: LayerType, feature: RecordType, shouldRefreshCoordinates?: boolean) => void;
  handleGrantSplitLine: (pXY: Position) => void;
  checkSplitLine: (pXY: Position) => boolean;
  setInfoToolActive: Dispatch<SetStateAction<boolean>>;
};

export const useDrawTool = (mapViewRef: MapView | MapRef | null): UseDrawToolReturnType => {
  const dispatch = useDispatch();
  const currentInfoTool = useSelector((state: RootState) => state.settings.currentInfoTool, shallowEqual);
  const [currentDrawTool, setDrawTool] = useState<DrawToolType>('NONE');
  const [currentPointTool, setPointTool] = useState<PointToolType>('PLOT_POINT');
  const [currentLineTool, setLineTool] = useState<LineToolType>('PLOT_LINE');
  const [currentPolygonTool, setPolygonTool] = useState<PolygonToolType>('PLOT_POLYGON');
  const [featureButton, setFeatureButton] = useState<FeatureButtonType>('NONE');
  const [, setRedraw] = useState('');
  const [isTerrainActive, setIsTerrainActive] = useState(false);
  const terrainPreferenceRef = useRef(false);
  const [visibleInfoPicker, setVisibleInfoPicker] = useState(false);
  const [isDrawLineVisible, setDrawLineVisible] = useState(true);
  const refreshDrawLine = useRef(true);
  //latlonが座標の真。xyは表示・ヒットテスト用の派生値で、地図移動時にlatlonから再投影される。
  //編集操作ではxy全体からlatlonを再生成せず、変更した頂点のみxyToLatLonで部分更新する
  //（全再生成すると全頂点が画面ピクセル解像度に丸められ、編集のたびに精度劣化が累積するため）。
  //latlonはundoスナップショットが参照を保持するため、in-place変更せず常に新配列で置き換えること。
  const drawLine = useRef<DrawLineType[]>([]);
  //フリーハンドの手ぶれ補正（1€フィルタ）。スクリーン座標に適用してから緯度経度化する
  const strokeFilter = useRef(new PositionFilter());
  //最後の生タッチ位置（終点キャッチアップ用）
  const lastTouchXY = useRef<Position | null>(null);
  const editingLineXY = useRef<Position[]>([]);
  const undoLine = useRef<UndoLineType[]>([]);
  const editingObjectIndex = useRef(-1);
  const selectLine = useRef<Position[]>([]);
  const isEditingDraw = useRef(false);
  //Redo用スタック。新しい編集操作(pushUndo)が入ると無効化される
  const redoLine = useRef<(UndoLineType & { line?: DrawLineType; objectIndex?: number })[]>([]);

  /**
   * undoスタックへ積む（新しい編集が入ったのでredo履歴は無効化する）
   */
  const pushUndo = useCallback((item: UndoLineType) => {
    undoLine.current.push(item);
    redoLine.current = [];
  }, []);
  const isEditingObject = useRef(false);
  const isSelectedDraw = useRef(false);
  const isPencilTouch = useRef<boolean | undefined>(undefined);
  const [isPinch, setIsPinch] = useState(false);
  const [isInfoToolActive, setInfoToolActive] = useState(false);
  //手書きペン（HANDWRITING_LINE/HANDWRITING_POLYGON）のセッション状態
  const [handwritingSubTool, setHandwritingSubTool] = useState<HandwritingSubToolType>('PEN');
  const handwritingPenStyle = useRef<HandwritingPenStyleType>({
    strokeColor: 'rgba(0,0,0,0.7)',
    strokeWidth: 2,
    arrowStyle: 'NONE',
    isStraightStyle: false,
    snapWithLine: true,
  });
  const handwritingSnapTarget = useRef<{ coordsXY: Position[]; targetId: string } | undefined>(undefined);
  const handwritingBrushStartXY = useRef<Position>([0, 0]);
  //タッチ中の手書きストロークが存在するか（release/pinch処理の対象判定）
  const activeHandwritingStroke = useRef(false);
  //手書きポリゴンの長押し→なぞり修正用タイマー
  const handwritingLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handwritingLongPressStartXY = useRef<Position | null>(null);

  const offset = useRef([0, 0]);

  const { mapSize, mapRegion } = useWindow();

  type EditingNodeStateType = 'NONE' | 'NEW' | 'MOVE';
  const editingNodeIndex = useRef(-1);
  const editingNodeState = useRef<EditingNodeStateType>('NONE');
  //複数選択（なげなわ）の一括変形（移動・回転）状態。ポイント・ライン・ポリゴン共通
  type FeaturesTransformModeType = 'NONE' | 'MOVE' | 'ROTATE';
  const isAreaSelected = useRef(false);
  const featuresTransformMode = useRef<FeaturesTransformModeType>('NONE');
  const featuresTransformStartXY = useRef<Position | null>(null);
  const featuresTransformSnapshot = useRef<Position[][]>([]);
  const featuresTransformCenter = useRef<Position>([0, 0]);
  //選択ボックスの累積回転角（rad）。回転してもボックスがオブジェクトと一緒に形を保つように保持する
  const featuresTransformAngle = useRef(0);
  const featuresTransformBaseAngle = useRef(0);

  const {
    dataUser,
    pointDataSet,
    lineDataSet,
    polygonDataSet,
    addRecord,
    updateRecord,
    getEditableLayerAndRecordSetWithCheck,
    generateRecord,
    findLayer,
    findRecord,
  } = useRecord();

  // 初期化時にcurrentInfoToolを'ALL_INFO'に強制設定
  // InfoToolを非表示にしたので、互換性のためにALL_INFOに固定
  useEffect(() => {
    if (currentInfoTool !== 'ALL_INFO') {
      dispatch(editSettingsAction({ currentInfoTool: 'ALL_INFO' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const convertPointFeatureToDrawLine = useCallback(
    (layerId: string, features: PointRecordType[]) => {
      features.forEach((record) => {
        if (record.coords === undefined) return;
        drawLine.current.push({
          id: record.id,
          layerId: layerId,
          record: record,
          xy: latLonObjectsToXYArray([record.coords], mapRegion, mapSize, mapViewRef),
          latlon: latLonObjectsToLatLonArray([record.coords]),
          properties: ['POINT'],
        });
      });
    },
    [mapRegion, mapSize, mapViewRef]
  );

  const convertLineFeatureToDrawLine = useCallback(
    (layerId: string, features: LineRecordType[]) => {
      features.forEach((record) => {
        if (record.coords === undefined) return;
        return drawLine.current.push({
          id: record.id,
          layerId: layerId,
          record: record,
          xy: latLonObjectsToXYArray(record.coords, mapRegion, mapSize, mapViewRef),
          latlon: latLonObjectsToLatLonArray(record.coords),
          properties: [],
        });
      });
    },
    [mapRegion, mapSize, mapViewRef]
  );
  const convertPolygonFeatureToDrawLine = useCallback(
    (layerId: string, features: PolygonRecordType[]) => {
      features.forEach((record) => {
        if (record.coords === undefined) return;
        return drawLine.current.push({
          id: record.id,
          layerId: layerId,
          record: record,
          xy: latLonObjectsToXYArray(record.coords, mapRegion, mapSize, mapViewRef),
          latlon: latLonObjectsToLatLonArray(record.coords),
          properties: [],
        });
      });
    },
    [mapRegion, mapSize, mapViewRef]
  );
  const selectPointFeatures = useCallback(
    (selectLineCoords: Position[], recordSet: RecordType[]) => {
      let features;
      if (selectLineCoords.length > 5) {
        //少し動くのを許容するため >5
        features = selectPointFeaturesByArea(recordSet as PointRecordType[], selectLineCoords);
      } else {
        const radius = calcDegreeRadius(1000, mapRegion, mapSize);
        const feature = selectPointFeatureByLatLon(recordSet as PointRecordType[], selectLineCoords[0], radius);
        features = feature !== undefined ? [feature] : [];
      }
      return features;
    },
    [mapRegion, mapSize]
  );

  const selectLineFeatures = useCallback(
    (selectLineCoords: Position[], recordSet: RecordType[]) => {
      let features;
      if (selectLineCoords.length > 5) {
        features = selectLineFeaturesByArea(recordSet as LineRecordType[], selectLineCoords);
      } else {
        const radius = calcDegreeRadius(500, mapRegion, mapSize);
        const feature = selectLineFeatureByLatLon(recordSet as LineRecordType[], selectLineCoords[0], radius);
        features = feature !== undefined ? [feature] : [];
      }
      return features;
    },
    [mapRegion, mapSize]
  );

  const selectPolygonFeatures = useCallback(
    (selectLineCoords: Position[], recordSet: RecordType[]) => {
      let features;
      if (selectLineCoords.length > 5) {
        features = selectPolygonFeaturesByArea(recordSet as PolygonRecordType[], selectLineCoords);
      } else {
        const radius = calcDegreeRadius(500, mapRegion, mapSize);
        const feature = selectPolygonFeatureByLatLon(recordSet as PolygonRecordType[], selectLineCoords[0], radius);
        features = feature !== undefined ? [feature] : [];
      }
      return features;
    },
    [mapRegion, mapSize]
  );

  const resetDrawTools = useCallback(() => {
    if (handwritingLongPressTimer.current) {
      clearTimeout(handwritingLongPressTimer.current);
      handwritingLongPressTimer.current = null;
    }
    handwritingLongPressStartXY.current = null;
    drawLine.current = [];
    editingLineXY.current = [];
    isEditingDraw.current = false;
    isSelectedDraw.current = false;
    editingObjectIndex.current = -1;
    selectLine.current = [];
    undoLine.current = [];
    isEditingObject.current = false;
    isAreaSelected.current = false;
    featuresTransformMode.current = 'NONE';
    featuresTransformStartXY.current = null;
    featuresTransformAngle.current = 0;
    featuresTransformBaseAngle.current = 0;
    setDrawLineVisible(true);
  }, [isEditingObject]);

  const convertFeatureToDrawLine = useCallback(
    (pXY: Position) => {
      const { isOK, layer, recordSet } = getEditableLayerAndRecordSetWithCheck(featureButton);
      if (!isOK || layer === undefined || recordSet === undefined) {
        resetDrawTools();
        return;
      }
      const selectLineCoords = xyArrayToLatLonArray([pXY], mapRegion, mapSize, mapViewRef);
      let features = [];
      if (featureButton === 'POINT') {
        features = selectPointFeatures(selectLineCoords, recordSet);
        if (features.length > 0) convertPointFeatureToDrawLine(layer.id, [features[0]]);
      } else if (featureButton === 'LINE') {
        features = selectLineFeatures(selectLineCoords, recordSet);
        if (features.length > 0) convertLineFeatureToDrawLine(layer.id, [features[0]]);
      } else if (featureButton === 'POLYGON') {
        features = selectPolygonFeatures(selectLineCoords, recordSet);
        if (features.length > 0) convertPolygonFeatureToDrawLine(layer.id, [features[0]]);
      }
      if (features.length > 0) {
        isSelectedDraw.current = true;
        // unselectRecord();
        selectLine.current = [];
      } else {
        resetDrawTools();
      }
    },
    [
      convertLineFeatureToDrawLine,
      convertPointFeatureToDrawLine,
      convertPolygonFeatureToDrawLine,
      featureButton,
      getEditableLayerAndRecordSetWithCheck,
      mapRegion,
      mapSize,
      mapViewRef,
      resetDrawTools,
      selectLineFeatures,
      selectPointFeatures,
      selectPolygonFeatures,
    ]
  );

  ///////////////////////////////////////////////////
  const changeToEditingObject = useCallback(
    (index: number, featureType: FeatureButtonType) => {
      editingObjectIndex.current = index;
      const lineXY = drawLine.current[index].xy;
      pushUndo({
        index: index,
        latlon: drawLine.current[index].latlon,
        action: 'SELECT',
      });
      drawLine.current[index].properties = [...drawLine.current[index].properties, 'EDIT'];
      if (featureType === 'POLYGON') {
        lineXY.pop(); //閉じたポイントを一旦削除
        drawLine.current[index].latlon = drawLine.current[index].latlon.slice(0, -1);
      }
      isEditingObject.current = true;
    },
    [pushUndo]
  );

  const selectObjectByFeature = useCallback(
    (layer: LayerType, feature: RecordType, shouldRefreshCoordinates = false) => {
      if (layer.type === 'POINT') {
        if ((feature as PointRecordType).coords === undefined) {
          // 位置なしレコードの位置編集: 空のプロットを編集対象として登録する。
          // handleGrantPlotの「編集中ポイントはタップで位置更新」動作により最初のタップが位置設定になり、
          // savePointではrecordが紐づいているため既存レコードの更新として保存される
          drawLine.current.push({
            id: feature.id,
            layerId: layer.id,
            record: feature,
            xy: [],
            latlon: [],
            properties: ['POINT'],
          });
        } else {
          convertPointFeatureToDrawLine(layer.id, [feature as PointRecordType]);
        }
      } else if (layer.type === 'LINE') {
        convertLineFeatureToDrawLine(layer.id, [feature as LineRecordType]);
      } else if (layer.type === 'POLYGON') {
        convertPolygonFeatureToDrawLine(layer.id, [feature as PolygonRecordType]);
      }
      changeToEditingObject(0, layer.type as FeatureButtonType);
      isEditingDraw.current = true;
      // DataEditからの編集時のみ座標を再計算
      if (shouldRefreshCoordinates) {
        refreshDrawLine.current = true;
      }
      setRedraw(ulid());
    },
    [
      changeToEditingObject,
      convertLineFeatureToDrawLine,
      convertPointFeatureToDrawLine,
      convertPolygonFeatureToDrawLine,
    ]
  );

  const trySelectObjectAtPosition = useCallback(
    (pXY: Position) => {
      // まずdrawLineをクリアしてから選択されたフィーチャーを追加
      resetDrawTools();
      convertFeatureToDrawLine(pXY);

      // 選択されたフィーチャーが存在するかチェック
      if (drawLine.current.length === 0) return false;

      // 最初の（そして唯一の）フィーチャーを選択
      const index = 0;

      changeToEditingObject(index, featureButton);
      return true;
    },
    [changeToEditingObject, convertFeatureToDrawLine, featureButton, resetDrawTools]
  );

  const editStartNewPlotObject = useCallback(
    (pXY: Position) => {
      //console.log('New Line');
      drawLine.current.push({
        id: ulid(),
        layerId: undefined,
        record: undefined,
        xy: [pXY],
        latlon: [],
        properties: ['EDIT'],
      });
      if (isPlotTool(currentDrawTool))
        pushUndo({
          index: -1,
          latlon: [],
          action: 'NEW',
        });
      isEditingObject.current = true;
      editingNodeIndex.current = 0;
      editingNodeState.current = 'NEW';
      editingObjectIndex.current = drawLine.current.length - 1;
    },
    [currentDrawTool, drawLine, editingObjectIndex, isEditingObject, pushUndo]
  );

  const tryStartEditNode = useCallback(
    (pXY: Position) => {
      //plotの修正

      const index = editingObjectIndex.current;
      const lineXY = drawLine.current[index].xy;
      const { isNear } = checkDistanceFromLine(pXY, lineXY);
      if (!isNear) return false;

      const nodeIndex = findNearNodeIndex(pXY, lineXY);
      if (nodeIndex >= 0) {
        //console.log('move node');
        editingNodeIndex.current = nodeIndex;
        editingNodeState.current = 'MOVE';
        editingLineXY.current = [lineXY[nodeIndex]];
      } else {
        //console.log('make interporate node');
        const { index: idx } = getSnappedPositionWithLine(pXY, lineXY, {
          isXY: true,
        });
        lineXY.splice(idx + 1, 0, pXY);
        editingNodeIndex.current = idx + 1;
        editingNodeState.current = 'NEW';
      }
      return true;
    },
    [drawLine, editingLineXY, editingObjectIndex]
  );

  const createNewNode = useCallback(
    (pXY: Position) => {
      //console.log('Fix Plot');
      const index = editingObjectIndex.current;
      const lineXY = drawLine.current[index].xy;

      //plotを最後尾に追加
      lineXY.push(pXY);
      editingNodeIndex.current = drawLine.current[index].xy.length - 1;
      editingNodeState.current = 'NEW';
      return true;
    },
    [drawLine, editingObjectIndex]
  );

  const moveNode = useCallback(
    (pXY: Position) => {
      //nodeを動かす。
      //editingLineにも軌跡を保存。離した時に移動量が少なければタップとみなすため。
      const index = editingObjectIndex.current;
      drawLine.current[index].xy.splice(editingNodeIndex.current, 1, pXY);
      editingLineXY.current.push(pXY);
    },
    [drawLine, editingLineXY, editingObjectIndex]
  );

  const tryDeleteLineNode = useCallback(() => {
    //console.log('tryDeleteLineNode');
    if (editingNodeState.current === 'NEW') return false;
    if (editingNodeIndex.current === 0) return false;
    if (editingLineXY.current.length > 5) return false;
    const index = editingObjectIndex.current;
    pushUndo({
      index: index,
      latlon: drawLine.current[index].latlon,
      action: 'EDIT',
    });
    //途中のノードをタッチでノード削除
    const deleteIndex = editingNodeIndex.current;
    drawLine.current[index].xy.splice(deleteIndex, 1);
    drawLine.current[index].latlon = drawLine.current[index].latlon.filter((_, i) => i !== deleteIndex);
    editingLineXY.current = [];
    return true;
  }, [pushUndo, editingLineXY, editingObjectIndex, drawLine]);

  const fixLittleMovement = useCallback(() => {
    //タッチでズレるので、タッチ前の位置に戻す。
    const index = editingObjectIndex.current;
    const correctXY = editingLineXY.current[0];
    drawLine.current[index].xy.splice(editingNodeIndex.current, 1, correctXY);
  }, [drawLine, editingLineXY, editingObjectIndex]);

  const tryFinishEditObject = useCallback(() => {
    // ラインの場合は始点タップで確定しない（ポリゴンのみ）
    if (currentDrawTool === 'PLOT_LINE') return false;
    if (editingNodeState.current === 'NEW') return false;
    if (editingNodeIndex.current !== 0) return false;
    if (editingLineXY.current.length > 5) return false;
    fixLittleMovement();
    const index = editingObjectIndex.current;
    const lineXY = drawLine.current[index].xy;

    if (currentDrawTool === 'PLOT_POLYGON' && lineXY.length < 3) return false;

    pushUndo({
      index: index,
      latlon: drawLine.current[index].latlon,
      action: 'FINISH',
    });
    //最初のノードをタッチで編集終了（ポリゴンのみ）
    if (currentDrawTool === 'PLOT_POLYGON') {
      lineXY.push(lineXY[0]);
      drawLine.current[index].latlon = [...drawLine.current[index].latlon, drawLine.current[index].latlon[0]];
    }
    drawLine.current[index].properties = drawLine.current[index].properties.filter((p) => p !== 'EDIT');
    editingObjectIndex.current = -1;
    isEditingObject.current = false;
    editingLineXY.current = [];
    return true;
  }, [pushUndo, editingLineXY, fixLittleMovement, editingObjectIndex, drawLine, currentDrawTool, isEditingObject]);

  const finishEditObject = useCallback(() => {
    if (!isEditingObject.current) return false;
    const index = editingObjectIndex.current;
    if (index === -1) return false;

    const lineXY = drawLine.current[index].xy;

    // 最小ポイント数のチェック
    if (currentDrawTool === 'PLOT_LINE' && lineXY.length < 2) return false;
    if ((currentDrawTool === 'PLOT_POLYGON' || currentDrawTool === 'HANDWRITING_POLYGON') && lineXY.length < 3) return false;

    pushUndo({
      index: index,
      latlon: drawLine.current[index].latlon,
      action: 'FINISH',
    });

    //latlonは各操作で部分更新済み。不変条件が崩れている場合のみ全再生成にフォールバック
    if (drawLine.current[index].latlon.length !== lineXY.length) {
      if (__DEV__) console.warn('finishEditObject: xy/latlon length mismatch, regenerating');
      drawLine.current[index].latlon = xyArrayToLatLonArray(lineXY, mapRegion, mapSize, mapViewRef);
    }
    drawLine.current[index].properties = drawLine.current[index].properties.filter((p) => p !== 'EDIT');
    editingObjectIndex.current = -1;
    isEditingObject.current = false;
    editingLineXY.current = [];
    editingNodeState.current = 'NONE';
    editingNodeIndex.current = -1;
    setRedraw(ulid());
    return true;
  }, [pushUndo, currentDrawTool, drawLine, editingObjectIndex, isEditingObject, mapRegion, mapSize, mapViewRef]);

  const updateNodePosition = useCallback(() => {
    const index = editingObjectIndex.current;
    const lineXY = drawLine.current[index].xy;
    if (isPointTool(currentDrawTool) || drawLine.current[index].latlon.length !== 0) {
      //ラインは新規以外。新規の場合はNEWで追加している。
      pushUndo({
        index: index,
        latlon: drawLine.current[index].latlon,
        action: 'EDIT',
      });
    }
    //編集された頂点のみ変換して部分更新する。
    //既存ノード移動(MOVE)は該当indexを置換、新規ノード(NEW: 先頭/中間挿入/末尾追加)は該当indexへ挿入
    const nodeIndex = editingNodeIndex.current;
    const latlon = drawLine.current[index].latlon;
    if (latlon.length === lineXY.length && nodeIndex >= 0 && nodeIndex < lineXY.length) {
      const newLatLon = [...latlon];
      newLatLon[nodeIndex] = xyToLatLon(lineXY[nodeIndex], mapRegion, mapSize, mapViewRef);
      drawLine.current[index].latlon = newLatLon;
    } else if (latlon.length === lineXY.length - 1 && nodeIndex >= 0 && nodeIndex < lineXY.length) {
      const newLatLon = [...latlon];
      newLatLon.splice(nodeIndex, 0, xyToLatLon(lineXY[nodeIndex], mapRegion, mapSize, mapViewRef));
      drawLine.current[index].latlon = newLatLon;
    } else {
      //不変条件が崩れている場合のフォールバック（本来通らない）
      if (__DEV__) console.warn('updateNodePosition: xy/latlon length mismatch, regenerating');
      drawLine.current[index].latlon = xyArrayToLatLonArray(lineXY, mapRegion, mapSize, mapViewRef);
    }
    editingLineXY.current = [];
    if (currentDrawTool === 'ADD_LOCATION_POINT') isEditingObject.current = false;
  }, [
    pushUndo,
    editingObjectIndex,
    drawLine,
    currentDrawTool,
    mapRegion,
    mapSize,
    mapViewRef,
    editingLineXY,
    isEditingObject,
  ]);

  /******************************************************************: */

  const editStartNewFreehandObject = useCallback(
    (pXY: Position) => {
      //console.log('New Line');

      //新規ラインの場合。描画中も地図移動に追従できるよう最初から緯度経度も持つ
      drawLine.current.push({
        id: ulid(),
        layerId: undefined,
        record: undefined,
        xy: [pXY],
        latlon: [xyToLatLon(pXY, mapRegion, mapSize, mapViewRef)],
        properties: ['EDIT'],
      });

      pushUndo({
        index: -1,
        latlon: [],
        action: 'NEW',
      });
      isEditingObject.current = true;
      editingObjectIndex.current = -1;
    },
    [drawLine, editingObjectIndex, isEditingObject, pushUndo, mapRegion, mapSize, mapViewRef]
  );

  const drawFreehandNewLine = useCallback(
    (pXY: Position, timestampMs: number) => {
      //新規ラインの場合。1€フィルタで手ぶれを補正し、xyと緯度経度を同時に追加する
      const index = drawLine.current.length - 1;
      const filteredXY = strokeFilter.current.filter(pXY, timestampMs);
      const xy = drawLine.current[index].xy;
      const last = xy[xy.length - 1];
      //ほぼ動いていない点は追加しない（点数の無駄な増加を防ぐ）
      if (last !== undefined && Math.hypot(filteredXY[0] - last[0], filteredXY[1] - last[1]) < 1) return;
      drawLine.current[index].xy = [...xy, filteredXY];
      drawLine.current[index].latlon = [
        ...drawLine.current[index].latlon,
        xyToLatLon(filteredXY, mapRegion, mapSize, mapViewRef),
      ];
    },
    [drawLine, mapRegion, mapSize, mapViewRef]
  );

  const drawFreehandEditingLine = useCallback(
    (pXY: Position, timestampMs: number) => {
      //ライン修正の場合も手ぶれ補正を適用する
      editingLineXY.current = [...editingLineXY.current, strokeFilter.current.filter(pXY, timestampMs)];
    },
    [editingLineXY]
  );

  const editFreehandObject = useCallback(() => {
    // //ライン修正の場合
    const index = editingObjectIndex.current;
    const lineXY = editingLineXY.current;
    //終点キャッチアップ（フィルタ遅延対策）
    const finalXY = lastTouchXY.current;
    if (finalXY !== null) {
      const last = lineXY[lineXY.length - 1];
      if (last === undefined || finalXY[0] !== last[0] || finalXY[1] !== last[1]) lineXY.push(finalXY);
    }
    if (lineXY.length < 2) return;
    //元のラインの頂点はlatlonを保持したまま、修正ストローク部分のみ変換して合成する
    const toLatLon = (xy: Position) => xyToLatLon(xy, mapRegion, mapSize, mapViewRef);
    const modified = modifyLineWithSource(drawLine.current[index], lineXY, currentDrawTool, toLatLon);
    editingLineXY.current = [];
    if (modified.xy.length <= 0) return;

    //接続部をなぞり方に応じて平滑化（浅い角度=なめらか、急角度=かくっと維持）
    const blended = smoothJunctions(modified.xy, modified.latlon, modified.junctions, toLatLon);

    pushUndo({
      index: index,
      latlon: drawLine.current[index].latlon,
      action: 'EDIT',
    });

    drawLine.current[index] = {
      ...drawLine.current[index],
      xy: blended.xy,
      latlon: blended.latlon,
    };
  }, [pushUndo, currentDrawTool, drawLine, editingLineXY, editingObjectIndex, mapRegion, mapSize, mapViewRef]);

  ////////////////////////////////////////////////////

  const deleteDrawRecord = useCallback(
    (layerId: string) => {
      drawLine.current.forEach((line) => {
        if (line.record !== undefined) {
          dispatch(
            deleteRecordsAction({
              layerId: layerId,
              userId: dataUser.uid,
              data: [line.record],
            })
          );
        }
      });
    },
    [dataUser.uid, dispatch, drawLine]
  );

  const savePoint = useCallback(() => {
    //削除したものを取り除く
    drawLine.current = drawLine.current.filter((line) => line.xy.length !== 0);
    //有効なポイントかチェック(ポイントの数)
    const isValid = drawLine.current.every((line) => isValidPoint(line.xy));

    if (!isValid) {
      return { isOK: false, message: t('hooks.message.invalidPoint'), layer: undefined, recordSet: undefined };
    }
    const { isOK, message, layer, recordSet } = getEditableLayerAndRecordSetWithCheck('POINT');
    if (!isOK || layer === undefined || recordSet === undefined) {
      return { isOK: false, message, layer: undefined, recordSet: undefined };
    }

    const savedRecordSet: RecordType[] = [];
    for (const line of drawLine.current) {
      if (line.record !== undefined && line.layerId !== undefined) {
        const coords = latlonArrayToLatLonObjects(line.latlon)[0];
        const updatedRecord: RecordType = { ...line.record, coords };
        const recordLayer = findLayer(line.layerId);
        if (recordLayer === undefined) continue;
        updateRecord(recordLayer, updatedRecord);
        savedRecordSet.push(updatedRecord);
      } else {
        const record = generateRecord('POINT', layer, recordSet, latlonArrayToLatLonObjects(line.latlon)[0]);
        addRecord(layer, record);
        savedRecordSet.push(record);
      }
    }

    resetDrawTools();
    return { isOK: true, message: '', layer: layer, recordSet: savedRecordSet };
  }, [addRecord, findLayer, generateRecord, getEditableLayerAndRecordSetWithCheck, resetDrawTools, updateRecord]);

  const saveLine = useCallback((defaultStyle?: DrawLineStyleType, applyStyleToSelected?: { color: boolean; width: boolean; arrow?: boolean }) => {
    //削除したものを取り除く
    drawLine.current = drawLine.current.filter((line) => line.xy.length !== 0);
    //有効なラインかチェック(ポイントの数)
    const isValid = drawLine.current.every((line) => isValidLine(line.xy));

    if (!isValid) {
      return { isOK: false, message: t('hooks.message.invalidLine'), layer: undefined, recordSet: undefined };
    }
    const { isOK, message, layer, recordSet } = getEditableLayerAndRecordSetWithCheck('LINE');
    if (!isOK || layer === undefined || recordSet === undefined) {
      return { isOK: false, message, layer: undefined, recordSet: undefined };
    }

    const savedRecordSet: RecordType[] = [];

    //手書きセッションのスタンプ・ブラシ（子）は、親ストロークの保存後にレコードIDを解決するため後回しにする
    const isHandwritingChild = (line: DrawLineType) =>
      line.style !== undefined && (line.style.stamp !== '' || isBrushTool(line.style.strokeStyle));
    const orderedLines = [
      ...drawLine.current.filter((line) => !isHandwritingChild(line)),
      ...drawLine.current.filter(isHandwritingChild),
    ];
    //セッション内ストロークid→保存レコードid（子の_group解決用）
    const sessionIdMap = new Map<string, string>();

    for (const line of orderedLines) {
      if (line.record !== undefined && line.layerId !== undefined) {
        const coords = latlonArrayToLatLonObjects(line.latlon);
        const centroid = calcLineMidPoint(coords);
        const updatedRecord: RecordType = { ...line.record, coords, centroid };
        const recordLayer = findLayer(line.layerId);
        if (recordLayer === undefined) continue;
        //編集選択中に操作した項目（色・太さ・矢印）だけを個別色レイヤの選択レコードへ反映する。
        //操作していない項目は元の値を保持する（太さだけ変えたのに色が変わる事故を防ぐ）
        if (
          applyStyleToSelected !== undefined &&
          (applyStyleToSelected.color || applyStyleToSelected.width || applyStyleToSelected.arrow) &&
          defaultStyle !== undefined &&
          isIndividualStrokeLayer(recordLayer)
        ) {
          updatedRecord.field = { ...updatedRecord.field };
          if (applyStyleToSelected.color) updatedRecord.field._strokeColor = defaultStyle.strokeColor;
          if (applyStyleToSelected.width) {
            updatedRecord.field._strokeWidth = defaultStyle.strokeWidth;
            updatedRecord.field._zoom = defaultStyle.zoom;
          }
          //ブラシストローク（_strokeStyleがブラシ種別）は矢印の対象外
          if (applyStyleToSelected.arrow && !isBrushTool(String(updatedRecord.field._strokeStyle ?? ''))) {
            updatedRecord.field._strokeStyle = defaultStyle.strokeStyle;
          }
        }
        //recordが存在する場合は更新。存在しない場合は新規追加。splitLineに対応するため
        const targetRecord = findRecord(recordLayer.id, line.record.userId, line.record.id, 'LINE');
        if (targetRecord !== undefined) {
          updateRecord(recordLayer, updatedRecord);
        } else {
          addRecord(recordLayer, updatedRecord);
        }
        savedRecordSet.push(updatedRecord);
      } else {
        //スナップ先が見つからない場合は_groupを付けない（孤児レコード防止）
        const rawGroupId = line.style?.groupId;
        const groupId =
          rawGroupId === undefined
            ? undefined
            : sessionIdMap.get(rawGroupId) ?? (recordSet.some((r) => r.id === rawGroupId) ? rawGroupId : undefined);
        //同一バッチ内でのSERIAL連番と_groupの属性継承のため、保存済み分もrecordSetに含めて生成する
        const coords = latlonArrayToLatLonObjects(line.latlon);
        const batchRecordSet = [...recordSet, ...savedRecordSet];
        const record =
          groupId === undefined
            ? generateRecord('LINE', layer, batchRecordSet, coords)
            : generateRecord('LINE', layer, batchRecordSet, coords, { groupId });
        //手書きはストロークのスタイル、個別色レイヤへの通常作図（プロット・フリーハンド）は現在の色・太さを書き込む。
        //色分けが個別でないレイヤでは色・太さを書かず、レイヤのスタイル設定に従わせる
        const withIndividualStyle = isIndividualStrokeLayer(layer);
        const style = line.style ?? (withIndividualStyle ? defaultStyle : undefined);
        if (style !== undefined) applyHandwritingStyleField(record, style, groupId, withIndividualStyle);
        addRecord(layer, record);
        sessionIdMap.set(line.id, record.id);
        savedRecordSet.push(record);
      }
    }

    resetDrawTools();
    return { isOK: true, message: '', layer: layer, recordSet: savedRecordSet };
  }, [
    addRecord,
    findLayer,
    findRecord,
    generateRecord,
    getEditableLayerAndRecordSetWithCheck,
    resetDrawTools,
    updateRecord,
  ]);

  const savePolygon = useCallback((defaultStyle?: DrawLineStyleType, applyStyleToSelected?: { color: boolean; width: boolean; arrow?: boolean }) => {
    //削除したものを取り除く
    drawLine.current = drawLine.current.filter((line) => line.xy.length !== 0);

    // ポリゴンを閉じる（始点と終点が異なる場合）
    drawLine.current.forEach((line) => {
      const lineXY = line.xy;
      if (lineXY.length >= 3 && (lineXY[0][0] !== lineXY[lineXY.length - 1][0] || lineXY[0][1] !== lineXY[lineXY.length - 1][1])) {
        if (currentDrawTool === 'HANDWRITING_POLYGON' && line.latlon.length === lineXY.length) {
          //フリーハンドは閉じ目をなぞり方の角度に応じて平滑化して閉じる（急角度ならかくっと閉じる）
          const closed = closeFreehandPolygonSeam(lineXY, line.latlon, (p) =>
            xyToLatLon(p, mapRegion, mapSize, mapViewRef)
          );
          line.xy = closed.xy;
          line.latlon = closed.latlon;
        } else {
          lineXY.push(lineXY[0]);
          if (line.latlon.length === lineXY.length - 1) {
            line.latlon = [...line.latlon, line.latlon[0]];
          } else {
            if (__DEV__) console.warn('savePolygon: xy/latlon length mismatch, regenerating');
            line.latlon = xyArrayToLatLonArray(lineXY, mapRegion, mapSize, mapViewRef);
          }
        }
      }
    });

    //有効なポリゴンかチェック(閉じていない。自己交差は不正でない)
    const isValid = drawLine.current.every((line) => isValidPolygon(line.latlon));

    if (!isValid) {
      return { isOK: false, message: t('hooks.message.invalidPolygon'), layer: undefined, recordSet: undefined };
    }
    const { isOK, message, layer, recordSet } = getEditableLayerAndRecordSetWithCheck('POLYGON');
    // console.log('🔍 savePolygon - layer:', layer?.name, 'type:', layer?.type, 'id:', layer?.id);
    if (!isOK || layer === undefined || recordSet === undefined) {
      return { isOK: false, message, layer: undefined, recordSet: undefined };
    }

    const savedRecordSet: RecordType[] = [];
    for (const line of drawLine.current) {
      if (line.record !== undefined && line.layerId !== undefined) {
        const coords = latlonArrayToLatLonObjects(line.latlon);
        const centroid = calcCentroid(coords);
        const updatedRecord: RecordType = { ...line.record, coords, centroid };
        const recordLayer = findLayer(line.layerId);
        if (recordLayer === undefined) continue;
        //編集選択中に操作した項目（色・太さ）だけを個別色レイヤの選択レコードへ反映する。
        //操作していない項目は元の値を保持する（太さだけ変えたのに色が変わる事故を防ぐ）
        if (
          applyStyleToSelected !== undefined &&
          (applyStyleToSelected.color || applyStyleToSelected.width) &&
          defaultStyle !== undefined &&
          isIndividualStrokeLayer(recordLayer)
        ) {
          updatedRecord.field = { ...updatedRecord.field };
          if (applyStyleToSelected.color) updatedRecord.field._strokeColor = defaultStyle.strokeColor;
          if (applyStyleToSelected.width) {
            updatedRecord.field._strokeWidth = defaultStyle.strokeWidth;
            updatedRecord.field._zoom = defaultStyle.zoom;
          }
        }
        updateRecord(recordLayer, updatedRecord);
        savedRecordSet.push(updatedRecord);
      } else {
        //同一バッチ内でのSERIAL連番のため、保存済み分もrecordSetに含めて生成する
        const record = generateRecord(
          'POLYGON',
          layer,
          [...recordSet, ...savedRecordSet],
          latlonArrayToLatLonObjects(line.latlon)
        );
        //手書きはストロークのスタイル、個別色レイヤへの通常作図（プロット）は現在の色・太さを書き込む。
        //色分けが個別でないレイヤでは色・太さを書かず、レイヤのスタイル設定に従わせる
        const withIndividualStyle = isIndividualStrokeLayer(layer);
        const style = line.style ?? (withIndividualStyle ? defaultStyle : undefined);
        if (style !== undefined) applyHandwritingStyleField(record, style, undefined, withIndividualStyle);
        addRecord(layer, record);
        savedRecordSet.push(record);
      }
    }

    resetDrawTools();
    return { isOK: true, message: '', layer: layer, recordSet: savedRecordSet };
  }, [addRecord, currentDrawTool, findLayer, generateRecord, getEditableLayerAndRecordSetWithCheck, mapRegion, mapSize, mapViewRef, resetDrawTools, updateRecord]);

  const selectSingleFeature = useCallback(
    (event: GestureResponderEvent) => {
      resetDrawTools();

      //選択処理
      const pXY: Position = [event.nativeEvent.locationX, event.nativeEvent.locationY];

      let feature;
      let layer;
      let recordSet;
      let recordIndex;

      if (feature === undefined && (currentInfoTool === 'ALL_INFO' || currentInfoTool === 'POINT_INFO')) {
        const radius = calcDegreeRadius(2000, mapRegion, mapSize);
        for (const { layerId, data } of pointDataSet) {
          const selectedFeature = selectPointFeatureByLatLon(
            data,
            xyToLatLon(pXY, mapRegion, mapSize, mapViewRef),
            radius
          );
          //console.log(selectedFeature);
          if (selectedFeature !== undefined) {
            const selectedLayer = findLayer(layerId);
            if (!selectedLayer?.visible) continue;
            layer = selectedLayer;
            recordSet = data;
            recordIndex = data.findIndex((d) => d.id === selectedFeature.id);
            feature = selectedFeature;
            break;
          }
        }
      }

      if (feature === undefined && (currentInfoTool === 'ALL_INFO' || currentInfoTool === 'LINE_INFO')) {
        const radius = calcDegreeRadius(2000, mapRegion, mapSize);

        for (const { layerId, data } of lineDataSet) {
          const selectedFeature = selectLineFeatureByLatLon(
            data,
            xyToLatLon(pXY, mapRegion, mapSize, mapViewRef),
            radius
          );

          if (selectedFeature !== undefined) {
            const selectedLayer = findLayer(layerId);
            if (!selectedLayer?.visible) continue;
            layer = selectedLayer;
            recordSet = data;
            recordIndex = data.findIndex((d) => d.id === selectedFeature.id);
            feature = selectedFeature;
            break;
          }
        }
      }

      if (feature === undefined && (currentInfoTool === 'ALL_INFO' || currentInfoTool === 'POLYGON_INFO')) {
        const radius = calcDegreeRadius(2000, mapRegion, mapSize);
        for (const { layerId, data } of polygonDataSet) {
          const selectedFeature = selectPolygonFeatureByLatLon(
            data,
            xyToLatLon(pXY, mapRegion, mapSize, mapViewRef),
            radius
          );
          if (selectedFeature !== undefined) {
            const selectedLayer = findLayer(layerId);
            if (!selectedLayer?.visible) continue;
            layer = selectedLayer;
            recordSet = data;
            recordIndex = data.findIndex((d) => d.id === selectedFeature.id);
            feature = selectedFeature;
            break;
          }
        }
      }

      if (feature === undefined || layer === undefined) {
        return { layer: undefined, feature: undefined, recordSet: undefined, recordIndex: undefined };
      }

      return { layer, feature, recordSet, recordIndex };
    },
    [
      currentInfoTool,
      findLayer,
      lineDataSet,
      mapRegion,
      mapSize,
      mapViewRef,
      pointDataSet,
      polygonDataSet,
      resetDrawTools,
    ]
  );

  const hideDrawLine = useCallback(() => {
    refreshDrawLine.current = false;
    setDrawLineVisible(false);
  }, []);

  const showDrawLine = useCallback(() => {
    //useEffectでdrawLineを更新してから表示する。この時点ではまだ座標が更新されていないため。
    refreshDrawLine.current = true;
    if (drawLine.current.length === 0) setDrawLineVisible(true);
  }, []);

  const deleteDraw = useCallback(() => {
    const { isOK, message, layer } = getEditableLayerAndRecordSetWithCheck(featureButton);

    if (!isOK || layer === undefined) {
      return { isOK: false, message };
    }
    deleteDrawRecord(layer.id);
    resetDrawTools();
    setDrawTool('NONE');
    return { isOK: true, message: '', layer };
  }, [deleteDrawRecord, featureButton, getEditableLayerAndRecordSetWithCheck, resetDrawTools]);

  const undoDraw = useCallback(() => {
    //console.log(undoLine.current);

    const undo = undoLine.current.pop();

    //undo.indexが-1の時(選択時)はリセットする
    if (undo === undefined) return;

    //Redo用に取り消し前の状態を退避（SELECTのundoと最後のリセットはredo対象外）
    if (undo.action === 'NEW') {
      redoLine.current = [
        ...redoLine.current,
        {
          ...undo,
          line: drawLine.current[drawLine.current.length - 1],
          objectIndex: editingObjectIndex.current,
        },
      ];
    } else if (undo.action === 'EDIT_MULTI') {
      redoLine.current = [
        ...redoLine.current,
        { index: -1, latlon: [], latlonList: drawLine.current.map((line) => line.latlon), action: 'EDIT_MULTI' },
      ];
    } else if (undo.action !== 'SELECT') {
      redoLine.current = [
        ...redoLine.current,
        { index: undo.index, latlon: drawLine.current[undo.index].latlon, action: undo.action },
      ];
    }

    if (undo.action === 'NEW') {
      //追加の場合
      drawLine.current.pop();
      //手書きセッションは残りのストロークがあれば編集状態（確定バー）を維持する
      isEditingObject.current = isHandwritingTool(currentDrawTool) && drawLine.current.length > 0;
      editingObjectIndex.current = -1;
    } else if (undo.action === 'SELECT') {
      //オブジェクトの選択をアンドゥする場合（状態がリセットされるためredoは不可）
      redoLine.current = [];
      resetDrawTools();
      setDrawTool('NONE');
      return true;
    } else if (undo.action === 'DELETE') {
      //消したオブジェクトの場合
      drawLine.current[undo.index].xy = latLonArrayToXYArray(undo.latlon, mapRegion, mapSize, mapViewRef);
      drawLine.current[undo.index].latlon = undo.latlon;
      drawLine.current[undo.index].properties = drawLine.current[undo.index].properties.filter((p) => p !== 'EDIT');
      isEditingObject.current = false;
      editingObjectIndex.current = -1;
    } else if (undo.action === 'FINISH') {
      //編集終了の場合
      drawLine.current[undo.index].xy = latLonArrayToXYArray(undo.latlon, mapRegion, mapSize, mapViewRef);
      drawLine.current[undo.index].latlon = undo.latlon;
      drawLine.current[undo.index].properties = [...drawLine.current[undo.index].properties, 'EDIT'];
      isEditingObject.current = true;
      editingObjectIndex.current = undo.index;
    } else if (undo.action === 'EDIT_MULTI') {
      //複数選択の一括移動・回転を取り消す（latlonList[i]がi番目の地物の座標列）
      featuresTransformAngle.current = 0;
      featuresTransformBaseAngle.current = 0;
      undo.latlonList?.forEach((latlon, i) => {
        const line = drawLine.current[i];
        if (line === undefined) return;
        line.latlon = latlon;
        line.xy = latLonArrayToXYArray(latlon, mapRegion, mapSize, mapViewRef);
      });
    } else if (undo.action === 'EDIT') {
      //修正の場合
      drawLine.current[undo.index].xy = latLonArrayToXYArray(undo.latlon, mapRegion, mapSize, mapViewRef);
      drawLine.current[undo.index].latlon = undo.latlon;
      //drawLine.current[undo.index].properties = currentDrawTool === 'PLOT_POINT' ? ['POINT'] : ['EDIT'];
      if (isHandwritingTool(currentDrawTool)) {
        //手書きの修正はワンショットなので、undo後も修正モードには入れない
        isEditingObject.current = drawLine.current.length > 0;
        editingObjectIndex.current = -1;
      } else {
        isEditingObject.current = currentDrawTool === 'PLOT_POINT' ? false : true;
        editingObjectIndex.current = currentDrawTool === 'PLOT_POINT' ? -1 : undo.index;
      }
    }
    if (undoLine.current.length === 0) {
      //最後まで戻すと描画状態ごとリセットされるためredoは不可
      redoLine.current = [];
      resetDrawTools();
      setDrawTool('NONE');
    }
    setRedraw(ulid());
  }, [currentDrawTool, mapRegion, mapSize, mapViewRef, resetDrawTools]);

  /**
   * undoDrawで取り消した操作をやり直す。
   * SELECTのundoや最後まで戻した後（状態リセット）はredo履歴が無効になる
   */
  const redoDraw = useCallback(() => {
    const redo = redoLine.current[redoLine.current.length - 1];
    if (redo === undefined) return;
    redoLine.current = redoLine.current.slice(0, -1);

    //redo中のundoスタック積み直しはpushUndoを使わない（redo履歴を消さないため）
    if (redo.action === 'NEW') {
      if (redo.line !== undefined) {
        drawLine.current.push(redo.line);
        undoLine.current.push({ index: -1, latlon: [], action: 'NEW' });
        isEditingObject.current = true;
        editingObjectIndex.current = redo.objectIndex ?? -1;
      }
    } else if (redo.action === 'DELETE') {
      undoLine.current.push({ index: redo.index, latlon: drawLine.current[redo.index].latlon, action: 'DELETE' });
      drawLine.current[redo.index] = { ...drawLine.current[redo.index], xy: [], latlon: [] };
    } else if (redo.action === 'FINISH') {
      undoLine.current.push({ index: redo.index, latlon: drawLine.current[redo.index].latlon, action: 'FINISH' });
      drawLine.current[redo.index].xy = latLonArrayToXYArray(redo.latlon, mapRegion, mapSize, mapViewRef);
      drawLine.current[redo.index].latlon = redo.latlon;
      drawLine.current[redo.index].properties = drawLine.current[redo.index].properties.filter((p) => p !== 'EDIT');
      isEditingObject.current = false;
      editingObjectIndex.current = -1;
      editingLineXY.current = [];
    } else if (redo.action === 'EDIT_MULTI') {
      featuresTransformAngle.current = 0;
      featuresTransformBaseAngle.current = 0;
      undoLine.current.push({
        index: -1,
        latlon: [],
        latlonList: drawLine.current.map((line) => line.latlon),
        action: 'EDIT_MULTI',
      });
      redo.latlonList?.forEach((latlon, i) => {
        const line = drawLine.current[i];
        if (line === undefined) return;
        line.latlon = latlon;
        line.xy = latLonArrayToXYArray(latlon, mapRegion, mapSize, mapViewRef);
      });
    } else if (redo.action === 'EDIT') {
      undoLine.current.push({ index: redo.index, latlon: drawLine.current[redo.index].latlon, action: 'EDIT' });
      drawLine.current[redo.index].xy = latLonArrayToXYArray(redo.latlon, mapRegion, mapSize, mapViewRef);
      drawLine.current[redo.index].latlon = redo.latlon;
      if (isHandwritingTool(currentDrawTool)) {
        //手書きの修正はワンショットなので、redo後も修正モードには入れない
        isEditingObject.current = drawLine.current.length > 0;
        editingObjectIndex.current = -1;
      } else {
        isEditingObject.current = currentDrawTool === 'PLOT_POINT' ? false : true;
        editingObjectIndex.current = currentDrawTool === 'PLOT_POINT' ? -1 : redo.index;
      }
    }
    setRedraw(ulid());
  }, [currentDrawTool, mapRegion, mapSize, mapViewRef]);

  const toggleTerrain = useCallback(
    (activate?: boolean) => {
      if (Platform.OS !== 'web' || mapViewRef === null) return;

      const mapView = (mapViewRef as MapRef).getMap();
      let activateTerrain = activate;

      if (activate === undefined) {
        activateTerrain = !isTerrainActive;
        terrainPreferenceRef.current = activateTerrain;
      }

      if (activateTerrain === undefined) return;

      if (activateTerrain) {
        if (isTerrainActive) return;
        if (activate !== undefined && !terrainPreferenceRef.current) return;

        mapView.setTerrain({ source: 'rasterdem', exaggeration: TERRAIN_EXAGGERATION });
        setIsTerrainActive(true);
      } else {
        if (!isTerrainActive) return;

        // Terrain が有効のままだとピッチやベアリングが保持され、ライン変換の精度が落ちるためリセットする
        mapView.setTerrain(null);
        dispatch(editSettingsAction({ mapRegion: { ...mapRegion, pitch: 0, bearing: 0 } }));
        setIsTerrainActive(false);
      }
    },
    [dispatch, isTerrainActive, mapRegion, mapViewRef]
  );

  const getPXY = (event: GestureResponderEvent): Position => {
    offset.current = [
      event.nativeEvent.locationX - event.nativeEvent.pageX,
      event.nativeEvent.locationY - event.nativeEvent.pageY,
    ];
    return [event.nativeEvent.pageX + offset.current[0], event.nativeEvent.pageY + offset.current[1]];
  };

  const handleGrantSelect = useCallback(
    (pXY: Position) => {
      selectLine.current = [pXY];
    },
    [selectLine]
  );

  const handleMoveSelect = useCallback(
    (pXY: Position) => {
      selectLine.current = [...selectLine.current, pXY];
      setRedraw(ulid());
    },
    [selectLine]
  );

  //なげなわ範囲でフィーチャーを選択する。ポイントは複数選択（一括移動・回転モード）に対応。
  //ライン・ポリゴンは範囲内の最初の1件のみ選択する
  const trySelectFeaturesByArea = useCallback(() => {
    const { isOK, layer, recordSet } = getEditableLayerAndRecordSetWithCheck(featureButton);
    if (!isOK || layer === undefined || recordSet === undefined) return false;
    const selectLineCoords = xyArrayToLatLonArray(selectLine.current, mapRegion, mapSize, mapViewRef);
    //なげなわ選択は1件でも一括変形モード（移動・回転）にする。
    //ノード編集をしたい場合はタップ選択を使う。UNDOで選択解除できるようにSELECTを積む
    const enterTransformSelection = () => {
      pushUndo({ index: -1, latlon: [], action: 'SELECT' });
      isEditingObject.current = true;
      isAreaSelected.current = true;
    };
    if (featureButton === 'POINT') {
      const features = selectPointFeaturesByArea(recordSet as PointRecordType[], selectLineCoords);
      if (features.length === 0) return false;
      resetDrawTools();
      convertPointFeatureToDrawLine(layer.id, features);
      enterTransformSelection();
    } else if (featureButton === 'LINE' || featureButton === 'MEMO') {
      //マップメモのストロークはラインレコードなのでLINEと同じ流れで選択する
      const features = selectLineFeaturesByArea(recordSet as LineRecordType[], selectLineCoords);
      if (features.length === 0) return false;
      resetDrawTools();
      convertLineFeatureToDrawLine(layer.id, features);
      //プロット由来（頂点が少ない）ラインの単一選択はノード編集に入る（タップ選択と同じ）。
      //手書き由来（頂点が多い）はhandleReleaseSelectで手書きモードへ変換される
      if (
        featureButton === 'LINE' &&
        features.length === 1 &&
        drawLine.current[0].xy.length < HANDWRITING_SELECT_MIN_POINTS
      ) {
        changeToEditingObject(0, 'LINE');
      } else {
        enterTransformSelection();
      }
    } else {
      const features = selectPolygonFeaturesByArea(recordSet as PolygonRecordType[], selectLineCoords);
      if (features.length === 0) return false;
      resetDrawTools();
      convertPolygonFeatureToDrawLine(layer.id, features);
      //プロット由来のポリゴンも単一選択はノード編集に入る
      if (features.length === 1 && drawLine.current[0].xy.length < HANDWRITING_SELECT_MIN_POINTS) {
        changeToEditingObject(0, 'POLYGON');
      } else {
        enterTransformSelection();
      }
    }
    isSelectedDraw.current = true;
    return true;
  }, [
    changeToEditingObject,
    convertLineFeatureToDrawLine,
    convertPointFeatureToDrawLine,
    convertPolygonFeatureToDrawLine,
    featureButton,
    getEditableLayerAndRecordSetWithCheck,
    mapRegion,
    mapSize,
    mapViewRef,
    pushUndo,
    resetDrawTools,
    selectLine,
  ]);

  /**
   * 編集選択で選択済みのオブジェクトを手書きセッションのストロークに変換する。
   * EDIT装飾（頂点マーカー・青線）をやめて自身のスタイルで表示し、
   * 手書きと同じ操作（ポリゴンの長押し→なぞり修正、ストローク追加）で編集できるようにする
   */
  const convertSelectionToHandwriting = useCallback(
    (penStyle: HandwritingPenStyleType) => {
      drawLine.current.forEach((line) => {
        if (line.record === undefined) {
          //追加（プロット）で作成中の未保存オブジェクトも手書きストロークへ変換する
          //（EDIT装飾のままだと手書きモードで＋丸マーカーが表示されてしまう）。
          //既にstyleを持つ手書きストロークはそのまま
          if (line.style === undefined) {
            line.properties = ['HANDWRITING'];
            line.style = {
              strokeColor: penStyle.strokeColor,
              strokeWidth: penStyle.strokeWidth,
              strokeStyle: penStyle.arrowStyle,
              stamp: '',
              zoom: mapRegion.zoom,
            };
          }
          return;
        }
        const field = line.record.field;
        line.properties = ['HANDWRITING'];
        line.style = {
          strokeColor:
            typeof field._strokeColor === 'string' && field._strokeColor !== ''
              ? field._strokeColor
              : penStyle.strokeColor,
          strokeWidth: typeof field._strokeWidth === 'number' ? field._strokeWidth : penStyle.strokeWidth,
          strokeStyle: typeof field._strokeStyle === 'string' ? field._strokeStyle : 'NONE',
          stamp: typeof field._stamp === 'string' ? field._stamp : '',
          zoom: typeof field._zoom === 'number' ? field._zoom : mapRegion.zoom,
        };
      });
      editingObjectIndex.current = -1;
      if (drawLine.current.length > 0) isEditingObject.current = true;
      setRedraw(ulid());
    },
    [mapRegion.zoom]
  );

  /**
   * 手書きセッションのストロークをプロット編集へ変換する（手書き→追加の切り替え時）。
   * 最後のペンストロークを編集対象にしてノード編集できるようにする。
   * スタンプ・ブラシのストロークは対象外（手書き表示のまま）。手書きストロークが無ければ何もしない
   */
  const convertSessionToPlot = useCallback((featureType: FeatureButtonType) => {
    let lastPenIndex = -1;
    drawLine.current.forEach((line, index) => {
      if (!line.properties.includes('HANDWRITING')) return;
      if (line.style !== undefined && (line.style.stamp !== '' || isBrushTool(line.style.strokeStyle))) return;
      //ポリゴンは閉じた終点を外してノード編集できるようにする（保存時に再び閉じられる）
      if (featureType === 'POLYGON' && line.xy.length >= 2) {
        const first = line.xy[0];
        const last = line.xy[line.xy.length - 1];
        if (first[0] === last[0] && first[1] === last[1]) {
          line.xy = line.xy.slice(0, -1);
          line.latlon = line.latlon.slice(0, -1);
        }
      }
      line.properties = [];
      lastPenIndex = index;
    });
    if (lastPenIndex === -1) return;
    drawLine.current[lastPenIndex].properties = ['EDIT'];
    editingObjectIndex.current = lastPenIndex;
    isEditingObject.current = true;
    setRedraw(ulid());
  }, []);

  /**
   * 選択中のオブジェクトを手書きモードで編集するか。
   * 単一選択かつ頂点が多い（フリーハンド由来）場合のみ。複数選択は従来どおり移動・回転モードを維持する。
   * ※_strokeColorの有無は判定に使わない（個別スタイルのレイヤではプロットで描いたレコードも持つため）
   */
  const isHandwrittenSelection = useCallback(() => {
    const selected = drawLine.current.filter((line) => line.record !== undefined);
    return selected.length === 1 && selected[0].xy.length >= HANDWRITING_SELECT_MIN_POINTS;
  }, []);

  const handleReleaseSelect = useCallback(
    (pXY: Position) => {
      //なげなわ（ドラッグ）なら範囲選択、タップなら位置選択
      const isLasso = selectLine.current.length > 5;
      const isSelected = isLasso ? trySelectFeaturesByArea() : trySelectObjectAtPosition(pXY);
      selectLine.current = [];
      if (isSelected) {
        isEditingDraw.current = true;
        setRedraw(ulid());
        //手書き由来のオブジェクトは手書きモードで編集する（MEMOタブは手書きツールが無いため対象外）
        if (featureButton === 'POINT') {
          setDrawTool('PLOT_POINT');
        } else if (featureButton === 'LINE') {
          if (isHandwrittenSelection()) {
            convertSelectionToHandwriting(handwritingPenStyle.current);
            setLineTool('HANDWRITING_LINE');
            setDrawTool('HANDWRITING_LINE');
          } else {
            setDrawTool('PLOT_LINE');
          }
        } else if (featureButton === 'MEMO') {
          setDrawTool('PLOT_LINE');
        } else {
          if (isHandwrittenSelection()) {
            convertSelectionToHandwriting(handwritingPenStyle.current);
            setPolygonTool('HANDWRITING_POLYGON');
            setDrawTool('HANDWRITING_POLYGON');
          } else {
            setDrawTool('PLOT_POLYGON');
          }
        }
      } else {
        //なげなわの消去を反映
        setRedraw(ulid());
      }
    },
    [
      convertSelectionToHandwriting,
      featureButton,
      isHandwrittenSelection,
      selectLine,
      trySelectFeaturesByArea,
      trySelectObjectAtPosition,
    ]
  );

  const startFeaturesTransform = useCallback(
    (pXY: Position) => {
      const frame = getRotatedPointsTransformFrame(
        drawLine.current.flatMap((line) => line.xy),
        featuresTransformAngle.current
      );
      featuresTransformSnapshot.current = drawLine.current.map((line) => line.xy);
      featuresTransformCenter.current = frame.center;
      featuresTransformStartXY.current = pXY;
      //回転ハンドル付近から開始したら回転、それ以外はドラッグで平行移動
      const isOnHandle = Math.hypot(pXY[0] - frame.handle[0], pXY[1] - frame.handle[1]) <= POINTS_TRANSFORM_HANDLE_RADIUS_PX * 2;
      featuresTransformMode.current = isOnHandle ? 'ROTATE' : 'MOVE';
    },
    [drawLine]
  );

  const moveFeaturesTransform = useCallback(
    (pXY: Position) => {
      const start = featuresTransformStartXY.current;
      if (start === null || featuresTransformMode.current === 'NONE') return;
      const snapshot = featuresTransformSnapshot.current;
      if (featuresTransformMode.current === 'MOVE') {
        const dx = pXY[0] - start[0];
        const dy = pXY[1] - start[1];
        drawLine.current.forEach((line, i) => {
          line.xy = snapshot[i].map(([x, y]) => [x + dx, y + dy]);
        });
      } else {
        const [cx, cy] = featuresTransformCenter.current;
        const a0 = Math.atan2(start[1] - cy, start[0] - cx);
        const a1 = Math.atan2(pXY[1] - cy, pXY[0] - cx);
        //ボックスもオブジェクトと一緒に回転して見えるよう、累積角を更新する
        featuresTransformAngle.current = featuresTransformBaseAngle.current + (a1 - a0);
        const cos = Math.cos(a1 - a0);
        const sin = Math.sin(a1 - a0);
        drawLine.current.forEach((line, i) => {
          line.xy = snapshot[i].map(([x, y]) => {
            const vx = x - cx;
            const vy = y - cy;
            return [cx + vx * cos - vy * sin, cy + vx * sin + vy * cos];
          });
        });
      }
    },
    [drawLine]
  );

  //一括変形を確定する。全頂点が動くため、取り消し用に変形前のlatlonをEDIT_MULTIで積む
  const finishFeaturesTransform = useCallback(() => {
    const mode = featuresTransformMode.current;
    featuresTransformMode.current = 'NONE';
    featuresTransformStartXY.current = null;
    featuresTransformBaseAngle.current = featuresTransformAngle.current;
    if (mode === 'NONE') return;
    const snapshot = featuresTransformSnapshot.current;
    const moved = drawLine.current.some((line, i) =>
      line.xy.some((p, j) => p[0] !== snapshot[i]?.[j]?.[0] || p[1] !== snapshot[i]?.[j]?.[1])
    );
    if (!moved) return;
    pushUndo({
      index: -1,
      latlon: [],
      latlonList: drawLine.current.map((line) => line.latlon),
      action: 'EDIT_MULTI',
    });
    drawLine.current.forEach((line) => {
      line.latlon = xyArrayToLatLonArray(line.xy, mapRegion, mapSize, mapViewRef);
    });
  }, [drawLine, mapRegion, mapSize, mapViewRef, pushUndo]);

  const handleGrantPlot = useCallback(
    (pXY: Position) => {
      /*
        A.編集中でないなら、
          - 近いものが無い場合は、新規プロットの作成

        B.編集中なら
        　b.編集中のプロット（ノードもしくはライン）に近いか
          - 近ければ、ノードの修正もしくは途中にプロットを追加
          - 最初のノードをタッチするだけなら編集終了（ポリゴンは閉じる）
          - 近くなければ、最後尾にプロットを追加（ポイントの場合は位置を更新）
      */
      if (isAreaSelected.current) {
        //複数選択中はドラッグで一括移動・回転
        startFeaturesTransform(pXY);
        return;
      }
      //手書きセッションから切り替えた直後はisEditingObjectでも編集対象indexが無い（-1）。
      //その場合は既存ストロークに触らず新規プロットの作成を開始する
      if (!isEditingObject.current || editingObjectIndex.current === -1) {
        editStartNewPlotObject(pXY);
      } else {
        //プロット中なら、
        const isStartEditNode = tryStartEditNode(pXY);
        if (!isStartEditNode) {
          // ポイントの場合は新しいノードを作成せず、既存ポイントの位置を更新
          if (currentDrawTool === 'PLOT_POINT' || currentDrawTool === 'ADD_LOCATION_POINT') {
            const index = editingObjectIndex.current;
            drawLine.current[index].xy = [pXY];
            editingNodeIndex.current = 0;
            editingNodeState.current = 'MOVE';
          } else {
            createNewNode(pXY);
          }
        }
      }
    },
    [createNewNode, currentDrawTool, editStartNewPlotObject, isEditingObject, startFeaturesTransform, tryStartEditNode]
  );

  const handleMovePlot = useCallback(
    (pXY: Position) => {
      //編集中でなければなにもしない。
      if (!isEditingObject.current) return;
      if (isAreaSelected.current) {
        moveFeaturesTransform(pXY);
        setRedraw(ulid());
        return;
      }
      moveNode(pXY);
      setRedraw(ulid());
    },
    [moveFeaturesTransform, moveNode]
  );

  const handleReleasePlotPoint = useCallback(() => {
    if (isAreaSelected.current) {
      finishFeaturesTransform();
    } else {
      updateNodePosition();
    }
    isEditingDraw.current = true;
    setRedraw(ulid());
  }, [finishFeaturesTransform, updateNodePosition]);

  const handleReleasePlotLinePolygon = useCallback(() => {
    if (isAreaSelected.current) {
      //複数選択中は一括変形の確定のみ（ノード編集・確定判定はしない）
      finishFeaturesTransform();
      isEditingDraw.current = true;
      setRedraw(ulid());
      return false;
    }
    let finished = false;

    const isDeleted = tryDeleteLineNode();
    if (!isDeleted) {
      finished = tryFinishEditObject();
      if (!finished) updateNodePosition();
    }

    setRedraw(ulid());
    return finished;
  }, [finishFeaturesTransform, tryDeleteLineNode, tryFinishEditObject, updateNodePosition]);

  /**
   * ピンチ開始時にGrantで加えられたプロット操作を取り消す。
   * 2本指タッチの1本目でノードが追加・移動されたまま残るのを防ぐ。
   * Grantで作成した新規オブジェクトは丸ごと取り消し、編集中はlatlonを正としてxyを復元する。
   */
  const cancelPlotGrant = useCallback(() => {
    if (!isPlotTool(currentDrawTool)) return;
    if (!isEditingObject.current) return;
    if (isAreaSelected.current) {
      //一括変形のドラッグ中にピンチへ移行した場合、latlonを正としてxyを戻す
      featuresTransformMode.current = 'NONE';
      featuresTransformStartXY.current = null;
      drawLine.current.forEach((line) => {
        line.xy = latLonArrayToXYArray(line.latlon, mapRegion, mapSize, mapViewRef);
      });
      setRedraw(ulid());
      return;
    }
    const index = editingObjectIndex.current;
    if (index < 0 || index >= drawLine.current.length) return;
    const line = drawLine.current[index];
    if (line.latlon.length === 0) {
      //Grantで作成した直後の新規オブジェクトを取り消す（undoのNEWも取り除く）
      drawLine.current = drawLine.current.filter((_, i) => i !== index);
      const lastUndo = undoLine.current[undoLine.current.length - 1];
      if (lastUndo !== undefined && lastUndo.action === 'NEW') undoLine.current.pop();
      isEditingObject.current = false;
      editingObjectIndex.current = -1;
      editingLineXY.current = [];
    } else {
      line.xy = latLonArrayToXYArray(line.latlon, mapRegion, mapSize, mapViewRef);
    }
    setRedraw(ulid());
  }, [currentDrawTool, drawLine, editingLineXY, editingObjectIndex, isEditingObject, mapRegion, mapSize, mapViewRef, undoLine]);

  /*************** 手書きペン（HANDWRITING_LINE/HANDWRITING_POLYGON） ***************
   * マップメモと同じ描き味でストロークを描きため、確定ボタンで一括保存するセッション方式。
   * ペンはフリーハンドの描画関数を再利用し、スタンプ・ブラシ（LINEタブのみ）はスナップ先へ_groupで紐づく
   */

  /**
   * 手書きの編集選択から分割ツールへ切り替える準備。
   * 選択オブジェクトを分割対象（editingObjectIndex）にし、EDIT表示（頂点マーカー）へ戻す
   */
  const switchSelectionToSplit = useCallback(() => {
    const index = drawLine.current.findIndex((line) => line.record !== undefined);
    if (index === -1) return false;
    editingObjectIndex.current = index;
    drawLine.current[index].properties = ['EDIT'];
    isEditingObject.current = true;
    setRedraw(ulid());
    return true;
  }, []);

  /**
   * 編集選択中のスタイル変更を画面上の選択オブジェクト（手書き変換済みストローク）へ即時反映する。
   * レコード自体は書き換えないため、キャンセルすれば元のスタイルに戻る。
   * 確定時の書き込みはsaveLine/savePolygonのapplyStyleToSelectedが担う
   */
  const applySelectionStylePreview = useCallback(
    (style: { strokeColor?: string; strokeWidth?: number; strokeStyle?: string }) => {
      let changed = false;
      drawLine.current.forEach((line) => {
        if (line.record === undefined || line.style === undefined) return;
        const isPenStroke = line.style.stamp === '' && !isBrushTool(line.style.strokeStyle);
        if (style.strokeColor !== undefined) {
          line.style.strokeColor = style.strokeColor;
          changed = true;
        }
        if (style.strokeWidth !== undefined && isPenStroke) {
          line.style.strokeWidth = style.strokeWidth;
          changed = true;
        }
        if (style.strokeStyle !== undefined && isPenStroke) {
          line.style.strokeStyle = style.strokeStyle;
          changed = true;
        }
      });
      if (changed) setRedraw(ulid());
    },
    []
  );

  const findHandwritingSnapTarget = useCallback(
    (pXY: Position) => {
      //セッション内の未保存ペンストロークを優先してスナップする（後に描いたものを優先）
      for (let i = drawLine.current.length - 1; i >= 0; i--) {
        const line = drawLine.current[i];
        if (line.style === undefined || line.style.stamp !== '' || isBrushTool(line.style.strokeStyle)) continue;
        if (line.xy.length < 2) continue;
        if (checkDistanceFromLine(pXY, line.xy).isNear) return { coordsXY: line.xy, targetId: line.id };
      }
      //保存済みのライン（アクティブレイヤの自分のレコード）にもスナップできる
      const { isOK, recordSet } = getEditableLayerAndRecordSetWithCheck('LINE');
      if (isOK && recordSet !== undefined) {
        for (const record of recordSet) {
          if (record.visible === false || record.coords === undefined || !Array.isArray(record.coords)) continue;
          if (record.field._stamp !== undefined && record.field._stamp !== '') continue;
          if (isBrushTool(String(record.field._strokeStyle ?? ''))) continue;
          const lineXY = latLonObjectsToXYArray(record.coords, mapRegion, mapSize, mapViewRef);
          if (checkDistanceFromLine(pXY, lineXY).isNear) return { coordsXY: lineXY, targetId: record.id };
        }
      }
      return undefined;
    },
    [getEditableLayerAndRecordSetWithCheck, mapRegion, mapSize, mapViewRef]
  );

  const clearHandwritingLongPress = useCallback(() => {
    if (handwritingLongPressTimer.current) {
      clearTimeout(handwritingLongPressTimer.current);
      handwritingLongPressTimer.current = null;
    }
    handwritingLongPressStartXY.current = null;
  }, []);

  /**
   * 長押しで押下点付近のセッション内ペンストロークを修正モードにする（LINE/POLYGON共通）。
   * 以降のなぞりはeditingLineXYに積まれ、releaseでeditFreehandObjectにより合成される。
   * スタンプ・ブラシは対象外
   */
  const startHandwritingModify = useCallback((pXY: Position) => {
    //押下点付近のセッションストロークを探す（末尾=描きかけの新規ストロークは除外）
    let targetIndex = -1;
    for (let i = drawLine.current.length - 2; i >= 0; i--) {
      const line = drawLine.current[i];
      if (line.style === undefined || line.style.stamp !== '' || isBrushTool(line.style.strokeStyle)) continue;
      if (line.xy.length < 2) continue;
      if (checkDistanceFromLine(pXY, line.xy).isNear) {
        targetIndex = i;
        break;
      }
    }
    //近くに無ければ何もしない（通常の描画を継続する）
    if (targetIndex === -1) return;
    //描きかけの新規ストロークを破棄（undoのNEWも取り除く）してから修正モードへ
    if (activeHandwritingStroke.current && drawLine.current.length > targetIndex + 1) {
      drawLine.current = drawLine.current.slice(0, -1);
      const lastUndo = undoLine.current[undoLine.current.length - 1];
      if (lastUndo !== undefined && lastUndo.action === 'NEW') undoLine.current.pop();
    }
    activeHandwritingStroke.current = false;
    editingObjectIndex.current = targetIndex;
    //修正対象が確定したことがひと目で分かるよう、対象をハイライト表示にする
    drawLine.current[targetIndex].properties = ['HANDWRITING', 'MODIFYING'];
    isEditingObject.current = true;
    strokeFilter.current.reset();
    editingLineXY.current = [pXY];
    setRedraw(ulid());
  }, []);

  const handleGrantHandwriting = useCallback(
    (pXY: Position, penStyle: HandwritingPenStyleType) => {
      handwritingPenStyle.current = penStyle;
      activeHandwritingStroke.current = false;
      const subTool = featureButton === 'POLYGON' ? 'PEN' : handwritingSubTool;
      if (subTool === 'PEN') {
        strokeFilter.current.reset();
        lastTouchXY.current = pXY;
        editStartNewFreehandObject(pXY);
        //手書きストロークにはEDIT装飾（青線・頂点マーカー）を付けない。
        //styleは描き始めから設定し、プレビューも渡されたスタイルで描く（releaseで最終値に更新される）
        const newStroke = drawLine.current[drawLine.current.length - 1];
        newStroke.properties = ['HANDWRITING'];
        newStroke.style = {
          strokeColor: penStyle.strokeColor,
          strokeWidth: penStyle.strokeWidth,
          strokeStyle: featureButton === 'LINE' ? penStyle.arrowStyle : 'NONE',
          stamp: '',
          zoom: mapRegion.zoom,
        };
        activeHandwritingStroke.current = true;
        //長押しでセッション内ストロークの修正（なぞり直し）モードに入る（LINE/POLYGON共通。ペンのみ）
        if (drawLine.current.length > 1) {
          handwritingLongPressStartXY.current = pXY;
          handwritingLongPressTimer.current = setTimeout(() => {
            handwritingLongPressTimer.current = null;
            startHandwritingModify(pXY);
          }, HANDWRITING_LONG_PRESS_MS);
        }
      } else if (isStampTool(subTool)) {
        const target = findHandwritingSnapTarget(pXY);
        let point = pXY;
        let groupId: string | undefined;
        if (target !== undefined && penStyle.snapWithLine) {
          point = getSnappedPositionWithLine(pXY, target.coordsXY, { isXY: true }).position;
          groupId = target.targetId;
          handwritingSnapTarget.current = target;
        } else {
          handwritingSnapTarget.current = undefined;
        }
        drawLine.current.push({
          id: ulid(),
          layerId: undefined,
          record: undefined,
          xy: [point],
          latlon: [xyToLatLon(point, mapRegion, mapSize, mapViewRef)],
          properties: ['HANDWRITING'],
          style: {
            strokeColor: penStyle.strokeColor,
            strokeWidth: penStyle.strokeWidth,
            strokeStyle: '',
            stamp: subTool,
            zoom: mapRegion.zoom,
            groupId,
          },
        });
        pushUndo({ index: -1, latlon: [], action: 'NEW' });
        isEditingObject.current = true;
        activeHandwritingStroke.current = true;
      } else if (isBrushTool(subTool)) {
        //ブラシは線に沿って描く記号なのでスナップ必須
        const target = findHandwritingSnapTarget(pXY);
        if (target === undefined) {
          handwritingSnapTarget.current = undefined;
          return;
        }
        handwritingSnapTarget.current = target;
        handwritingBrushStartXY.current = getSnappedPositionWithLine(pXY, target.coordsXY, { isXY: true }).position;
        drawLine.current.push({
          id: ulid(),
          layerId: undefined,
          record: undefined,
          xy: [],
          latlon: [],
          properties: ['HANDWRITING'],
          style: {
            strokeColor: penStyle.strokeColor,
            strokeWidth: penStyle.strokeWidth,
            strokeStyle: subTool,
            stamp: '',
            zoom: mapRegion.zoom,
            groupId: target.targetId,
          },
        });
        pushUndo({ index: -1, latlon: [], action: 'NEW' });
        isEditingObject.current = true;
        activeHandwritingStroke.current = true;
      }
      setRedraw(ulid());
    },
    [
      featureButton,
      handwritingSubTool,
      findHandwritingSnapTarget,
      editStartNewFreehandObject,
      startHandwritingModify,
      pushUndo,
      mapRegion,
      mapSize,
      mapViewRef,
    ]
  );

  const handleMoveHandwriting = useCallback(
    (pXY: Position, timestampMs: number) => {
      //長押し判定中に閾値を超えて動いたら長押しをキャンセル
      if (handwritingLongPressTimer.current !== null && handwritingLongPressStartXY.current !== null) {
        const start = handwritingLongPressStartXY.current;
        if (Math.hypot(pXY[0] - start[0], pXY[1] - start[1]) > HANDWRITING_LONG_PRESS_MOVE_PX) {
          clearHandwritingLongPress();
        }
      }
      //修正モード（長押しで開始）はなぞりストロークを積む
      if (editingObjectIndex.current !== -1) {
        lastTouchXY.current = pXY;
        drawFreehandEditingLine(pXY, timestampMs);
        setRedraw(ulid());
        return;
      }
      if (!activeHandwritingStroke.current) return;
      const subTool = featureButton === 'POLYGON' ? 'PEN' : handwritingSubTool;
      const index = drawLine.current.length - 1;
      if (index < 0) return;
      if (subTool === 'PEN') {
        lastTouchXY.current = pXY;
        if (handwritingPenStyle.current.isStraightStyle && featureButton === 'LINE') {
          //直線スタイルは始点と現在位置の2点に置き換える
          const line = drawLine.current[index];
          line.xy = [line.xy[0], pXY];
          line.latlon = [line.latlon[0], xyToLatLon(pXY, mapRegion, mapSize, mapViewRef)];
        } else {
          drawFreehandNewLine(pXY, timestampMs);
        }
      } else if (isStampTool(subTool)) {
        let point = pXY;
        const target = handwritingSnapTarget.current;
        if (target !== undefined && handwritingPenStyle.current.snapWithLine) {
          point = getSnappedPositionWithLine(pXY, target.coordsXY, { isXY: true }).position;
        }
        drawLine.current[index].xy = [point];
        drawLine.current[index].latlon = [xyToLatLon(point, mapRegion, mapSize, mapViewRef)];
      } else if (isBrushTool(subTool)) {
        const target = handwritingSnapTarget.current;
        if (target === undefined) return;
        const end = getSnappedPositionWithLine(pXY, target.coordsXY, { isXY: true }).position;
        drawLine.current[index].xy = getSnappedLine(handwritingBrushStartXY.current, end, target.coordsXY);
      }
      setRedraw(ulid());
    },
    [featureButton, handwritingSubTool, clearHandwritingLongPress, drawFreehandEditingLine, drawFreehandNewLine, mapRegion, mapSize, mapViewRef]
  );

  /**
   * タッチ中の手書きストロークを確定してセッションに積む。
   * withCatchUp=trueなら1€フィルタの遅延を最後の生タッチ位置で補正する
   */
  const finalizeHandwritingStroke = useCallback(
    (withCatchUp: boolean) => {
      if (!activeHandwritingStroke.current) return;
      activeHandwritingStroke.current = false;
      const subTool = featureButton === 'POLYGON' ? 'PEN' : handwritingSubTool;
      const index = drawLine.current.length - 1;
      if (index < 0) return;
      const line = drawLine.current[index];
      const discardStroke = () => {
        drawLine.current.pop();
        const lastUndo = undoLine.current[undoLine.current.length - 1];
        if (lastUndo !== undefined && lastUndo.action === 'NEW') undoLine.current.pop();
        isEditingObject.current = drawLine.current.length > 0;
      };
      if (subTool === 'PEN') {
        const penStyle = handwritingPenStyle.current;
        const finalXY = withCatchUp ? lastTouchXY.current : null;
        if (finalXY !== null) {
          const last = line.xy[line.xy.length - 1];
          if (last === undefined || finalXY[0] !== last[0] || finalXY[1] !== last[1]) {
            line.xy = [...line.xy, finalXY];
            line.latlon = [...line.latlon, xyToLatLon(finalXY, mapRegion, mapSize, mapViewRef)];
          }
        }
        if (line.xy.length === 1) {
          //タップは極小の線として保存する（マップメモのペンと同じ扱い）
          const dot: Position = [line.xy[0][0] + 0.5, line.xy[0][1] + 0.5];
          line.xy = [...line.xy, dot];
          line.latlon = [...line.latlon, xyToLatLon(dot, mapRegion, mapSize, mapViewRef)];
        }
        //矢印スタイルは向きが綺麗になるよう整形する（マップメモのペンと同じ）
        if (
          featureButton === 'LINE' &&
          penStyle.arrowStyle !== 'NONE' &&
          !penStyle.isStraightStyle &&
          line.xy.length >= MIN_POINTS_FOR_REFINE
        ) {
          try {
            const refined = refineArrowStroke(line.xy, PEN_SIMPLIFY_TOLERANCE_PX);
            line.xy = refined;
            line.latlon = xyArrayToLatLonArray(refined, mapRegion, mapSize, mapViewRef);
          } catch (e) {
            //整形に失敗した場合は生のストロークをそのまま確定する
            console.log('refine handwriting stroke error', e);
          }
        }
        line.style = {
          strokeColor: penStyle.strokeColor,
          strokeWidth: penStyle.strokeWidth,
          strokeStyle: featureButton === 'LINE' ? penStyle.arrowStyle : 'NONE',
          stamp: '',
          zoom: mapRegion.zoom,
        };
      } else if (isBrushTool(subTool)) {
        if (line.xy.length < 2) {
          //線をなぞれていないブラシは破棄する
          discardStroke();
          return;
        }
        line.latlon = xyArrayToLatLonArray(line.xy, mapRegion, mapSize, mapViewRef);
      }
      //スタンプは1点で座標・スタイルともGrant/Moveで確定済み
      if (drawLine.current.length > 0) isEditingDraw.current = true;
    },
    [featureButton, handwritingSubTool, mapRegion, mapSize, mapViewRef]
  );

  const handleReleaseHandwriting = useCallback(() => {
    clearHandwritingLongPress();
    if (editingObjectIndex.current !== -1) {
      //長押し→なぞり修正を合成して確定する（ワンショット。styleは保持される）
      const index = editingObjectIndex.current;
      editFreehandObject();
      //editFreehandObjectはオブジェクトを差し替えるため、合成後にハイライトを解除する
      if (drawLine.current[index] !== undefined) drawLine.current[index].properties = ['HANDWRITING'];
      editingObjectIndex.current = -1;
      editingLineXY.current = [];
      setRedraw(ulid());
      return;
    }
    finalizeHandwritingStroke(true);
    setRedraw(ulid());
  }, [clearHandwritingLongPress, editFreehandObject, finalizeHandwritingStroke]);

  /**
   * ピンチ開始がタッチ直後の場合に、手書きの描きかけストロークを破棄する
   */
  const cancelHandwritingStroke = useCallback(() => {
    clearHandwritingLongPress();
    if (editingObjectIndex.current !== -1) {
      //修正のなぞりかけは破棄して通常モードへ戻る（ハイライトも解除）
      const target = drawLine.current[editingObjectIndex.current];
      if (target !== undefined) target.properties = ['HANDWRITING'];
      editingLineXY.current = [];
      editingObjectIndex.current = -1;
      setRedraw(ulid());
      return;
    }
    if (!activeHandwritingStroke.current) return;
    activeHandwritingStroke.current = false;
    if (drawLine.current.length === 0) return;
    drawLine.current = drawLine.current.slice(0, -1);
    const lastUndo = undoLine.current[undoLine.current.length - 1];
    if (lastUndo !== undefined && lastUndo.action === 'NEW') undoLine.current.pop();
    isEditingObject.current = drawLine.current.length > 0;
    setRedraw(ulid());
  }, [clearHandwritingLongPress]);

  /**
   * ピンチ開始時に手書きの描きかけストロークをその場で確定する（実質描かれていなければ破棄）
   */
  const commitHandwritingStroke = useCallback(() => {
    clearHandwritingLongPress();
    if (editingObjectIndex.current !== -1) {
      //修正のなぞりかけは破棄して通常モードへ戻る（ピンチ操作を優先する。ハイライトも解除）
      const target = drawLine.current[editingObjectIndex.current];
      if (target !== undefined) target.properties = ['HANDWRITING'];
      editingLineXY.current = [];
      editingObjectIndex.current = -1;
      setRedraw(ulid());
      return;
    }
    if (!activeHandwritingStroke.current) return;
    const subTool = featureButton === 'POLYGON' ? 'PEN' : handwritingSubTool;
    if (subTool === 'PEN') {
      const index = drawLine.current.length - 1;
      if (index < 0) return;
      const xy = drawLine.current[index].xy;
      //Grant以降の累計移動距離。極小なら描画意図なし（2本指タッチの1本目）とみなす
      let pathLength = 0;
      for (let i = 1; i < xy.length; i++) {
        pathLength += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
      }
      if (xy.length >= 2 && pathLength >= PINCH_DISCARD_DISTANCE_PX) {
        finalizeHandwritingStroke(false);
        setRedraw(ulid());
      } else {
        cancelHandwritingStroke();
      }
    } else {
      //スタンプ・ブラシの途中は破棄する
      cancelHandwritingStroke();
    }
  }, [featureButton, handwritingSubTool, cancelHandwritingStroke, clearHandwritingLongPress, finalizeHandwritingStroke]);

  const checkSplitLine = useCallback((pXY: Position) => {
    const index = editingObjectIndex.current;
    if (index === -1) return false;
    const lineXY = drawLine.current[index].xy;
    const { isNear } = checkDistanceFromLine(pXY, lineXY);
    if (!isNear) return false;

    return true;
  }, []);

  const handleGrantSplitLine = useCallback(
    (pXY: Position) => {
      const index = editingObjectIndex.current;
      if (index === -1) return;

      const lineXY = drawLine.current[index].xy;

      let nodeIndex = findNearNodeIndex(pXY, lineXY);
      if (nodeIndex === -1) {
        const { index: idx } = getSnappedPositionWithLine(pXY, lineXY, {
          isXY: true,
        });
        lineXY.splice(idx + 1, 0, pXY);
        //挿入した補間ノード1点のみ変換してlatlonにも挿入（既存頂点の座標は保持）
        const newLatLon = [...drawLine.current[index].latlon];
        newLatLon.splice(idx + 1, 0, xyToLatLon(pXY, mapRegion, mapSize, mapViewRef));
        drawLine.current[index].latlon = newLatLon;
        nodeIndex = idx + 1;
      }

      const record = drawLine.current[index].record;
      const layerId = drawLine.current[index].layerId;

      // 前半・後半のxyとlatlonを分割（latlonは既存値を保持したままsliceする）
      const frontXY = lineXY.slice(0, nodeIndex + 1);
      const frontLatlon = drawLine.current[index].latlon.slice(0, nodeIndex + 1);
      const backXY = lineXY.slice(nodeIndex);
      const backLatlon = drawLine.current[index].latlon.slice(nodeIndex);

      const newLine = {
        ...drawLine.current[index],
        id: ulid(),
        xy: frontXY,
        latlon: frontLatlon,
        layerId: layerId,
        record: record ? { ...record, id: ulid() } : undefined,
      };
      drawLine.current.push(newLine);

      // 元のラインを後半部分に更新
      drawLine.current[index].xy = backXY;
      drawLine.current[index].latlon = backLatlon;

      //保存する
      saveLine();
    },
    [mapRegion, mapSize, mapViewRef, saveLine]
  );

  const setCurrentInfoTool = useCallback(
    (tool: InfoToolType) => {
      dispatch(editSettingsAction({ currentInfoTool: tool }));
    },
    [dispatch]
  );

  useEffect(() => {
    //ライン編集中にサイズ変更。移動中は更新しない。
    if (drawLine.current.length > 0 && refreshDrawLine.current) {
      drawLine.current = drawLine.current.map((line) => {
        return { ...line, xy: latLonArrayToXYArray(line.latlon, mapRegion, mapSize, mapViewRef) };
      });
      setDrawLineVisible(true);
      // Web(maplibre)は地図移動中もisDrawLineVisibleがtrueのままで、setDrawLineVisible(true)が
      // no-opになり再描画が起きない。再計算したxyを反映するため明示的に再描画を促す。
      // （モバイルはhide/showのトグルで再マウントされるため不要）
      if (Platform.OS === 'web') setRedraw(ulid());
      // 座標再計算後はフラグをリセット
      refreshDrawLine.current = false;
    }
  }, [isDrawLineVisible, mapRegion, mapSize, mapViewRef]);

  return {
    isEditingDraw: isEditingDraw.current,
    isAreaSelected: isAreaSelected.current,
    isUndoable: undoLine.current.length > 0,
    isRedoable: redoLine.current.length > 0,
    isEditingObject: isEditingObject.current,
    isSelectedDraw: isSelectedDraw.current,
    currentDrawTool,
    currentPointTool,
    currentLineTool,
    currentPolygonTool,
    drawLine,
    editingLineXY,
    selectLine,
    featureButton,
    isDrawLineVisible,
    visibleInfoPicker,
    currentInfoTool,
    isPencilTouch,
    isPinch,
    isTerrainActive,
    isInfoToolActive,
    deleteDraw,
    undoDraw,
    redoDraw,
    finishEditObject,
    savePoint,
    saveLine,
    savePolygon,
    setDrawTool,
    setPointTool,
    setLineTool,
    setPolygonTool,
    setFeatureButton,
    selectSingleFeature,
    resetDrawTools,
    hideDrawLine,
    showDrawLine,
    toggleTerrain,
    setVisibleInfoPicker,
    setCurrentInfoTool,
    convertPointFeatureToDrawLine,
    setIsPinch,
    getPXY,
    handleGrantPlot,
    handleMovePlot,
    handleGrantSelect,
    handleMoveSelect,
    handleReleaseSelect,
    handleReleasePlotPoint,
    handleReleasePlotLinePolygon,
    featuresTransformAngle,
    handwritingSubTool,
    setHandwritingSubTool,
    handleGrantHandwriting,
    convertSelectionToHandwriting,
    switchSelectionToSplit,
    convertSessionToPlot,
    applySelectionStylePreview,
    handleMoveHandwriting,
    handleReleaseHandwriting,
    commitHandwritingStroke,
    cancelHandwritingStroke,
    cancelPlotGrant,
    handleGrantSplitLine,
    selectObjectByFeature,
    checkSplitLine,
    setInfoToolActive,
  } as const;
};
