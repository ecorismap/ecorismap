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

import { useRoute } from '@react-navigation/native';
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
  changeChecked: (index: number) => void;
  changeCheckedAll: (checked: boolean) => void;
  changeOrder: (colname: string, order: SortOrderType) => void;
  addDefaultRecord: (fields?: { [key: string]: string | number | PhotoType[] }) => RecordType;
  deleteRecords: () => void;
  updateRecordSetOrder: (sortedRecordSet_: RecordType[]) => void;
};

export const useData = (layerId: string): UseDataReturnType => {
  const dispatch = useDispatch();
  const targetLayer = useSelector((state: RootState) => state.layers.find((l) => l.id === layerId)!, shallowEqual);
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: RootState) => state.user, shallowEqual);
  const route = useRoute();
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

  const isEditable = useMemo(
    () => isSettingProject || targetLayer.permission !== 'COMMON',
    [isSettingProject, targetLayer.permission]
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

  const changeChecked = useCallback(
    (index: number) => {
      const updatedCheckList = [...checkList];
      updatedCheckList[index].checked = !checkList[index].checked;
      setCheckList(updatedCheckList);
    },
    [checkList]
  );

  const updateRecordSetOrder = useCallback(
    (sortedRecordSet_: RecordType[]) => {
      changeCheckedAll(false);
      // userIdごとにグループ化
      const userMap: { [userId: string]: RecordType[] } = {};
      sortedRecordSet_.forEach((record) => {
        if (!record.userId) return;
        if (!userMap[record.userId]) userMap[record.userId] = [];
        userMap[record.userId].push(record);
      });
      Object.entries(userMap).forEach(([userId, data]) => {
        dispatch(setRecordSetAction({ layerId: targetLayer.id, userId, data }));
      });
    },
    [changeCheckedAll, dispatch, targetLayer]
  );

  const addDefaultRecord = useCallback(
    (fields?: { [key: string]: string | number | PhotoType[] }) => {
      const id = ulid();
      const ownRecordSet = sortedRecordSet.filter((d) => d.userId === dataUser.uid);
      const field = getDefaultField(targetLayer, ownRecordSet, id);

      const newData: RecordType = {
        id: id,
        userId: dataUser.uid,
        displayName: dataUser.displayName,
        visible: true,
        redraw: false,
        coords: undefined,
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
    if (route.name !== 'Data' && route.name !== 'DataEdit') return;
    changeOrder(targetLayer.sortedName || '', targetLayer.sortedOrder || 'UNSORTED');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allUserRecordSet, route.name, targetLayer]);

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
