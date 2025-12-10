import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { DMSKey, LatLonDMSKey, LatLonDMSType, LayerType, PhotoType, RecordType, SelectedPhotoType } from '../types';
import { RootState } from '../store';
import { addRecordsAction, deleteRecordsAction, updateRecordsAction } from '../modules/dataSet';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LatLonDMSTemplate, PHOTO_FOLDER, SelectedPhotoTemplate } from '../constants/AppConstants';
import { Platform } from 'react-native';
import { cloneDeep } from 'lodash';
import { latLonDMS, toLatLonDMS } from '../utils/Coords';
import { formattedInputs } from '../utils/Format';
import * as FileSystem from 'expo-file-system/legacy';
import { updateRecordCoords, updateReferenceFieldValue } from '../utils/Data';
import { useRecord } from './useRecord';
import { ulid } from 'ulid';
import { deleteLocalPhoto, deleteRecordPhotos } from '../utils/Photo';
import { useBottomSheetNavigation } from '../contexts/BottomSheetNavigationContext';
import { isLocationType } from '../utils/General';
import { selectNonDeletedDataSet, selectNonDeletedAllUserRecordSet } from '../modules/selectors';
import { useProject } from './useProject';
import { addToDynamicDictionary } from './useDynamicDictionaryInput';

export type UseDataEditReturnType = {
  targetRecord: RecordType;
  targetLayer: LayerType;
  latlon: LatLonDMSType;
  selectedPhoto: SelectedPhotoType;
  isEditingRecord: boolean;
  isDecimal: boolean;
  recordNumber: number;
  maxRecordNumber: number;
  photoFolder: string;
  isEditable: boolean;
  changeRecord: (value: number) => void;
  saveData: () => {
    isOK: boolean;
    message: string;
  };
  addPhoto: (
    fieldName: string,
    photo: {
      uri: string;
      thumbnail: string | null;
      width: number | undefined;
      height: number | undefined;
      name: string;
    }
  ) => void;
  updatePhoto: (fieldName: string, index: number, uri: string) => void;
  removePhoto: (photo: SelectedPhotoType) => void;
  selectPhoto: (fieldName: string, photo: PhotoType, index: number) => void;
  deleteRecord: () => void;
  copyRecord: (originalRecord: RecordType) => RecordType;
  changeLatLonType: () => void;
  changeField: (name: string, value: string | number) => void;
  submitField: (name: string, format: string) => void;
  changeLatLon: (val: string, latlonType: LatLonDMSKey, dmsType: DMSKey) => void;
  cancelUpdate: () => void;
};

export const useDataEdit = (record: RecordType, layer: LayerType): UseDataEditReturnType => {
  const dispatch = useDispatch();
  const { isSettingProject } = useProject();
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: RootState) => state.user);
  const isEditingRecord = useSelector((state: RootState) => state.settings.isEditingRecord, shallowEqual);
  const dataSet = useSelector(selectNonDeletedDataSet);
  const allUserRecordSet = useSelector((state: RootState) => selectNonDeletedAllUserRecordSet(state, layer.id));
  const [targetLayer, setTargetLayer] = useState<LayerType>(layer);
  const [targetRecord, setTargetRecord] = useState<RecordType>(record);
  const [targetRecordSet, setTargetRecordSet] = useState<RecordType[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<SelectedPhotoType>(SelectedPhotoTemplate);
  const [latlon, setLatLon] = useState<LatLonDMSType>(LatLonDMSTemplate);
  const [recordNumber, setRecordNumber] = useState(1);
  const [isDecimal, setIsDecimal] = useState(true);
  const [temporaryDeletePhotoList, setTemporaryDeletePhotoList] = useState<{ photoId: string; uri: string }[]>([]);
  const [temporaryAddedPhotoList, setTemporaryAddedPhotoList] = useState<{ photoId: string; uri: string }[]>([]);

  const { selectRecord, setIsEditingRecord } = useRecord();
  const { currentScreen } = useBottomSheetNavigation();

  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );
  const photoFolder = useMemo(
    () =>
      projectId !== undefined
        ? `${PHOTO_FOLDER}/${projectId}/${targetLayer.id}/${dataUser.uid}`
        : `${PHOTO_FOLDER}/LOCAL/${targetLayer.id}/OWNER`,
    [dataUser.uid, projectId, targetLayer.id]
  );

  const isMapMemoLayer = useMemo(
    () =>
      dataSet.flatMap((d) => (d.layerId === layer.id ? d.data : [])).some((d) => d.field._strokeColor !== undefined),
    [dataSet, layer.id]
  );
  const isEditable = useMemo(
    () => isSettingProject || targetLayer.permission !== 'COMMON',
    [isSettingProject, targetLayer.permission]
  );

  const maxRecordNumber = targetRecordSet.length;

  useEffect(() => {
    //changeRecordが呼ばれた場合、targetRecordを変更する
    if (currentScreen.name !== 'DataEdit') return;

    //recordNumberが変更された場合、targetRecordを変更する
    const newRecord = allUserRecordSet[recordNumber - 1];
    selectRecord(targetLayer.id, newRecord);
    setTargetRecord(newRecord);
    setTargetRecordSet(allUserRecordSet);
    setTargetLayer(layer);
    if (layer.type === 'POINT') {
      const newLatLon = isLocationType(newRecord.coords) ? toLatLonDMS(newRecord.coords) : LatLonDMSTemplate;
      setLatLon(newLatLon);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordNumber]);

  useEffect(() => {
    //recordが変更された場合、targetRecordを変更する
    if (currentScreen.name !== 'DataEdit') return;

    // allUserRecordSetをセレクタから取得
    const initialRecordNumber = allUserRecordSet.findIndex((d) => d.id === record.id) + 1;
    selectRecord(targetLayer.id, record);
    setTargetRecord(record);
    setTargetRecordSet(allUserRecordSet);
    setTargetLayer(layer);
    setRecordNumber(initialRecordNumber);
    if (layer.type === 'POINT') {
      const newLatLon = isLocationType(record.coords) ? toLatLonDMS(record.coords) : LatLonDMSTemplate;
      setLatLon(newLatLon);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);

  // Reduxストアのデータが更新された際に緯度経度を更新
  useEffect(() => {
    if (currentScreen.name !== 'DataEdit') return;
    if (!targetRecord || !targetRecord.id) return;

    // Reduxストアから最新のレコードを取得
    const updatedRecord = allUserRecordSet.find((d) => d.id === targetRecord.id);
    if (updatedRecord && layer.type === 'POINT') {
      const newLatLon = isLocationType(updatedRecord.coords) ? toLatLonDMS(updatedRecord.coords) : LatLonDMSTemplate;
      // 緯度経度が変更されている場合のみ更新
      if (JSON.stringify(newLatLon) !== JSON.stringify(latlon)) {
        setLatLon(newLatLon);
        setTargetRecord(updatedRecord);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allUserRecordSet]);

  const changeRecord = useCallback(
    (value: number) => {
      if (targetRecordSet.length === 0) return;

      setRecordNumber(value);
    },
    [targetRecordSet]
  );

  const removePhoto = useCallback(
    (photo: SelectedPhotoType) => {
      if (photo.uri) {
        const addedPhoto = temporaryAddedPhotoList.find(({ photoId }) => photoId === photo.id);
        if (addedPhoto === undefined) {
          setTemporaryDeletePhotoList([...temporaryDeletePhotoList, { photoId: photo.id, uri: photo.uri }]);
        } else {
          //一旦追加したものを削除する場合
          const updatedList = temporaryAddedPhotoList.filter(({ photoId }) => photoId !== photo.id);
          setTemporaryAddedPhotoList(updatedList);
        }
      }
      const m = cloneDeep(targetRecord);
      const photos = m.field[photo.fieldName] as PhotoType[];
      if (projectId === undefined) {
        photos.splice(photo.index, 1);
      } else {
        //アップロードする際に削除すべきものはuriをundefinedにする
        photos[photo.index] = { ...photo, uri: undefined };
      }

      setSelectedPhoto({} as SelectedPhotoType);
      setTargetRecord(m);
      setIsEditingRecord(true);
    },
    [projectId, setIsEditingRecord, targetRecord, temporaryAddedPhotoList, temporaryDeletePhotoList]
  );

  const selectPhoto = useCallback(async (fieldName: string, photo: PhotoType, index: number) => {
    let hasLocal = false;
    if (photo.uri) {
      if (Platform.OS === 'web') {
        // Web版: URIの有効性を確認
        if (photo.uri.startsWith('blob:')) {
          // Blob URIの場合、fetchでアクセス試行
          try {
            const response = await fetch(photo.uri);
            if (response.ok) hasLocal = true;
          } catch (error) {
            hasLocal = false;
          }
        }
      } else {
        try {
          const fileInfo = await FileSystem.getInfoAsync(photo.uri);
          hasLocal = fileInfo.exists;
        } catch (error) {
          hasLocal = false;
        }
      }
    }
    setSelectedPhoto({ ...photo, hasLocal, index: index, fieldName: fieldName });
  }, []);

  const addPhoto = useCallback(
    (
      fieldName: string,
      photo: {
        uri: string;
        thumbnail: string | null;
        width: number | undefined;
        height: number | undefined;
        name: string;
      }
    ) => {
      //console.log('$$$', uri);
      const updatedRecord = cloneDeep(targetRecord);
      const photoId = ulid();
      const photoField = updatedRecord.field[fieldName] as PhotoType[];
      photoField.push({
        id: photoId,
        name: photo.name,
        url: null,
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
        thumbnail: photo.thumbnail,
        key: null,
      } as PhotoType);

      //console.log(m.field[name]);
      setTargetRecord(updatedRecord);
      setIsEditingRecord(true);
      setTemporaryAddedPhotoList([...temporaryAddedPhotoList, { photoId, uri: photo.uri }]);
    },
    [setIsEditingRecord, targetRecord, temporaryAddedPhotoList]
  );

  const saveData = useCallback(() => {
    temporaryDeletePhotoList.forEach(({ uri }) => deleteLocalPhoto(uri));
    setTemporaryDeletePhotoList([]);
    setTemporaryAddedPhotoList([]);
    const updatedField = updateReferenceFieldValue(targetLayer, targetRecord.field, targetRecord.id);
    const fieldUpdatedRecord = { ...targetRecord, field: updatedField };

    const updatedRecord = updateRecordCoords(fieldUpdatedRecord, latlon, isDecimal);
    //unixTimeを更新
    updatedRecord.updatedAt = Date.now();

    // STRING_DYNAMICフィールドの値を辞書に追加
    targetLayer.field.forEach((field) => {
      if (field.format === 'STRING_DYNAMIC' && updatedRecord.field[field.name]) {
        const fieldValue = updatedRecord.field[field.name];
        if (typeof fieldValue === 'string' || typeof fieldValue === 'number') {
          const fieldKey = `${targetLayer.id}_${field.id}`;
          addToDynamicDictionary(fieldKey, fieldValue);
        }
      }
    });

    //データの更新。userIdが変更される場合は、元のデータを削除して新しいデータを追加する
    if (targetRecord.userId !== dataUser.uid) {
      dispatch(
        deleteRecordsAction({
          layerId: targetLayer.id,
          userId: targetRecord.userId,
          data: [targetRecord],
        })
      );
    }
    updatedRecord.userId = dataUser.uid;
    updatedRecord.displayName = dataUser.displayName;
    dispatch(
      updateRecordsAction({
        layerId: targetLayer.id,
        userId: dataUser.uid,
        data: [updatedRecord],
      })
    );

    setIsEditingRecord(false);
    return { isOK: true, message: '' };
  }, [
    temporaryDeletePhotoList,
    targetLayer,
    targetRecord,
    latlon,
    isDecimal,
    dataUser.uid,
    dataUser.displayName,
    dispatch,
    setIsEditingRecord,
  ]);

  const updatePhoto = useCallback(
    (fieldName: string, index: number, uri: string) => {
      const updatedRecord = cloneDeep(targetRecord);
      (updatedRecord.field[fieldName] as PhotoType[])[index].uri = uri;
      setTargetRecord(updatedRecord);
      //編集中でなければ、保存する。ユーザーは変更しない。
      if (!isEditingRecord) {
        dispatch(
          updateRecordsAction({
            layerId: targetLayer.id,
            userId: updatedRecord.userId,
            data: [updatedRecord],
          })
        );
      }
    },
    [dispatch, isEditingRecord, targetLayer.id, targetRecord]
  );

  const deleteRecord = useCallback(() => {
    deleteRecordPhotos(targetLayer, targetRecord);
    setTemporaryDeletePhotoList([]);
    setTemporaryAddedPhotoList([]);

    let deletedRecords: RecordType[] = [];
    if (isMapMemoLayer) {
      //同じグループのレコードを取得
      const subGroupRecords = dataSet
        .flatMap((d) => (d.layerId === layer.id ? d.data : []))
        .filter((d) => d.field._group === targetRecord.id);
      deletedRecords = [targetRecord, ...subGroupRecords];
    } else {
      deletedRecords = [targetRecord];
    }

    dispatch(
      deleteRecordsAction({
        layerId: targetLayer.id,
        userId: targetRecord.userId,
        data: deletedRecords,
      })
    );
  }, [targetLayer, targetRecord, isMapMemoLayer, dispatch, dataSet, layer.id]);

  const changeField = useCallback(
    (name: string, value: string | number) => {
      const m = cloneDeep(targetRecord);
      if (m.field[name] !== value) {
        m.field[name] = value;
        setTargetRecord(m);
        setIsEditingRecord(true);
      }
    },
    [setIsEditingRecord, targetRecord]
  );

  const submitField = useCallback(
    (name: string, format: string) => {
      //console.log(targetRecord.field[name]);
      const formatted = formattedInputs(targetRecord.field[name], format);
      const m = cloneDeep(targetRecord);
      m.field[name] = formatted.result;
      setTargetRecord(m);
    },
    [targetRecord]
  );

  const changeLatLonType = useCallback(() => {
    const latLonDms = latLonDMS(latlon, isDecimal);
    setLatLon(latLonDms);
    setIsDecimal(!isDecimal);
  }, [isDecimal, latlon]);

  const changeLatLon = useCallback(
    (val: string, latlonType: LatLonDMSKey, dmsType: DMSKey) => {
      const newLatLon = cloneDeep(latlon);
      newLatLon[latlonType][dmsType] = val;
      setLatLon(newLatLon);
      setIsEditingRecord(true);
    },
    [latlon, setIsEditingRecord]
  );

  const cancelUpdate = useCallback(() => {
    setIsEditingRecord(false);
    temporaryAddedPhotoList.forEach(({ uri }) => deleteLocalPhoto(uri));
    setTemporaryDeletePhotoList([]);
    setTemporaryAddedPhotoList([]);
  }, [setIsEditingRecord, temporaryAddedPhotoList]);

  const copyRecord = useCallback(
    (originalRecord: RecordType) => {
      const id = ulid();

      const newData: RecordType = {
        ...originalRecord,
        id: id,
        userId: dataUser.uid,
        displayName: dataUser.displayName,
        updatedAt: Date.now(),
      };
      dispatch(addRecordsAction({ layerId: targetLayer.id, userId: dataUser.uid, data: [newData] }));
      return newData;
    },
    [targetLayer, dataUser.uid, dataUser.displayName, dispatch]
  );

  return {
    targetRecord,
    targetLayer,
    latlon,
    selectedPhoto,
    isEditingRecord,
    isDecimal,
    recordNumber,
    maxRecordNumber,
    photoFolder,
    isEditable,
    addPhoto,
    removePhoto,
    selectPhoto,
    updatePhoto,
    changeRecord,
    deleteRecord,
    changeLatLonType,
    changeField,
    submitField,
    changeLatLon,
    cancelUpdate,
    copyRecord,
    saveData,
  } as const;
};
