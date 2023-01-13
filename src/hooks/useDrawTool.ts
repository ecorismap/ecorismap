import { useCallback, useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, Platform } from 'react-native';
import { useDispatch } from 'react-redux';
import MapView from 'react-native-maps';
import { Position } from '@turf/turf';
import * as turf from '@turf/turf';
import { v4 as uuidv4 } from 'uuid';
import { t } from '../i18n/config';
import { FeatureButtonType, LayerType, LineRecordType, LineToolType, RecordType } from '../types';
import {
  latLonObjectsToLatLonArray,
  latLonObjectsToXYArray,
  calcDegreeRadius,
  latlonArrayToLatLonObjects,
  latLonArrayToXYArray,
  selectFeatureByLatLon,
  selectFeaturesByArea,
  xyArrayToLatLonArray,
  xyToLatLon,
} from '../utils/Coords';
import { useWindow } from './useWindow';
import { addRecordsAction, updateRecordsAction, deleteRecordsAction } from '../modules/dataSet';
import { useHisyouTool } from '../plugins/hisyoutool/useHisyouTool';
import { useHisyouToolSetting } from '../plugins/hisyoutool/useHisyouToolSetting';
import { isDrawTool } from '../utils/General';
import { isHisyouTool } from '../plugins/hisyoutool/utils';
import { MapRef } from 'react-map-gl';
import { useLineTool } from './useLineTool';
import { editSettingsAction } from '../modules/settings';
import { useFeature } from './useFeature';

export type UseDrawToolReturnType = {
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
  currentLineTool: LineToolType;
  setLineTool: React.Dispatch<React.SetStateAction<LineToolType>>;
  convertFeatureToDrawLine: (features: LineRecordType[]) => void;
  deleteDrawLine: (layerId: string) => void;
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

  hideDrawLine: () => void;
  showDrawLine: () => void;
  toggleTerrainForWeb: (value: FeatureButtonType) => void;
};

export const useDrawTool = (mapViewRef: MapView | MapRef | null): UseDrawToolReturnType => {
  const dispatch = useDispatch();
  const [currentLineTool, setLineTool] = useState<LineToolType>('NONE');

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
  const offset = useRef([0, 0]);
  const movingMapCenter = useRef<{ x: number; y: number; longitude: number; latitude: number } | undefined>(undefined);

  const { mapSize, mapRegion } = useWindow();

  const { dataUser, checkEditable, getEditingLayerAndRecordSet, generateLineRecord } = useFeature();
  const { pressSvgDrawTool, moveSvgDrawTool, releaseSvgDrawTool } = useLineTool(
    drawLine,
    editingLine,
    undoLine,
    modifiedIndex,
    currentLineTool
  );
  const {
    pressSvgHisyouTool,
    moveSvgHisyouTool,
    releaseSvgHisyouTool,
    saveHisyou,
    convertFeatureToHisyouLine,
    deleteHisyouLine,
  } = useHisyouTool(currentLineTool, modifiedIndex, drawLine, editingLine, undoLine);
  const { isHisyouToolActive } = useHisyouToolSetting();

  const convertFeatureToDrawLine = useCallback(
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

  const deleteDrawLine = useCallback(
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
      resetLineTools();
      setRedraw(uuidv4());
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

      if (feature === undefined) {
        return { layer: undefined, feature: undefined };
      }
      if (isHisyouToolActive) convertFeatureToHisyouLine([feature]);

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
    currentLineTool,
    drawLine,
    editingLine,
    selectLine,
    deleteLine,
    undoEditLine,
    saveLine,
    setLineTool,
    convertFeatureToDrawLine,
    deleteDrawLine,
    pressSvgView,
    moveSvgView,
    releaseSvgView,
    selectSingleFeature,
    resetLineTools,
    hideDrawLine,
    showDrawLine,
    toggleTerrainForWeb,
  } as const;
};
