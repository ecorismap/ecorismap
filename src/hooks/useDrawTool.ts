import { Dispatch, RefObject, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, Platform } from 'react-native';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import MapView from 'react-native-maps';
import { ulid } from 'ulid';
import { t } from '../i18n/config';
//import * as turf from '@turf/turf';
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
  modifyLine,
  simplify,
  smoothingByBezier,
} from '../utils/Coords';
import { useWindow } from './useWindow';
import { deleteRecordsAction } from '../modules/dataSet';
import { MapRef } from 'react-map-gl/maplibre';
import { editSettingsAction } from '../modules/settings';
import { useRecord } from './useRecord';
import { isPointTool } from '../utils/General';
import { Position } from 'geojson';
import { RootState } from '../store';

export type UseDrawToolReturnType = {
  isEditingDraw: boolean;
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
  isModalInfoToolHidden: boolean;
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
  handleMoveFreehand: (pXY: Position) => void;
  handleReleaseSelect: (pXY: Position) => void;
  handleReleaseFreehand: () => void;
  handleReleasePlotPoint: () => void;
  handleReleasePlotLinePolygon: () => boolean;
  selectObjectByFeature: (layer: LayerType, feature: RecordType, shouldRefreshCoordinates?: boolean) => void;
  handleGrantSplitLine: (pXY: Position) => void;
  checkSplitLine: (pXY: Position) => boolean;
  setIsModalInfoToolHidden: (value: boolean) => void;
  setInfoToolActive: Dispatch<SetStateAction<boolean>>;
};

export const useDrawTool = (mapViewRef: MapView | MapRef | null): UseDrawToolReturnType => {
  const dispatch = useDispatch();
  const isModalInfoToolHidden = useSelector((state: RootState) => state.settings.isModalInfoToolHidden, shallowEqual);
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
  const drawLine = useRef<DrawLineType[]>([]);
  const editingLineXY = useRef<Position[]>([]);
  const undoLine = useRef<UndoLineType[]>([]);
  const editingObjectIndex = useRef(-1);
  const selectLine = useRef<Position[]>([]);
  const isEditingDraw = useRef(false);
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
        if (features.length > 0) convertPointFeatureToDrawLine(layer.id, features);
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
        undoLine.current.push({
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
    [convertFeatureToDrawLine, currentDrawTool]
  );

  const changeToEditingObject = useCallback(
    (index: number, featureType: FeatureButtonType) => {
      editingObjectIndex.current = index;
      const lineXY = drawLine.current[index].xy;
      undoLine.current.push({
        index: index,
        latlon: drawLine.current[index].latlon,
        action: 'SELECT',
      });
      drawLine.current[index].properties = [...drawLine.current[index].properties, 'EDIT'];
      if (featureType === 'POLYGON') {
        lineXY.pop(); //閉じたポイントを一旦削除
        drawLine.current[index].latlon = xyArrayToLatLonArray(lineXY, mapRegion, mapSize, mapViewRef);
      }
      isEditingObject.current = true;
    },
    [mapRegion, mapSize, mapViewRef]
  );

  const selectObjectByFeature = useCallback(
    (layer: LayerType, feature: RecordType, shouldRefreshCoordinates = false) => {
      if (layer.type === 'POINT') {
        convertPointFeatureToDrawLine(layer.id, [feature as PointRecordType]);
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
        properties: [currentDrawTool === 'PLOT_POINT' ? 'POINT' : 'EDIT'],
      });
      if (currentDrawTool === 'PLOT_LINE' || currentDrawTool === 'PLOT_POLYGON')
        undoLine.current.push({
          index: -1,
          latlon: [],
          action: 'NEW',
        });
      isEditingObject.current = true;
      editingNodeIndex.current = 0;
      editingNodeState.current = 'NEW';
      editingObjectIndex.current = drawLine.current.length - 1;
    },
    [currentDrawTool, drawLine, editingObjectIndex, isEditingObject, undoLine]
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
    const lineXY = drawLine.current[index].xy;
    undoLine.current.push({
      index: index,
      latlon: drawLine.current[index].latlon,
      action: 'EDIT',
    });
    //途中のノードをタッチでノード削除
    drawLine.current[index].xy.splice(editingNodeIndex.current, 1);
    drawLine.current[index].latlon = xyArrayToLatLonArray(lineXY, mapRegion, mapSize, mapViewRef);
    editingLineXY.current = [];
    return true;
  }, [editingLineXY, editingObjectIndex, drawLine, undoLine, mapRegion, mapSize, mapViewRef]);

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

    undoLine.current.push({
      index: index,
      latlon: drawLine.current[index].latlon,
      action: 'FINISH',
    });
    //最初のノードをタッチで編集終了（ポリゴンのみ）
    if (currentDrawTool === 'PLOT_POLYGON') lineXY.push(lineXY[0]);
    drawLine.current[index].latlon = xyArrayToLatLonArray(lineXY, mapRegion, mapSize, mapViewRef);
    drawLine.current[index].properties = drawLine.current[index].properties.filter((p) => p !== 'EDIT');
    editingObjectIndex.current = -1;
    isEditingObject.current = false;
    editingLineXY.current = [];
    return true;
  }, [
    editingLineXY,
    fixLittleMovement,
    editingObjectIndex,
    drawLine,
    currentDrawTool,
    undoLine,
    mapRegion,
    mapSize,
    mapViewRef,
    isEditingObject,
  ]);

  const finishEditObject = useCallback(() => {
    if (!isEditingObject.current) return false;
    const index = editingObjectIndex.current;
    if (index === -1) return false;

    const lineXY = drawLine.current[index].xy;

    // 最小ポイント数のチェック
    if ((currentDrawTool === 'PLOT_LINE' || currentDrawTool === 'FREEHAND_LINE') && lineXY.length < 2) return false;
    if ((currentDrawTool === 'PLOT_POLYGON' || currentDrawTool === 'FREEHAND_POLYGON') && lineXY.length < 3) return false;

    undoLine.current.push({
      index: index,
      latlon: drawLine.current[index].latlon,
      action: 'FINISH',
    });

    drawLine.current[index].latlon = xyArrayToLatLonArray(lineXY, mapRegion, mapSize, mapViewRef);
    drawLine.current[index].properties = drawLine.current[index].properties.filter((p) => p !== 'EDIT');
    editingObjectIndex.current = -1;
    isEditingObject.current = false;
    editingLineXY.current = [];
    editingNodeState.current = 'NONE';
    editingNodeIndex.current = -1;
    setRedraw(ulid());
    return true;
  }, [currentDrawTool, drawLine, editingObjectIndex, isEditingObject, mapRegion, mapSize, mapViewRef, undoLine]);

  const updateNodePosition = useCallback(() => {
    const index = editingObjectIndex.current;
    const lineXY = drawLine.current[index].xy;
    if (isPointTool(currentDrawTool) || drawLine.current[index].latlon.length !== 0) {
      //ラインは新規以外。新規の場合はNEWで追加している。
      undoLine.current.push({
        index: index,
        latlon: drawLine.current[index].latlon,
        action: 'EDIT',
      });
    }
    drawLine.current[index].latlon = xyArrayToLatLonArray(lineXY, mapRegion, mapSize, mapViewRef);
    editingLineXY.current = [];
    if (currentDrawTool === 'PLOT_POINT') isEditingObject.current = false;
  }, [
    editingObjectIndex,
    drawLine,
    currentDrawTool,
    mapRegion,
    mapSize,
    mapViewRef,
    editingLineXY,
    isEditingObject,
    undoLine,
  ]);

  /******************************************************************: */

  const tryFinishFreehandEditObject = useCallback(
    (pXY: Position) => {
      // フリーハンドの場合は始点タップで確定しない（確定ボタンを使う）
      if (currentDrawTool === 'FREEHAND_LINE' || currentDrawTool === 'FREEHAND_POLYGON') return false;
      const index = editingObjectIndex.current;
      if (index === -1) return false;
      const lineXY = drawLine.current[index].xy;
      if (currentDrawTool === 'FREEHAND_POLYGON' && lineXY.length < 3) return false;
      const isNearWithFirstNode = isNearWithPlot(pXY, lineXY[0]);
      if (!isNearWithFirstNode) return false;

      undoLine.current.push({
        index: index,
        latlon: drawLine.current[index].latlon,
        action: 'FINISH',
      });
      //最初のノードをタッチで編集終了
      if (currentDrawTool === 'FREEHAND_POLYGON') {
        //ポリゴンは閉じてなかったら閉じる
        if (!isClosedPolygon(lineXY)) lineXY.push(lineXY[0]);
      }
      drawLine.current[index].latlon = xyArrayToLatLonArray(lineXY, mapRegion, mapSize, mapViewRef);
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
      undoLine,
      mapRegion,
      mapSize,
      mapViewRef,
      isEditingObject,
      editingLineXY,
    ]
  );;

  const editStartNewFreehandObject = useCallback(
    (pXY: Position) => {
      //console.log('New Line');

      //新規ラインの場合
      drawLine.current.push({
        id: ulid(),
        layerId: undefined,
        record: undefined,
        xy: [pXY],
        latlon: [],
        properties: ['EDIT'],
      });

      undoLine.current.push({
        index: -1,
        latlon: [],
        action: 'NEW',
      });
      isEditingObject.current = true;
      editingObjectIndex.current = -1;
    },
    [drawLine, editingObjectIndex, isEditingObject, undoLine]
  );

  const drawFreehandNewLine = useCallback(
    (pXY: Position) => {
      //新規ラインの場合
      const index = drawLine.current.length - 1;
      drawLine.current[index].xy = [...drawLine.current[index].xy, pXY];
    },
    [drawLine]
  );

  const drawFreehandEditingLine = useCallback(
    (pXY: Position) => {
      //ライン修正の場合
      editingLineXY.current = [...editingLineXY.current, pXY];
    },
    [editingLineXY]
  );

  const tryClosePolygon = (lineXY: Position[], forceClose = false) => {
    if (lineXY.length < 3) return false;
    const startPoint = lineXY[0];
    const endPoint = lineXY[lineXY.length - 1];
    // forceCloseがtrueの場合は距離に関係なく閉じる（フリーハンド用）
    if (!forceClose && !isNearWithPlot(startPoint, endPoint)) return false;
    // 始点と終点が同じでなければ始点を追加してポリゴンを閉じる
    if (startPoint[0] !== endPoint[0] || startPoint[1] !== endPoint[1]) {
      lineXY.push(startPoint);
    }
    return true;
  };

  const createNewFreehandObject = useCallback(() => {
    const index = drawLine.current.length - 1;
    const lineXY = drawLine.current[index].xy;
    lineXY.splice(-2);
    if (lineXY.length < 2) return;
    const smoothedXY = smoothingByBezier(lineXY);
    const simplifiedXY = simplify(smoothedXY);
    drawLine.current[index].xy = simplifiedXY;
    drawLine.current[index].latlon = xyArrayToLatLonArray(simplifiedXY, mapRegion, mapSize, mapViewRef);
    drawLine.current[index].properties = ['EDIT'];

    editingObjectIndex.current = index;
  }, [currentDrawTool, drawLine, editingObjectIndex, mapRegion, mapSize, mapViewRef]);

  const editFreehandObject = useCallback(() => {
    // //ライン修正の場合
    const index = editingObjectIndex.current;
    const lineXY = editingLineXY.current;
    lineXY.splice(-2);
    if (lineXY.length < 2) return;
    const smoothedXY = smoothingByBezier(lineXY);
    const simplifiedXY = simplify(smoothedXY);
    const modifiedXY = modifyLine(drawLine.current[index], simplifiedXY, currentDrawTool);
    editingLineXY.current = [];
    if (modifiedXY.length <= 0) return;

    undoLine.current.push({
      index: index,
      latlon: drawLine.current[index].latlon,
      action: 'EDIT',
    });

    drawLine.current[index] = {
      ...drawLine.current[index],
      xy: modifiedXY,
      latlon: xyArrayToLatLonArray(modifiedXY, mapRegion, mapSize, mapViewRef),
    };
  }, [currentDrawTool, drawLine, editingLineXY, editingObjectIndex, mapRegion, mapSize, mapViewRef, undoLine]);

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
        lineXY.push(lineXY[0]);
        line.latlon = xyArrayToLatLonArray(lineXY, mapRegion, mapSize, mapViewRef);
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
  }, [addRecord, findLayer, generateRecord, getEditableLayerAndRecordSetWithCheck, resetDrawTools, updateRecord]);

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

    if (undo.action === 'NEW') {
      //追加の場合
      drawLine.current.pop();
      isEditingObject.current = false;
      editingObjectIndex.current = -1;
    } else if (undo.action === 'SELECT') {
      //オブジェクトの選択をアンドゥする場合
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
      resetDrawTools();
      setDrawTool('NONE');
    }
    setRedraw(ulid());
  }, [currentDrawTool, mapRegion, mapSize, mapViewRef, resetDrawTools]);

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

        mapView.setTerrain({ source: 'rasterdem', exaggeration: 1.5 });
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
        setDrawTool(featureButton === 'LINE' ? 'PLOT_LINE' : 'PLOT_POLYGON');
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
          - 近くなければ、最後尾にプロットを追加
      */
      if (!isEditingObject.current) {
        editStartNewPlotObject(pXY);
      } else {
        //プロット中なら、
        const isStartEditNode = tryStartEditNode(pXY);
        if (!isStartEditNode) createNewNode(pXY);
      }
    },
    [createNewNode, editStartNewPlotObject, isEditingObject, tryStartEditNode]
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
    (pXY: Position) => {
      if (!isEditingObject.current) return;

      if (editingObjectIndex.current === -1) {
        drawFreehandNewLine(pXY);
      } else {
        drawFreehandEditingLine(pXY);
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
      const lineXY = drawLine.current[index].xy;

      let nodeIndex = findNearNodeIndex(pXY, lineXY);
      if (nodeIndex === -1) {
        //console.log('make interporate node');
        const { index: idx } = getSnappedPositionWithLine(pXY, lineXY, {
          isXY: true,
        });
        lineXY.splice(idx + 1, 0, pXY);
        nodeIndex = idx + 1;
      }
      const record = drawLine.current[index].record;
      const newLine = {
        ...drawLine.current[index],
        id: ulid(),
        latlon: xyArrayToLatLonArray(lineXY.slice(0, nodeIndex + 1), mapRegion, mapSize, mapViewRef),
        record: record ? { ...record, id: ulid() } : undefined,
      };
      drawLine.current.push(newLine);
      drawLine.current[index].latlon = xyArrayToLatLonArray(lineXY.slice(nodeIndex), mapRegion, mapSize, mapViewRef);
      //保存する
      saveLine();
    },
    [mapRegion, mapSize, mapViewRef, saveLine]
  );

  const setIsModalInfoToolHidden = useCallback(
    (value: boolean) => {
      dispatch(editSettingsAction({ isModalInfoToolHidden: value }));
    },
    [dispatch]
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
      // 座標再計算後はフラグをリセット
      refreshDrawLine.current = false;
    }
  }, [isDrawLineVisible, mapRegion, mapSize, mapViewRef]);

  return {
    isEditingDraw: isEditingDraw.current,
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
    isModalInfoToolHidden,
    isInfoToolActive,
    deleteDraw,
    undoDraw,
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
    handleGrantSplitLine,
    selectObjectByFeature,
    checkSplitLine,
    setIsModalInfoToolHidden,
    setInfoToolActive,
  } as const;
};
