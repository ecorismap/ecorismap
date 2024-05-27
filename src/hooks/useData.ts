import { useCallback, useEffect, useMemo, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { ExportType, LayerType, PhotoType, RecordType } from '../types';
import { generateCSV, generateGeoJson, generateGPX } from '../utils/Geometry';
import { AppState } from '../modules';
import { addRecordsAction, deleteRecordsAction, setRecordSetAction, updateRecordsAction } from '../modules/dataSet';
import { v4 as uuidv4 } from 'uuid';
import { getDefaultField, sortData, SortOrderType } from '../utils/Data';
import dayjs from 'dayjs';
import { usePermission } from './usePermission';
import { t } from '../i18n/config';

export type UseDataReturnType = {
  allUserRecordSet: RecordType[];
  isChecked: boolean;
  checkList: boolean[];
  checkedRecords: RecordType[];
  isMapMemoLayer: boolean;
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
};

export const useData = (targetLayer: LayerType): UseDataReturnType => {
  //console.log(targetLayer);
  const dispatch = useDispatch();
  const projectId = useSelector((state: AppState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: AppState) => state.user, shallowEqual);
  const dataSet = useSelector((state: AppState) => state.dataSet, shallowEqual);
  const tracking = useSelector((state: AppState) => state.settings.tracking, shallowEqual);
  const { isRunningProject } = usePermission();
  const [allUserRecordSet, setAllUserRecordSet] = useState<RecordType[]>([]);
  const [checkList, setCheckList] = useState<boolean[]>([]);

  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );
  const ownRecordSet = useMemo(
    () => allUserRecordSet.filter((d) => d.userId === dataUser.uid),
    [allUserRecordSet, dataUser.uid]
  );
  const isChecked = useMemo(() => checkList.some((d) => d), [checkList]);

  const checkedRecords = useMemo(() => allUserRecordSet.filter((_, i) => checkList[i]), [allUserRecordSet, checkList]);

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
      if (tracking !== undefined && tracking.dataId === feature?.id) {
        return { isOK: false, message: t('hooks.message.cannotEditInTracking') };
      }
      if (!targetLayer_.active) {
        return { isOK: false, message: t('hooks.message.noEditMode') };
      }

      return { isOK: true, message: '' };
    },
    [isRunningProject, tracking, user.uid]
  );

  const updateOwnRecordSetOrder = useCallback(
    (allUserRecordSet_: RecordType[]) => {
      const ownRecordSet_ = allUserRecordSet_.filter((d) => d.userId === dataUser.uid);

      dispatch(setRecordSetAction({ layerId: targetLayer.id, userId: dataUser.uid, data: ownRecordSet_ }));
    },
    [dataUser.uid, dispatch, targetLayer.id]
  );

  const changeOrder = useCallback(
    (colName: string, order: SortOrderType) => {
      let sortedData: RecordType[] = [];
      let idx: number[] = [];

      if (order === 'UNSORTED') {
        sortedData = dataSet.map((d) => (d.layerId === targetLayer.id ? d.data : [])).flat();
        idx = sortedData.map((_, i) => i);
      } else {
        const result = sortData(allUserRecordSet, colName, order);
        sortedData = result.data;
        idx = result.idx;
      }
      const sortedCheckList = idx.map((d) => checkList[d]);
      setCheckList(sortedCheckList);
      setAllUserRecordSet(sortedData);
    },
    [allUserRecordSet, checkList, dataSet, targetLayer.id]
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
      setCheckList(checkList.map(() => checked));
    },
    [checkList]
  );

  const changeChecked = useCallback(
    (index: number) => {
      const updatedCheckList = [...checkList];
      updatedCheckList[index] = !checkList[index];
      setCheckList(updatedCheckList);
    },
    [checkList]
  );

  const addDefaultRecord = useCallback(
    (fields?: { [key: string]: string | number | PhotoType[] }) => {
      const id = uuidv4();
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
    if (dataSet === undefined) return;
    const data = dataSet.flatMap((d) => (d.layerId === targetLayer.id ? d.data : []));

    setCheckList(new Array(data.length).fill(false));
    //console.log(data);
    setAllUserRecordSet(data);
  }, [dataSet, targetLayer.id]);

  return {
    allUserRecordSet,
    isChecked,
    checkList,
    checkedRecords,
    isMapMemoLayer,
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
  } as const;
};
