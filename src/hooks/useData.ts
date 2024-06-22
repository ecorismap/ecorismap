import { useCallback, useEffect, useMemo, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { ExportType, LayerType, PhotoType, RecordType } from '../types';
import { generateCSV, generateGeoJson, generateGPX } from '../utils/Geometry';
import { AppState } from '../modules';
import { addRecordsAction, deleteRecordsAction, setRecordSetAction, updateRecordsAction } from '../modules/dataSet';
import { ulid } from 'ulid';
import { getDefaultField, sortData, SortOrderType } from '../utils/Data';
import dayjs from 'dayjs';
import { usePermission } from './usePermission';
import { t } from '../i18n/config';
import { useRoute } from '@react-navigation/native';

export type UseDataReturnType = {
  allUserRecordSet: RecordType[];
  isChecked: boolean;
  checkList: { id: number; checked: boolean }[];
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
  generateExportGeoData: () => {
    exportData: {
      data: string;
      name: string;
      type: ExportType | 'PHOTO';
      folder: string;
    }[];
    fileName: string;
  };
  checkRecordEditable: (
    targetLayer: LayerType,
    feature?: RecordType
  ) => {
    isOK: boolean;
    message: string;
  };
  updateOwnRecordSetOrder: (allUserRecordSet_: RecordType[]) => void;
  setSortedOrder: (order: SortOrderType) => void;
  setSortedName: (name: string) => void;
};

export const useData = (targetLayer: LayerType): UseDataReturnType => {
  //console.log(targetLayer);
  const dispatch = useDispatch();
  const projectId = useSelector((state: AppState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: AppState) => state.user, shallowEqual);
  const dataSet = useSelector((state: AppState) => state.dataSet, shallowEqual);
  const { isRunningProject } = usePermission();
  const route = useRoute();
  const [allUserRecordSet, setAllUserRecordSet] = useState<RecordType[]>([]);
  const [checkList, setCheckList] = useState<{ id: number; checked: boolean }[]>([]);
  const [sortedOrder, setSortedOrder] = useState<SortOrderType>('UNSORTED');
  const [sortedName, setSortedName] = useState<string>('');

  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );
  const ownRecordSet = useMemo(
    () => allUserRecordSet.filter((d) => d.userId === dataUser.uid),
    [allUserRecordSet, dataUser.uid]
  );
  const isChecked = useMemo(() => checkList.some(({ checked }) => checked), [checkList]);

  const checkedRecords = useMemo(
    () => allUserRecordSet.filter((_, i) => checkList[i].checked),
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
    (colName: string, order: SortOrderType) => {
      let sortedData: RecordType[] = [];
      const data = dataSet.map((d) => (d.layerId === targetLayer.id ? d.data : [])).flat();
      if (order === 'UNSORTED') {
        const newCheckList = data.map((_, idx) => checkList.find(({ id }) => idx === id)!);
        setCheckList(newCheckList);
        setAllUserRecordSet(data);
      } else {
        const result = sortData(data, colName, order);
        sortedData = result.data;
        const newCheckList = result.idx.map((d) => checkList.find(({ id }) => d === id)!);
        setCheckList(newCheckList);
        setAllUserRecordSet(sortedData);
      }
    },
    [checkList, dataSet, targetLayer.id]
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
        coords: { latitude: 0, longitude: 0 },
        field: { ...field, ...fields },
      };
      dispatch(addRecordsAction({ layerId: targetLayer.id, userId: dataUser.uid, data: [newData] }));
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

    dispatch(
      deleteRecordsAction({
        layerId: targetLayer.id,
        userId: dataUser.uid,
        data: deletedRecords,
      })
    );
  }, [allUserRecordSet, checkedRecords, dataUser.uid, dispatch, isMapMemoLayer, targetLayer.id]);

  const generateExportGeoData = useCallback(() => {
    const exportData: { data: string; name: string; type: ExportType | 'PHOTO'; folder: string }[] = [];
    const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');

    let exportedRecords: RecordType[] = [];
    if (isMapMemoLayer) {
      checkedRecords.forEach((record) => {
        if (record.field._group && record.field._group !== '') return; //自身がsubGroupの場合はスキップ
        const subGroupRecords = allUserRecordSet.filter((r) => r.field._group === record.id);
        exportedRecords = [...exportedRecords, record, ...subGroupRecords];
      });
    } else {
      exportedRecords = checkedRecords;
    }

    //LayerSetting
    const layerSetting = JSON.stringify(targetLayer);
    exportData.push({ data: layerSetting, name: `${targetLayer.name}_${time}.json`, type: 'JSON', folder: '' });

    //GeoJSON
    if (targetLayer.type === 'POINT' || targetLayer.type === 'LINE' || targetLayer.type === 'POLYGON') {
      const geojson = generateGeoJson(
        exportedRecords,
        targetLayer.field,
        targetLayer.type,
        targetLayer.name,
        isMapMemoLayer
      );
      const geojsonData = JSON.stringify(geojson);
      const geojsonName = `${targetLayer.name}_${time}.geojson`;
      exportData.push({ data: geojsonData, name: geojsonName, type: 'GeoJSON', folder: '' });
    }
    //CSV
    if (
      targetLayer.type === 'POINT' ||
      targetLayer.type === 'LINE' ||
      targetLayer.type === 'POLYGON' ||
      targetLayer.type === 'NONE'
    ) {
      const csv = generateCSV(exportedRecords, targetLayer.field, targetLayer.type, isMapMemoLayer);
      const csvData = csv;
      const csvName = `${targetLayer.name}_${time}.csv`;
      exportData.push({ data: csvData, name: csvName, type: 'CSV', folder: '' });
    }
    //GPX
    if (targetLayer.type === 'POINT' || targetLayer.type === 'LINE') {
      const gpx = generateGPX(exportedRecords, targetLayer.type);
      const gpxData = gpx;
      const gpxName = `${targetLayer.name}_${time}.gpx`;
      exportData.push({ data: gpxData, name: gpxName, type: 'GPX', folder: '' });
    }
    //Photo

    const photoFields = targetLayer.field.filter((f) => f.format === 'PHOTO');
    exportedRecords.forEach(({ field }) => {
      photoFields.forEach(({ name }) => {
        const photos = field[name] as PhotoType[];
        for (const photo of photos) {
          if (photo.uri) {
            exportData.push({ data: photo.uri, name: photo.name, type: 'PHOTO', folder: '' });
          }
        }
      });
    });
    const fileName = `${targetLayer.name}_${time}`;
    return { exportData, fileName };
  }, [allUserRecordSet, checkedRecords, isMapMemoLayer, targetLayer]);

  useEffect(() => {
    if (route.name !== 'Data') return;
    if (dataSet === undefined) return;

    const data = dataSet.flatMap((d) => (d.layerId === targetLayer.id ? d.data : []));
    const sortedData = data;

    if (checkList.length === 0 || data.length !== checkList.length) {
      setCheckList(data.map((_, idx) => ({ id: idx, checked: false })));
      setAllUserRecordSet(sortedData);
      setSortedOrder('UNSORTED');
      setSortedName('');
    } else {
      changeOrder(sortedName, sortedOrder);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSet, route.name, targetLayer.id]);

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
    generateExportGeoData,
    checkRecordEditable,
    updateOwnRecordSetOrder,
    setSortedOrder,
    setSortedName,
  } as const;
};
