import { useCallback, useMemo } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
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
import { ulid } from 'ulid';
import { getDefaultField } from '../utils/Data';
import { addRecordsAction, updateRecordsAction } from '../modules/dataSet';

import { calcCentroid, calcLineMidPoint } from '../utils/Coords';
import { usePermission } from './usePermission';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { selectLineDataSet, selectPointDataSet, selectPolygonDataSet } from '../modules/selectors';
import { addLayerAction, layersInitialState } from '../modules/layers';

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
  activePointLayer: LayerType | undefined;
  activeLineLayer: LayerType | undefined;
  activePolygonLayer: LayerType | undefined;
  addRecord: (
    layer: LayerType,
    record: RecordType,
    options?: {
      isTrack?: boolean;
    }
  ) => void;
  addRecordWithCheck: (
    featureType: FeatureType,
    locations: LocationType | LocationType[]
  ) => {
    isOK: boolean;
    message: string;
    layer: LayerType | undefined;
    record: RecordType | undefined;
  };
  addTrackRecord: (locations: LocationType[]) => {
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
    coords: LocationType | LocationType[],
    options?: { groupId?: string }
  ) => RecordType;
  isLayerEditable: (type: FeatureType, layer: LayerType) => boolean | undefined;
  checkRecordEditable: (targetLayer: LayerType) => {
    isOK: boolean;
    message: string;
  };
  calculateStorageSize: () => Promise<number>;
  setIsEditingRecord: (value: boolean) => void;
};

export const useRecord = (): UseRecordReturnType => {
  const dispatch = useDispatch();

  const layers = useSelector((state: RootState) => state.layers);
  const user = useSelector((state: RootState) => state.user);
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);

  const pointDataSet = useSelector(selectPointDataSet);
  const lineDataSet = useSelector(selectLineDataSet);
  const polygonDataSet = useSelector(selectPolygonDataSet);

  const selectedRecord = useSelector((state: RootState) => state.settings.selectedRecord, shallowEqual);

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
    (targetLayer: LayerType) => {
      if (isRunningProject && targetLayer.permission === 'COMMON') {
        return { isOK: false, message: t('hooks.message.lockProject') };
      }

      if (!targetLayer.active && targetLayer.id !== 'track') {
        // レイヤーがアクティブでない場合。ただし、トラックレイヤーは除外
        return { isOK: false, message: t('hooks.message.noEditMode') };
      }

      return { isOK: true, message: '' };
    },
    [isRunningProject]
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
      coords: LocationType | LocationType[],
      options?: { groupId?: string }
    ) => {
      const id = ulid();
      const field = getDefaultField(editingLayer, editingRecordSet, id, options);
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
        updatedAt: Date.now(),
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
    (layer: LayerType, record: RecordType) => {
      dispatch(addRecordsAction({ layerId: layer.id, userId: dataUser.uid, data: [record] }));
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

  const addTrackRecord = useCallback(
    (locations: LocationType[]) => {
      let trackLayer = layers.find((l) => l.id === 'track');
      if (!trackLayer) {
        // Trackレイヤーがなければ初期状態から作成
        trackLayer = layersInitialState.find((l) => l.id === 'track');
        if (!trackLayer) throw new Error('Track layer template not found');
        dispatch(addLayerAction(trackLayer));
      }
      const trackDataSet = lineDataSet.find((d) => d.layerId === trackLayer!.id && d.userId === dataUser.uid);
      const trackRecordSet = trackDataSet ? trackDataSet.data : [];
      const record = generateRecord('LINE', trackLayer, trackRecordSet, locations);
      addRecord(trackLayer, record);

      return { isOK: true, message: '', layer: trackLayer, record };
    },
    [layers, lineDataSet, generateRecord, addRecord, dispatch, dataUser.uid]
  );

  const addRecordWithCheck = useCallback(
    (featureType: FeatureType, locations: LocationType | LocationType[]) => {
      const { isOK, message, layer, recordSet } = getEditableLayerAndRecordSetWithCheck(featureType);
      if (!isOK || layer === undefined || recordSet === undefined) {
        return { isOK: false, message, layer: undefined, record: undefined };
      }
      const record = generateRecord(featureType, layer, recordSet, locations);
      addRecord(layer, record);

      return { isOK, message, layer, record };
    },
    [addRecord, generateRecord, getEditableLayerAndRecordSetWithCheck]
  );

  const calculateStorageSize = useCallback(async () => {
    const keys = await AsyncStorage.getAllKeys();
    const stores = await AsyncStorage.multiGet(keys);

    let totalSize = 0;
    stores.map((_, i, store) => {
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
    activePointLayer,
    activeLineLayer,
    activePolygonLayer,
    addRecordWithCheck,
    addTrackRecord,
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
