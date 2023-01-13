import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { v4 as uuidv4 } from 'uuid';
import * as turf from '@turf/turf';
import {
  GestureResponderEvent,
  PanResponder,
  PanResponderInstance,
  Platform,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DataType,
  DrawLineToolType,
  FeatureButtonType,
  FeatureType,
  LayerType,
  LineToolType,
  LocationType,
  PointToolType,
  PolygonToolType,
  RecordType,
} from '../types';

import { addRecordsAction, deleteRecordsAction, updateRecordsAction } from '../modules/dataSet';
import { editSettingsAction } from '../modules/settings';
import MapView, { LatLng, MapEvent } from 'react-native-maps';
import { cloneDeep } from 'lodash';
import { computeMovingAverage, isPoint, locationToPoints, pointsToLocation } from '../utils/Coords';
import { getLayerSerial } from '../utils/Layer';
import { getDefaultFieldObject } from '../utils/Data';

import * as Location from 'expo-location';
import { toLocationType } from '../utils/Location';
import { MapRef } from 'react-map-gl';
import { hasOpened } from '../utils/Project';
import { Position } from '@turf/turf';
import { isDrawTool } from '../utils/General';
import { updateLayerAction } from '../modules/layers';
import { useDisplay } from './useDisplay';
import { t } from '../i18n/config';

export type UseFeatureReturnType = {
  mapViewRef: React.MutableRefObject<MapView | MapRef | null>;
  layers: LayerType[];
  projectId: string | undefined;
  pointDataSet: DataType[];
  lineDataSet: DataType[];
  polygonDataSet: DataType[];
  isEdited: React.MutableRefObject<boolean>;
  drawLine: React.MutableRefObject<
    {
      id: string;
      coords: Position[];
      properties: (DrawLineToolType | '')[];
      arrow: number;
    }[]
  >;
  modifiedLine: React.MutableRefObject<{
    start: turf.helpers.Position;
    coords: Position[];
  }>;
  pointTool: PointToolType;
  lineTool: LineToolType;
  drawLineTool: DrawLineToolType;
  polygonTool: PolygonToolType;
  featureButton: FeatureButtonType;
  selectedRecord: {
    layerId: string;
    record: RecordType | undefined;
  };
  hisyouzuToolEnabled: boolean;
  panResponder: PanResponderInstance;
  drawToolsSettings: { hisyouzuTool: { active: boolean; layerId: string | undefined } };

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
  setSelectedFeatureAndRecord: (data: { layerId: string; record: RecordType | undefined }) => void;
  setPointTool: React.Dispatch<React.SetStateAction<PointToolType>>;
  setLineTool: React.Dispatch<React.SetStateAction<LineToolType>>;
  setDrawLineTool: React.Dispatch<React.SetStateAction<DrawLineToolType>>;
  setPolygonTool: React.Dispatch<React.SetStateAction<PolygonToolType>>;
  dragEndPoint: (
    layer: LayerType,
    feature: RecordType,
    coordinate: LatLng,
    shouldUpdate: boolean
  ) => {
    isOK: boolean;
    message: string;
  };
  changeEditMapStyle: (value: FeatureButtonType) => void;
  setFeatureButton: React.Dispatch<React.SetStateAction<FeatureButtonType>>;
  saveLine: () => {
    isOK: boolean;
    message: string;
    layer: LayerType | undefined;
    data: RecordType | undefined;
  };
  deleteLine: () => void;
  clearDrawLines: () => void;
  convertFeatureToDrawLine: (feature: RecordType) => void;
  undoEditLine: () => void;
  updateDrawToolsSettings: (settings: {
    hisyouzuTool: {
      active: boolean;
      layerId: string | undefined;
    };
  }) => {
    isOK: boolean;
    message: string;
  };
};

export const useFeature = (): UseFeatureReturnType => {
  const dispatch = useDispatch();
  const window = useWindowDimensions();
  const user = useSelector((state: AppState) => state.user);
  const mapRegion = useSelector((state: AppState) => state.settings.mapRegion);
  const [pointTool, setPointTool] = useState<PointToolType>('NONE');
  const [lineTool, setLineTool] = useState<LineToolType>('NONE');
  const [drawLineTool, setDrawLineTool] = useState<DrawLineToolType>('DRAW');
  const [polygonTool, setPolygonTool] = useState<PolygonToolType>('NONE');
  const [drawLineLatLng, setDrawLineLatLng] = useState<LocationType[]>([]);
  const [, setRedraw] = useState('');
  const drawLine = useRef<{ id: string; coords: Position[]; properties: (DrawLineToolType | '')[]; arrow: number }[]>([
    { id: '', coords: [], properties: [], arrow: 0 },
  ]);
  const modifiedLine = useRef<{ start: Position; coords: Position[] }>({ start: [], coords: [] });
  const undoLine = useRef<LocationType[]>([]);
  const isEdited = useRef(false);
  const movingMapCenter = useRef<{ x: number; y: number; longitude: number; latitude: number } | undefined>(undefined);
  const role = useSelector((state: AppState) => state.settings.role);
  const isSettingProject = useSelector((state: AppState) => state.settings.isSettingProject);
  const layers = useSelector((state: AppState) => state.layers);
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const drawToolsSettings = useSelector((state: AppState) => state.settings.drawTools);

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

  const mapViewRef = useRef<MapView | MapRef | null>(null);

  const isOwnerAdmin = useMemo(() => role === 'OWNER' || role === 'ADMIN', [role]);
  const activePointLayer = useMemo(() => layers.find((d) => d.active && d.type === 'POINT'), [layers]);
  const activeLineLayer = useMemo(() => layers.find((d) => d.active && d.type === 'LINE'), [layers]);
  const activePolygonLayer = useMemo(() => layers.find((d) => d.active && d.type === 'POLYGON'), [layers]);

  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );
  const { isDataOpened } = useDisplay();

  const screenParam = useMemo(() => {
    if (Platform.OS === 'web' && mapViewRef.current && isDataOpened) {
      const mapView = (mapViewRef.current as MapRef).getMap();
      const width = mapView.getContainer().offsetWidth;
      const height = mapView.getContainer().offsetHeight;

      const param = {
        latitude: mapRegion.latitude,
        longitude: mapRegion.longitude,
        latitudeDelta: mapRegion.latitudeDelta,
        longitudeDelta: mapRegion.longitudeDelta,
        width,
        height,
      };
      //console.log('##param##', param);
      return param;
    } else {
      //simulatorのStatus Barの挙動がおかしい？実機ならStatusBarを引かなくても良い。
      const windowHeight =
        StatusBar.currentHeight && Platform.OS === 'android' && Platform.Version < 30
          ? window.height - StatusBar.currentHeight
          : window.height;

      //const windowHeight = window.height;
      const param = {
        latitude: mapRegion.latitude,
        longitude: mapRegion.longitude,
        latitudeDelta: mapRegion.latitudeDelta,
        longitudeDelta: mapRegion.longitudeDelta,
        height: isDataOpened === 'expanded' ? 0 : isDataOpened === 'opened' ? windowHeight / 2 : windowHeight,
        //height: screenData.height,
        width: window.width,
      };
      //console.log('##param##', param);
      return param;
    }
  }, [
    isDataOpened,
    mapRegion.latitude,
    mapRegion.latitudeDelta,
    mapRegion.longitude,
    mapRegion.longitudeDelta,
    window.height,
    window.width,
  ]);

  const hisyouzuToolEnabled = useMemo(() => {
    const hisyouzuTool = drawToolsSettings.hisyouzuTool;
    if (!hisyouzuTool.active) return false;
    if (hisyouzuTool.layerId === undefined) return false;
    const actionLayer = layers.find((layer) => layer.id === hisyouzuTool.layerId);
    if (actionLayer === undefined) return false;
    const fieldNames = actionLayer.field.map((f) => f.name);
    if (!fieldNames.includes('飛翔凡例')) return false;
    if (!fieldNames.includes('消失')) return false;
    return true;
  }, [drawToolsSettings, layers]);

  const [selectedFeature, setSelectedFeature] = useState<{ layerId: string; record: RecordType | undefined }>({
    layerId: '',
    record: undefined,
  });

  const setSelectedFeatureAndRecord = useCallback(
    (data: { layerId: string; record: RecordType | undefined }) => {
      dispatch(editSettingsAction({ selectedRecord: data }));
      setSelectedFeature(data);
    },
    [dispatch]
  );

  const updateDrawToolsSettings = useCallback(
    (settings: { hisyouzuTool: { active: boolean; layerId: string | undefined } }) => {
      if (hasOpened(projectId) && !isOwnerAdmin) {
        return { isOK: false, message: t('hooks.message.onlyAdminCanEdit') };
      }
      if (hasOpened(projectId) && isOwnerAdmin && !isSettingProject) {
        return { isOK: false, message: t('hooks.message.lockProject') };
      }
      dispatch(editSettingsAction({ drawTools: settings }));
      const hisyouzuLayer = layers.find((layer) => layer.id === settings.hisyouzuTool.layerId);
      if (hisyouzuLayer !== undefined) {
        dispatch(updateLayerAction({ ...hisyouzuLayer, visible: false }));
      }
      return { isOK: true, message: '' };
    },
    [dispatch, isSettingProject, isOwnerAdmin, layers, projectId]
  );

  const getEditingLayerAndRecordSet = useCallback(
    (type: FeatureType) => {
      let editingLayer: LayerType | undefined;
      let dataSet: DataType[] = [];
      if (type === 'POINT') {
        editingLayer = activePointLayer;
        dataSet = pointDataSet;
      } else if (type === 'LINE') {
        editingLayer = activeLineLayer;
        dataSet = lineDataSet;
      } else if (type === 'POLYGON') {
        editingLayer = activePolygonLayer;
        dataSet = polygonDataSet;
      }
      const editingData = dataSet.find((d) => d.layerId === editingLayer?.id && d.userId === dataUser.uid);
      const editingRecordSet = editingData !== undefined ? editingData.data : [];

      return { editingLayer, editingRecordSet };
    },
    [activeLineLayer, activePointLayer, activePolygonLayer, dataUser.uid, lineDataSet, pointDataSet, polygonDataSet]
  );

  const changeEditMapStyle = useCallback(
    (value: FeatureButtonType) => {
      if (Platform.OS !== 'web') return;
      const mapView = (mapViewRef.current as MapRef).getMap();
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

  const checkEditable = useCallback(
    (editingLayer: LayerType, feature?: RecordType) => {
      //コモンレイヤでメンバー（ログインしているがオーナー＆管理者でない）
      if (editingLayer.permission === 'COMMON' && hasOpened(projectId) && !isOwnerAdmin) {
        return { isOK: false, message: t('hooks.message.noPermissionToCommon') };
      }
      //コモンレイヤでオーナー＆管理者だがロックしている
      if (editingLayer.permission === 'COMMON' && hasOpened(projectId) && isOwnerAdmin && !isSettingProject) {
        return { isOK: false, message: t('hooks.message.unlockToEditCommon') };
      }
      //データのチェックもする場合
      if (feature !== undefined) {
        //パブリック、パーソナルデータでメンバーで自分以外のデータ
        if (
          editingLayer.permission !== 'COMMON' &&
          hasOpened(projectId) &&
          !isOwnerAdmin &&
          dataUser.uid !== feature.userId
        ) {
          return { isOK: false, message: t('hooks.message.cannotEditOthers') };
        }
        //パブリック、パーソナルデータでオーナー＆管理者だが自分以外のデータで調査モード
        //ToDo 調査モード
        const workInProgress = true;
        if (editingLayer.permission !== 'COMMON' && isOwnerAdmin && workInProgress && dataUser.uid !== feature.userId) {
          return { isOK: false, message: t('hooks.message.cannotEditOthersInWork') };
        }
      }
      return { isOK: true, message: '' };
    },
    [dataUser.uid, isSettingProject, isOwnerAdmin, projectId]
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

  const addFeature = useCallback(
    (
      editingLayer: LayerType,
      editingRecordSet: RecordType[],
      locations: LocationType | LocationType[],
      isTrack = false
    ) => {
      const serial = getLayerSerial(editingLayer, editingRecordSet);

      let newData: RecordType = {
        id: uuidv4(),
        userId: dataUser.uid,
        displayName: dataUser.displayName,
        visible: true,
        redraw: false,
        coords: locations,
        field: {},
      };
      if (editingLayer.type === 'LINE' && Array.isArray(locations)) {
        newData.centroid = locations[0];
      }

      const field = editingLayer.field
        .map(({ name, format, list, defaultValue }) => getDefaultFieldObject(name, format, list, defaultValue, serial))
        /* @ts-ignore */
        .reduce((obj, userObj) => Object.assign(obj, userObj), {});
      //field['飛翔凡例'] = '飛翔';
      //field['消失'] = 1;
      newData = { ...newData, field: field } as RecordType;

      dispatch(addRecordsAction({ layerId: editingLayer.id, userId: dataUser.uid, data: [newData] }));
      if (isTrack) {
        dispatch(editSettingsAction({ tracking: { layerId: editingLayer.id, dataId: newData.id } }));
      }
      return { isOK: true, data: newData, layer: editingLayer, user: dataUser };
    },
    [dataUser, dispatch]
  );

  const addCurrentPoint = useCallback(async () => {
    const location = await Location.getLastKnownPositionAsync();
    if (location === null) {
      return { isOK: false, message: t('hooks.message.turnOnGPS'), layer: undefined, data: undefined };
    }
    const { editingLayer, editingRecordSet } = getEditingLayerAndRecordSet('POINT');
    if (editingLayer === undefined) {
      return { isOK: false, message: t('hooks.message.noLayerToEdit'), layer: undefined, data: undefined };
    }
    const { isOK, message } = checkEditable(editingLayer);
    if (!isOK) {
      return { isOK: false, message, layer: undefined, data: undefined };
    }
    const result = addFeature(editingLayer, editingRecordSet, toLocationType(location)!);
    return { isOK: true, message: '', layer: result.layer, data: result.data };
  }, [addFeature, checkEditable, getEditingLayerAndRecordSet]);

  const addPressPoint = useCallback(
    (e: MapEvent<{}>) => {
      const { editingLayer, editingRecordSet } = getEditingLayerAndRecordSet('POINT');
      if (editingLayer === undefined) {
        return { isOK: false, message: t('hooks.message.noLayerToEdit'), layer: undefined, data: undefined };
      }

      const { isOK, message } = checkEditable(editingLayer);

      if (!isOK) {
        return { isOK: false, message, layer: undefined, data: undefined };
      }
      const result = addFeature(editingLayer, editingRecordSet, {
        //@ts-ignore
        latitude: e.nativeEvent ? e.nativeEvent.coordinate.latitude : e.latLng.lat(),
        //@ts-ignore
        longitude: e.nativeEvent ? e.nativeEvent.coordinate.longitude : e.latLng.lng(),
      });
      return { isOK: true, message: '', layer: result.layer, data: result.data };
    },
    [addFeature, checkEditable, getEditingLayerAndRecordSet]
  );

  const addTrack = useCallback(() => {
    const { editingLayer, editingRecordSet } = getEditingLayerAndRecordSet('LINE');
    if (editingLayer === undefined) {
      return { isOK: false, message: t('hooks.message.noLayerToEdit') };
    }
    const { isOK, message } = checkEditable(editingLayer);
    if (!isOK) {
      return { isOK: false, message };
    }
    addFeature(editingLayer, editingRecordSet, [], true);
    return { isOK: true, message: '' };
  }, [addFeature, checkEditable, getEditingLayerAndRecordSet]);

  const updatePointPosition = useCallback(
    (editingLayer: LayerType, feature: RecordType, coordinate: LatLng) => {
      const data = cloneDeep(feature);
      if (!isPoint(data.coords)) return;

      data.coords.latitude = coordinate.latitude;
      data.coords.longitude = coordinate.longitude;
      if (data.coords.ele !== undefined) data.coords.ele = undefined;
      dispatch(updateRecordsAction({ layerId: editingLayer.id, userId: dataUser.uid, data: [data] }));
    },
    [dataUser.uid, dispatch]
  );

  const resetPointPosition = useCallback(
    (editingLayer: LayerType, feature: RecordType) => {
      const data = cloneDeep(feature);
      data.redraw = !data.redraw;
      dispatch(
        updateRecordsAction({
          layerId: editingLayer.id,
          userId: feature.userId,
          data: [data],
        })
      );
    },
    [dispatch]
  );

  const dragEndPoint = useCallback(
    (layer: LayerType, feature: RecordType, coordinate: LatLng, shouldUpdate: boolean) => {
      if (!shouldUpdate) {
        resetPointPosition(layer, feature);
        return { isOK: true, message: '' };
      }
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

  const getLineSnappedPosition = useCallback((pos: Position, line: Position[]) => {
    //turfの仕様？でスクリーン座標のままだと正確にスナップ座標を計算しないために、一旦、小さい値（緯度経度的）にして、最後に戻す
    const ADJUST_VALUE = 1000.0;
    const adjustedPt = turf.point([pos[0] / ADJUST_VALUE, pos[1] / ADJUST_VALUE]);
    const adjustedLine = turf.lineString(line.map((d) => [d[0] / ADJUST_VALUE, d[1] / ADJUST_VALUE]));
    const snapped = turf.nearestPointOnLine(adjustedLine, adjustedPt);
    return {
      position: [snapped.geometry.coordinates[0] * ADJUST_VALUE, snapped.geometry.coordinates[1] * ADJUST_VALUE],
      distance: snapped.properties.dist !== undefined ? snapped.properties.dist * ADJUST_VALUE : 999999,
      index: snapped.properties.index ?? -1,
      location: snapped.properties.location ?? -1,
    };
  }, []);

  const getSnappedLine = useCallback((start: Position, end: Position, line: Position[]) => {
    const ADJUST_VALUE = 1000.0;
    const adjustedStartPt = turf.point([start[0] / ADJUST_VALUE, start[1] / ADJUST_VALUE]);
    const adjustedEndPt = turf.point([end[0] / ADJUST_VALUE, end[1] / ADJUST_VALUE]);
    const adjustedLine = turf.lineString(line.map((d) => [d[0] / ADJUST_VALUE, d[1] / ADJUST_VALUE]));
    const sliced = turf.lineSlice(adjustedStartPt, adjustedEndPt, adjustedLine);
    const snappedLine = sliced.geometry.coordinates.map((d) => [d[0] * ADJUST_VALUE, d[1] * ADJUST_VALUE]);
    snappedLine[0] = start;
    snappedLine[snappedLine.length - 1] = end;
    return snappedLine;
  }, []);

  const getActionSnappedPosition = useCallback(
    (point: Position, actions: { coords: Position[]; properties: string[]; arrow: number }[]) => {
      for (const action of actions) {
        const target = turf.point(point);
        const lineStart = action.coords[0];
        const distanceStart = turf.distance(target, turf.point(lineStart));

        if (distanceStart < 500) {
          //console.log('#######distanceStart', distanceStart, action);
          return lineStart;
        }
        const lineEnd = action.coords[action.coords.length - 1];
        const distanceEnd = turf.distance(target, turf.point(lineEnd));
        //console.log(distanceEnd);
        if (distanceEnd < 500) {
          //console.log('#######distanceEnd', distanceEnd, action, lineEnd);
          return lineEnd;
        }
      }
      return point;
    },
    []
  );

  const checkDistanceFromDrawLine = useCallback(
    (point: Position) => {
      const SNAP_DISTANCE = 800;
      const snapped = getLineSnappedPosition(point, drawLine.current[0].coords);
      return { isFar: snapped.distance > SNAP_DISTANCE, index: snapped.index };
    },
    [getLineSnappedPosition]
  );

  const modifyLine = useCallback(() => {
    const startPoint = modifiedLine.current.start;
    const endPoint = modifiedLine.current.coords[modifiedLine.current.coords.length - 1];
    const { isFar: startIsFar, index: startIndex } = checkDistanceFromDrawLine(startPoint);
    const { isFar: endIsFar, index: endIndex } = checkDistanceFromDrawLine(endPoint);

    if (startIsFar && endIsFar) {
      //最初も最後も離れている場合（何もしない）
    } else if (startIsFar) {
      //最初だけが離れている場合
      undoLine.current = drawLineLatLng;
      drawLine.current[0] = {
        id: drawLine.current[0].id,
        coords: [...modifiedLine.current.coords, ...drawLine.current[0].coords.slice(endIndex)],
        properties: ['DRAW'],
        arrow: 1,
      };
    } else if (endIsFar) {
      //終わりだけが離れている場合
      undoLine.current = drawLineLatLng;
      drawLine.current[0] = {
        id: drawLine.current[0].id,
        coords: [...drawLine.current[0].coords.slice(0, startIndex), ...modifiedLine.current.coords],
        properties: ['DRAW'],
        arrow: 1,
      };
    } else if (startIndex >= endIndex) {
      //最初も最後もスナップ範囲内だが、最後のスナップが最初のスナップより前にある場合
      undoLine.current = drawLineLatLng;
      drawLine.current[0] = {
        id: drawLine.current[0].id,
        coords: [...drawLine.current[0].coords.slice(0, startIndex), ...modifiedLine.current.coords],
        properties: ['DRAW'],
        arrow: 1,
      };
    } else {
      //最初も最後もスナップ範囲の場合
      undoLine.current = drawLineLatLng;
      drawLine.current[0] = {
        id: drawLine.current[0].id,
        coords: [
          ...drawLine.current[0].coords.slice(0, startIndex),
          ...modifiedLine.current.coords,
          ...drawLine.current[0].coords.slice(endIndex),
        ],
        properties: ['DRAW'],
        arrow: 1,
      };
    }
  }, [checkDistanceFromDrawLine, drawLineLatLng]);

  const panResponder: PanResponderInstance = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event: GestureResponderEvent) => {
          //console.log(selectedTool);

          if (!event.nativeEvent.touches.length) return;
          if (lineTool === 'MOVE') {
            //ラインとの距離をチェック。離れていれば地図の移動に切り替える
            const start: Position = [event.nativeEvent.locationX, event.nativeEvent.locationY];
            movingMapCenter.current = {
              x: start[0],
              y: start[1],
              longitude: screenParam.longitude,
              latitude: screenParam.latitude,
            };
          } else if (lineTool === 'DRAW') {
            if (drawLine.current[0].coords.length === 0) {
              //新規ラインの場合
              drawLine.current[0].coords = [[event.nativeEvent.locationX, event.nativeEvent.locationY]];
            } else {
              //ライン修正の場合
              //行動を消す
              const start: Position = [event.nativeEvent.locationX, event.nativeEvent.locationY];
              drawLine.current = [drawLine.current[0]];
              modifiedLine.current = { start: start, coords: [start] };
            }
            isEdited.current = true;
          } else if (isDrawTool(lineTool)) {
            //ドローツールがライン以外の場合
            const snapped = getLineSnappedPosition(
              [event.nativeEvent.locationX, event.nativeEvent.locationY],
              drawLine.current[0].coords
            ).position;
            //console.log('###actions###', drawLine.current.slice(1));
            const actionSnapped = getActionSnappedPosition(snapped, drawLine.current.slice(1));
            modifiedLine.current = { start: actionSnapped, coords: [actionSnapped] };
            //console.log('###start###', actionSnapped);
            isEdited.current = true;
          } else if (lineTool === 'SELECT') {
            //選択解除
            setSelectedFeatureAndRecord({ layerId: '', record: undefined });
            drawLine.current = [{ id: '', coords: [], properties: [], arrow: 0 }];
          }
        },
        onPanResponderMove: (event: GestureResponderEvent) => {
          if (!event.nativeEvent.touches.length) return;
          if (lineTool === 'MOVE') {
            if (movingMapCenter.current === undefined) return;
            //ライン修正のときにラインから離れてドラッグすると地図の移動
            const point = [event.nativeEvent.locationX, event.nativeEvent.locationY];
            const longitude =
              movingMapCenter.current.longitude -
              (screenParam.longitudeDelta * (point[0] - movingMapCenter.current.x)) / screenParam.width;

            const latitude =
              movingMapCenter.current.latitude +
              (screenParam.latitudeDelta * (point[1] - movingMapCenter.current.y)) / screenParam.height;
            if (Platform.OS === 'web') {
              const mapView = (mapViewRef.current as MapRef).getMap();
              mapView.flyTo({ center: [longitude, latitude] });
            } else {
              (mapViewRef.current as MapView).setCamera({ center: { latitude, longitude } });
            }
          } else if (lineTool === 'DRAW') {
            if (modifiedLine.current.coords.length > 0) {
              //ライン修正の場合
              modifiedLine.current.coords = [
                ...modifiedLine.current.coords,
                [event.nativeEvent.locationX, event.nativeEvent.locationY],
              ];
            } else {
              //新規ラインの場合
              drawLine.current[0].coords = [
                ...drawLine.current[0].coords,
                [event.nativeEvent.locationX, event.nativeEvent.locationY],
              ];
            }
          } else if (lineTool === 'TOMARI') {
            //ドローツールがポイントの場合
            const lineSnapped = getLineSnappedPosition(
              [event.nativeEvent.locationX, event.nativeEvent.locationY],
              drawLine.current[0].coords
            ).position;
            const actionSnapped = getActionSnappedPosition(lineSnapped, drawLine.current.slice(1));
            //console.log('###start###', actionSnapped);
            modifiedLine.current.coords = [actionSnapped];
          } else if (isDrawTool(lineTool)) {
            //ドローツールがポイントとライン以外
            const snapped = getLineSnappedPosition(
              [event.nativeEvent.locationX, event.nativeEvent.locationY],
              drawLine.current[0].coords
            ).position;
            const actionSnapped = getActionSnappedPosition(snapped, drawLine.current.slice(1));
            modifiedLine.current.coords = getSnappedLine(
              modifiedLine.current.start,
              actionSnapped,
              drawLine.current[0].coords
            );
          }
          setRedraw(uuidv4());
        },
        onPanResponderRelease: () => {
          const AVERAGE_UNIT = 8;
          if (lineTool === 'MOVE') {
            movingMapCenter.current = undefined;
          } else if (lineTool === 'DRAW') {
            if (modifiedLine.current.coords.length > 0) {
              //ライン修正の場合
              // modifiedLine.current.coords = computeMovingAverage(modifiedLine.current.coords, AVERAGE_UNIT);
              // if (modifiedLine.current.coords.length > AVERAGE_UNIT) {
              //   //移動平均になっていない終端を削除（筆ハネ）
              //   modifiedLine.current.coords = modifiedLine.current.coords.slice(0, -(AVERAGE_UNIT - 1));
              // }
              modifyLine();
              modifiedLine.current = { start: [], coords: [] };
            } else {
              //新規ラインの場合
              if (drawLine.current[0].coords.length === 1) {
                drawLine.current = [{ id: '', coords: [], properties: [], arrow: 0 }];
                setRedraw(uuidv4());
                return;
              }

              // drawLine.current[0].coords = computeMovingAverage(drawLine.current[0].coords, AVERAGE_UNIT);

              // if (drawLine.current[0].coords.length > AVERAGE_UNIT) {
              //   //移動平均になっていない終端を削除（筆ハネ）
              //   drawLine.current[0].coords = drawLine.current[0].coords.slice(0, -(AVERAGE_UNIT - 1));
              // }
              drawLine.current[0].properties = ['DRAW'];
              drawLine.current[0].arrow = 1;
            }
            // const line = turf.lineString(drawLine.current[0].coords);
            // //const options = { tolerance: 0.8, highQuality: true };
            // //const simplified = turf.simplify(line, options);
            // const simplified = line;

            const newDrawLineLatLng = pointsToLocation(drawLine.current[0].coords, screenParam);
            //console.log(screenParam);
            setDrawLineLatLng(newDrawLineLatLng);
          } else if (isDrawTool(lineTool)) {
            //ドローツールの場合
            drawLine.current.push({ id: '', coords: modifiedLine.current.coords, properties: [lineTool], arrow: 0 });
            modifiedLine.current = { start: [], coords: [] };
            setRedraw(uuidv4());
          }
        },
      }),
    [
      lineTool,
      screenParam,
      getLineSnappedPosition,
      getActionSnappedPosition,
      setSelectedFeatureAndRecord,
      getSnappedLine,
      modifyLine,
    ]
  );

  const legendsToProperties = useCallback((legends: string): (DrawLineToolType | '')[] => {
    return legends.split(',').map((legend) => {
      switch (legend) {
        case '飛翔':
          return 'DRAW';
        case '旋回':
          return 'SENKAI';
        case '旋回上昇':
          return 'SENJYOU';
        case 'ディスプレイ':
          return 'DISPLAY';
        case '攻撃':
          return 'KOUGEKI';
        case '停空飛翔':
          return 'HOVERING';
        case '狩り':
          return 'KARI';
        case '急降下':
          return 'KYUKOKA';
        case 'とまり':
          return 'TOMARI';
        default:
          return '';
      }
    });
  }, []);

  const propertiesToLegends = useCallback((properties: (DrawLineToolType | '')[]) => {
    const legendArray = properties.map((property) => {
      switch (property) {
        case 'DRAW':
          return '飛翔';
        case 'SENKAI':
          return '旋回';
        case 'SENJYOU':
          return '旋回上昇';
        case 'DISPLAY':
          return 'ディスプレイ';
        case 'KOUGEKI':
          return '攻撃';
        case 'HOVERING':
          return '停空飛翔';
        case 'KARI':
          return '狩り';
        case 'KYUKOKA':
          return '急降下';
        case 'TOMARI':
          return 'とまり';
        default:
          return '';
      }
    });
    const legends = Array.from(new Set(legendArray));
    if (legends.length === 1) {
      return legends.join(',');
    } else {
      return legends.filter((v) => v !== '飛翔').join(',');
    }
  }, []);

  const getSplitPoints = useCallback(
    (
      actions: {
        coords: Position[];
        properties: (DrawLineToolType | '')[];
      }[]
    ) => {
      return actions
        .flatMap((action) => {
          const startPt = getLineSnappedPosition(action.coords[0], drawLine.current[0].coords);
          const endPt = getLineSnappedPosition(action.coords[action.coords.length - 1], drawLine.current[0].coords);
          return [
            { ...startPt, properties: action.properties, type: 'start' },
            { ...endPt, properties: action.properties, type: 'end' },
          ];
        })
        .sort(function (a, b) {
          if (a.location < b.location) return -1;
          if (a.location > b.location) return 1;
          if (a.type < b.type) return -1;
          if (a.type > b.type) return 1;
          if (a.properties[0] < b.properties[0]) return -1;
          if (a.properties[0] > b.properties[0]) return 1;
          return 0;
        });
    },
    [getLineSnappedPosition]
  );

  const getSplittedLinesByLine = useCallback(
    (
      line: {
        coords: Position[];
        properties: (DrawLineToolType | '')[];
      },
      splitPoints: {
        properties: (DrawLineToolType | '')[];
        type: string;
        position: number[];
        distance: number;
        index: number;
        location: number;
      }[]
    ) => {
      const splitted: { coords: Position[]; properties: (DrawLineToolType | '')[] }[] = [];
      let remained = line;
      splitPoints.forEach((point) => {
        const lineString = turf.lineString(remained.coords);
        const splitter = turf.point(point.position);
        //調整必要?
        const collection = turf.lineSplit(lineString, splitter);
        const origin = lineString.geometry.coordinates[0];
        const end = remained.coords[remained.coords.length - 1];
        const first = collection.features[0].geometry.coordinates[0];
        const isEndPoint = turf.booleanEqual(turf.point(point.position), turf.point(end));

        let splittedCoords;
        let remainedCoords;
        //console.log(collection.features.length);
        if (collection.features.length === 1) {
          //ラインの最初か最後が同じ場合
          remainedCoords = collection.features[0].geometry.coordinates;
        } else if (origin[0] === first[0] && origin[1] === first[1]) {
          //最初が原点側の場合
          splittedCoords = collection.features[0].geometry.coordinates;
          remainedCoords = collection.features[1].geometry.coordinates;
        } else {
          splittedCoords = collection.features[1].geometry.coordinates;
          remainedCoords = collection.features[0].geometry.coordinates;
        }
        if (splittedCoords !== undefined) {
          splitted.push({ coords: splittedCoords, properties: remained.properties });
        }
        let updatedProperties;
        if (point.type === 'start') {
          updatedProperties = [...remained.properties, ...point.properties];
        } else if (point.type === 'end' && collection.features.length === 1 && isEndPoint) {
          updatedProperties = remained.properties;
        } else {
          updatedProperties = remained.properties.filter((f) => !point.properties.includes(f));
        }
        remained = { coords: remainedCoords, properties: updatedProperties };
      });
      splitted.push(remained);
      return splitted;
    },
    []
  );

  const booleanNearEqual = useCallback((p1: Position, p2: Position) => {
    return Math.abs(p2[0] - p1[0]) <= 0.001 && Math.abs(p2[1] - p1[1]) <= 0.001;
  }, []);

  const getSplittedLinesByPoint = useCallback(
    (
      lines: {
        coords: Position[];
        properties: (DrawLineToolType | '')[];
      }[],
      splitPoints: {
        coords: Position[];
        properties: (DrawLineToolType | '')[];
      }[]
    ) => {
      if (splitPoints.length === 0) return lines;
      let splitted: { coords: Position[]; properties: (DrawLineToolType | '')[] }[] = [];
      let targetLines = lines;

      splitPoints.forEach((point) => {
        let isAddedPoint = false;
        targetLines.forEach((line) => {
          if (line.coords.length === 1) {
            splitted.push(line);
            return;
          }
          const isEqualStart = booleanNearEqual(point.coords[0], line.coords[0]);
          const isEqualEnd = booleanNearEqual(point.coords[0], line.coords[line.coords.length - 1]);
          const lineString = turf.lineString(line.coords);
          let splitter;
          //ラインとポイントのズレを修正
          if (isEqualStart) {
            splitter = turf.point(line.coords[0]);
          } else if (isEqualEnd) {
            splitter = turf.point(line.coords[line.coords.length - 1]);
          } else {
            splitter = turf.point(point.coords[0]);
          }

          const collection = turf.lineSplit(lineString, splitter);
          if (collection.features.length === 1 && !isEqualStart && !isEqualEnd) {
            //ラインとポイントが違うセグメント
            splitted.push(line);
          } else if (collection.features.length === 1 && isEqualStart) {
            //ラインの最初が同じ場合(追加する順番が重要、矢印に影響)
            if (!isAddedPoint) {
              splitted.push(point);
              isAddedPoint = true;
            }
            splitted.push(line);
          } else if (collection.features.length === 1 && isEqualEnd) {
            //ラインの最初か最後が同じ場合
            splitted.push(line);
            if (!isAddedPoint) {
              splitted.push(point);
              isAddedPoint = true;
            }
          } else if (collection.features.length === 1 && !isEqualStart && !isEqualEnd) {
            //ラインとポイントが違うセグメント
            splitted.push(line);
          } else {
            //ポイントで分割する場合
            const originIsFirst = booleanNearEqual(collection.features[0].geometry.coordinates[0], line.coords[0]);
            if (originIsFirst) {
              splitted.push({ coords: collection.features[0].geometry.coordinates, properties: line.properties });
              splitted.push(point);
              splitted.push({ coords: collection.features[1].geometry.coordinates, properties: line.properties });
            } else {
              splitted.push({ coords: collection.features[1].geometry.coordinates, properties: line.properties });
              splitted.push(point);
              splitted.push({ coords: collection.features[0].geometry.coordinates, properties: line.properties });
            }
          }
        });
        targetLines = cloneDeep(splitted);
        splitted = [];
      });

      return targetLines;
    },
    [booleanNearEqual]
  );

  const saveActions = useCallback(
    (layerId: string, referenceDataId: string) => {
      const tomariActions = drawLine.current.slice(1).filter((v) => v.properties[0] === 'TOMARI');
      const lineActions = drawLine.current.slice(1).filter((v) => v.properties[0] !== 'TOMARI');
      const splitPoints = getSplitPoints(lineActions);
      const splittedLinesByLine = getSplittedLinesByLine(drawLine.current[0], splitPoints);
      const splittedLines = getSplittedLinesByPoint(splittedLinesByLine, tomariActions);

      splittedLines.forEach((action, idx) => {
        let locations;
        if (action.coords.length === 1) {
          const point = turf.point(action.coords[0]);
          locations = pointsToLocation([point.geometry.coordinates], screenParam);
        } else {
          const line = turf.lineString(action.coords);
          locations = pointsToLocation(line.geometry.coordinates, screenParam);
        }

        const updatedField = {
          飛翔凡例: propertiesToLegends(action.properties),
          消失: idx === splittedLines.length - 1 ? 1 : 0,
          高度: '',
          _ReferenceDataId: referenceDataId,
        };
        //console.log(updatedField);

        const propertyRecord: RecordType = {
          //...selectedFeature.feature!,
          id: uuidv4(),
          userId: dataUser.uid,
          displayName: dataUser.displayName,
          redraw: false,
          visible: true,
          coords: locations,
          field: updatedField,
        };
        dispatch(
          addRecordsAction({
            layerId: layerId,
            userId: dataUser.uid,
            data: [propertyRecord],
          })
        );
      });
    },
    [
      dataUser.displayName,
      dataUser.uid,
      dispatch,
      getSplitPoints,
      getSplittedLinesByLine,
      getSplittedLinesByPoint,
      propertiesToLegends,
      screenParam,
    ]
  );

  const deleteActions = useCallback(
    (layerId: string, featureId: string) => {
      const targetData = lineDataSet.find((d) => d.layerId === layerId && d.userId === dataUser.uid);
      if (targetData === undefined) return;
      const deleteRecords = targetData.data.filter((record) => record.field._ReferenceDataId === featureId);
      dispatch(
        deleteRecordsAction({
          layerId: layerId,
          userId: dataUser.uid,
          data: deleteRecords,
        })
      );
    },
    [dataUser.uid, dispatch, lineDataSet]
  );

  const saveDefaultAction = useCallback(
    (layerId: string, featureId: string, locations: LocationType[]) => {
      const updatedField = {
        飛翔凡例: propertiesToLegends(['DRAW']),
        消失: 1,
        高度: '',
        _ReferenceDataId: featureId,
      };
      //console.log(updatedField);

      const propertyRecord: RecordType = {
        //...selectedFeature.feature!,
        id: uuidv4(),
        userId: dataUser.uid,
        displayName: dataUser.displayName,
        redraw: false,
        visible: true,
        coords: locations,
        field: updatedField,
      };
      dispatch(
        addRecordsAction({
          layerId: layerId,
          userId: dataUser.uid,
          data: [propertyRecord],
        })
      );
    },
    [dataUser.displayName, dataUser.uid, dispatch, propertiesToLegends]
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

    // console.log(locations);
    if (selectedFeature.record === undefined) {
      const result = addFeature(editingLayer, editingRecordSet, drawLineLatLng);
      //飛翔図ツール
      if (hisyouzuToolEnabled) {
        saveDefaultAction(
          drawToolsSettings.hisyouzuTool.layerId!,
          result.data.id,
          result.data.coords as LocationType[]
        );
      }
      return { isOK: true, message: '', layer: result.layer, data: result.data };
    } else {
      const updatedRecord: RecordType = { ...selectedFeature.record, coords: drawLineLatLng };
      dispatch(
        updateRecordsAction({
          layerId: selectedFeature.layerId,
          userId: dataUser.uid,
          data: [updatedRecord],
        })
      );
      //飛翔図ツール
      if (hisyouzuToolEnabled) {
        deleteActions(drawToolsSettings.hisyouzuTool.layerId!, selectedFeature.record.id);
        saveActions(drawToolsSettings.hisyouzuTool.layerId!, selectedFeature.record.id);
      }

      return { isOK: true, message: '', layer: editingLayer, data: updatedRecord };
    }
  }, [
    addFeature,
    checkEditable,
    dataUser.uid,
    deleteActions,
    dispatch,
    drawLineLatLng,
    drawToolsSettings.hisyouzuTool.layerId,
    getEditingLayerAndRecordSet,
    hisyouzuToolEnabled,
    saveActions,
    saveDefaultAction,
    selectedFeature.layerId,
    selectedFeature.record,
  ]);

  const clearDrawLines = useCallback(() => {
    drawLine.current = [{ id: '', coords: [], properties: [], arrow: 0 }];
    modifiedLine.current = { start: [], coords: [] };
    setSelectedFeatureAndRecord({ layerId: '', record: undefined });
    setLineTool('NONE');
    setDrawLineLatLng([]);
    setDrawLineTool('DRAW');
    isEdited.current = false;
  }, [setSelectedFeatureAndRecord]);

  const deleteLine = useCallback(() => {
    if (selectedFeature.record !== undefined) {
      dispatch(
        deleteRecordsAction({
          layerId: selectedFeature.layerId,
          userId: dataUser.uid,
          data: [selectedFeature.record],
        })
      );
      if (drawToolsSettings.hisyouzuTool.layerId !== undefined) {
        deleteActions(drawToolsSettings.hisyouzuTool.layerId, selectedFeature.record.id);
      }
      clearDrawLines();
    }
  }, [
    clearDrawLines,
    dataUser.uid,
    deleteActions,
    dispatch,
    drawToolsSettings.hisyouzuTool.layerId,
    selectedFeature.layerId,
    selectedFeature.record,
  ]);

  const convertFeatureToDrawLine = useCallback(
    (feature: RecordType) => {
      //console.log('www', feature);
      // console.log(screenParam);
      if (!Array.isArray(feature.coords)) return;
      drawLine.current[0] = {
        id: feature.id,
        coords: locationToPoints(feature.coords, screenParam),
        properties: ['DRAW'],
        arrow: 1,
      };
      //飛翔図ツール

      if (hisyouzuToolEnabled) {
        const actionLayerId = drawToolsSettings.hisyouzuTool.layerId;
        const actionData = lineDataSet.find((d) => d.layerId === actionLayerId && d.userId === feature.userId);
        if (actionData !== undefined) {
          actionData.data.forEach((record) => {
            if (record.field._ReferenceDataId === feature.id) {
              drawLine.current.push({
                id: record.id,
                coords: locationToPoints(record.coords as LocationType[], screenParam),
                properties: legendsToProperties(record.field['飛翔凡例'] as string),
                arrow: record.field['消失'] as number,
              });
            }
          });
        }
      }
      //setRedraw(uuidv4());
      const newDrawLineLatLng = pointsToLocation(drawLine.current[0].coords, screenParam);
      setDrawLineLatLng(newDrawLineLatLng);
    },
    [drawToolsSettings.hisyouzuTool.layerId, hisyouzuToolEnabled, legendsToProperties, lineDataSet, screenParam]
  );

  const undoEditLine = useCallback(() => {
    if (drawLine.current.length > 1) {
      //行動がある場合
      drawLine.current.pop();
    } else if (undoLine.current.length > 0) {
      //行動がなくてアンドゥーのデータがある場合
      drawLine.current[0].coords = locationToPoints(undoLine.current, screenParam);
      undoLine.current = [];
    } else {
      //アンドゥーのデータがない場合
      clearDrawLines();
    }

    setRedraw(uuidv4());
  }, [clearDrawLines, screenParam]);

  useEffect(() => {
    //地図サイズが変更になったときにSVGを再描画
    if (featureButton === 'LINE') {
      //保存した飛翔を表示する場合（複数行動がある場合）にサイズ変更
      if (selectedFeature.record !== undefined && !isEdited.current) {
        drawLine.current = [{ id: '', coords: [], properties: [], arrow: 0 }];
        convertFeatureToDrawLine(selectedFeature.record);
      } else {
        //新規のライン、修正途中のラインの際にサイズ変更
        if (drawLineLatLng.length > 0) {
          drawLine.current[0] = {
            id: '',
            coords: locationToPoints(drawLineLatLng, screenParam),
            properties: ['DRAW'],
            arrow: 1,
          };

          setRedraw(uuidv4());
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenParam]);

  return {
    mapViewRef,
    layers,
    projectId,
    pointDataSet,
    lineDataSet,
    polygonDataSet,
    isEdited,
    pointTool,
    lineTool,
    drawLineTool,
    polygonTool,
    featureButton,
    selectedRecord,
    hisyouzuToolEnabled,
    drawLine,
    modifiedLine,
    panResponder,
    drawToolsSettings,
    addCurrentPoint,
    addPressPoint,
    addTrack,
    findRecord,
    setSelectedFeatureAndRecord,
    setPointTool,
    setLineTool,
    setDrawLineTool,
    setPolygonTool,
    setFeatureButton,
    dragEndPoint,
    changeEditMapStyle,
    saveLine,
    deleteLine,
    clearDrawLines,
    convertFeatureToDrawLine,
    undoEditLine,
    updateDrawToolsSettings,
  } as const;
};
