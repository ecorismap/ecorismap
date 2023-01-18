import { useCallback, useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, Platform } from 'react-native';
import { useDispatch } from 'react-redux';
import MapView from 'react-native-maps';
import { Position } from '@turf/turf';
import * as turf from '@turf/turf';
import { v4 as uuidv4 } from 'uuid';
import { t } from '../i18n/config';
import {
  DrawToolType,
  FeatureButtonType,
  LayerType,
  LineRecordType,
  PointRecordType,
  PolygonRecordType,
  RecordType,
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
  isValidPolygon,
  isValidPoint,
  isValidLine,
} from '../utils/Coords';
import { useWindow } from './useWindow';
import { addRecordsAction, updateRecordsAction, deleteRecordsAction } from '../modules/dataSet';
import { useHisyouTool } from '../plugins/hisyoutool/useHisyouTool';
import { useHisyouToolSetting } from '../plugins/hisyoutool/useHisyouToolSetting';
import { isHisyouTool } from '../plugins/hisyoutool/utils';
import { MapRef } from 'react-map-gl';
import { useLineTool } from './useLineTool';
import { editSettingsAction } from '../modules/settings';
import { useRecord } from './useRecord';
import { isInfoTool, isLineTool } from '../utils/General';

export type UseDrawToolReturnType = {
  isEditingLine: boolean;
  isDrag: boolean;
  drawLine: React.MutableRefObject<
    {
      id: string;
      record: RecordType | undefined;
      xy: Position[];
      latlon: Position[];
      properties: string[];
    }[]
  >;
  editingLine: React.MutableRefObject<{
    start: turf.helpers.Position;
    xy: Position[];
  }>;
  selectLine: React.MutableRefObject<Position[]>;
  currentDrawTool: DrawToolType;
  featureButton: FeatureButtonType;
  setDrawTool: React.Dispatch<React.SetStateAction<DrawToolType>>;
  setFeatureButton: React.Dispatch<React.SetStateAction<FeatureButtonType>>;
  savePoint: () => {
    isOK: boolean;
    message: string;
    layer: undefined;
    data: undefined;
  };
  saveLine: () => {
    isOK: boolean;
    message: string;
    layer: LayerType | undefined;
    data: RecordType | undefined;
  };
  savePolygon: () => {
    isOK: boolean;
    message: string;
    layer: undefined;
    data: undefined;
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
  toggleTerrainForWeb: (value: FeatureButtonType) => void;
};

export const useDrawTool = (mapViewRef: MapView | MapRef | null): UseDrawToolReturnType => {
  const dispatch = useDispatch();
  const [currentDrawTool, setDrawTool] = useState<DrawToolType>('NONE');
  const [featureButton, setFeatureButton] = useState<FeatureButtonType>('NONE');
  const [, setRedraw] = useState('');

  const drawLine = useRef<
    {
      id: string;
      record: RecordType | undefined;
      xy: Position[];
      latlon: Position[];
      properties: string[];
    }[]
  >([]);
  const editingLine = useRef<{ start: Position; xy: Position[] }>({ start: [], xy: [] });
  const undoLine = useRef<{ index: number; latlon: Position[] }[]>([]);
  const modifiedIndex = useRef(-1);
  const selectLine = useRef<Position[]>([]);
  const isEditingLine = useRef(false);
  const isDrag = useRef(false);
  const offset = useRef([0, 0]);
  const movingMapCenter = useRef<{ x: number; y: number; longitude: number; latitude: number } | undefined>(undefined);

  const { mapSize, mapRegion } = useWindow();

  const {
    dataUser,
    pointDataSet,
    lineDataSet,
    polygonDataSet,
    checkRecordEditable,
    getEditingLayerAndRecordSet,
    generateLineRecord,
    findLayer,
    unselectRecord,
  } = useRecord();
  const {
    isPlotting,
    pressSvgFreehandTool,
    moveSvgFreehandTool,
    releaseSvgFreehandTool,
    pressSvgPlotTool,
    moveSvgPlotTool,
    releaseSvgPlotTool,
  } = useLineTool(drawLine, editingLine, undoLine, modifiedIndex, currentDrawTool);
  const {
    pressSvgHisyouTool,
    moveSvgHisyouTool,
    releaseSvgHisyouTool,
    saveHisyou,
    convertFeatureToHisyouLine,
    deleteHisyouLine,
  } = useHisyouTool(currentDrawTool, modifiedIndex, drawLine, editingLine, undoLine);
  const { isHisyouToolActive } = useHisyouToolSetting();

  const convertPointFeatureToDrawLine = useCallback(
    (features: PointRecordType[]) => {
      features.forEach((record) =>
        drawLine.current.push({
          id: record.id,
          record: record,
          xy: latLonObjectsToXYArray([record.coords], mapRegion, mapSize),
          latlon: latLonObjectsToLatLonArray([record.coords]),
          properties: ['POINT'],
        })
      );
    },
    [drawLine, mapRegion, mapSize]
  );

  const convertLineFeatureToDrawLine = useCallback(
    (features: LineRecordType[]) => {
      features.forEach((record) =>
        drawLine.current.push({
          id: record.id,
          record: record,
          xy: latLonObjectsToXYArray(record.coords, mapRegion, mapSize),
          latlon: latLonObjectsToLatLonArray(record.coords),
          properties: ['DRAW'],
        })
      );
    },
    [drawLine, mapRegion, mapSize]
  );
  const convertPolygonFeatureToDrawLine = useCallback(
    (features: PolygonRecordType[]) => {
      features.forEach((record) =>
        drawLine.current.push({
          id: record.id,
          record: record,
          xy: latLonObjectsToXYArray(record.coords, mapRegion, mapSize),
          latlon: latLonObjectsToLatLonArray(record.coords),
          properties: ['PLOT'],
        })
      );
    },
    [drawLine, mapRegion, mapSize]
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
    editingLine.current = { start: [], xy: [] };
    isEditingLine.current = false;
    modifiedIndex.current = -1;
    selectLine.current = [];
    undoLine.current = [];
    isPlotting.current = false;
    isDrag.current = false;
  }, [isPlotting]);

  const saveDraw = useCallback(
    (editingLayer: LayerType, editingRecordSet: RecordType[]) => {
      drawLine.current.forEach((line) => {
        if (line.record !== undefined) {
          //修正
          const updatedRecord: RecordType = {
            ...line.record,
            coords: latlonArrayToLatLonObjects(line.latlon),
          };
          dispatch(
            updateRecordsAction({
              layerId: editingLayer.id,
              userId: dataUser.uid,
              data: [updatedRecord],
            })
          );
        } else {
          //新規
          const newRecord = generateLineRecord(editingLayer, editingRecordSet, latlonArrayToLatLonObjects(line.latlon));
          dispatch(addRecordsAction({ layerId: editingLayer.id, userId: dataUser.uid, data: [newRecord] }));
        }
      });
    },
    [dataUser.uid, dispatch, generateLineRecord]
  );

  const savePoint = useCallback(() => {
    const { editingLayer, editingRecordSet } = getEditingLayerAndRecordSet('POINT');
    if (editingLayer === undefined) {
      return { isOK: false, message: t('hooks.message.noLayerToEdit'), layer: undefined, data: undefined };
    }
    const { isOK, message } = checkRecordEditable(editingLayer);

    if (!isOK) {
      return { isOK: false, message, layer: undefined, data: undefined };
    }

    //有効なポイントかチェック(ポイントの数)
    const isValid = drawLine.current.every((line) => isValidPoint(line.xy));

    if (!isValid) {
      return { isOK: false, message: "Can't save for invalid point", layer: undefined, data: undefined };
    }
    saveDraw(editingLayer, editingRecordSet);
    resetDrawTools();
    return { isOK: true, message: '', layer: undefined, data: undefined };
  }, [checkRecordEditable, getEditingLayerAndRecordSet, resetDrawTools, saveDraw]);

  const saveLine = useCallback(() => {
    const { editingLayer, editingRecordSet } = getEditingLayerAndRecordSet('LINE');
    if (editingLayer === undefined) {
      return { isOK: false, message: t('hooks.message.noLayerToEdit'), layer: undefined, data: undefined };
    }
    const { isOK, message } = checkRecordEditable(editingLayer);

    if (!isOK) {
      return { isOK: false, message, layer: undefined, data: undefined };
    }

    //有効なラインかチェック(ポイントの数)
    const isValid = drawLine.current.every((line) => isValidLine(line.xy));

    if (!isValid) {
      return { isOK: false, message: "Can't save for invalid line", layer: undefined, data: undefined };
    }

    if (isHisyouToolActive) {
      const { isOK: isOKsaveHisyou, message: messageSaveHisyou } = saveHisyou(editingLayer, editingRecordSet);
      if (!isOKsaveHisyou) return { isOK: false, message: messageSaveHisyou, layer: undefined, data: undefined };
    } else {
      saveDraw(editingLayer, editingRecordSet);
    }
    resetDrawTools();
    return { isOK: true, message: '', layer: undefined, data: undefined };
  }, [checkRecordEditable, getEditingLayerAndRecordSet, isHisyouToolActive, resetDrawTools, saveDraw, saveHisyou]);

  const savePolygon = useCallback(() => {
    const { editingLayer, editingRecordSet } = getEditingLayerAndRecordSet('POLYGON');
    if (editingLayer === undefined) {
      return { isOK: false, message: t('hooks.message.noLayerToEdit'), layer: undefined, data: undefined };
    }
    const { isOK, message } = checkRecordEditable(editingLayer);

    if (!isOK) {
      return { isOK: false, message, layer: undefined, data: undefined };
    }

    //console.log(drawLine.current[0]);
    //有効なポリゴンかチェック(ポイントの数、一直線、自己交差)
    const isValid = drawLine.current.every((line) => isValidPolygon(line.xy));

    if (!isValid) {
      return { isOK: false, message: "Can't save for invalid polygon", layer: undefined, data: undefined };
    }
    saveDraw(editingLayer, editingRecordSet);

    resetDrawTools();
    return { isOK: true, message: '', layer: undefined, data: undefined };
  }, [checkRecordEditable, getEditingLayerAndRecordSet, resetDrawTools, saveDraw]);

  const selectSingleFeature = useCallback(
    (event: GestureResponderEvent) => {
      resetDrawTools();
      setRedraw(uuidv4());
      //選択処理
      const pXY: Position = [event.nativeEvent.locationX, event.nativeEvent.locationY];

      // For DeBug
      // selectLine.current = turf
      //   .buffer(turf.point(pointToLatLon(point, mapRegion, mapSize)), radius)
      //   .geometry.coordinates[0].map((d) => latLonToPoint(d, mapRegion, mapSize));
      // setRedraw(uuidv4());
      let feature;
      let layer;
      let recordSet;
      let recordIndex;
      if (feature === undefined && (featureButton === 'POINT' || currentDrawTool === 'ALL_INFO')) {
        const radius = calcDegreeRadius(1000, mapRegion, mapSize);
        for (const { layerId, data } of pointDataSet) {
          const selectedFeature = selectPointFeatureByLatLon(data, xyToLatLon(pXY, mapRegion, mapSize), radius);
          if (selectedFeature !== undefined) {
            layer = findLayer(layerId);
            recordSet = data;
            recordIndex = data.findIndex((d) => d.id === selectedFeature.id);
            feature = selectedFeature;
            break;
          }
        }
      }
      if (feature === undefined && (featureButton === 'LINE' || currentDrawTool === 'ALL_INFO')) {
        const radius = calcDegreeRadius(500, mapRegion, mapSize);
        for (const { layerId, data } of lineDataSet) {
          const selectedFeature = selectLineFeatureByLatLon(data, xyToLatLon(pXY, mapRegion, mapSize), radius);
          if (selectedFeature !== undefined) {
            layer = findLayer(layerId);
            if (isHisyouToolActive) convertFeatureToHisyouLine([selectedFeature]);
            recordSet = data;
            recordIndex = data.findIndex((d) => d.id === selectedFeature.id);
            feature = selectedFeature;
            break;
          }
        }
      }
      if (feature === undefined && (featureButton === 'POLYGON' || currentDrawTool === 'ALL_INFO')) {
        const radius = calcDegreeRadius(500, mapRegion, mapSize);
        for (const { layerId, data } of polygonDataSet) {
          const selectedFeature = selectPolygonFeatureByLatLon(data, xyToLatLon(pXY, mapRegion, mapSize), radius);
          if (selectedFeature !== undefined) {
            layer = findLayer(layerId);
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
      convertFeatureToHisyouLine,
      currentDrawTool,
      featureButton,
      findLayer,
      isHisyouToolActive,
      lineDataSet,
      mapRegion,
      mapSize,
      pointDataSet,
      polygonDataSet,
      resetDrawTools,
    ]
  );

  const hideDrawLine = useCallback(() => {
    drawLine.current.forEach((line, idx) => (drawLine.current[idx] = { ...line, xy: [] }));
    setRedraw(uuidv4());
  }, []);

  const showDrawLine = useCallback(() => {
    drawLine.current.forEach(
      (line, idx) => (drawLine.current[idx] = { ...line, xy: latLonArrayToXYArray(line.latlon, mapRegion, mapSize) })
    );
    setRedraw(uuidv4());
  }, [mapRegion, mapSize]);

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

      if (currentDrawTool === 'MOVE' || isInfoTool(currentDrawTool)) {
        movingMapCenter.current = {
          x: pXY[0],
          y: pXY[1],
          longitude: mapRegion.longitude,
          latitude: mapRegion.latitude,
        };
        //xyを消してsvgの描画を止める。表示のタイムラグがでるため
        hideDrawLine();
      } else if (currentDrawTool === 'SELECT') {
        // //選択解除
        modifiedIndex.current = -1;
        drawLine.current = [];
        selectLine.current = [pXY];
      } else if (currentDrawTool === 'PLOT_POINT' || currentDrawTool === 'PLOT_POLYGON') {
        pressSvgPlotTool(pXY);
      } else if (isLineTool(currentDrawTool) || currentDrawTool === 'FREEHAND_POLYGON') {
        pressSvgFreehandTool(pXY);
      } else if (isHisyouTool(currentDrawTool)) {
        pressSvgHisyouTool(pXY);
      }
    },
    [
      currentDrawTool,
      hideDrawLine,
      mapRegion.latitude,
      mapRegion.longitude,
      pressSvgFreehandTool,
      pressSvgHisyouTool,
      pressSvgPlotTool,
    ]
  );

  const moveSvgView = useCallback(
    (event: GestureResponderEvent) => {
      if (!event.nativeEvent.touches.length) return;
      //console.log('##', gesture.numberActiveTouches);
      const pXY: Position = [event.nativeEvent.pageX + offset.current[0], event.nativeEvent.pageY + offset.current[1]];

      if (currentDrawTool === 'MOVE' || isInfoTool(currentDrawTool)) {
        if (movingMapCenter.current === undefined) return;
        isDrag.current = true;
        const longitude =
          movingMapCenter.current.longitude -
          (mapRegion.longitudeDelta * (pXY[0] - movingMapCenter.current.x)) / mapSize.width;

        const latitude =
          movingMapCenter.current.latitude +
          (mapRegion.latitudeDelta * (pXY[1] - movingMapCenter.current.y)) / mapSize.height;
        if (Platform.OS === 'web') {
          const mapView = (mapViewRef as MapRef).getMap();
          mapView.easeTo({ center: [longitude, latitude], animate: false });
        } else {
          (mapViewRef as MapView).setCamera({ center: { latitude, longitude } });
        }
      } else if (currentDrawTool === 'SELECT') {
        selectLine.current = [...selectLine.current, pXY];
      } else if (currentDrawTool === 'PLOT_POINT' || currentDrawTool === 'PLOT_POLYGON') {
        moveSvgPlotTool(pXY);
      } else if (isLineTool(currentDrawTool) || currentDrawTool === 'FREEHAND_POLYGON') {
        moveSvgFreehandTool(pXY);
      } else if (isHisyouTool(currentDrawTool)) {
        moveSvgHisyouTool(pXY);
      }
      setRedraw(uuidv4());
    },
    [
      currentDrawTool,
      mapRegion.latitudeDelta,
      mapRegion.longitudeDelta,
      mapSize.height,
      mapSize.width,
      mapViewRef,
      moveSvgFreehandTool,
      moveSvgHisyouTool,
      moveSvgPlotTool,
    ]
  );

  const releaseSVGSelectionTool = useCallback(() => {
    //選択処理

    const { editingLayer, editingRecordSet } = getEditingLayerAndRecordSet(featureButton);
    if (editingLayer === undefined) return;
    const { isOK } = checkRecordEditable(editingLayer);
    if (!isOK) return;
    const selectLineCoords = xyArrayToLatLonArray(selectLine.current, mapRegion, mapSize);
    // let features: PointRecordType[] | LineRecordType[] | PolygonRecordType[] = [];
    // let feature: PointRecordType | LineRecordType | PolygonRecordType | undefined;
    if (featureButton === 'POINT') {
      let features;
      if (selectLineCoords.length > 1) {
        features = selectPointFeaturesByArea(editingRecordSet as PointRecordType[], selectLineCoords);
      } else {
        const radius = calcDegreeRadius(1000, mapRegion, mapSize);
        const feature = selectPointFeatureByLatLon(editingRecordSet as PointRecordType[], selectLineCoords[0], radius);
        features = feature !== undefined ? [feature] : [];
      }
      if (features.length === 0) {
        resetDrawTools();
        setRedraw(uuidv4());
        return;
      }
      convertPointFeatureToDrawLine(features);
    } else if (featureButton === 'LINE') {
      let features;
      if (selectLineCoords.length > 1) {
        features = selectLineFeaturesByArea(editingRecordSet as LineRecordType[], selectLineCoords);
      } else {
        const radius = calcDegreeRadius(500, mapRegion, mapSize);
        const feature = selectLineFeatureByLatLon(editingRecordSet as LineRecordType[], selectLineCoords[0], radius);
        features = feature !== undefined ? [feature] : [];
      }
      if (features.length === 0) {
        resetDrawTools();
        setRedraw(uuidv4());
        return;
      }
      if (isHisyouToolActive) {
        convertFeatureToHisyouLine(features);
      } else {
        convertLineFeatureToDrawLine(features);
      }
    } else if (featureButton === 'POLYGON') {
      let features;
      if (selectLineCoords.length > 1) {
        features = selectPolygonFeaturesByArea(editingRecordSet as PolygonRecordType[], selectLineCoords);
      } else {
        const radius = calcDegreeRadius(500, mapRegion, mapSize);
        const feature = selectPolygonFeatureByLatLon(
          editingRecordSet as PolygonRecordType[],
          selectLineCoords[0],
          radius
        );
        features = feature !== undefined ? [feature] : [];
      }

      if (features.length === 0) {
        resetDrawTools();
        setRedraw(uuidv4());
        return;
      }
      convertPolygonFeatureToDrawLine(features);
    }
    unselectRecord();
    undoLine.current.push({ index: -1, latlon: [] });
    selectLine.current = [];
  }, [
    checkRecordEditable,
    convertFeatureToHisyouLine,
    convertLineFeatureToDrawLine,
    convertPointFeatureToDrawLine,
    convertPolygonFeatureToDrawLine,
    featureButton,
    getEditingLayerAndRecordSet,
    isHisyouToolActive,
    mapRegion,
    mapSize,
    resetDrawTools,
    unselectRecord,
  ]);

  const releaseSvgView = useCallback(
    (event: GestureResponderEvent) => {
      //console.log('##', gesture.numberActiveTouches);
      const pXY: Position = [event.nativeEvent.pageX + offset.current[0], event.nativeEvent.pageY + offset.current[1]];

      if (currentDrawTool === 'MOVE' || isInfoTool(currentDrawTool)) {
        movingMapCenter.current = undefined;
        //xy座標を更新してsvgを表示
        showDrawLine();
        isDrag.current = false;
      } else if (currentDrawTool === 'SELECT') {
        releaseSVGSelectionTool();
      } else if (currentDrawTool === 'PLOT_POINT' || currentDrawTool === 'PLOT_POLYGON') {
        releaseSvgPlotTool(pXY);
        if (drawLine.current.length > 0) isEditingLine.current = true;
      } else if (isLineTool(currentDrawTool) || currentDrawTool === 'FREEHAND_POLYGON') {
        releaseSvgFreehandTool();
        if (drawLine.current.length > 0) isEditingLine.current = true;
      } else if (isHisyouTool(currentDrawTool)) {
        releaseSvgHisyouTool();
        if (drawLine.current.length > 0) isEditingLine.current = true;
      }

      setRedraw(uuidv4());
    },
    [
      currentDrawTool,
      releaseSVGSelectionTool,
      releaseSvgFreehandTool,
      releaseSvgHisyouTool,
      releaseSvgPlotTool,
      showDrawLine,
    ]
  );

  const deleteDraw = useCallback(() => {
    const { editingLayer } = getEditingLayerAndRecordSet(featureButton);
    if (editingLayer === undefined) {
      return { isOK: false, message: t('hooks.message.noLayerToEdit') };
    }
    const { isOK, message } = checkRecordEditable(editingLayer);

    if (!isOK) {
      return { isOK: false, message };
    }
    deleteDrawRecord(editingLayer.id);
    if (isHisyouToolActive) {
      deleteHisyouLine();
    }
    resetDrawTools();
    setDrawTool('NONE');
    return { isOK: true, message: '' };
  }, [
    checkRecordEditable,
    deleteDrawRecord,
    deleteHisyouLine,
    featureButton,
    getEditingLayerAndRecordSet,
    isHisyouToolActive,
    resetDrawTools,
  ]);

  const undoDraw = useCallback(() => {
    const undo = undoLine.current.pop();

    //undo.indexが-1の時(選択時)はリセットする
    if (undo === undefined) return;
    if (undo.index === -1) {
      //追加の場合
      drawLine.current.pop();
    } else {
      //修正の場合
      drawLine.current[undo.index].xy = latLonArrayToXYArray(undo.latlon, mapRegion, mapSize);
      drawLine.current[undo.index].latlon = undo.latlon;
    }
    if (undoLine.current.length === 0) {
      resetDrawTools();
      setDrawTool('NONE');
    }

    setRedraw(uuidv4());
  }, [resetDrawTools, mapRegion, mapSize]);

  const toggleTerrainForWeb = useCallback(
    (value: FeatureButtonType) => {
      if (Platform.OS !== 'web' || mapViewRef === null) return;
      const mapView = (mapViewRef as MapRef).getMap();
      if (value === 'NONE') {
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
    if (drawLine.current.length > 0 && movingMapCenter.current === undefined) {
      //console.log('redraw', dayjs());
      drawLine.current.forEach(
        (line, idx) => (drawLine.current[idx] = { ...line, xy: latLonArrayToXYArray(line.latlon, mapRegion, mapSize) })
      );
      setRedraw(uuidv4());
    }
  }, [mapRegion, mapSize]);

  return {
    isEditingLine: isEditingLine.current,
    isDrag: isDrag.current,
    currentDrawTool,
    drawLine,
    editingLine,
    selectLine,
    featureButton,
    deleteDraw,
    undoDraw,
    savePoint,
    saveLine,
    savePolygon,
    setDrawTool,
    setFeatureButton,
    pressSvgView,
    moveSvgView,
    releaseSvgView,
    selectSingleFeature,
    resetDrawTools,
    hideDrawLine,
    showDrawLine,
    toggleTerrainForWeb,
  } as const;
};
