import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import {
  DataType,
  FeatureType,
  LayerType,
  LineDataType,
  LineRecordType,
  LocationType,
  PointDataType,
  PointRecordType,
  PolygonDataType,
  PolygonRecordType,
  RecordType,
  UserType,
} from '../types';
import { editSettingsAction } from '../modules/settings';
import { t } from '../i18n/config';
import { v4 as uuidv4 } from 'uuid';
import { getDefaultField } from '../utils/Data';
import { addRecordsAction, updateRecordsAction } from '../modules/dataSet';

import { calcCentroid, calcLineMidPoint } from '../utils/Coords';
import { usePermission } from './usePermission';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type UseRecordReturnType = {
  dataUser: UserType;
  projectId: string | undefined;
  pointDataSet: PointDataType[];
  lineDataSet: LineDataType[];
  polygonDataSet: PolygonDataType[];
  selectedRecord:
    | {
        layerId: string;
        record: RecordType;
      }
    | undefined;
  addRecord: (
    layer: LayerType,
    record: RecordType,
    options?: {
      isTrack?: boolean;
    }
  ) => void;
  addRecordWithCheck: (
    featureType: FeatureType,
    locations: LocationType | LocationType[],
    options?: {
      isTrack?: boolean;
    }
  ) => {
    isOK: boolean;
    message: string;
    layer: LayerType | undefined;
    record: RecordType | undefined;
  };
  updateRecord: (layer: LayerType, record: RecordType) => void;
  getEditableLayerAndRecordSetWithCheck: (featureType: string) => {
    isOK: boolean;
    message: string;
    layer: LayerType | undefined;
    recordSet: RecordType[] | undefined;
  };
  getEditableLayerAndRecordSet: (type: string) => {
    editingLayer: LayerType | undefined;
    editingRecordSet: RecordType[];
  };
  findLayer: (layerId: string) => LayerType | undefined;
  findRecord: (
    layerId: string,
    userId: string | undefined,
    recordId: string,
    type: FeatureType
  ) => PointRecordType | LineRecordType | PolygonRecordType | undefined;
  selectRecord: (layerId: string, record: RecordType) => void;
  unselectRecord: () => void;
  generateRecord: (
    featureType: FeatureType,
    editingLayer: LayerType,
    editingRecordSet: RecordType[],
    coords: LocationType | LocationType[]
  ) => RecordType;
  isLayerEditable: (type: FeatureType, layer: LayerType) => boolean | undefined;
  checkRecordEditable: (
    targetLayer: LayerType,
    feature?: RecordType
  ) => {
    isOK: boolean;
    message: string;
  };
  calculateStorageSize: () => Promise<number>;
  setIsEditingRecord: (value: boolean) => void;
};

export const useRecord = (): UseRecordReturnType => {
  const dispatch = useDispatch();

  const layers = useSelector((state: AppState) => state.layers);
  const user = useSelector((state: AppState) => state.user);
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const pointDataSet = useSelector(
    (state: AppState) =>
      layers
        .map((layer) => (layer.type === 'POINT' ? state.dataSet.filter((v) => v.layerId === layer.id) : []))
        .flat() as PointDataType[]
  );
  const lineDataSet = useSelector(
    (state: AppState) =>
      layers
        .map((layer) => (layer.type === 'LINE' ? state.dataSet.filter((v) => v.layerId === layer.id) : []))
        .flat() as LineDataType[]
  );
  const polygonDataSet = useSelector(
    (state: AppState) =>
      layers
        .map((layer) => (layer.type === 'POLYGON' ? state.dataSet.filter((v) => v.layerId === layer.id) : []))
        .flat() as PolygonDataType[]
  );

  const selectedRecord = useSelector((state: AppState) => state.settings.selectedRecord);

  const tracking = useSelector((state: AppState) => state.settings.tracking);

  const { isRunningProject } = usePermission();
  const activePointLayer = useMemo(() => layers.find((d) => d.active && d.type === 'POINT'), [layers]);
  const activeLineLayer = useMemo(() => layers.find((d) => d.active && d.type === 'LINE'), [layers]);
  const activePolygonLayer = useMemo(() => layers.find((d) => d.active && d.type === 'POLYGON'), [layers]);
  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );

  const selectRecord = useCallback(
    (layerId: string, record: RecordType) => {
      dispatch(editSettingsAction({ selectedRecord: { layerId, record } }));
    },
    [dispatch]
  );

  const unselectRecord = useCallback(() => {
    dispatch(editSettingsAction({ selectedRecord: undefined }));
  }, [dispatch]);

  const findRecord = useCallback(
    (layerId: string, userId: string | undefined, recordId: string, type: FeatureType) => {
      if (type === 'POINT') {
        const pointData = pointDataSet.find((d) => d.layerId === layerId && d.userId === userId);
        return pointData?.data.find(({ id }) => id === recordId);
      } else if (type === 'LINE') {
        const lineData = lineDataSet.find((d) => d.layerId === layerId && d.userId === userId);
        return lineData?.data.find(({ id }) => id === recordId);
      } else if (type === 'POLYGON') {
        const polygonData = polygonDataSet.find((d) => d.layerId === layerId && d.userId === userId);
        return polygonData?.data.find(({ id }) => id === recordId);
      }
    },
    [lineDataSet, pointDataSet, polygonDataSet]
  );

  const findLayer = useCallback((layerId: string) => layers.find((l) => l.id === layerId), [layers]);

  const getEditableLayerAndRecordSet = useCallback(
    (type: string) => {
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

  const checkRecordEditable = useCallback(
    (targetLayer: LayerType, feature?: RecordType) => {
      if (isRunningProject && targetLayer.permission === 'COMMON') {
        return { isOK: false, message: t('hooks.message.lockProject') };
      }
      if (isRunningProject && feature && feature.userId !== user.uid) {
        return { isOK: false, message: t('hooks.message.cannotEditOthers') };
      }
      if (tracking !== undefined && tracking.dataId === feature?.id) {
        return { isOK: false, message: t('hooks.message.cannotEditInTracking') };
      }
      if (!targetLayer.active) {
        return { isOK: false, message: t('hooks.message.noEditMode') };
      }

      return { isOK: true, message: '' };
    },
    [isRunningProject, tracking, user.uid]
  );

  const isLayerEditable = useCallback(
    (type: FeatureType, layer: LayerType) => {
      if (type === 'POINT') {
        return activePointLayer?.id === layer.id;
      } else if (type === 'LINE') {
        return activeLineLayer?.id === layer.id;
      } else if (type === 'POLYGON') {
        return activePolygonLayer?.id === layer.id;
      }
    },
    [activeLineLayer?.id, activePointLayer?.id, activePolygonLayer?.id]
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
      const centroid = Array.isArray(coords)
        ? featureType === 'LINE'
          ? calcLineMidPoint(coords)
          : calcCentroid(coords)
        : coords;

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

  const getEditableLayerAndRecordSetWithCheck = useCallback(
    (featureType: string) => {
      const { editingLayer, editingRecordSet } = getEditableLayerAndRecordSet(featureType);
      if (editingLayer === undefined || editingRecordSet === undefined) {
        return {
          isOK: false,
          message: t('hooks.message.noLayerToEdit'),
          layer: undefined,
          recordSet: undefined,
        };
      }
      const { isOK, message } = checkRecordEditable(editingLayer);
      if (!isOK) {
        return { isOK: false, message, layer: undefined, recordSet: undefined };
      }

      return { isOK: true, message: '', layer: editingLayer, recordSet: editingRecordSet };
    },
    [checkRecordEditable, getEditableLayerAndRecordSet]
  );

  const addRecord = useCallback(
    (layer: LayerType, record: RecordType, options?: { isTrack?: boolean }) => {
      dispatch(addRecordsAction({ layerId: layer.id, userId: dataUser.uid, data: [record] }));
      if (options?.isTrack) {
        dispatch(editSettingsAction({ tracking: { layerId: layer.id, dataId: record.id } }));
      }
    },
    [dataUser.uid, dispatch]
  );

  const updateRecord = useCallback(
    (layer: LayerType, record: RecordType) => {
      dispatch(
        updateRecordsAction({
          layerId: layer.id,
          userId: dataUser.uid,
          data: [record],
        })
      );
    },
    [dataUser.uid, dispatch]
  );

  const addRecordWithCheck = useCallback(
    (featureType: FeatureType, locations: LocationType | LocationType[], options?: { isTrack?: boolean }) => {
      const { isOK, message, layer, recordSet } = getEditableLayerAndRecordSetWithCheck(featureType);
      if (!isOK || layer === undefined || recordSet === undefined) {
        return { isOK: false, message, layer: undefined, record: undefined };
      }
      const record = generateRecord(featureType, layer, recordSet, locations);
      addRecord(layer, record, options);

      return { isOK, message, layer, record };
    },
    [addRecord, generateRecord, getEditableLayerAndRecordSetWithCheck]
  );

  const calculateStorageSize = useCallback(async () => {
    const keys = await AsyncStorage.getAllKeys();
    const stores = await AsyncStorage.multiGet(keys);

    let totalSize = 0;
    stores.map((result, i, store) => {
      const key = store[i][0];
      const value = store[i][1];
      const currentSize = key.length + value!.length;
      totalSize += currentSize;
      //console.log(key, currentSize / 1024 / 1024);
    });
    //bytesをMBに変換
    totalSize = totalSize / 1024 / 1024;
    //console.log('Total size in MBytes:', totalSize);
    return totalSize;
  }, []);

  const setIsEditingRecord = useCallback(
    (value: boolean) => {
      dispatch(editSettingsAction({ isEditingRecord: value }));
    },
    [dispatch]
  );

  return {
    dataUser,
    projectId,
    pointDataSet,
    lineDataSet,
    polygonDataSet,
    selectedRecord,
    addRecordWithCheck,
    findRecord,
    selectRecord,
    unselectRecord,
    getEditableLayerAndRecordSet,
    getEditableLayerAndRecordSetWithCheck,
    addRecord,
    updateRecord,
    generateRecord,
    findLayer,
    isLayerEditable,
    checkRecordEditable,
    calculateStorageSize,
    setIsEditingRecord,
  } as const;
};
