import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { v4 as uuidv4 } from 'uuid';
import * as turf from '@turf/turf';
import { GestureResponderEvent, Platform } from 'react-native';
import { useCallback, useRef, useState } from 'react';
import {
  DataType,
  FeatureButtonType,
  FeatureType,
  LayerType,
  LineRecordType,
  LineToolType,
  PointToolType,
  PolygonToolType,
  RecordType,
} from '../types';

import { addRecordsAction, updateRecordsAction } from '../modules/dataSet';
import { editSettingsAction } from '../modules/settings';
import MapView, { LatLng, MapEvent } from 'react-native-maps';
import {
  calcDegreeRadius,
  latlonArrayToLatLonObjects,
  latLonArrayToXYArray,
  selectFeatureByLatLon,
  selectFeaturesByArea,
  xyArrayToLatLonArray,
  xyToLatLon,
} from '../utils/Coords';

import * as Location from 'expo-location';
import { toLocationType } from '../utils/Location';
import { MapRef } from 'react-map-gl';
import { Position } from '@turf/turf';
import { t } from '../i18n/config';
import { useWindow } from './useWindow';
import { isHisyouTool } from '../plugins/hisyoutool/utils';
import { useHisyouTool } from '../plugins/hisyoutool/useHisyouTool';
import { useDrawTool } from './useDrawTool';
import { useFeatureEdit } from './useFeatureEdit';
import { isDrawTool } from '../utils/General';
import { useHisyouToolSetting } from '../plugins/hisyoutool/useHisyouToolSetting';

export type UseFeatureReturnType = {
  layers: LayerType[];
  projectId: string | undefined;
  pointDataSet: DataType[];
  lineDataSet: DataType[];
  polygonDataSet: DataType[];
  isEditingLine: boolean;
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
  pointTool: PointToolType;
  currentLineTool: LineToolType;
  polygonTool: PolygonToolType;
  featureButton: FeatureButtonType;
  selectedRecord:
    | {
        layerId: string;
        record: RecordType;
      }
    | undefined;
  addTrack: () => {
    isOK: boolean;
    message: string;
  };
  addCurrentPoint: () => Promise<{
    isOK: boolean;
    message: string;
    layer: LayerType | undefined;
    data: RecordType | undefined;
  }>;
  addPressPoint: (e: MapEvent<{}>) => {
    isOK: boolean;
    message: string;
    data: RecordType | undefined;
    layer: LayerType | undefined;
  };
  findRecord: (
    layerId: string,
    userId: string | undefined,
    recordId: string,
    type: FeatureType
  ) => RecordType | undefined;
  deselectFeature: () => void;
  setPointTool: React.Dispatch<React.SetStateAction<PointToolType>>;
  setLineTool: React.Dispatch<React.SetStateAction<LineToolType>>;
  setPolygonTool: React.Dispatch<React.SetStateAction<PolygonToolType>>;
  dragEndPoint: (
    layer: LayerType,
    feature: RecordType,
    coordinate: LatLng
  ) => {
    isOK: boolean;
    message: string;
  };
  toggleTerrainForWeb: (value: FeatureButtonType) => void;
  setFeatureButton: React.Dispatch<React.SetStateAction<FeatureButtonType>>;
  saveLine: () => {
    isOK: boolean;
    message: string;
    layer: LayerType | undefined;
    data: RecordType | undefined;
  };
  deleteLine: () => {
    isOK: boolean;
    message: string;
  };
  undoEditLine: () => void;
  pressSvgView: (event: GestureResponderEvent) => void;
  moveSvgView: (event: GestureResponderEvent) => void;
  releaseSvgView: () => void;
  selectSingleFeature: (event: GestureResponderEvent) =>
    | {
        layer: undefined;
        feature: undefined;
      }
    | {
        layer: LayerType;
        feature: LineRecordType;
      };
  resetLineTools: () => void;
  resetPointPosition: (editingLayer: LayerType, feature: RecordType) => void;
  hideDrawLine: () => void;
  showDrawLine: () => void;
};

export const useFeature = (mapViewRef: MapView | MapRef | null): UseFeatureReturnType => {
  const dispatch = useDispatch();
  const [pointTool, setPointTool] = useState<PointToolType>('NONE');
  const [currentLineTool, setLineTool] = useState<LineToolType>('NONE');
  const [polygonTool, setPolygonTool] = useState<PolygonToolType>('NONE');
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
  const selectLine = useRef<Position[]>([]);
  const undoLine = useRef<{ index: number; latlon: Position[] }[]>([]);
  const isEditingLine = useRef(false);
  const modifiedIndex = useRef(-1);
  const offset = useRef([0, 0]);
  const movingMapCenter = useRef<{ x: number; y: number; longitude: number; latitude: number } | undefined>(undefined);

  const layers = useSelector((state: AppState) => state.layers);
  const projectId = useSelector((state: AppState) => state.settings.projectId);

  const pointDataSet = useSelector((state: AppState) =>
    layers.map((layer) => (layer.type === 'POINT' ? state.dataSet.filter((v) => v.layerId === layer.id) : [])).flat()
  );
  const lineDataSet = useSelector((state: AppState) =>
    layers.map((layer) => (layer.type === 'LINE' ? state.dataSet.filter((v) => v.layerId === layer.id) : [])).flat()
  );
  const polygonDataSet = useSelector((state: AppState) =>
    layers.map((layer) => (layer.type === 'POLYGON' ? state.dataSet.filter((v) => v.layerId === layer.id) : [])).flat()
  );
  const [featureButton, setFeatureButton] = useState<FeatureButtonType>('NONE');
  const selectedRecord = useSelector((state: AppState) => state.settings.selectedRecord);

  const { mapSize, mapRegion } = useWindow();
  const { pressSvgDrawTool, moveSvgDrawTool, releaseSvgDrawTool, convertFeatureToDrawLine, deleteDrawLine } =
    useDrawTool(currentLineTool, modifiedIndex, drawLine, editingLine, undoLine);
  const {
    pressSvgHisyouTool,
    moveSvgHisyouTool,
    releaseSvgHisyouTool,
    saveHisyou,
    convertFeatureToHisyouLine,
    deleteHisyouLine,
  } = useHisyouTool(currentLineTool, modifiedIndex, drawLine, editingLine, undoLine);
  const { isHisyouToolActive } = useHisyouToolSetting();
  const {
    dataUser,
    addFeature,
    checkEditable,
    getEditingLayerAndRecordSet,
    resetPointPosition,
    updatePointPosition,
    generateLineRecord,
  } = useFeatureEdit();
  const deselectFeature = useCallback(() => {
    dispatch(editSettingsAction({ selectedRecord: undefined }));
  }, [dispatch]);

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

  const findRecord = useCallback(
    (layerId: string, userId: string | undefined, recordId: string, type: FeatureType) => {
      const dataSet =
        type === 'POINT'
          ? pointDataSet
          : type === 'LINE'
          ? lineDataSet
          : type === 'POLYGON'
          ? polygonDataSet
          : undefined;
      if (dataSet === undefined) return undefined;
      const dataIndex = dataSet.findIndex((d) => d.layerId === layerId && d.userId === userId);
      if (dataIndex !== -1) {
        const record = dataSet[dataIndex].data.find((n) => n.id === recordId);
        if (record !== undefined) {
          return record;
        }
      }
      return undefined;
    },
    [lineDataSet, pointDataSet, polygonDataSet]
  );

  const addCurrentPoint = useCallback(async () => {
    const location = await Location.getLastKnownPositionAsync();
    if (location === null) {
      return { isOK: false, message: t('hooks.message.turnOnGPS'), layer: undefined, data: undefined };
    }
    return addFeature('POINT', toLocationType(location)!);
  }, [addFeature]);

  const addPressPoint = useCallback(
    (e: MapEvent<{}>) => {
      const location = {
        //@ts-ignore
        latitude: e.nativeEvent ? e.nativeEvent.coordinate.latitude : e.latLng.lat(),
        //@ts-ignore
        longitude: e.nativeEvent ? e.nativeEvent.coordinate.longitude : e.latLng.lng(),
      };
      return addFeature('POINT', location);
    },
    [addFeature]
  );

  const addTrack = useCallback(() => {
    return addFeature('LINE', [], true);
  }, [addFeature]);

  const dragEndPoint = useCallback(
    (layer: LayerType, feature: RecordType, coordinate: LatLng) => {
      const { editingLayer } = getEditingLayerAndRecordSet('POINT');
      if (editingLayer === undefined) {
        resetPointPosition(layer, feature);
        return { isOK: false, message: t('hooks.message.noEditingLayer') };
      }
      const { isOK, message } = checkEditable(editingLayer, feature);
      if (isOK) {
        updatePointPosition(editingLayer, feature, coordinate);
        return { isOK: true, message: '' };
      } else {
        resetPointPosition(layer, feature);
        return { isOK: false, message };
      }
    },
    [checkEditable, getEditingLayerAndRecordSet, resetPointPosition, updatePointPosition]
  );

  const resetLineTools = useCallback(() => {
    drawLine.current = [];
    editingLine.current = { start: [], xy: [] };
    isEditingLine.current = false;
    modifiedIndex.current = -1;
    selectLine.current = [];
    undoLine.current = [];
  }, []);

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

  const saveLine = useCallback(() => {
    const { editingLayer, editingRecordSet } = getEditingLayerAndRecordSet('LINE');
    if (editingLayer === undefined) {
      return { isOK: false, message: t('hooks.message.noLayerToEdit'), layer: undefined, data: undefined };
    }
    const { isOK, message } = checkEditable(editingLayer);

    if (!isOK) {
      return { isOK: false, message, layer: undefined, data: undefined };
    }

    if (isHisyouToolActive) {
      const { isOK: isOKsaveHisyou, message: messageSaveHisyou } = saveHisyou(editingLayer, editingRecordSet);
      if (!isOKsaveHisyou) return { isOK: false, message: messageSaveHisyou, layer: undefined, data: undefined };
    } else {
      saveDraw(editingLayer, editingRecordSet);
    }
    resetLineTools();
    return { isOK: true, message: '', layer: undefined, data: undefined };
  }, [checkEditable, getEditingLayerAndRecordSet, isHisyouToolActive, resetLineTools, saveDraw, saveHisyou]);

  const selectSingleFeature = useCallback(
    (event: GestureResponderEvent) => {
      //選択処理
      const pXY: Position = [event.nativeEvent.locationX, event.nativeEvent.locationY];
      const { editingLayer, editingRecordSet } = getEditingLayerAndRecordSet('LINE');
      if (editingLayer === undefined) return { layer: undefined, feature: undefined };
      const radius = calcDegreeRadius(500, mapRegion, mapSize);
      // For DeBug
      // selectLine.current = turf
      //   .buffer(turf.point(pointToLatLon(point, mapRegion, mapSize)), radius)
      //   .geometry.coordinates[0].map((d) => latLonToPoint(d, mapRegion, mapSize));
      // setRedraw(uuidv4());
      const feature = selectFeatureByLatLon(
        editingRecordSet as LineRecordType[],
        xyToLatLon(pXY, mapRegion, mapSize),
        radius
      );

      if (isHisyouToolActive) {
        if (feature === undefined) {
          resetLineTools();
          setRedraw(uuidv4());
        } else {
          convertFeatureToHisyouLine([feature]);
        }
      }
      if (feature === undefined) {
        return { layer: undefined, feature: undefined };
      }

      return { layer: editingLayer, feature: feature };
    },
    [convertFeatureToHisyouLine, getEditingLayerAndRecordSet, isHisyouToolActive, mapRegion, mapSize, resetLineTools]
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

      if (currentLineTool === 'MOVE') {
        movingMapCenter.current = {
          x: pXY[0],
          y: pXY[1],
          longitude: mapRegion.longitude,
          latitude: mapRegion.latitude,
        };
        //xyを消してsvgの描画を止める。表示のタイムラグがでるため
        hideDrawLine();
      } else if (currentLineTool === 'SELECT') {
        // //選択解除
        modifiedIndex.current = -1;
        drawLine.current = [];
        selectLine.current = [pXY];
      } else if (isDrawTool(currentLineTool)) {
        pressSvgDrawTool(pXY);
      } else if (isHisyouTool(currentLineTool)) {
        pressSvgHisyouTool(pXY);
      }
    },
    [currentLineTool, hideDrawLine, mapRegion.latitude, mapRegion.longitude, pressSvgDrawTool, pressSvgHisyouTool]
  );

  const moveSvgView = useCallback(
    (event: GestureResponderEvent) => {
      if (!event.nativeEvent.touches.length) return;
      //console.log('##', gesture.numberActiveTouches);
      const pXY: Position = [event.nativeEvent.pageX + offset.current[0], event.nativeEvent.pageY + offset.current[1]];

      if (currentLineTool === 'MOVE') {
        if (movingMapCenter.current === undefined) return;

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
      } else if (currentLineTool === 'SELECT') {
        selectLine.current = [...selectLine.current, pXY];
      } else if (isDrawTool(currentLineTool)) {
        moveSvgDrawTool(pXY);
      } else if (isHisyouTool(currentLineTool)) {
        moveSvgHisyouTool(pXY);
      }
      setRedraw(uuidv4());
    },
    [
      currentLineTool,
      mapRegion.latitudeDelta,
      mapRegion.longitudeDelta,
      mapSize.height,
      mapSize.width,
      mapViewRef,
      moveSvgDrawTool,
      moveSvgHisyouTool,
    ]
  );

  const releaseSVGSelectionTool = useCallback(() => {
    //選択処理
    const { editingLayer, editingRecordSet } = getEditingLayerAndRecordSet('LINE');
    if (editingLayer === undefined) return;
    const { isOK } = checkEditable(editingLayer);
    if (!isOK) return;
    const selectLineCoords = xyArrayToLatLonArray(selectLine.current, mapRegion, mapSize);
    let features: LineRecordType[] = [];
    if (selectLineCoords.length === 1) {
      const radius = calcDegreeRadius(500, mapRegion, mapSize);
      const feature = selectFeatureByLatLon(editingRecordSet as LineRecordType[], selectLineCoords[0], radius);
      if (feature === undefined) {
        features = [];
      } else {
        features = [feature];
      }
    } else {
      features = selectFeaturesByArea(editingRecordSet as LineRecordType[], selectLineCoords);
    }

    if (isHisyouToolActive) {
      convertFeatureToHisyouLine(features);
    } else {
      convertFeatureToDrawLine(features);
    }
    if (features.length === 0) {
      resetLineTools();
      setRedraw(uuidv4());
      return;
    }
    undoLine.current.push({ index: -1, latlon: [] });
    selectLine.current = [];
  }, [
    checkEditable,
    convertFeatureToDrawLine,
    convertFeatureToHisyouLine,
    getEditingLayerAndRecordSet,
    isHisyouToolActive,
    mapRegion,
    mapSize,
    resetLineTools,
  ]);

  const releaseSvgView = useCallback(() => {
    //const AVERAGE_UNIT = 8;
    if (currentLineTool === 'MOVE') {
      movingMapCenter.current = undefined;
      //xy座標を更新してsvgを表示
      showDrawLine();
    } else if (currentLineTool === 'SELECT') {
      releaseSVGSelectionTool();
    } else if (isDrawTool(currentLineTool)) {
      releaseSvgDrawTool();
      if (drawLine.current.length > 0) isEditingLine.current = true;
    } else if (isHisyouTool(currentLineTool)) {
      releaseSvgHisyouTool();
      if (drawLine.current.length > 0) isEditingLine.current = true;
    }

    setRedraw(uuidv4());
  }, [currentLineTool, releaseSVGSelectionTool, releaseSvgDrawTool, releaseSvgHisyouTool, showDrawLine]);

  const deleteLine = useCallback(() => {
    const { editingLayer } = getEditingLayerAndRecordSet('LINE');
    if (editingLayer === undefined) {
      return { isOK: false, message: t('hooks.message.noLayerToEdit') };
    }
    const { isOK, message } = checkEditable(editingLayer);

    if (!isOK) {
      return { isOK: false, message };
    }
    deleteDrawLine(editingLayer.id);
    if (isHisyouToolActive) {
      deleteHisyouLine();
    }
    resetLineTools();
    setLineTool('NONE');
    return { isOK: true, message: '' };
  }, [
    checkEditable,
    deleteDrawLine,
    deleteHisyouLine,
    getEditingLayerAndRecordSet,
    isHisyouToolActive,
    resetLineTools,
  ]);

  const undoEditLine = useCallback(() => {
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
      resetLineTools();
      setLineTool('NONE');
    }

    setRedraw(uuidv4());
  }, [resetLineTools, mapRegion, mapSize]);

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
    layers,
    projectId,
    pointDataSet,
    lineDataSet,
    polygonDataSet,
    isEditingLine: isEditingLine.current,
    pointTool,
    currentLineTool,
    polygonTool,
    featureButton,
    selectedRecord,
    drawLine,
    editingLine,
    selectLine,
    addCurrentPoint,
    addPressPoint,
    addTrack,
    saveLine,
    deleteLine,
    undoEditLine,
    findRecord,
    deselectFeature,
    setPointTool,
    setLineTool,
    setPolygonTool,
    setFeatureButton,
    dragEndPoint,
    toggleTerrainForWeb,
    pressSvgView,
    moveSvgView,
    releaseSvgView,
    selectSingleFeature,
    resetLineTools,
    resetPointPosition,
    hideDrawLine,
    showDrawLine,
  } as const;
};
