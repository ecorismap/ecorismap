import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ExportType, FormatType, LayerType, PhotoType, RecordType } from '../types';
import { generateCSV, generateGeoJson, generateGPX } from '../utils/Geometry';
import { AppState } from '../modules';
import { addRecordsAction, deleteRecordsAction, updateRecordsAction } from '../modules/dataSet';
import { v4 as uuidv4 } from 'uuid';
import { getDefaultFieldObject, sortData, SortOrderType } from '../utils/Data';
import { getLayerSerial } from '../utils/Layer';
import { hasOpened } from '../utils/Project';
import { exportDataAndPhoto } from '../utils/File';
import { usePhoto } from './usePhoto';
import { t } from '../i18n/config';
import dayjs from 'dayjs';

export type UseDataReturnType = {
  isOwnerAdmin: boolean;
  allUserRecordSet: RecordType[];
  ownRecordSet: RecordType[];
  isChecked: boolean;
  checkList: boolean[];
  sortedName: string;
  sortedOrder: SortOrderType;
  changeVisible: (index: number, visible: boolean) => void;
  changeChecked: (index: number, checked: boolean) => void;
  changeOrder: (colname: string, format: FormatType | '_user_') => void;
  addRecord: (referenceDataId?: string | undefined) => Promise<{
    isOK: boolean;
    message: string;
    data: RecordType | undefined;
  }>;
  deleteSelectedRecords: () => Promise<{
    isOK: boolean;
    message: string;
  }>;
  exportRecords: () => Promise<{
    isOK: boolean;
    message: string;
  }>;
};

export const useData = (targetLayer: LayerType): UseDataReturnType => {
  const dispatch = useDispatch();
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const user = useSelector((state: AppState) => state.user);
  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );

  const tracking = useSelector((state: AppState) => state.settings.tracking);
  const dataSet = useSelector((state: AppState) => state.dataSet);
  const role = useSelector((state: AppState) => state.settings.role);
  const isSettingProject = useSelector((state: AppState) => state.settings.isSettingProject);
  const { deleteRecordPhotos } = usePhoto();
  const [allUserRecordSet, setAllUserRecordSet] = useState<RecordType[]>([]);
  const [sortedOrder, setSortedOrder] = useState<SortOrderType>('UNSORTED');
  const [sortedName, setSortedName] = useState<string>('');
  const [checkList, setCheckList] = useState<boolean[]>([]);

  const ownRecordSet = useMemo(
    () => allUserRecordSet.filter((d) => d.userId === dataUser.uid),
    [allUserRecordSet, dataUser.uid]
  );
  const isChecked = useMemo(() => checkList.some((d) => d), [checkList]);
  const isOwnerAdmin = useMemo(() => role === 'OWNER' || role === 'ADMIN', [role]);

  const changeOrder = useCallback(
    (colname: string, format: FormatType | '_user_' | null, order?: SortOrderType, data?: RecordType[]) => {
      if (format === 'PHOTO') return;
      let sortOrder: SortOrderType;

      if (order) {
        sortOrder = order;
      } else if (sortedName === colname && sortedOrder === 'ASCENDING') {
        sortOrder = 'DESCENDING';
      } else {
        sortOrder = 'ASCENDING';
      }
      let targetData = allUserRecordSet;
      if (data) targetData = data;
      const { data: sortedData, idx } = sortData(targetData, colname, sortOrder);
      const sortedCheckList = idx.map((d) => checkList[d]);
      setSortedOrder(sortOrder);
      setSortedName(colname);
      setCheckList(sortedCheckList);
      setAllUserRecordSet(sortedData);
    },
    [allUserRecordSet, checkList, sortedName, sortedOrder]
  );

  const changeVisible = useCallback(
    (index: number, visible: boolean) => {
      if (index >= 0) {
        const record = allUserRecordSet[index];
        dispatch(
          updateRecordsAction({
            layerId: targetLayer.id,
            userId: record.userId,
            data: [{ ...record, visible }],
          })
        );
      } else {
        dataSet.forEach((d) => {
          const recordSetbyUser = allUserRecordSet
            .map((record) => record.userId === d.userId && { ...record, visible })
            .filter((v): v is RecordType => !v !== undefined);
          if (recordSetbyUser.length > 0) {
            dispatch(
              updateRecordsAction({
                layerId: targetLayer.id,
                userId: d.userId,
                data: recordSetbyUser,
              })
            );
          }
        });
      }
    },
    [allUserRecordSet, dataSet, dispatch, targetLayer.id]
  );

  const changeChecked = useCallback(
    (index: number, checked: boolean) => {
      if (index >= 0) {
        const updatedCheckList = [...checkList];
        updatedCheckList[index] = checked;
        setCheckList(updatedCheckList);
      } else {
        //タイトルのチェックで全部を変更。indexは-1
        const updatedCheckList = checkList.map((_d) => checked);
        setCheckList(updatedCheckList);
      }
    },
    [checkList]
  );

  const deleteSelectedRecords = useCallback(async () => {
    //自分が削除できるデータか確認
    const hasOthersData = checkList.some(
      (checked, i) => checked && allUserRecordSet[i].userId !== undefined && allUserRecordSet[i].userId !== dataUser.uid
    );
    if (tracking !== undefined && tracking.layerId === targetLayer.id) {
      return { isOK: false, message: t('hooks.message.cannotDeleteInTracking') };
    }
    if (hasOpened(projectId) && hasOthersData) {
      return { isOK: false, message: t('hooks.message.cannotDeleteOthers') };
    }
    if (!targetLayer.active) {
      return { isOK: false, message: t('hooks.message.noEditMode') };
    }
    if (targetLayer.permission === 'COMMON' && hasOpened(projectId) && isOwnerAdmin && !isSettingProject) {
      return { isOK: false, message: t('hooks.message.lockProject') };
    }
    if (targetLayer.permission === 'COMMON' && hasOpened(projectId) && !isOwnerAdmin) {
      return { isOK: false, message: t('hooks.message.noPermissionToCommon') };
    }

    const records = allUserRecordSet.filter((_, i) => checkList[i]);
    records.forEach((record) => {
      deleteRecordPhotos(targetLayer, record, projectId, record.userId);
    });

    dispatch(
      deleteRecordsAction({
        layerId: targetLayer.id,
        userId: dataUser.uid,
        data: records,
      })
    );
    return { isOK: true, message: '' };
  }, [
    allUserRecordSet,
    checkList,
    dataUser.uid,
    deleteRecordPhotos,
    dispatch,
    isSettingProject,
    isOwnerAdmin,
    projectId,
    targetLayer,
    tracking,
  ]);

  const exportRecords = useCallback(async () => {
    const exportData: { data: string; name: string; type: ExportType | 'PHOTO'; folder: string }[] = [];
    const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const records = allUserRecordSet.filter((_, i) => checkList[i]);
    //GeoJSON
    const geojson = generateGeoJson(records, targetLayer.field, targetLayer.type, targetLayer.name);
    const geojsonData = JSON.stringify(geojson);
    const geojsonName = `${targetLayer.name}_${time}.geojson`;
    exportData.push({ data: geojsonData, name: geojsonName, type: 'GeoJSON', folder: '' });
    //CSV
    const csv = generateCSV(records, targetLayer.field, targetLayer.type);
    const csvData = csv;
    const csvName = `${targetLayer.name}_${time}.csv`;
    exportData.push({ data: csvData, name: csvName, type: 'CSV', folder: '' });
    //GPX
    if (targetLayer.type === 'POINT' || targetLayer.type === 'LINE') {
      const gpx = generateGPX(records, targetLayer.type);
      const gpxData = gpx;
      const gpxName = `${targetLayer.name}_${time}.gpx`;
      exportData.push({ data: gpxData, name: gpxName, type: 'GPX', folder: '' });
    }
    //Photo

    const photoFields = targetLayer.field.filter((f) => f.format === 'PHOTO');
    records.forEach((record) => {
      photoFields.forEach((photoField) => {
        (record.field[photoField.name] as PhotoType[]).forEach((photo) => {
          if (photo.uri) {
            exportData.push({ data: photo.uri, name: photo.name, type: 'PHOTO', folder: '' });
          }
        });
      });
    });

    const exportDataName = `${targetLayer.name}_${time}`;
    const isOK = await exportDataAndPhoto(exportData, exportDataName, 'zip');
    if (!isOK) return { isOK: false, message: t('hooks.message.failExport') };
    return { isOK: true, message: '' };
  }, [allUserRecordSet, checkList, targetLayer]);

  const addRecord = useCallback(
    async (referenceDataId?: string) => {
      if (!targetLayer.active) {
        return { isOK: false, message: t('hooks.message.noEditMode'), data: undefined };
      }
      if (targetLayer.permission === 'COMMON' && hasOpened(projectId) && isOwnerAdmin && !isSettingProject) {
        return { isOK: false, message: t('hooks.message.unlockToEditCommon'), data: undefined };
      }
      if (targetLayer.permission === 'COMMON' && hasOpened(projectId) && !isOwnerAdmin) {
        return { isOK: false, message: t('hooks.message.noPermissionToCommon'), data: undefined };
      }
      if (targetLayer.type !== 'NONE' && targetLayer.type !== 'POINT') {
        //ボタンをdisableにした方が良いかも？
        return { isOK: false, message: t('hooks.message.cannotThisLayer'), data: undefined };
      }

      const serial = getLayerSerial(targetLayer, ownRecordSet);

      let newData: RecordType = {
        id: uuidv4(),
        userId: dataUser.uid,
        displayName: dataUser.displayName,
        visible: true,
        redraw: false,
        coords: { latitude: 0, longitude: 0 },
        field: {},
      };

      let field = targetLayer.field
        .map(({ name, format, list, defaultValue }) => getDefaultFieldObject(name, format, list, defaultValue, serial))
        /* @ts-ignore */
        .reduce((obj, userObj) => Object.assign(obj, userObj), {});
      field = referenceDataId !== undefined ? { ...field, _ReferenceDataId: referenceDataId } : field;
      newData = { ...newData, field: field } as RecordType;
      //console.log("###", newData);
      dispatch(addRecordsAction({ layerId: targetLayer.id, userId: dataUser.uid, data: [newData] }));
      return { isOK: true, message: '', data: newData };
    },
    [targetLayer, projectId, isOwnerAdmin, isSettingProject, ownRecordSet, dataUser.uid, dataUser.displayName, dispatch]
  );

  useEffect(() => {
    const data = dataSet.map((d) => (d.layerId === targetLayer.id ? d.data : [])).flat();
    // console.log(dataSet);

    setCheckList(new Array(data.length).fill(false));
    if (sortedOrder !== 'UNSORTED') {
      changeOrder(sortedName, null, sortedOrder, data);
    } else {
      setAllUserRecordSet(data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSet, targetLayer.id]);

  return {
    isOwnerAdmin,
    allUserRecordSet,
    ownRecordSet,
    isChecked,
    checkList,
    sortedName,
    sortedOrder,
    changeVisible,
    changeChecked,
    changeOrder,
    addRecord,
    deleteSelectedRecords,
    exportRecords,
  } as const;
};
