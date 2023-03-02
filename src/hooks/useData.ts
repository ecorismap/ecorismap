import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ExportType, LayerType, PhotoType, RecordType } from '../types';
import { generateCSV, generateGeoJson, generateGPX } from '../utils/Geometry';
import { AppState } from '../modules';
import { addRecordsAction, deleteRecordsAction, setRecordSetAction, updateRecordsAction } from '../modules/dataSet';
import { v4 as uuidv4 } from 'uuid';
import { getDefaultField, sortData, SortOrderType } from '../utils/Data';
import dayjs from 'dayjs';

export type UseDataReturnType = {
  allUserRecordSet: RecordType[];
  isChecked: boolean;
  checkList: boolean[];
  targetRecords: RecordType[];
  changeVisible: (record: RecordType) => void;
  changeVisibleAll: (visible: boolean) => void;
  changeChecked: (index: number) => void;
  changeCheckedAll: (checked: boolean) => void;
  changeOrder: (colname: string, order: SortOrderType) => void;
  addRecord: () => RecordType;
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
};

export const useData = (targetLayer: LayerType): UseDataReturnType => {
  const dispatch = useDispatch();
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const user = useSelector((state: AppState) => state.user);
  const dataSet = useSelector((state: AppState) => state.dataSet);

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

  const targetRecords = useMemo(() => allUserRecordSet.filter((_, i) => checkList[i]), [allUserRecordSet, checkList]);

  const changeOrder = useCallback(
    (colName: string, order: SortOrderType) => {
      const { data: sortedData, idx } = sortData(allUserRecordSet, colName, order);
      const sortedCheckList = idx.map((d) => checkList[d]);
      setCheckList(sortedCheckList);
      setAllUserRecordSet(sortedData);
    },
    [allUserRecordSet, checkList]
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
      dispatch(
        updateRecordsAction({
          layerId: targetLayer.id,
          userId: record.userId,
          data: [{ ...record, visible: !record.visible }],
        })
      );
    },
    [dispatch, targetLayer.id]
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

  const addRecord = useCallback(() => {
    const id = uuidv4();
    const field = getDefaultField(targetLayer, ownRecordSet, id);

    const newData: RecordType = {
      id: id,
      userId: dataUser.uid,
      displayName: dataUser.displayName,
      visible: true,
      redraw: false,
      coords: { latitude: 0, longitude: 0 },
      field: field,
    };
    dispatch(addRecordsAction({ layerId: targetLayer.id, userId: dataUser.uid, data: [newData] }));
    return newData;
  }, [targetLayer, ownRecordSet, dataUser.uid, dataUser.displayName, dispatch]);

  const deleteRecords = useCallback(() => {
    dispatch(
      deleteRecordsAction({
        layerId: targetLayer.id,
        userId: dataUser.uid,
        data: targetRecords,
      })
    );
  }, [dataUser.uid, dispatch, targetLayer.id, targetRecords]);

  const generateExportGeoData = useCallback(() => {
    const exportData: { data: string; name: string; type: ExportType | 'PHOTO'; folder: string }[] = [];
    const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');

    //LayerSetting
    const layerSetting = JSON.stringify(targetLayer);
    exportData.push({ data: layerSetting, name: `${targetLayer.name}_${time}.json`, type: 'JSON', folder: '' });
    //GeoJSON
    const geojson = generateGeoJson(targetRecords, targetLayer.field, targetLayer.type, targetLayer.name);
    const geojsonData = JSON.stringify(geojson);
    const geojsonName = `${targetLayer.name}_${time}.geojson`;
    exportData.push({ data: geojsonData, name: geojsonName, type: 'GeoJSON', folder: '' });
    //CSV
    const csv = generateCSV(targetRecords, targetLayer.field, targetLayer.type);
    const csvData = csv;
    const csvName = `${targetLayer.name}_${time}.csv`;
    exportData.push({ data: csvData, name: csvName, type: 'CSV', folder: '' });
    //GPX
    if (targetLayer.type === 'POINT' || targetLayer.type === 'LINE') {
      const gpx = generateGPX(targetRecords, targetLayer.type);
      const gpxData = gpx;
      const gpxName = `${targetLayer.name}_${time}.gpx`;
      exportData.push({ data: gpxData, name: gpxName, type: 'GPX', folder: '' });
    }
    //Photo

    const photoFields = targetLayer.field.filter((f) => f.format === 'PHOTO');
    targetRecords.forEach(({ field }) => {
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
  }, [targetLayer, targetRecords]);

  useEffect(() => {
    if (dataSet === undefined) return;
    const data = dataSet.map((d) => (d.layerId === targetLayer.id ? d.data : [])).flat();
    setCheckList(new Array(data.length).fill(false));
    setAllUserRecordSet(data);
  }, [dataSet, targetLayer.id]);

  return {
    allUserRecordSet,
    isChecked,
    checkList,
    targetRecords,
    changeVisible,
    changeVisibleAll,
    changeChecked,
    changeCheckedAll,
    changeOrder,
    addRecord,
    deleteRecords,
    generateExportGeoData,
  } as const;
};
