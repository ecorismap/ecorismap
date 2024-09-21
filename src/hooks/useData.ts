import { useCallback, useEffect, useMemo, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { CheckListItem, LayerType, PhotoType, RecordType } from '../types';

import { RootState } from '../store';
import { addRecordsAction, deleteRecordsAction, setRecordSetAction, updateRecordsAction } from '../modules/dataSet';
import { ulid } from 'ulid';
import { getDefaultField, sortData, SortOrderType } from '../utils/Data';

import { usePermission } from './usePermission';
import { t } from '../i18n/config';
import { useRoute } from '@react-navigation/native';
import { updateLayerAction } from '../modules/layers';

export type UseDataReturnType = {
  allUserRecordSet: RecordType[];
  isChecked: boolean;
  checkList: CheckListItem[];
  checkedRecords: RecordType[];
  isMapMemoLayer: boolean;
  sortedOrder: SortOrderType;
  sortedName: string;
  changeVisible: (record: RecordType) => void;
  changeVisibleAll: (visible: boolean) => void;
  changeChecked: (index: number) => void;
  changeCheckedAll: (checked: boolean) => void;
  changeOrder: (colname: string, order: SortOrderType) => void;
  addDefaultRecord: (fields?: { [key: string]: string | number | PhotoType[] }) => RecordType;
  deleteRecords: () => void;
  checkRecordEditable: (
    targetLayer: LayerType,
    feature?: RecordType
  ) => {
    isOK: boolean;
    message: string;
  };
  updateOwnRecordSetOrder: (allUserRecordSet_: RecordType[]) => void;
};

export const useData = (layerId: string): UseDataReturnType => {
  const dispatch = useDispatch();
  const targetLayer = useSelector((state: RootState) => state.layers.find((l) => l.id === layerId)!, shallowEqual);
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: RootState) => state.user, shallowEqual);
  const dataSet = useSelector((state: RootState) => state.dataSet, shallowEqual);
  const { isRunningProject } = usePermission();
  const route = useRoute();
  const [allUserRecordSet, setAllUserRecordSet] = useState<RecordType[]>([]);
  const [checkList, setCheckList] = useState<CheckListItem[]>([]);
  const [sortedOrder, setSortedOrder] = useState<SortOrderType>(targetLayer.sortedOrder || 'UNSORTED');
  const [sortedName, setSortedName] = useState<string>(targetLayer.sortedName || '');

  const originalData = useMemo(
    () => dataSet.flatMap((d) => (d.layerId === targetLayer.id ? d.data : [])),
    [dataSet, targetLayer.id]
  );
  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );
  const ownRecordSet = useMemo(
    () => allUserRecordSet.filter((d) => d.userId === dataUser.uid),
    [allUserRecordSet, dataUser.uid]
  );
  const isChecked = useMemo(() => checkList.some((c) => c?.checked), [checkList]);

  const checkedRecords = useMemo(
    () => allUserRecordSet.filter((_, i) => checkList[i]?.checked),
    [allUserRecordSet, checkList]
  );

  const isMapMemoLayer = useMemo(
    () => allUserRecordSet.some((r) => r.field._strokeColor !== undefined),
    [allUserRecordSet]
  );

  const checkRecordEditable = useCallback(
    (targetLayer_: LayerType, feature?: RecordType) => {
      if (isRunningProject && targetLayer_.permission === 'COMMON') {
        return { isOK: false, message: t('hooks.message.lockProject') };
      }
      if (isRunningProject && feature && feature.userId !== user.uid) {
        return { isOK: false, message: t('hooks.message.cannotEditOthers') };
      }
      if (!targetLayer_.active) {
        return { isOK: false, message: t('hooks.message.noEditMode') };
      }

      return { isOK: true, message: '' };
    },
    [isRunningProject, user.uid]
  );

  const changeOrder = useCallback(
    (colName: string, order: SortOrderType, checkList_: CheckListItem[] = checkList) => {
      if (order === 'UNSORTED') {
        const newCheckList = originalData.map(
          (_, idx) => checkList_.find((c) => idx === c.id) ?? { id: idx, checked: false }
        );
        setCheckList(newCheckList);
        setAllUserRecordSet(originalData);
      } else {
        const result = sortData(originalData, colName, order);
        const newCheckList = result.idx.map((d) => checkList_.find((c) => d === c.id) ?? { id: d, checked: false });
        setCheckList(newCheckList);
        setAllUserRecordSet(result.data);
      }
      setSortedOrder(order);
      setSortedName(colName);
      dispatch(updateLayerAction({ ...targetLayer, sortedOrder: order, sortedName: colName }));
    },
    [checkList, dispatch, originalData, targetLayer]
  );

  const changeVisibleAll = useCallback(
    (visible: boolean) => {
      const data = dataSet.filter((d) => d.layerId === targetLayer.id);
      data.forEach((d) =>
        dispatch(
          setRecordSetAction({
            ...d,
            data: d.data.map((record) => ({ ...record, visible })),
          })
        )
      );
    },
    [dataSet, dispatch, targetLayer.id]
  );

  const changeVisible = useCallback(
    (record: RecordType) => {
      let updatedRecords;
      if (isMapMemoLayer) {
        //同じグループのレコードを取得
        const subGroupRecords = allUserRecordSet.filter((r) => r.field._group === record.id);
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
    [allUserRecordSet, dispatch, isMapMemoLayer, targetLayer.id]
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

  const updateOwnRecordSetOrder = useCallback(
    (allUserRecordSet_: RecordType[]) => {
      changeCheckedAll(false);
      const ownRecordSet_ = allUserRecordSet_.filter((d) => d.userId === dataUser.uid);

      dispatch(setRecordSetAction({ layerId: targetLayer.id, userId: dataUser.uid, data: ownRecordSet_ }));
    },
    [changeCheckedAll, dataUser.uid, dispatch, targetLayer.id]
  );

  const addDefaultRecord = useCallback(
    (fields?: { [key: string]: string | number | PhotoType[] }) => {
      const id = ulid();
      const field = getDefaultField(targetLayer, ownRecordSet, id);

      const newData: RecordType = {
        id: id,
        userId: dataUser.uid,
        displayName: dataUser.displayName,
        visible: true,
        redraw: false,
        coords: undefined,
        field: { ...field, ...fields },
      };
      dispatch(addRecordsAction({ layerId: targetLayer.id, userId: dataUser.uid, data: [newData] }));
      setCheckList([]);
      return newData;
    },
    [targetLayer, ownRecordSet, dataUser.uid, dataUser.displayName, dispatch]
  );

  const deleteRecords = useCallback(() => {
    let deletedRecords: RecordType[] = [];
    if (isMapMemoLayer) {
      //同じグループのレコードを取得
      checkedRecords.forEach((record) => {
        if (record.field._group && record.field._group !== '') return; //自身がsubGroupの場合はスキップ
        const subGroupRecords = allUserRecordSet.filter((r) => r.field._group === record.id);
        deletedRecords = [...deletedRecords, record, ...subGroupRecords];
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
  }, [allUserRecordSet, checkedRecords, dataUser.uid, dispatch, isMapMemoLayer, targetLayer.id]);

  useEffect(() => {
    if (route.name !== 'Data' && route.name !== 'DataEdit') return;
    if (dataSet === undefined) return;
    changeOrder(targetLayer.sortedName || '', targetLayer.sortedOrder || 'UNSORTED');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSet, route.name]);

  return {
    allUserRecordSet,
    isChecked,
    checkList,
    checkedRecords,
    isMapMemoLayer,
    sortedOrder,
    sortedName,
    changeVisible,
    changeVisibleAll,
    changeChecked,
    changeCheckedAll,
    changeOrder,
    addDefaultRecord,
    deleteRecords,
    checkRecordEditable,
    updateOwnRecordSetOrder,
  } as const;
};
