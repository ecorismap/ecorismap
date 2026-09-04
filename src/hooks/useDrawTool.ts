import { TERRAIN_EXAGGERATION } from '../constants/DemSources';
import { Dispatch, RefObject, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, Platform } from 'react-native';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import MapView from 'react-native-maps';
import { ulid } from 'ulid';
import { t } from '../i18n/config';
import {
  DrawLineType,
  DrawToolType,
  FeatureButtonType,
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
  isClosedPolygon,
  isNearWithPlot,
  modifyLineWithSource,
  smoothJunctions,
  closeFreehandPolygonSeam,
} from '../utils/Coords';
import { useWindow } from './useWindow';
import { deleteRecordsAction } from '../modules/dataSet';
import { MapRef } from 'react-map-gl/maplibre';
import { editSettingsAction } from '../modules/settings';
import { useRecord } from './useRecord';
import { isFreehandTool, isPlotTool, isPointTool } from '../utils/General';
import { PositionFilter } from '../utils/OneEuroFilter';
import { Position } from 'geojson';
import { RootState } from '../store';

export type UseDrawToolReturnType = {
  isEditingDraw: boolean;
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
  saveLine: () => {
    isOK: boolean;
    message: string;
    layer: LayerType | undefined;
    recordSet: RecordType[] | undefined;
  };
  savePolygon: () => {
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
  handleReleaseDeletePoint: (pXY: Position) => void;
  handleGrantPlot: (pXY: Position) => void;
  handleGrantFreehand: (pXY: Position) => boolean;
  handleMovePlot: (pXY: Position) => void;
  handleMoveFreehand: (pXY: Position, timestampMs: number) => void;
  handleReleaseSelect: (pXY: Position) => void;
  handleReleaseFreehand: () => void;
  commitFreehandStroke: () => void;
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

  const offset = useRef([0, 0]);

  const { mapSize, mapRegion } = useWindow();

  type EditingNodeStateType = 'NONE' | 'NEW' | 'MOVE';
  const editingNodeIndex = useRef(-1);
  const editingNodeState = useRef<EditingNodeStateType>('NONE');

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
    drawLine.current = [];
    editingLineXY.current = [];
    isEditingDraw.current = false;
    isSelectedDraw.current = false;
    editingObjectIndex.current = -1;
    selectLine.current = [];
    undoLine.current = [];
    isEditingObject.current = false;
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
  const tryDeleteObjectAtPosition = useCallback(
    (pXY: Position) => {
      convertFeatureToDrawLine(pXY);
      //始点のノードに近ければ配列を空にして見えなくする。保存時に配列が空のものを除く。
      if (currentDrawTool === 'PLOT_POINT') return false;
      const deleteIndex = drawLine.current.findIndex((line) => {
        return line.xy.length > 0 && isNearWithPlot(pXY, line.xy[0]);
      });
      if (deleteIndex !== -1) {
        pushUndo({
          index: deleteIndex,
          latlon: drawLine.current[deleteIndex].latlon,
          action: 'DELETE',
        });
        drawLine.current[deleteIndex] = {
          ...drawLine.current[deleteIndex],
          xy: [],
          latlon: [],
          //properties: [],
        };
        return true;
      }
      return false;
    },
    [convertFeatureToDrawLine, currentDrawTool, pushUndo]
  );

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
    if ((currentDrawTool === 'PLOT_LINE' || currentDrawTool === 'FREEHAND_LINE') && lineXY.length < 2) return false;
    if ((currentDrawTool === 'PLOT_POLYGON' || currentDrawTool === 'FREEHAND_POLYGON') && lineXY.length < 3) return false;

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

  const tryFinishFreehandEditObject = useCallback(
    (pXY: Position) => {
      // フリーハンドの場合は始点タップで確定しない（確定ボタンを使う）
      if (currentDrawTool === 'FREEHAND_LINE' || currentDrawTool === 'FREEHAND_POLYGON') return false;
      const index = editingObjectIndex.current;
      if (index === -1) return false;
      const lineXY = drawLine.current[index].xy;
      if (currentDrawTool === 'PLOT_POLYGON' && lineXY.length < 3) return false;
      const isNearWithFirstNode = isNearWithPlot(pXY, lineXY[0]);
      if (!isNearWithFirstNode) return false;

      pushUndo({
        index: index,
        latlon: drawLine.current[index].latlon,
        action: 'FINISH',
      });
      //最初のノードをタッチで編集終了
      if (currentDrawTool === 'PLOT_POLYGON') {
        //ポリゴンは閉じてなかったら閉じる
        if (!isClosedPolygon(lineXY)) {
          lineXY.push(lineXY[0]);
          drawLine.current[index].latlon = [...drawLine.current[index].latlon, drawLine.current[index].latlon[0]];
        }
      }
      if (drawLine.current[index].latlon.length !== lineXY.length) {
        if (__DEV__) console.warn('tryFinishFreehandEditObject: xy/latlon length mismatch, regenerating');
        drawLine.current[index].latlon = xyArrayToLatLonArray(lineXY, mapRegion, mapSize, mapViewRef);
      }
      drawLine.current[index].properties = drawLine.current[index].properties.filter((p) => p !== 'EDIT');
      editingObjectIndex.current = -1;
      isEditingObject.current = false;
      editingLineXY.current = [];

      return true;
    },
    [
      editingObjectIndex,
      drawLine,
      currentDrawTool,
      pushUndo,
      mapRegion,
      mapSize,
      mapViewRef,
      isEditingObject,
      editingLineXY,
    ]
  );

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

  const createNewFreehandObject = useCallback(() => {
    const index = drawLine.current.length - 1;
    //1€フィルタの遅延で終点が実際のタッチ位置より手前になるため、最後の生タッチ位置で終点を確定する
    const finalXY = lastTouchXY.current;
    if (finalXY !== null) {
      const xy = drawLine.current[index].xy;
      const last = xy[xy.length - 1];
      if (last === undefined || finalXY[0] !== last[0] || finalXY[1] !== last[1]) {
        drawLine.current[index].xy = [...xy, finalXY];
        drawLine.current[index].latlon = [
          ...drawLine.current[index].latlon,
          xyToLatLon(finalXY, mapRegion, mapSize, mapViewRef),
        ];
      }
    }
    if (drawLine.current[index].xy.length < 2) return;
    //描いた形をそのまま保持する（手ぶれ除去は描画中の1€フィルタが担い、離した瞬間に形を変えない）
    drawLine.current[index].properties = ['EDIT'];
    editingObjectIndex.current = index;
  }, [drawLine, editingObjectIndex, mapRegion, mapSize, mapViewRef]);

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

  const saveLine = useCallback(() => {
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

    for (const line of drawLine.current) {
      if (line.record !== undefined && line.layerId !== undefined) {
        const coords = latlonArrayToLatLonObjects(line.latlon);
        const centroid = calcLineMidPoint(coords);
        const updatedRecord: RecordType = { ...line.record, coords, centroid };
        const recordLayer = findLayer(line.layerId);
        if (recordLayer === undefined) continue;
        //recordが存在する場合は更新。存在しない場合は新規追加。splitLineに対応するため
        const targetRecord = findRecord(recordLayer.id, line.record.userId, line.record.id, 'LINE');
        if (targetRecord !== undefined) {
          updateRecord(recordLayer, updatedRecord);
        } else {
          addRecord(recordLayer, updatedRecord);
        }
        savedRecordSet.push(updatedRecord);
      } else {
        const record = generateRecord('LINE', layer, recordSet, latlonArrayToLatLonObjects(line.latlon));
        addRecord(layer, record);
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

  const savePolygon = useCallback(() => {
    //削除したものを取り除く
    drawLine.current = drawLine.current.filter((line) => line.xy.length !== 0);

    // ポリゴンを閉じる（始点と終点が異なる場合）
    drawLine.current.forEach((line) => {
      const lineXY = line.xy;
      if (lineXY.length >= 3 && (lineXY[0][0] !== lineXY[lineXY.length - 1][0] || lineXY[0][1] !== lineXY[lineXY.length - 1][1])) {
        if (currentDrawTool === 'FREEHAND_POLYGON' && line.latlon.length === lineXY.length) {
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
        updateRecord(recordLayer, updatedRecord);
        savedRecordSet.push(updatedRecord);
      } else {
        const record = generateRecord('POLYGON', layer, recordSet, latlonArrayToLatLonObjects(line.latlon));
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
    } else if (undo.action !== 'SELECT') {
      redoLine.current = [
        ...redoLine.current,
        { index: undo.index, latlon: drawLine.current[undo.index].latlon, action: undo.action },
      ];
    }

    if (undo.action === 'NEW') {
      //追加の場合
      drawLine.current.pop();
      isEditingObject.current = false;
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
    } else if (undo.action === 'EDIT') {
      //修正の場合
      drawLine.current[undo.index].xy = latLonArrayToXYArray(undo.latlon, mapRegion, mapSize, mapViewRef);
      drawLine.current[undo.index].latlon = undo.latlon;
      //drawLine.current[undo.index].properties = currentDrawTool === 'PLOT_POINT' ? ['POINT'] : ['EDIT'];
      isEditingObject.current = currentDrawTool === 'PLOT_POINT' ? false : true;
      editingObjectIndex.current = currentDrawTool === 'PLOT_POINT' ? -1 : undo.index;
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
    } else if (redo.action === 'EDIT') {
      undoLine.current.push({ index: redo.index, latlon: drawLine.current[redo.index].latlon, action: 'EDIT' });
      drawLine.current[redo.index].xy = latLonArrayToXYArray(redo.latlon, mapRegion, mapSize, mapViewRef);
      drawLine.current[redo.index].latlon = redo.latlon;
      isEditingObject.current = currentDrawTool === 'PLOT_POINT' ? false : true;
      editingObjectIndex.current = currentDrawTool === 'PLOT_POINT' ? -1 : redo.index;
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

  const handleReleaseDeletePoint = useCallback(
    (pXY: Position) => {
      tryDeleteObjectAtPosition(pXY);
      setRedraw(ulid());
    },
    [tryDeleteObjectAtPosition]
  );

  const handleReleaseSelect = useCallback(
    (pXY: Position) => {
      const isSelected = trySelectObjectAtPosition(pXY);
      if (isSelected) {
        isEditingDraw.current = true;
        setRedraw(ulid());
        if (featureButton === 'POINT') {
          setDrawTool('PLOT_POINT');
        } else if (featureButton === 'LINE') {
          setDrawTool('PLOT_LINE');
        } else {
          setDrawTool('PLOT_POLYGON');
        }
      }
    },
    [featureButton, trySelectObjectAtPosition]
  );

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
      if (!isEditingObject.current) {
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
    [createNewNode, currentDrawTool, editStartNewPlotObject, isEditingObject, tryStartEditNode]
  );

  const handleMovePlot = useCallback(
    (pXY: Position) => {
      //編集中でなければなにもしない。
      if (!isEditingObject.current) return;
      moveNode(pXY);
      setRedraw(ulid());
    },
    [moveNode]
  );

  const handleReleasePlotPoint = useCallback(() => {
    updateNodePosition();
    isEditingDraw.current = true;
    setRedraw(ulid());
  }, [updateNodePosition]);

  const handleReleasePlotLinePolygon = useCallback(() => {
    let finished = false;

    const isDeleted = tryDeleteLineNode();
    if (!isDeleted) {
      finished = tryFinishEditObject();
      if (!finished) updateNodePosition();
    }

    setRedraw(ulid());
    return finished;
  }, [tryDeleteLineNode, tryFinishEditObject, updateNodePosition]);

  const handleGrantFreehand = useCallback(
    (pXY: Position) => {
      strokeFilter.current.reset();
      lastTouchXY.current = pXY;
      if (isEditingObject.current) {
        //編集中なら、
        const isFishished = tryFinishFreehandEditObject(pXY);
        if (isFishished) {
          return true;
        } else {
          editingLineXY.current = [pXY];
          return false;
        }
      } else {
        editStartNewFreehandObject(pXY);
        return false;
      }
    },
    [editStartNewFreehandObject, tryFinishFreehandEditObject]
  );

  const handleMoveFreehand = useCallback(
    (pXY: Position, timestampMs: number) => {
      if (!isEditingObject.current) return;

      lastTouchXY.current = pXY;
      if (editingObjectIndex.current === -1) {
        drawFreehandNewLine(pXY, timestampMs);
      } else {
        drawFreehandEditingLine(pXY, timestampMs);
      }
      setRedraw(ulid());
    },
    [drawFreehandEditingLine, drawFreehandNewLine]
  );

  const handleReleaseFreehand = useCallback(() => {
    if (editingObjectIndex.current === -1) {
      createNewFreehandObject();
    } else {
      editFreehandObject();
    }

    if (drawLine.current.length > 0) isEditingDraw.current = true;
    setRedraw(ulid());
  }, [createNewFreehandObject, editFreehandObject]);

  /**
   * フリーハンドの新規ストロークをその場で確定する。
   * ピンチ開始時に呼ぶことで、描きかけの消失や中断点から再開点への直線化を防ぐ。
   * 確定後の続き描きは既存の修正ストロークフローに乗る
   */
  const commitFreehandStroke = useCallback(() => {
    if (!isEditingObject.current) return;
    if (!isFreehandTool(currentDrawTool)) return;
    if (editingObjectIndex.current !== -1) {
      //修正ストローク中は軌跡を破棄するだけ（次のタッチで再初期化される）
      editingLineXY.current = [];
      return;
    }
    const index = drawLine.current.length - 1;
    if (index < 0) return;
    if (drawLine.current[index].xy.length >= 2) {
      //2点以上なら確定して修正モードへ
      drawLine.current[index].properties = ['EDIT'];
      editingObjectIndex.current = index;
    } else {
      //1点だけなら破棄（undoのNEWも取り除く）
      drawLine.current = drawLine.current.slice(0, -1);
      const lastUndo = undoLine.current[undoLine.current.length - 1];
      if (lastUndo !== undefined && lastUndo.action === 'NEW') undoLine.current.pop();
      isEditingObject.current = false;
    }
  }, [currentDrawTool, drawLine, editingLineXY, editingObjectIndex, isEditingObject, undoLine]);

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
    handleReleaseDeletePoint,
    handleGrantPlot,
    handleGrantFreehand,
    handleMovePlot,
    handleMoveFreehand,
    handleReleaseSelect,
    handleReleasePlotPoint,
    handleReleasePlotLinePolygon,
    handleReleaseFreehand,
    commitFreehandStroke,
    handleGrantSplitLine,
    selectObjectByFeature,
    checkSplitLine,
    setInfoToolActive,
  } as const;
};
