import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { v4 as uuidv4 } from 'uuid';
import * as turf from '@turf/turf';
import { GestureResponderEvent, PanResponder, PanResponderInstance, Platform } from 'react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DataType,
  DrawLineToolType,
  FeatureButtonType,
  FeatureType,
  LayerType,
  LineRecordType,
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
import {
  checkDistanceFromLine,
  getActionSnappedPosition,
  getLineSnappedPosition,
  getSnappedLine,
  isPoint,
  locationToPoints,
  modifyLine,
  pointsToLocation,
  selectedFeatures,
} from '../utils/Coords';
import { getLayerSerial } from '../utils/Layer';
import { getDefaultFieldObject } from '../utils/Data';

import * as Location from 'expo-location';
import { toLocationType } from '../utils/Location';
import { MapRef } from 'react-map-gl';
import { Position } from '@turf/turf';
import { isDrawTool } from '../utils/General';
import { updateLayerAction } from '../modules/layers';
import { t } from '../i18n/config';
import { useWindow } from './useWindow';

export type UseFeatureReturnType = {
  layers: LayerType[];
  projectId: string | undefined;
  pointDataSet: DataType[];
  lineDataSet: DataType[];
  polygonDataSet: DataType[];
  isEditingLine: boolean;
  drawLine: React.MutableRefObject<
    {
      layerId: string;
      record: RecordType | undefined;
      xy: Position[];
      coords: LocationType[];
      properties: (DrawLineToolType | '')[];
      arrow: number;
    }[]
  >;
  modifiedLine: React.MutableRefObject<{
    start: turf.helpers.Position;
    xy: Position[];
  }>;
  selectLine: React.MutableRefObject<{
    start: turf.helpers.Position;
    xy: Position[];
  }>;
  pointTool: PointToolType;
  lineTool: LineToolType;
  drawLineTool: DrawLineToolType;
  polygonTool: PolygonToolType;
  featureButton: FeatureButtonType;
  selectedRecord:
    | {
        layerId: string;
        record: RecordType;
      }
    | undefined;
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
  deselectFeature: () => void;
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

export const useFeature = (mapViewRef: MapView | MapRef | null): UseFeatureReturnType => {
  const dispatch = useDispatch();
  const user = useSelector((state: AppState) => state.user);
  const [pointTool, setPointTool] = useState<PointToolType>('NONE');
  const [lineTool, setLineTool] = useState<LineToolType>('NONE');
  const [drawLineTool, setDrawLineTool] = useState<DrawLineToolType>('DRAW');
  const [polygonTool, setPolygonTool] = useState<PolygonToolType>('NONE');
  const [, setRedraw] = useState('');
  const drawLine = useRef<
    {
      layerId: string;
      record: RecordType | undefined;
      xy: Position[];
      coords: LocationType[];
      properties: (DrawLineToolType | '')[];
      arrow: number;
    }[]
  >([]);
  const modifiedLine = useRef<{ start: Position; xy: Position[] }>({ start: [], xy: [] });
  const selectLine = useRef<{ start: Position; xy: Position[] }>({ start: [], xy: [] });
  const undoLine = useRef<{ index: number; coords: LocationType[] }[]>([]);
  const isEditingLine = useRef(false);
  const modifiedIndex = useRef(-1);
  const movingMapCenter = useRef<{ x: number; y: number; longitude: number; latitude: number } | undefined>(undefined);
  const role = useSelector((state: AppState) => state.settings.role);
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

  const isOwnerAdmin = useMemo(() => role === 'OWNER' || role === 'ADMIN', [role]);
  const activePointLayer = useMemo(() => layers.find((d) => d.active && d.type === 'POINT'), [layers]);
  const activeLineLayer = useMemo(() => layers.find((d) => d.active && d.type === 'LINE'), [layers]);
  const activePolygonLayer = useMemo(() => layers.find((d) => d.active && d.type === 'POLYGON'), [layers]);

  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );

  const { mapSize, mapRegion } = useWindow();

  const deselectFeature = useCallback(() => {
    dispatch(editSettingsAction({ selectedRecord: undefined }));
  }, [dispatch]);

  const updateDrawToolsSettings = useCallback(
    (settings: { hisyouzuTool: { active: boolean; layerId: string | undefined } }) => {
      dispatch(editSettingsAction({ drawTools: settings }));
      const hisyouzuLayer = layers.find((layer) => layer.id === settings.hisyouzuTool.layerId);
      if (hisyouzuLayer !== undefined) {
        dispatch(updateLayerAction({ ...hisyouzuLayer, visible: false }));
      }
      return { isOK: true, message: '' };
    },
    [dispatch, layers]
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

  const checkEditable = useCallback(
    (editingLayer: LayerType, feature?: RecordType) => {
      //データのチェックもする場合
      if (feature !== undefined) {
        //パブリック、パーソナルデータでオーナー＆管理者だが自分以外のデータで調査モード
        //ToDo 調査モード
        const workInProgress = true;
        if (editingLayer.permission !== 'COMMON' && isOwnerAdmin && workInProgress && dataUser.uid !== feature.userId) {
          return { isOK: false, message: t('hooks.message.cannotEditOthersInWork') };
        }
      }
      return { isOK: true, message: '' };
    },
    [dataUser.uid, isOwnerAdmin]
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

  const saveLine = useCallback(() => {
    const { editingLayer, editingRecordSet } = getEditingLayerAndRecordSet('LINE');
    if (editingLayer === undefined) {
      return { isOK: false, message: t('hooks.message.noLayerToEdit'), layer: undefined, data: undefined };
    }
    const { isOK, message } = checkEditable(editingLayer);

    if (!isOK) {
      return { isOK: false, message, layer: undefined, data: undefined };
    }

    drawLine.current.map((line) => {
      if (line.record !== undefined) {
        const updatedRecord: RecordType = { ...line.record, coords: line.coords };
        dispatch(
          updateRecordsAction({
            layerId: line.layerId,
            userId: dataUser.uid,
            data: [updatedRecord],
          })
        );
      } else {
        addFeature(editingLayer, editingRecordSet, line.coords);
      }
    });

    return { isOK: true, message: '', layer: undefined, data: undefined };
  }, [addFeature, checkEditable, dataUser.uid, dispatch, getEditingLayerAndRecordSet]);

  const panResponder: PanResponderInstance = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event: GestureResponderEvent) => {
          //console.log(selectedTool);

          if (!event.nativeEvent.touches.length) return;
          //console.log('#', gesture.numberActiveTouches);
          const point: Position = [event.nativeEvent.locationX, event.nativeEvent.locationY];
          if (lineTool === 'MOVE') {
            movingMapCenter.current = {
              x: point[0],
              y: point[1],
              longitude: mapRegion.longitude,
              latitude: mapRegion.latitude,
            };
            drawLine.current.forEach((line, idx) => (drawLine.current[idx] = { ...line, xy: [] }));
          } else if (lineTool === 'SELECT') {
            // //選択解除
            modifiedIndex.current = -1;
            drawLine.current = [];
            selectLine.current = { start: point, xy: [point] };
          } else if (lineTool === 'DRAW' || lineTool === 'AREA') {
            modifiedIndex.current = drawLine.current.findIndex((line) => {
              const { isFar } = checkDistanceFromLine(point, line.xy);
              return !isFar;
            });
            if (modifiedIndex.current === -1) {
              //新規ラインの場合
              drawLine.current.push({
                layerId: '',
                record: undefined,
                xy: [point],
                coords: [],
                properties: [],
                arrow: 0,
              });
            } else {
              //ライン修正の場合
              modifiedLine.current = { start: point, xy: [point] };
            }
            isEditingLine.current = true;
          } else if (isDrawTool(lineTool)) {
            //ドローツールがライン以外の場合
            const snapped = getLineSnappedPosition(
              [event.nativeEvent.locationX, event.nativeEvent.locationY],
              drawLine.current[0].xy
            ).position;
            //console.log('###actions###', drawLine.current.slice(1));
            const actionSnapped = getActionSnappedPosition(snapped, drawLine.current.slice(1));
            modifiedLine.current = { start: actionSnapped, xy: [actionSnapped] };
            //console.log('###start###', actionSnapped);
            isEditingLine.current = true;
          }
        },
        onPanResponderMove: (event: GestureResponderEvent) => {
          if (!event.nativeEvent.touches.length) return;
          //console.log('##', gesture.numberActiveTouches);
          const point = [event.nativeEvent.locationX, event.nativeEvent.locationY];

          if (lineTool === 'MOVE') {
            if (movingMapCenter.current === undefined) return;

            const longitude =
              movingMapCenter.current.longitude -
              (mapRegion.longitudeDelta * (point[0] - movingMapCenter.current.x)) / mapSize.width;

            const latitude =
              movingMapCenter.current.latitude +
              (mapRegion.latitudeDelta * (point[1] - movingMapCenter.current.y)) / mapSize.height;
            if (Platform.OS === 'web') {
              const mapView = (mapViewRef as MapRef).getMap();
              mapView.easeTo({ center: [longitude, latitude], animate: false });
            } else {
              (mapViewRef as MapView).setCamera({ center: { latitude, longitude } });
            }
          } else if (lineTool === 'SELECT') {
            selectLine.current.xy = [...selectLine.current.xy, point];
          } else if (lineTool === 'DRAW' || lineTool === 'AREA') {
            if (modifiedIndex.current === -1) {
              //新規ラインの場合
              const index = drawLine.current.length - 1;
              drawLine.current[index].xy = [...drawLine.current[index].xy, point];
            } else {
              //ライン修正の場合
              modifiedLine.current.xy = [...modifiedLine.current.xy, point];
            }
          } else if (isDrawTool(lineTool)) {
            //ドローツールがポイントとライン以外
            const snapped = getLineSnappedPosition(point, drawLine.current[0].xy).position;
            const actionSnapped = getActionSnappedPosition(snapped, drawLine.current.slice(1));
            modifiedLine.current.xy = getSnappedLine(modifiedLine.current.start, actionSnapped, drawLine.current[0].xy);
          }
          setRedraw(uuidv4());
        },
        onPanResponderRelease: () => {
          //const AVERAGE_UNIT = 8;
          if (lineTool === 'MOVE') {
            movingMapCenter.current = undefined;
            drawLine.current.forEach(
              (line, idx) =>
                (drawLine.current[idx] = { ...line, xy: locationToPoints(line.coords, mapRegion, mapSize) })
            );
          } else if (lineTool === 'SELECT') {
            //選択処理
            const { editingLayer, editingRecordSet } = getEditingLayerAndRecordSet('LINE');
            if (editingLayer === undefined) return;
            const { isOK } = checkEditable(editingLayer);
            if (!isOK) return;
            const selectLineCoords = pointsToLocation(selectLine.current.xy, mapRegion, mapSize);
            const features = selectedFeatures(editingRecordSet as LineRecordType[], selectLineCoords);

            features.forEach((record) =>
              drawLine.current.push({
                layerId: editingLayer.id,
                record: record,
                xy: locationToPoints(record.coords, mapRegion, mapSize),
                coords: record.coords,
                properties: ['DRAW'],
                arrow: 1,
              })
            );
            if (features.length > 0) {
              undoLine.current.push({ index: -1, coords: [] });
              isEditingLine.current = true;
            }
            selectLine.current = { start: [], xy: [] };
          } else if (lineTool === 'DRAW' || lineTool === 'AREA') {
            const index = drawLine.current.length - 1;
            if (modifiedIndex.current === -1) {
              //新規ラインの場合
              if (drawLine.current[index].xy.length === 1) {
                //1点しかなければ追加しない
                drawLine.current = [];
                setRedraw(uuidv4());
                return;
              }
              //AREAツールの場合は、エリアを閉じるために始点を追加する。
              if (lineTool === 'AREA') drawLine.current[index].xy.push(drawLine.current[index].xy[0]);
              drawLine.current[index].properties = ['DRAW'];
              drawLine.current[index].arrow = 1;
              drawLine.current[index].coords = pointsToLocation(drawLine.current[index].xy, mapRegion, mapSize);
              undoLine.current.push({
                index: index,
                coords: [],
              });
            } else {
              // //ライン修正の場合
              // // modifiedLine.current.coords = computeMovingAverage(modifiedLine.current.coords, AVERAGE_UNIT);
              // // if (modifiedLine.current.coords.length > AVERAGE_UNIT) {
              // //   //移動平均になっていない終端を削除（筆ハネ）
              // //   modifiedLine.current.coords = modifiedLine.current.coords.slice(0, -(AVERAGE_UNIT - 1));
              // // }

              const modifiedXY = modifyLine(drawLine.current[modifiedIndex.current], modifiedLine.current);
              if (modifiedXY.length > 0) {
                undoLine.current.push({
                  index: modifiedIndex.current,
                  coords: drawLine.current[modifiedIndex.current].coords,
                });

                drawLine.current[modifiedIndex.current] = {
                  ...drawLine.current[modifiedIndex.current],
                  xy: modifiedXY,
                  coords: pointsToLocation(modifiedXY, mapRegion, mapSize),
                };
                //moveToLastOfArray(drawLine.current, modifiedIndex.current);
              }
              modifiedLine.current = { start: [], xy: [] };
            }
          } else if (isDrawTool(lineTool)) {
            //ドローツールの場合
            drawLine.current.push({
              layerId: '',
              record: undefined,
              xy: modifiedLine.current.xy,
              coords: [],
              properties: [lineTool],
              arrow: 0,
            });
            modifiedLine.current = { start: [], xy: [] };
          }
          setRedraw(uuidv4());
        },
      }),
    [checkEditable, getEditingLayerAndRecordSet, lineTool, mapRegion, mapSize, mapViewRef]
  );

  // const deleteActions = useCallback(
  //   (layerId: string, featureId: string) => {
  //     const targetData = lineDataSet.find((d) => d.layerId === layerId && d.userId === dataUser.uid);
  //     if (targetData === undefined) return;
  //     const deleteRecords = targetData.data.filter((record) => record.field._ReferenceDataId === featureId);
  //     dispatch(
  //       deleteRecordsAction({
  //         layerId: layerId,
  //         userId: dataUser.uid,
  //         data: deleteRecords,
  //       })
  //     );
  //   },
  //   [dataUser.uid, dispatch, lineDataSet]
  // );

  const clearDrawLines = useCallback(() => {
    drawLine.current = [];
    modifiedLine.current = { start: [], xy: [] };
    setLineTool('NONE');
    //setDrawLineTool('DRAW');
    isEditingLine.current = false;
    modifiedIndex.current = -1;
    undoLine.current = [];
  }, []);

  const deleteLine = useCallback(() => {
    if (drawLine.current.length === 0) return;
    drawLine.current.forEach((line) => {
      if (line.record !== undefined) {
        dispatch(
          deleteRecordsAction({
            layerId: line.layerId,
            userId: dataUser.uid,
            data: [line.record],
          })
        );
      }
    });

    clearDrawLines();
  }, [clearDrawLines, dataUser.uid, dispatch]);

  const undoEditLine = useCallback(() => {
    const undo = undoLine.current.pop();
    //undo.indexが-1の時はリセットする
    if (undo !== undefined && undo.index !== -1) {
      //アンドゥーのデータがある場合
      drawLine.current[undo.index].xy = locationToPoints(undo.coords, mapRegion, mapSize);
      drawLine.current[undo.index].coords = undo.coords;
    }
    if (undoLine.current.length === 0) clearDrawLines();

    setRedraw(uuidv4());
  }, [clearDrawLines, mapRegion, mapSize]);

  useEffect(() => {
    //ライン編集中にサイズ変更。移動中は更新しない。
    if (isEditingLine.current && movingMapCenter.current === undefined) {
      //console.log('redraw', dayjs());
      drawLine.current.forEach(
        (line, idx) => (drawLine.current[idx] = { ...line, xy: locationToPoints(line.coords, mapRegion, mapSize) })
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
    lineTool,
    drawLineTool,
    polygonTool,
    featureButton,
    selectedRecord,
    drawLine,
    modifiedLine,
    selectLine,
    panResponder,
    drawToolsSettings,
    addCurrentPoint,
    addPressPoint,
    addTrack,
    findRecord,
    deselectFeature,
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
    undoEditLine,
    updateDrawToolsSettings,
  } as const;
};
