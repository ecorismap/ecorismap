import { useCallback, useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, Platform } from 'react-native';
import { useDispatch } from 'react-redux';
import MapView from 'react-native-maps';
import { Position } from '@turf/turf';
import { v4 as uuidv4 } from 'uuid';
import { t } from '../i18n/config';
//import * as turf from '@turf/turf';
import {
  DrawLineType,
  DrawToolType,
  FeatureButtonType,
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
} from '../utils/Coords';
import { useWindow } from './useWindow';
import { deleteRecordsAction } from '../modules/dataSet';
import { useHisyouTool } from '../plugins/hisyoutool/useHisyouTool';
import { useHisyouToolSetting } from '../plugins/hisyoutool/useHisyouToolSetting';
import { isHisyouTool } from '../plugins/hisyoutool/utils';
import { MapRef } from 'react-map-gl';
import { useDrawObjects } from './useDrawObjects';
import { editSettingsAction } from '../modules/settings';
import { useRecord } from './useRecord';
import { isFreehandTool, isPlotTool } from '../utils/General';

export type UseDrawToolReturnType = {
  isEditingDraw: boolean;
  isEditingObject: boolean;
  isSelectedDraw: boolean;
  drawLine: React.MutableRefObject<DrawLineType[]>;
  editingLineXY: React.MutableRefObject<Position[]>;
  selectLine: React.MutableRefObject<Position[]>;
  currentDrawTool: DrawToolType;
  currentPointTool: PointToolType;
  currentLineTool: LineToolType;
  currentPolygonTool: PolygonToolType;
  featureButton: FeatureButtonType;
  isDrawLineVisible: boolean;
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
  };
  undoDraw: () => void;
  pressSvgView: (event: GestureResponderEvent) => void;
  moveSvgView: (event: GestureResponderEvent) => void;
  releaseSvgView: (event: GestureResponderEvent) => void;
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
  toggleWebTerrainActive: (isActive: boolean) => void;
};

export const useDrawTool = (mapViewRef: MapView | MapRef | null): UseDrawToolReturnType => {
  const dispatch = useDispatch();
  const [currentDrawTool, setDrawTool] = useState<DrawToolType>('NONE');
  const [currentPointTool, setPointTool] = useState<PointToolType>('PLOT_POINT');
  const [currentLineTool, setLineTool] = useState<LineToolType>('PLOT_LINE');
  const [currentPolygonTool, setPolygonTool] = useState<PolygonToolType>('PLOT_POLYGON');
  const [featureButton, setFeatureButton] = useState<FeatureButtonType>('NONE');
  const [, setRedraw] = useState('');
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

  const offset = useRef([0, 0]);

  const { mapSize, mapRegion } = useWindow();

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
  } = useRecord();
  const {
    pressSvgFreehandTool,
    moveSvgFreehandTool,
    releaseSvgFreehandTool,
    pressSvgPlotTool,
    moveSvgPlotTool,
    releaseSvgPlotTool,
  } = useDrawObjects(
    drawLine,
    editingLineXY,
    undoLine,
    editingObjectIndex,
    currentDrawTool,
    isEditingObject,
    mapViewRef
  );
  const {
    pressSvgHisyouTool,
    moveSvgHisyouTool,
    releaseSvgHisyouTool,
    saveHisyou,
    convertFeatureToHisyouLine,
    deleteHisyouLine,
  } = useHisyouTool(
    drawLine,
    editingLineXY,
    undoLine,
    editingObjectIndex,
    currentDrawTool,
    isEditingObject,
    mapViewRef
  );
  const { isHisyouToolActive } = useHisyouToolSetting();
  const convertPointFeatureToDrawLine = useCallback(
    (layerId: string, features: PointRecordType[]) => {
      features.forEach((record) => {
        //console.log(record.coords, mapRegion, mapSize);
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
      features.forEach((record) =>
        drawLine.current.push({
          id: record.id,
          layerId: layerId,
          record: record,
          xy: latLonObjectsToXYArray(record.coords, mapRegion, mapSize, mapViewRef),
          latlon: latLonObjectsToLatLonArray(record.coords),
          properties: [],
        })
      );
    },
    [mapRegion, mapSize, mapViewRef]
  );
  const convertPolygonFeatureToDrawLine = useCallback(
    (layerId: string, features: PolygonRecordType[]) => {
      features.forEach((record) =>
        drawLine.current.push({
          id: record.id,
          layerId: layerId,
          record: record,
          xy: latLonObjectsToXYArray(record.coords, mapRegion, mapSize, mapViewRef),
          latlon: latLonObjectsToLatLonArray(record.coords),
          properties: [],
        })
      );
    },
    [mapRegion, mapSize, mapViewRef]
  );

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
    if (isHisyouToolActive) {
      const {
        isOK: isOKsaveHisyou,
        message: messageSaveHisyou,
        layer: hisyouLayer,
        recordSet: hisyouRecordSet,
      } = saveHisyou(layer, recordSet);
      if (!isOKsaveHisyou || hisyouLayer === undefined || hisyouRecordSet === undefined)
        return { isOK: false, message: messageSaveHisyou, layer: undefined, recordSet: undefined };
      savedRecordSet.push(...hisyouRecordSet);
    } else {
      for (const line of drawLine.current) {
        if (line.record !== undefined && line.layerId !== undefined) {
          const coords = latlonArrayToLatLonObjects(line.latlon);
          const centroid = calcLineMidPoint(coords);
          const updatedRecord: RecordType = { ...line.record, coords, centroid };
          const recordLayer = findLayer(line.layerId);
          if (recordLayer === undefined) continue;
          updateRecord(recordLayer, updatedRecord);
          savedRecordSet.push(updatedRecord);
        } else {
          const record = generateRecord('LINE', layer, recordSet, latlonArrayToLatLonObjects(line.latlon));
          addRecord(layer, record);
          savedRecordSet.push(record);
        }
      }
    }

    resetDrawTools();
    return { isOK: true, message: '', layer: layer, recordSet: savedRecordSet };
  }, [
    addRecord,
    findLayer,
    generateRecord,
    getEditableLayerAndRecordSetWithCheck,
    isHisyouToolActive,
    resetDrawTools,
    saveHisyou,
    updateRecord,
  ]);

  const savePolygon = useCallback(() => {
    //削除したものを取り除く
    drawLine.current = drawLine.current.filter((line) => line.xy.length !== 0);

    //有効なポリゴンかチェック(閉じていない。自己交差は不正でない)
    // drawLine.current.forEach((line) => {
    //   //line.xy = makeValidPolygon(line.xy);
    //   line.xy = makeBufferPolygon(line.xy);
    //   line.latlon = xyArrayToLatLonArray(line.xy, mapRegion, mapSize);
    // });

    const isValid = drawLine.current.every((line) => isValidPolygon(line.latlon));

    if (!isValid) {
      return { isOK: false, message: t('hooks.message.invalidPolygon'), layer: undefined, recordSet: undefined };
    }
    const { isOK, message, layer, recordSet } = getEditableLayerAndRecordSetWithCheck('POLYGON');
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
      // For DeBug
      // selectLine.current = turf
      //   .buffer(turf.point(xyToLatLon(pXY, mapRegion, mapSize)), radius)
      //   .geometry.coordinates[0].map((d) => latLonToXY(d, mapRegion, mapSize));

      let feature;
      let layer;
      let recordSet;
      let recordIndex;
      if (feature === undefined && (featureButton === 'POINT' || currentDrawTool === 'ALL_INFO')) {
        const radius = calcDegreeRadius(1000, mapRegion, mapSize);
        for (const { layerId, data } of pointDataSet) {
          const selectedFeature = selectPointFeatureByLatLon(
            data,
            xyToLatLon(pXY, mapRegion, mapSize, mapViewRef),
            radius
          );
          //console.log(selectedFeature);
          if (selectedFeature !== undefined && selectedFeature.visible) {
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
      if (feature === undefined && (featureButton === 'LINE' || currentDrawTool === 'ALL_INFO')) {
        const radius = calcDegreeRadius(1000, mapRegion, mapSize);

        for (const { layerId, data } of lineDataSet) {
          const selectedFeature = selectLineFeatureByLatLon(
            data,
            xyToLatLon(pXY, mapRegion, mapSize, mapViewRef),
            radius
          );
          if (selectedFeature !== undefined && selectedFeature.visible) {
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

      if (feature === undefined && (featureButton === 'POLYGON' || currentDrawTool === 'ALL_INFO')) {
        const radius = calcDegreeRadius(1000, mapRegion, mapSize);
        for (const { layerId, data } of polygonDataSet) {
          const selectedFeature = selectPolygonFeatureByLatLon(
            data,
            xyToLatLon(pXY, mapRegion, mapSize, mapViewRef),
            radius
          );
          if (selectedFeature !== undefined && selectedFeature.visible) {
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
      currentDrawTool,
      featureButton,
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

  const selectEditableFeatures = useCallback(() => {
    const { isOK, layer, recordSet } = getEditableLayerAndRecordSetWithCheck(featureButton);
    if (!isOK || layer === undefined || recordSet === undefined) {
      resetDrawTools();
      return;
    }
    const selectLineCoords = xyArrayToLatLonArray(selectLine.current, mapRegion, mapSize, mapViewRef);

    let features = [];
    if (featureButton === 'POINT') {
      features = selectPointFeatures(selectLineCoords, recordSet);
      if (features.length > 0) convertPointFeatureToDrawLine(layer.id, features);
    } else if (featureButton === 'LINE') {
      features = selectLineFeatures(selectLineCoords, recordSet);
      if (features.length > 0)
        isHisyouToolActive
          ? convertFeatureToHisyouLine(layer.id, features)
          : convertLineFeatureToDrawLine(layer.id, features);
    } else if (featureButton === 'POLYGON') {
      features = selectPolygonFeatures(selectLineCoords, recordSet);
      if (features.length > 0) convertPolygonFeatureToDrawLine(layer.id, features);
    }
    if (features.length > 0) {
      isSelectedDraw.current = true;
      // unselectRecord();
      undoLine.current.push({ index: -1, latlon: [], action: 'NEW' });
      selectLine.current = [];
    } else {
      resetDrawTools();
    }
  }, [
    convertFeatureToHisyouLine,
    convertLineFeatureToDrawLine,
    convertPointFeatureToDrawLine,
    convertPolygonFeatureToDrawLine,
    featureButton,
    getEditableLayerAndRecordSetWithCheck,
    isHisyouToolActive,
    mapRegion,
    mapSize,
    mapViewRef,
    resetDrawTools,
    selectLineFeatures,
    selectPointFeatures,
    selectPolygonFeatures,
  ]);

  const hideDrawLine = useCallback(() => {
    refreshDrawLine.current = false;
    setDrawLineVisible(false);
  }, []);

  const showDrawLine = useCallback(() => {
    //useEffectでdrawLineを更新してから表示する。この時点ではまだ座標が更新されていないため。
    refreshDrawLine.current = true;
  }, []);

  const pressSvgView = useCallback(
    (event: GestureResponderEvent) => {
      //console.log(selectedTool);

      if (!event.nativeEvent.touches.length) return;
      //console.log('#', gesture.numberActiveTouches);
      //locationXを使用するとボタンと重なったときにボタンの座標になってしまうのでpageXを使用。
      //pageとmapのlocationとのズレをoffsetで修正
      offset.current = [
        event.nativeEvent.locationX - event.nativeEvent.pageX,
        event.nativeEvent.locationY - event.nativeEvent.pageY,
      ];
      const pXY: Position = [event.nativeEvent.pageX + offset.current[0], event.nativeEvent.pageY + offset.current[1]];

      if (currentDrawTool === 'SELECT' || currentDrawTool === 'DELETE_POINT') {
        // //選択解除
        editingObjectIndex.current = -1;
        drawLine.current = [];
        selectLine.current = [pXY];
        return;
      }
      if (isPlotTool(currentDrawTool)) {
        pressSvgPlotTool(pXY);
        return;
      }
      if (isFreehandTool(currentDrawTool)) {
        pressSvgFreehandTool(pXY);
        return;
      }
      if (isHisyouTool(currentDrawTool)) {
        pressSvgHisyouTool(pXY);
        return;
      }
    },
    [currentDrawTool, pressSvgFreehandTool, pressSvgHisyouTool, pressSvgPlotTool]
  );

  const moveSvgView = useCallback(
    (event: GestureResponderEvent) => {
      if (!event.nativeEvent.touches.length) return;
      //console.log('##', gesture.numberActiveTouches);
      const pXY: Position = [event.nativeEvent.pageX + offset.current[0], event.nativeEvent.pageY + offset.current[1]];

      if (currentDrawTool === 'SELECT' || currentDrawTool === 'DELETE_POINT') {
        selectLine.current = [...selectLine.current, pXY];
        setRedraw(uuidv4());
        return;
      }
      if (isPlotTool(currentDrawTool)) {
        moveSvgPlotTool(pXY);
        setRedraw(uuidv4());
        return;
      }
      if (isFreehandTool(currentDrawTool)) {
        moveSvgFreehandTool(pXY);
        setRedraw(uuidv4());
        return;
      }
      if (isHisyouTool(currentDrawTool)) {
        moveSvgHisyouTool(pXY);
        setRedraw(uuidv4());
        return;
      }
    },
    [currentDrawTool, moveSvgFreehandTool, moveSvgHisyouTool, moveSvgPlotTool]
  );

  const releaseSvgView = useCallback(
    (event: GestureResponderEvent) => {
      //console.log('##', gesture.numberActiveTouches);
      const pXY: Position = [event.nativeEvent.pageX + offset.current[0], event.nativeEvent.pageY + offset.current[1]];

      if (currentDrawTool === 'SELECT' || currentDrawTool === 'DELETE_POINT') {
        selectEditableFeatures();
        setRedraw(uuidv4());
        return;
      }
      if (isPlotTool(currentDrawTool)) {
        releaseSvgPlotTool(pXY);
        if (drawLine.current.length > 0) isEditingDraw.current = true;
        setRedraw(uuidv4());
        return;
      }
      if (isFreehandTool(currentDrawTool)) {
        releaseSvgFreehandTool();
        if (drawLine.current.length > 0) isEditingDraw.current = true;
        setRedraw(uuidv4());
        return;
      }
      if (isHisyouTool(currentDrawTool)) {
        releaseSvgHisyouTool();
        if (drawLine.current.length > 0) isEditingDraw.current = true;
        setRedraw(uuidv4());
        return;
      }
    },
    [currentDrawTool, releaseSvgFreehandTool, releaseSvgHisyouTool, releaseSvgPlotTool, selectEditableFeatures]
  );

  const deleteDraw = useCallback(() => {
    const { isOK, message, layer } = getEditableLayerAndRecordSetWithCheck(featureButton);

    if (!isOK || layer === undefined) {
      return { isOK: false, message };
    }
    deleteDrawRecord(layer.id);
    if (isHisyouToolActive) {
      deleteHisyouLine();
    }
    resetDrawTools();
    setDrawTool('NONE');
    return { isOK: true, message: '' };
  }, [
    deleteDrawRecord,
    deleteHisyouLine,
    featureButton,
    getEditableLayerAndRecordSetWithCheck,
    isHisyouToolActive,
    resetDrawTools,
  ]);

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
      drawLine.current[undo.index].xy = latLonArrayToXYArray(undo.latlon, mapRegion, mapSize, mapViewRef);
      drawLine.current[undo.index].latlon = undo.latlon;
      drawLine.current[undo.index].properties = drawLine.current[undo.index].properties.filter((p) => p !== 'EDIT');
      isEditingObject.current = false;
      editingObjectIndex.current = -1;
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
    setRedraw(uuidv4());
  }, [currentDrawTool, mapRegion, mapSize, mapViewRef, resetDrawTools]);

  const toggleWebTerrainActive = useCallback(
    (isActive: boolean) => {
      if (Platform.OS !== 'web' || mapViewRef === null) return;
      const mapView = (mapViewRef as MapRef).getMap();
      if (isActive) {
        mapView.setTerrain({ source: 'rasterdem', exaggeration: 1.5 });
      } else {
        //Terrainが有効の時やビューが回転していると、boundsが正確に取れなくてSVGのラインを正しく変換できないので無効にする。
        mapView.setTerrain();
        dispatch(editSettingsAction({ mapRegion: { ...mapRegion, pitch: 0, bearing: 0 } }));
      }
    },
    [dispatch, mapRegion, mapViewRef]
  );

  useEffect(() => {
    //ライン編集中にサイズ変更。移動中は更新しない。
    if (drawLine.current.length > 0 && refreshDrawLine.current) {
      drawLine.current = drawLine.current.map((line) => {
        return { ...line, xy: latLonArrayToXYArray(line.latlon, mapRegion, mapSize, mapViewRef) };
      });
      setDrawLineVisible(true);
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
    deleteDraw,
    undoDraw,
    savePoint,
    saveLine,
    savePolygon,
    setDrawTool,
    setPointTool,
    setLineTool,
    setPolygonTool,
    setFeatureButton,
    pressSvgView,
    moveSvgView,
    releaseSvgView,
    selectSingleFeature,
    resetDrawTools,
    hideDrawLine,
    showDrawLine,
    toggleWebTerrainActive,
  } as const;
};
