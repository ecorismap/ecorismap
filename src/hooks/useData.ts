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
import { filterRecords, getDefaultField, sortData, SortOrderType } from '../utils/Data';

import { setDataFilterForLayerAction } from '../modules/settings';
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
  filterText: string;
  filterFieldName: string;
  isFiltering: boolean;
  setFilter: (text: string, fieldName: string) => void;
  clearFilter: () => void;
  showOnlyFilteredRecords: () => void;
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

//「絞り込み結果だけ地図に表示」を押した時点のvisible。解除時に戻すために使う。
//絞り込み自体と違いアプリ再起動後は意味を持たないため、Reduxではなくメモリに置く
const visibilitySnapshots: { [layerId: string]: { [recordId: string]: boolean } } = {};

export const clearAllVisibilitySnapshots = () => {
  Object.keys(visibilitySnapshots).forEach((key) => delete visibilitySnapshots[key]);
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
  //絞り込みは解除するまで維持する。画面遷移でこのhookはアンマウントされるためReduxに置く
  //（fieldNameが空文字なら「すべてのフィールド」）
  const dataFilter = useSelector((state: RootState) => state.settings.dataFilterPerLayer?.[layerId], shallowEqual);
  const filterText = dataFilter?.text ?? '';
  const filterFieldName = dataFilter?.fieldName ?? '';

  //条件と対象列は必ず一緒に設定する（別々のsetterだと後の呼び出しが前の値を古い状態で上書きしてしまう）
  const setFilter = useCallback(
    (text: string, fieldName: string) => {
      dispatch(setDataFilterForLayerAction({ layerId, text, fieldName }));
    },
    [dispatch, layerId]
  );

  const allUserRecordSet = useSelector((state: RootState) => selectNonDeletedAllUserRecordSet(state, targetLayer?.id));

  const isFiltering = useMemo(() => filterText.trim() !== '', [filterText]);

  //一覧に出すレコード。チェックリストと並行配列にする必要があるため、表示側ではなくここで絞り込む
  const filteredRecordSet = useMemo(() => {
    if (targetLayer === undefined) return allUserRecordSet ?? [];
    return filterRecords(allUserRecordSet ?? [], targetLayer, filterText, filterFieldName);
  }, [allUserRecordSet, targetLayer, filterText, filterFieldName]);

  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );

  const isChecked = useMemo(() => checkList.some((c) => c?.checked), [checkList]);

  const checkedRecords = useMemo(
    () => sortedRecordSet.filter((_, i) => checkList[i]?.checked),
    [sortedRecordSet, checkList]
  );

  //絞り込み中に列構成が変わらないよう、絞り込み前のレコードで判定する
  const isMapMemoLayer = useMemo(
    () => (allUserRecordSet ?? []).some((r) => r.field._strokeColor !== undefined),
    [allUserRecordSet]
  );

  const isClosedProject = projectId === undefined;
  const isEditable = useMemo(
    () => isClosedProject || isSettingProject || targetLayer?.permission !== 'COMMON',
    [isClosedProject, isSettingProject, targetLayer?.permission]
  );

  const changeOrder = useCallback(
    (colName: string, order: SortOrderType, checkList_: CheckListItem[] = checkList) => {
      // allUserRecordSetが空またはundefinedの場合の処理
      const recordSet = filteredRecordSet || [];

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
      //ソート設定が変わったときのみdispatch（レコード更新のたびにlayers全体が再生成されるのを防ぐ）
      if (targetLayer.sortedOrder !== order || targetLayer.sortedName !== colName) {
        dispatch(updateLayerAction({ ...targetLayer, sortedOrder: order, sortedName: colName }));
      }
    },
    [checkList, dispatch, filteredRecordSet, targetLayer]
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
      //絞り込み中はストアのレコードを丸ごと置き換えると絞り込みから外れたレコードが消えるため受け付けない
      if (isFiltering) return;
      //列ソート中は表示順で置き換えるとストア順(追加順=連番採番の基準)が壊れるため受け付けない
      if (sortedOrder !== 'UNSORTED') return;
      changeCheckedAll(false);
      // userIdごとにグループ化（undefinedはキー'undefined'として処理）
      const userMap: { [userId: string]: RecordType[] } = {};
      sortedRecordSet_.forEach((record) => {
        const key = record.userId ?? 'undefined';
        if (!userMap[key]) userMap[key] = [];
        userMap[key].push(record);
      });
      Object.entries(userMap).forEach(([userId, data]) => {
        dispatch(
          setRecordSetAction({ layerId: targetLayer.id, userId: userId === 'undefined' ? undefined : userId, data })
        );
      });
    },
    [changeCheckedAll, dispatch, isFiltering, sortedOrder, targetLayer]
  );

  //レコードのvisibleをまとめて更新する（userIdごとにdispatchが必要）
  const dispatchVisibility = useCallback(
    (records: RecordType[]) => {
      const userMap: { [userId: string]: RecordType[] } = {};
      records.forEach((record) => {
        const key = record.userId ?? 'undefined';
        if (!userMap[key]) userMap[key] = [];
        userMap[key].push(record);
      });
      Object.entries(userMap).forEach(([userId, data]) => {
        dispatch(
          updateRecordsAction({ layerId: targetLayer.id, userId: userId === 'undefined' ? undefined : userId, data })
        );
      });
    },
    [dispatch, targetLayer]
  );

  //絞り込み結果のレコードだけを地図に表示する
  const showOnlyFilteredRecords = useCallback(() => {
    //連続で押しても最初の状態を保つ（2回目に控えると絞り込み後の状態を覚えてしまう）
    if (visibilitySnapshots[layerId] === undefined) {
      visibilitySnapshots[layerId] = Object.fromEntries(allUserRecordSet.map((r) => [r.id, r.visible]));
    }
    dispatch(setAllRecordsVisibilityAction({ layerId: targetLayer.id, visible: false }));
    dispatchVisibility(sortedRecordSet.map((record) => ({ ...record, visible: true })));
  }, [allUserRecordSet, dispatch, dispatchVisibility, layerId, sortedRecordSet, targetLayer]);

  //解除は対象列も一緒に戻す（列だけ残るとヘッダのフィルタアイコンが消えない）
  const clearFilter = useCallback(() => {
    dispatch(setDataFilterForLayerAction({ layerId, text: '', fieldName: '' }));

    const snapshot = visibilitySnapshots[layerId];
    if (snapshot === undefined) return;
    delete visibilitySnapshots[layerId];
    //スナップショット後に追加されたレコードは対象外。変化した分だけ戻す
    const restored = allUserRecordSet
      .filter((r) => snapshot[r.id] !== undefined && r.visible !== snapshot[r.id])
      .map((r) => ({ ...r, visible: snapshot[r.id] }));
    if (restored.length > 0) dispatchVisibility(restored);
  }, [allUserRecordSet, dispatch, dispatchVisibility, layerId]);

  const addDefaultRecord = useCallback(
    (
      fields?: { [key: string]: string | number | PhotoType[] },
      currentLocation?: { latitude: number; longitude: number; altitude?: number }
    ) => {
      const id = ulid();
      // 採番(連番/前回値引き継ぎ)はソート状態に依存しないよう、未ソートのストア順(末尾が最新追加)を使用する
      const ownRecordSet = allUserRecordSet.filter((d) => d.userId === dataUser.uid);
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
    [allUserRecordSet, targetLayer, dataUser.uid, dataUser.displayName, dispatch]
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
  }, [filteredRecordSet, targetLayer]);

  return {
    sortedRecordSet,
    isChecked,
    checkList,
    checkedRecords,
    isMapMemoLayer,
    sortedOrder,
    sortedName,
    isEditable,
    filterText,
    filterFieldName,
    isFiltering,
    setFilter,
    clearFilter,
    showOnlyFilteredRecords,
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
