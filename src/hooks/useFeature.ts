import React, { useCallback, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import {
  DataType,
  FeatureButtonType,
  FeatureType,
  LayerType,
  LineRecordType,
  LocationType,
  RecordType,
  UserType,
} from '../types';
import { editSettingsAction } from '../modules/settings';
import { t } from '../i18n/config';
import { v4 as uuidv4 } from 'uuid';
import { getDefaultField } from '../utils/Data';
import { addRecordsAction, updateRecordsAction } from '../modules/dataSet';
import { cloneDeep } from 'lodash';
import { LatLng } from 'react-native-maps';
import { isPoint } from '../utils/Coords';

export type UseFeatureReturnType = {
  dataUser: UserType;
  layers: LayerType[];
  projectId: string | undefined;
  pointDataSet: DataType[];
  lineDataSet: DataType[];
  polygonDataSet: DataType[];
  featureButton: FeatureButtonType;
  selectedRecord:
    | {
        layerId: string;
        record: RecordType;
      }
    | undefined;
  addFeature: (
    featureType: FeatureType,
    locations: LocationType | LocationType[],
    isTrack?: any
  ) => {
    isOK: boolean;
    message: string;
    data: RecordType | undefined;
    layer: LayerType | undefined;
  };
  getEditingLayerAndRecordSet: (type: FeatureType) => {
    editingLayer: LayerType | undefined;
    editingRecordSet: RecordType[];
  };
  checkEditable: (
    editingLayer: LayerType,
    feature?: RecordType
  ) => {
    isOK: boolean;
    message: string;
  };
  findRecord: (
    layerId: string,
    userId: string | undefined,
    recordId: string,
    type: FeatureType
  ) => RecordType | undefined;
  deselectFeature: () => void;
  setFeatureButton: React.Dispatch<React.SetStateAction<FeatureButtonType>>;
  updatePointPosition: (editingLayer: LayerType, feature: RecordType, coordinate: LatLng) => void;
  generateRecord: (
    featureType: FeatureType,
    editingLayer: LayerType,
    editingRecordSet: RecordType[],
    coords: LocationType | LocationType[]
  ) => RecordType;
  generateLineRecord: (
    editingLayer: LayerType,
    editingRecordSet: RecordType[],
    coords: LocationType[]
  ) => LineRecordType;
};

export const useFeature = (): UseFeatureReturnType => {
  const dispatch = useDispatch();

  const layers = useSelector((state: AppState) => state.layers);
  const user = useSelector((state: AppState) => state.user);
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
  const role = useSelector((state: AppState) => state.settings.role);
  const isOwnerAdmin = useMemo(() => role === 'OWNER' || role === 'ADMIN', [role]);

  const activePointLayer = useMemo(() => layers.find((d) => d.active && d.type === 'POINT'), [layers]);
  const activeLineLayer = useMemo(() => layers.find((d) => d.active && d.type === 'LINE'), [layers]);
  const activePolygonLayer = useMemo(() => layers.find((d) => d.active && d.type === 'POLYGON'), [layers]);

  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );

  const deselectFeature = useCallback(() => {
    dispatch(editSettingsAction({ selectedRecord: undefined }));
  }, [dispatch]);

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

  const generateRecord = useCallback(
    (
      featureType: FeatureType,
      editingLayer: LayerType,
      editingRecordSet: RecordType[],
      coords: LocationType | LocationType[]
    ) => {
      const id = uuidv4();
      const field = getDefaultField(editingLayer, editingRecordSet, id);
      const centroid = Array.isArray(coords) ? (featureType === 'LINE' ? coords[0] : coords[0]) : coords;

      const record: RecordType = {
        id: id,
        userId: dataUser.uid,
        displayName: dataUser.displayName,
        visible: true,
        redraw: false,
        coords: coords,
        centroid: centroid,
        field: field,
      };
      return record;
    },
    [dataUser.displayName, dataUser.uid]
  );

  const generateLineRecord = useCallback(
    (editingLayer: LayerType, editingRecordSet: RecordType[], coords: LocationType[]) => {
      return generateRecord('LINE', editingLayer, editingRecordSet, coords) as LineRecordType;
    },
    [generateRecord]
  );

  const addFeature = useCallback(
    (featureType: FeatureType, locations: LocationType | LocationType[], isTrack = false) => {
      const { editingLayer, editingRecordSet } = getEditingLayerAndRecordSet(featureType);
      if (editingLayer === undefined) {
        return {
          isOK: false,
          message: t('hooks.message.noLayerToEdit'),
          layer: undefined,
          data: undefined,
        };
      }
      const { isOK, message } = checkEditable(editingLayer);
      if (!isOK) {
        return { isOK: false, message, layer: undefined, data: undefined };
      }
      const newRecord = generateRecord('LINE', editingLayer, editingRecordSet, locations);

      dispatch(addRecordsAction({ layerId: editingLayer.id, userId: dataUser.uid, data: [newRecord] }));
      if (isTrack) {
        dispatch(editSettingsAction({ tracking: { layerId: editingLayer.id, dataId: newRecord.id } }));
      }
      return { isOK: true, message: '', data: newRecord, layer: editingLayer };
    },
    [checkEditable, dataUser.uid, dispatch, generateRecord, getEditingLayerAndRecordSet]
  );

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

  return {
    dataUser,
    layers,
    projectId,
    pointDataSet,
    lineDataSet,
    polygonDataSet,
    featureButton,
    selectedRecord,
    findRecord,
    deselectFeature,
    setFeatureButton,
    addFeature,
    getEditingLayerAndRecordSet,
    checkEditable,
    updatePointPosition,
    generateRecord,
    generateLineRecord,
  } as const;
};
