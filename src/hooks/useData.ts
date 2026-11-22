import { useCallback, useEffect, useMemo, useState } from 'react';
import { shallowEqual, useDispatch, useSelector, useStore } from 'react-redux';
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
import { filterRecords, getDefaultField, getFilterCandidates, sortData, SortOrderType } from '../utils/Data';

import { setDataFilterForLayerAction } from '../modules/settings';
import { updateLayerAction } from '../modules/layers';
import { selectNonDeletedAllUserRecordSet, selectNonDeletedLayerRecordSetWithChildren } from '../modules/selectors';
import { deleteRecordPhotos } from '../utils/Photo';
import { useProject } from './useProject';
import { getRecordModifyBlock, recordModifyBlockMessageKey } from '../utils/recordTakeover';
import { t } from '../i18n/config';

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
  getFieldCandidates: (fieldName: string) => string[];
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
  /** チェックした記録を消す。他のメンバー・テンプレートの記録を含み、消せないときは何も消さずに理由を返す */
  deleteRecords: () => { isOK: boolean; message: string };
  withChildRecords: (records: RecordType[]) => RecordType[];
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
  const store = useStore<RootState>();
  const targetLayer = useSelector((state: RootState) => state.layers.find((l) => l.id === layerId)!, shallowEqual);
  // console.log('🔍 targetLayer:', targetLayer?.name, 'type:', targetLayer?.type);
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: RootState) => state.user, shallowEqual);
  // console.log('🔍 route.params:', route.params);
  const { isSettingProject, isOwnerAdmin } = useProject();
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
  //一覧（allUserRecordSet）は _group でぶら下がる子を除くので、子はこちらから探す
  const layerRecordSetWithChildren = useSelector((state: RootState) =>
    selectNonDeletedLayerRecordSetWithChildren(state, targetLayer?.id)
  );

  //親ごとに、その親へ _group でぶら下がる子を後ろに付けて返す（マップメモの子ストローク、飛翔図の行動記号）。
  //子を一覧（絞り込み・ソート済み）から探すと、一覧は子を除いているので必ず空になり、
  //親だけ消える・隠れる・書き出されて、孤立した子が残ったり他のメンバーへ配られたりする。
  //子自身が渡されたときは親の処理で拾うので二重に入れない
  const withChildRecords = useCallback(
    (records: RecordType[]) => {
      const childrenByParent = new Map<string, RecordType[]>();
      layerRecordSetWithChildren.forEach((r) => {
        const group = r.field._group;
        if (typeof group !== 'string' || group === '') return;
        const list = childrenByParent.get(group);
        if (list) list.push(r);
        else childrenByParent.set(group, [r]);
      });
      const result: RecordType[] = [];
      const added = new Set<string>();
      records.forEach((record) => {
        if (record.field._group && record.field._group !== '') return;
        [record, ...(childrenByParent.get(record.id) ?? [])].forEach((r) => {
          if (added.has(r.id)) return;
          added.add(r.id);
          result.push(r);
        });
      });
      return result;
    },
    [layerRecordSetWithChildren]
  );

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
        // DATETIME列は時刻で比べる（ISOと旧ネイティブのロケール形式が混在しうるため文字列比較では時系列にならない）
        const format = targetLayer?.field.find((f) => f.name === colName)?.format;
        const result = sortData(recordSet, colName, order, format);
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
      //子も親と同じ表示にする。updateRecordsAction は集合に無い id を追加してしまうため、親と同じ名義の子だけを渡す
      const updatedRecords = withChildRecords([record])
        .filter((r) => r.userId === record.userId)
        .map((r) => ({ ...r, visible: !record.visible }));
      dispatch(
        updateRecordsAction({
          layerId: targetLayer.id,
          userId: record.userId,
          data: updatedRecords,
        })
      );
    },
    [withChildRecords, dispatch, targetLayer]
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
      // 一覧に出ないレコード（削除の墓標、_group でぶら下がる行動記号・子ストローク）も同じ集合にある。
      // 一覧の並びだけで置き換えるとそれらが消え、子はクラウドからも消え、墓標が消えると別端末から削除したものが戻る。
      // 一覧に出るものだけを並べ替え、出ないものは元の並びのまま後ろに残す
      const currentDataSet = store.getState().dataSet;
      Object.entries(userMap).forEach(([userId, data]) => {
        const bucketUserId = userId === 'undefined' ? undefined : userId;
        const current = currentDataSet.find((d) => d.layerId === targetLayer.id && d.userId === bucketUserId)?.data ?? [];
        const listedIds = new Set(data.map((record) => record.id));
        const hidden = current.filter((record) => !listedIds.has(record.id));
        dispatch(setRecordSetAction({ layerId: targetLayer.id, userId: bucketUserId, data: [...data, ...hidden] }));
      });
    },
    [changeCheckedAll, dispatch, isFiltering, sortedOrder, store, targetLayer]
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
      //子も全件非表示にされるので、解除で戻せるよう子の状態も控える
      visibilitySnapshots[layerId] = Object.fromEntries(layerRecordSetWithChildren.map((r) => [r.id, r.visible]));
    }
    dispatch(setAllRecordsVisibilityAction({ layerId: targetLayer.id, visible: false }));
    dispatchVisibility(withChildRecords(sortedRecordSet).map((record) => ({ ...record, visible: true })));
  }, [dispatch, dispatchVisibility, layerId, layerRecordSetWithChildren, sortedRecordSet, targetLayer, withChildRecords]);

  //解除は対象列も一緒に戻す（列だけ残るとヘッダのフィルタアイコンが消えない）
  const clearFilter = useCallback(() => {
    dispatch(setDataFilterForLayerAction({ layerId, text: '', fieldName: '' }));

    const snapshot = visibilitySnapshots[layerId];
    if (snapshot === undefined) return;
    delete visibilitySnapshots[layerId];
    //スナップショット後に追加されたレコードは対象外。変化した分だけ戻す
    const restored = layerRecordSetWithChildren
      .filter((r) => snapshot[r.id] !== undefined && r.visible !== snapshot[r.id])
      .map((r) => ({ ...r, visible: snapshot[r.id] }));
    if (restored.length > 0) dispatchVisibility(restored);
  }, [dispatch, dispatchVisibility, layerId, layerRecordSetWithChildren]);

  //絞り込みモーダルの候補。別の値へ切り替えられるよう、絞り込み後ではなく全レコードから作る
  const getFieldCandidates = useCallback(
    (fieldName: string) =>
      targetLayer === undefined ? [] : getFilterCandidates(allUserRecordSet ?? [], targetLayer, fieldName),
    [allUserRecordSet, targetLayer]
  );

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
    //子はマップメモに限らず親と一緒に消す（飛翔図の行動記号も _group でぶら下がる）。残すと地図に孤立して残り、
    //一覧に出ないので消す手段も無く、アップロードで他のメンバーにも配られる
    const deletedRecords = withChildRecords(checkedRecords);
    //他のメンバー・テンプレートの記録を消せるのは管理者だけ（同期監査 M8）。一部だけ消すと、どれが残ったのか
    //利用者に分からないので、消せないものが1つでもあれば何も消さずに理由を返す
    const isRunningProject = !isClosedProject && !isSettingProject;
    for (const record of deletedRecords) {
      const block = getRecordModifyBlock({
        layer: targetLayer,
        recordUserId: record.userId,
        action: 'delete',
        ownUserId: dataUser.uid,
        isOwnerAdmin,
        isRunningProject,
      });
      if (block !== undefined) {
        return { isOK: false, message: `${t('Data.alert.cannotDeleteOthersRecords')}\n${t(recordModifyBlockMessageKey(block))}` };
      }
    }
    //写真の削除は従来どおりマップメモのときだけ（挙動を変えない）
    if (isMapMemoLayer) {
      checkedRecords.forEach((record) => {
        if (record.field._group && record.field._group !== '') return;
        deleteRecordPhotos(targetLayer, record);
      });
    }
    setCheckList([]);
    //記録のある集合（名義）ごとに消す。以前は自分の集合だけを指定していたので、テンプレートや他のメンバーの記録は
    //チェックしても消えなかった。他のメンバーの記録は、ストアの所有権の規則（modules/recordOwnership）が
    //管理者の引き継いだ墓標に置き換える
    const byBucket = new Map<string | undefined, RecordType[]>();
    deletedRecords.forEach((record) => {
      const list = byBucket.get(record.userId);
      if (list === undefined) byBucket.set(record.userId, [record]);
      else list.push(record);
    });
    byBucket.forEach((data, userId) => {
      dispatch(deleteRecordsAction({ layerId: targetLayer.id, userId, data }));
    });
    return { isOK: true, message: '' };
  }, [
    withChildRecords,
    checkedRecords,
    isClosedProject,
    isSettingProject,
    targetLayer,
    dataUser.uid,
    isOwnerAdmin,
    isMapMemoLayer,
    dispatch,
  ]);

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
    getFieldCandidates,
    showOnlyFilteredRecords,
    changeVisible,
    changeVisibleAll,
    changeChecked,
    changeCheckedAll,
    changeOrder,
    addDefaultRecord,
    deleteRecords,
    withChildRecords,
    updateRecordSetOrder,
  } as const;
};
