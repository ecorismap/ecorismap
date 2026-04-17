import { useCallback, useEffect, useMemo, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { CheckListItem, PhotoType, RecordType } from '../types';

import { RootState } from '../store';
import {
  addRecordsAction,
  deleteRecordsAction,
  setAllRecordsVisibilityAction,
  setRecordSetAction,
  updateRecordsAction,
} from '../modules/dataSet';
import { ulid } from 'ulid';
import { getDefaultField, sortData, SortOrderType } from '../utils/Data';

import { updateLayerAction } from '../modules/layers';
import { selectNonDeletedAllUserRecordSet } from '../modules/selectors';
import { deleteRecordPhotos } from '../utils/Photo';
import { useProject } from './useProject';

export type UseDataReturnType = {
  sortedRecordSet: RecordType[];
  isChecked: boolean;
  checkList: CheckListItem[];
  checkedRecords: RecordType[];
  isMapMemoLayer: boolean;
  sortedOrder: SortOrderType;
  sortedName: string;
  isEditable: boolean;
  changeVisible: (record: RecordType) => void;
  changeVisibleAll: (visible: boolean) => void;
  changeChecked: (index: number, checked: boolean) => void;
  changeCheckedAll: (checked: boolean) => void;
  changeOrder: (colname: string, order: SortOrderType) => void;
  addDefaultRecord: (
    fields?: { [key: string]: string | number | PhotoType[] },
    currentLocation?: { latitude: number; longitude: number; altitude?: number }
  ) => RecordType;
  deleteRecords: () => void;
  updateRecordSetOrder: (sortedRecordSet_: RecordType[]) => void;
};

export const useData = (layerId: string): UseDataReturnType => {
  // console.log('🔍 useData called with layerId:', layerId);
  const dispatch = useDispatch();
  const targetLayer = useSelector((state: RootState) => state.layers.find((l) => l.id === layerId)!, shallowEqual);
  // console.log('🔍 targetLayer:', targetLayer?.name, 'type:', targetLayer?.type);
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: RootState) => state.user, shallowEqual);
  // console.log('🔍 route.params:', route.params);
  const { isSettingProject } = useProject();
  const [sortedRecordSet, setSortedRecordSet] = useState<RecordType[]>([]);
  const [checkList, setCheckList] = useState<CheckListItem[]>([]);
  const [sortedOrder, setSortedOrder] = useState<SortOrderType>('UNSORTED');
  const [sortedName, setSortedName] = useState<string>('');

  const allUserRecordSet = useSelector((state: RootState) => selectNonDeletedAllUserRecordSet(state, targetLayer?.id));

  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );

  const isChecked = useMemo(() => checkList.some((c) => c?.checked), [checkList]);

  const checkedRecords = useMemo(
    () => sortedRecordSet.filter((_, i) => checkList[i]?.checked),
    [sortedRecordSet, checkList]
  );

  const isMapMemoLayer = useMemo(
    () => sortedRecordSet.some((r) => r.field._strokeColor !== undefined),
    [sortedRecordSet]
  );

  const isClosedProject = projectId === undefined;
  const isEditable = useMemo(
    () => isClosedProject || isSettingProject || targetLayer?.permission !== 'COMMON',
    [isClosedProject, isSettingProject, targetLayer?.permission]
  );

  const changeOrder = useCallback(
    (colName: string, order: SortOrderType, checkList_: CheckListItem[] = checkList) => {
      // allUserRecordSetが空またはundefinedの場合の処理
      const recordSet = allUserRecordSet || [];

      if (order === 'UNSORTED') {
        const newCheckList = recordSet.map(
          (_, idx) => checkList_.find((c) => idx === c.id) ?? { id: idx, checked: false }
        );
        setCheckList(newCheckList);
        setSortedRecordSet(recordSet);
      } else {
        const result = sortData(recordSet, colName, order);
        const newCheckList = result.idx.map((d) => checkList_.find((c) => d === c.id) ?? { id: d, checked: false });
        setCheckList(newCheckList);
        setSortedRecordSet(result.data);
      }
      setSortedOrder(order);
      setSortedName(colName);
      dispatch(updateLayerAction({ ...targetLayer, sortedOrder: order, sortedName: colName }));
    },
    [checkList, dispatch, allUserRecordSet, targetLayer]
  );

  const changeVisibleAll = useCallback(
    (visible: boolean) => {
      dispatch(setAllRecordsVisibilityAction({ layerId: targetLayer.id, visible }));
    },
    [dispatch, targetLayer]
  );

  const changeVisible = useCallback(
    (record: RecordType) => {
      let updatedRecords;
      if (isMapMemoLayer) {
        //同じグループのレコードを取得
        const subGroupRecords = sortedRecordSet.filter((r) => r.field._group === record.id);
        updatedRecords = [record, ...subGroupRecords].map((r) => ({ ...r, visible: !record.visible }));
      } else {
        updatedRecords = [{ ...record, visible: !record.visible }];
      }
      dispatch(
        updateRecordsAction({
          layerId: targetLayer.id,
          userId: record.userId,
          data: updatedRecords,
        })
      );
    },
    [sortedRecordSet, dispatch, isMapMemoLayer, targetLayer]
  );

  const changeCheckedAll = useCallback(
    (checked: boolean) => {
      setCheckList(checkList.map((d) => ({ ...d, checked: checked })));
    },
    [checkList]
  );

  const changeChecked = useCallback((index: number, checked: boolean) => {
    setCheckList((prevCheckList) => prevCheckList.map((item, i) => (i === index ? { ...item, checked } : item)));
  }, []);

  const updateRecordSetOrder = useCallback(
    (sortedRecordSet_: RecordType[]) => {
      changeCheckedAll(false);
      // userIdごとにグループ化（undefinedはキー'undefined'として処理）
      const userMap: { [userId: string]: RecordType[] } = {};
      sortedRecordSet_.forEach((record) => {
        const key = record.userId ?? 'undefined';
        if (!userMap[key]) userMap[key] = [];
        userMap[key].push(record);
      });
      Object.entries(userMap).forEach(([userId, data]) => {
        dispatch(setRecordSetAction({ layerId: targetLayer.id, userId: userId === 'undefined' ? undefined : userId, data }));
      });
    },
    [changeCheckedAll, dispatch, targetLayer]
  );

  const addDefaultRecord = useCallback(
    (
      fields?: { [key: string]: string | number | PhotoType[] },
      currentLocation?: { latitude: number; longitude: number; altitude?: number }
    ) => {
      const id = ulid();
      const ownRecordSet = sortedRecordSet.filter((d) => d.userId === dataUser.uid);
      const field = getDefaultField(targetLayer, ownRecordSet, id);

      // GPS座標を使用する場合
      let coords;
      if (currentLocation && targetLayer.type === 'POINT') {
        coords = {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          altitude: currentLocation.altitude,
        };
      }

      const newData: RecordType = {
        id: id,
        userId: dataUser.uid,
        displayName: dataUser.displayName,
        visible: true,
        redraw: false,
        coords: coords,
        field: { ...field, ...fields },
        updatedAt: Date.now(),
      };
      dispatch(addRecordsAction({ layerId: targetLayer.id, userId: dataUser.uid, data: [newData] }));
      setCheckList([]);
      return newData;
    },
    [sortedRecordSet, targetLayer, dataUser.uid, dataUser.displayName, dispatch]
  );

  const deleteRecords = useCallback(() => {
    let deletedRecords: RecordType[] = [];
    if (isMapMemoLayer) {
      //同じグループのレコードを取得
      checkedRecords.forEach((record) => {
        if (record.field._group && record.field._group !== '') return; //自身がsubGroupの場合はスキップ
        const subGroupRecords = sortedRecordSet.filter((r) => r.field._group === record.id);
        deletedRecords = [...deletedRecords, record, ...subGroupRecords];
        deleteRecordPhotos(targetLayer, record);
      });
    } else {
      deletedRecords = checkedRecords;
    }
    setCheckList([]);
    dispatch(
      deleteRecordsAction({
        layerId: targetLayer.id,
        userId: dataUser.uid,
        data: deletedRecords,
      })
    );
  }, [sortedRecordSet, checkedRecords, dataUser.uid, dispatch, isMapMemoLayer, targetLayer]);

  useEffect(() => {
    if (targetLayer === undefined) return;
    // すべての画面で初期化を実行（DataEdit画面でREFERENCEフィールドが動作するように）
    changeOrder(targetLayer.sortedName || '', targetLayer.sortedOrder || 'UNSORTED');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allUserRecordSet, targetLayer]);

  return {
    sortedRecordSet,
    isChecked,
    checkList,
    checkedRecords,
    isMapMemoLayer,
    sortedOrder,
    sortedName,
    isEditable,
    changeVisible,
    changeVisibleAll,
    changeChecked,
    changeCheckedAll,
    changeOrder,
    addDefaultRecord,
    deleteRecords,
    updateRecordSetOrder,
  } as const;
};
