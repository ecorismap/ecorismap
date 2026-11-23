import { useCallback, useMemo } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '../store';
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
import { getDefaultField, getNumberingRecordSets } from '../utils/Data';
import { addRecordsAction, moveRecordsToUserAction, updateRecordsAction } from '../modules/dataSet';

import { calcCentroid, calcLineMidPoint } from '../utils/Coords';
import { usePermission } from './usePermission';
import { getRecordModifyBlock, RecordModifyAction, recordModifyBlockMessageKey } from '../utils/recordTakeover';
import { selectLineDataSet, selectPointDataSet, selectPolygonDataSet } from '../modules/selectors';
import { addLayerAction, layersInitialState, MEMO_LAYER_ID, updateLayerAction } from '../modules/layers';
import { toGnssQualityColorLayer } from '../utils/Layer';
import { storage, trackLogStorage } from '../utils/mmkvStorage';

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
  addTrackRecord: (locations: LocationType[], options?: { distance?: string }) => {
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
  /**
   * 記録を変更・削除してよいか。他のメンバー・テンプレートの記録を変えられるのは管理者だけ
   * （同期監査 M8・L1。utils/recordTakeover の getRecordModifyBlock）
   */
  checkRecordsModifiable: (
    targetLayer: LayerType,
    records: RecordType[],
    action: RecordModifyAction
  ) => {
    isOK: boolean;
    message: string;
  };
  calculateStorageSize: () => Promise<number>;
  setIsEditingRecord: (value: boolean) => void;
};

export const useRecord = (): UseRecordReturnType => {
  const dispatch = useDispatch<AppDispatch>();

  const layers = useSelector((state: RootState) => state.layers);
  const user = useSelector((state: RootState) => state.user);
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);

  const pointDataSet = useSelector(selectPointDataSet);
  const lineDataSet = useSelector(selectLineDataSet);
  const polygonDataSet = useSelector(selectPolygonDataSet);

  const selectedRecord = useSelector((state: RootState) => state.settings.selectedRecord, shallowEqual);
  const trackGnssColorAutoApplied = useSelector((state: RootState) => state.settings.trackGnssColorAutoApplied === true);

  const { isRunningProject, isOwnerAdmin } = usePermission();
  const activePointLayer = useMemo(() => layers.find((d) => d.active && d.type === 'POINT'), [layers]);
  //メモは専用レイヤなので、アクティブにされてもラインの作図先にはしない
  const activeLineLayer = useMemo(
    () => layers.find((d) => d.active && d.type === 'LINE' && d.id !== MEMO_LAYER_ID),
    [layers]
  );
  const activePolygonLayer = useMemo(() => layers.find((d) => d.active && d.type === 'POLYGON'), [layers]);
  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );

  const selectRecord = useCallback(
    (layerId: string, record: RecordType) => {
      //recordがundefinedのまま入ると描画側のrecord.id参照でクラッシュするため選択解除として扱う
      if (record === undefined) {
        dispatch(editSettingsAction({ selectedRecord: undefined }));
        return;
      }
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
      //ツール選択ハンドラ内でactive化した直後でも正しく解決できるよう、最新のレイヤ状態を読む（stale closure対策）
      const currentLayers = dispatch((_thunkDispatch, getState) => (getState() as RootState).layers);
      let editingLayer: LayerType | undefined;
      let dataSet: DataType[] = [];
      if (type === 'POINT') {
        editingLayer = currentLayers.find((d) => d.active && d.type === 'POINT');
        dataSet = pointDataSet;
      } else if (type === 'LINE' || type === 'MEMO') {
        //マップメモはアクティブなラインレイヤに保存されるため、LINEと同じ扱い
        editingLayer = currentLayers.find((d) => d.active && d.type === 'LINE');
        dataSet = lineDataSet;
      } else if (type === 'POLYGON') {
        editingLayer = currentLayers.find((d) => d.active && d.type === 'POLYGON');
        dataSet = polygonDataSet;
      }
      //同じレイヤのデータは、自分・未設定（ログイン前に作成）・テンプレートが別々の集合に
      //分かれて入っている。表示は全部を描画するのに編集対象を自分の集合だけにすると、
      //テンプレートのデータが地図に見えているのに編集選択できない。アップロード側
      //（utils/DataのgetTargetRecordSet）と同じ扱いに揃えて1つにまとめる
      const editingDataSet = dataSet.filter((d) => d.layerId === editingLayer?.id);
      const ownRank = (userId: string | undefined) => (userId === dataUser.uid ? 0 : userId === undefined ? 1 : 2);
      const editingRecordSet: RecordType[] = [];
      const addedIds = new Set<string>();
      editingDataSet
        .filter((d) => d.userId === dataUser.uid || d.userId === undefined || d.userId === 'template')
        //同じidが複数の集合にある場合は自分のものを優先する
        .sort((a, b) => ownRank(a.userId) - ownRank(b.userId))
        .forEach((d) =>
          d.data.forEach((record) => {
            if (addedIds.has(record.id)) return;
            addedIds.add(record.id);
            editingRecordSet.push(record);
          })
        );

      return { editingLayer, editingRecordSet };
    },
    [dataUser.uid, dispatch, lineDataSet, pointDataSet, polygonDataSet]
  );

  const checkRecordEditable = useCallback(
    (targetLayer: LayerType) => {
      // 画面遷移paramsで渡されるレイヤはスナップショットでactiveが古いことがある
      // （編集モード切替後もfalseのままで確認ダイアログが再表示される）ため、
      // 最新のlayersをidで引いて判定する
      const layer = layers.find((l) => l.id === targetLayer.id) ?? targetLayer;

      if (isRunningProject && layer.permission === 'COMMON') {
        return { isOK: false, message: t('hooks.message.lockProject') };
      }

      if (!layer.active && layer.id !== 'track' && layer.id !== MEMO_LAYER_ID) {
        // レイヤーがアクティブでない場合。ただし、軌跡とメモは編集レイヤにしない専用レイヤなので除外
        return { isOK: false, message: t('hooks.message.noEditMode') };
      }

      return { isOK: true, message: '' };
    },
    [isRunningProject, layers]
  );

  const checkRecordsModifiable = useCallback(
    (targetLayer: LayerType, records: RecordType[], action: RecordModifyAction) => {
      for (const record of records) {
        const block = getRecordModifyBlock({
          layer: targetLayer,
          recordUserId: record.userId,
          action,
          ownUserId: dataUser.uid,
          isOwnerAdmin,
          isRunningProject,
        });
        if (block !== undefined) return { isOK: false, message: t(recordModifyBlockMessageKey(block)) };
      }
      return { isOK: true, message: '' };
    },
    [dataUser.uid, isOwnerAdmin, isRunningProject]
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
      //連番・前回値は一覧からの追加と同じ数え方にする（前回値=自分の記録の末尾、連番=レイヤの全記録の最大値+1）
      //作図の連続追加中もストアの最新を読む（閉じ込めた値だと他のメンバーの同期分を取りこぼす）
      const layerRecords = dispatch((_thunkDispatch, getState) => (getState() as RootState).dataSet)
        .filter((d) => d.layerId === editingLayer.id)
        .flatMap((d) => d.data);
      const numbering = getNumberingRecordSets(editingRecordSet, layerRecords, dataUser.uid);
      const field = getDefaultField(editingLayer, editingRecordSet, id, { ...options, numbering });
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
    [dataUser.displayName, dataUser.uid, dispatch]
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
      // 作図での変形・色や太さの変更・行動記号の集約などもここを通る。updatedAt を更新しないと、
      // 同期の「最新優先」や衝突の判定で編集前の版と同じ時刻になり、古い版に負けて編集が消える
      const updated = { ...record, updatedAt: Date.now() };
      //テンプレートや未設定ユーザーのデータを編集したら自分のデータとして持ち替える。
      //元の集合に残すと同じレコードが二重に表示されるため、元の集合からは消す（データ一覧の編集と同じ扱い）。
      //他のメンバーの記録は、ストアの所有権の規則（modules/recordOwnership）が管理者なら引き継ぎ、一般メンバーなら受け付けない
      if (record.userId !== dataUser.uid) {
        dispatch(
          moveRecordsToUserAction({
            layerId: layer.id,
            fromUserId: record.userId,
            toUserId: dataUser.uid,
            toDisplayName: dataUser.displayName,
            data: [updated],
          })
        );
        return;
      }
      dispatch(
        updateRecordsAction({
          layerId: layer.id,
          userId: dataUser.uid,
          data: [{ ...updated, userId: dataUser.uid, displayName: dataUser.displayName }],
        })
      );
    },
    [dataUser.displayName, dataUser.uid, dispatch]
  );

  const addTrackRecord = useCallback(
    (locations: LocationType[], options?: { distance?: string }) => {
      let trackLayer = layers.find((l) => l.id === 'track');
      const isNewLayer = !trackLayer;
      if (!trackLayer) {
        // Trackレイヤーがなければ初期状態から作成
        trackLayer = layersInitialState.find((l) => l.id === 'track');
        if (!trackLayer) throw new Error('Track layer template not found');
      }
      // 外部GNSS受信機で記録した軌跡を初めて保存するときは、色分けを「測位品質」へ切り替える。
      // 一度だけにして、利用者が単色へ戻したら以後は尊重する
      const gnssColorLayer = trackGnssColorAutoApplied ? undefined : toGnssQualityColorLayer(trackLayer, locations);
      if (gnssColorLayer !== undefined) {
        trackLayer = gnssColorLayer;
        dispatch(editSettingsAction({ trackGnssColorAutoApplied: true }));
      }
      if (isNewLayer) {
        dispatch(addLayerAction(trackLayer));
      } else if (gnssColorLayer !== undefined) {
        dispatch(updateLayerAction(trackLayer));
      }
      const trackDataSet = lineDataSet.find((d) => d.layerId === trackLayer!.id && d.userId === dataUser.uid);
      const trackRecordSet = trackDataSet ? trackDataSet.data : [];
      const record = generateRecord('LINE', trackLayer, trackRecordSet, locations);
      
      // 距離情報が提供されていれば、cmtフィールドに追加
      if (options?.distance && record.field) {
        record.field.cmt = options.distance;
      }
      
      addRecord(trackLayer, record);

      return { isOK: true, message: '', layer: trackLayer, record };
    },
    [layers, lineDataSet, generateRecord, addRecord, dispatch, dataUser.uid, trackGnssColorAutoApplied]
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
    try {
      let totalSize = 0;
      
      // メインストレージのサイズを計算
      const mainKeys = storage.getAllKeys();
      mainKeys.forEach((key) => {
        const value = storage.getString(key);
        if (value) {
          // キーと値の両方のサイズを加算
          totalSize += key.length + value.length;
        }
      });
      
      // トラックログストレージのサイズを計算
      const trackLogKeys = trackLogStorage.getAllKeys();
      trackLogKeys.forEach((key) => {
        const value = trackLogStorage.getString(key);
        if (value) {
          totalSize += key.length + value.length;
        }
      });
      
      // bytesをMBに変換
      const sizeInMB = totalSize / 1024 / 1024;
      // console.log('Total MMKV storage size:', sizeInMB.toFixed(2), 'MB');
      
      return sizeInMB;
    } catch (error) {
      // console.error('Failed to calculate storage size:', error);
      return 0;
    }
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
    checkRecordsModifiable,
    calculateStorageSize,
    setIsEditingRecord,
  } as const;
};
