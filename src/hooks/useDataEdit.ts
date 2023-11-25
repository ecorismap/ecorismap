import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import {
  DMSKey,
  LatLonDMSKey,
  LatLonDMSType,
  LayerType,
  LocationType,
  PhotoType,
  RecordType,
  SelectedPhotoType,
} from '../types';
import { AppState } from '../modules';
import { addRecordsAction, deleteRecordsAction, updateRecordsAction } from '../modules/dataSet';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LatLonDMSTemplate, PHOTO_FOLDER, SelectedPhotoTemplate } from '../constants/AppConstants';
import { Platform } from 'react-native';
import { cloneDeep } from 'lodash';
import { LatLonDMS, toLatLonDMS } from '../utils/Coords';
import { formattedInputs } from '../utils/Format';
import * as FileSystem from 'expo-file-system';
import { updateRecordCoords, updateReferenceFieldValue } from '../utils/Data';
import { usePhoto } from './usePhoto';
import { useRecord } from './useRecord';
import { v4 as uuidv4 } from 'uuid';
import { deleteLocalPhoto } from '../utils/Photo';

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

export const useDataEdit = (
  record: RecordType,
  layer: LayerType,
  recordSet: RecordType[],
  recordIndex: number
): UseDataEditReturnType => {
  const dispatch = useDispatch();
  const projectId = useSelector((state: AppState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: AppState) => state.user);
  const isEditingRecord = useSelector((state: AppState) => state.settings.isEditingRecord, shallowEqual);
  //const [isEditingRecord, setIsEditingRecord] = useState(false);
  const [targetLayer, setTargetLayer] = useState<LayerType>(layer);
  const [targetRecord, setTargetRecord] = useState<RecordType>(record);
  const [targetRecordSet, setTargetRecordSet] = useState<RecordType[]>(recordSet);
  const [selectedPhoto, setSelectedPhoto] = useState<SelectedPhotoType>(SelectedPhotoTemplate);
  const [latlon, setLatLon] = useState<LatLonDMSType>(LatLonDMSTemplate);
  const [recordNumber, setRecordNumber] = useState(1);
  const [isDecimal, setIsDecimal] = useState(true);
  const [temporaryDeletePhotoList, setTemporaryDeletePhotoList] = useState<{ photoId: string; uri: string }[]>([]);
  const [temporaryAddedPhotoList, setTemporaryAddedPhotoList] = useState<{ photoId: string; uri: string }[]>([]);
  // console.log('$$$ temporaryDeletePhotoList $$$', temporaryDeletePhotoList);
  // console.log('%%% temporaryAddedPhotoList %%%', temporaryAddedPhotoList);

  const { deleteRecordPhotos } = usePhoto();
  const { selectRecord, setIsEditingRecord } = useRecord();

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

  const maxRecordNumber = targetRecordSet.length;

  useEffect(() => {
    //データの初期化。以降はchangeRecordで行う。
    selectRecord(layer.id, record);
    setTargetRecord(record);
    setTargetRecordSet(recordSet);
    setTargetLayer(layer);
    setRecordNumber(recordIndex + 1);
    if (layer.type === 'POINT') {
      const newLatLon = toLatLonDMS(record.coords as LocationType);
      setLatLon(newLatLon);
    }
  }, [layer, layer.id, layer.type, record, recordIndex, recordSet, selectRecord]);

  const changeRecord = useCallback(
    (value: number) => {
      if (targetRecordSet.length === 0) return;
      const newRecord = targetRecordSet[value - 1];
      selectRecord(targetLayer.id, newRecord);
      setTargetRecord(newRecord);
      setRecordNumber(value);
      if (targetLayer.type === 'POINT') {
        const newLatLon = toLatLonDMS(newRecord.coords as LocationType);
        setLatLon(newLatLon);
      }
    },
    [selectRecord, targetLayer.id, targetLayer.type, targetRecordSet]
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
        //web版はpickerImageで読み込んだuriはbase64で読み込まれる。
        hasLocal = photo.uri !== null;
      } else {
        const { exists } = await FileSystem.getInfoAsync(photo.uri);
        //PHOTO_FOLDERになければオリジナルがあってもダウンロードするバージョン
        //hasLocal = exists && photo.url !== null;
        //PHOTO_FOLDERもしくはオリジナルがあればダウンロードしないバージョン
        hasLocal = exists;
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
      const m = cloneDeep(targetRecord);
      const photoId = uuidv4();
      (m.field[fieldName] as PhotoType[]).push({
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
      setTargetRecord(m);
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

    dispatch(
      updateRecordsAction({
        layerId: targetLayer.id,
        userId: updatedRecord.userId,
        data: [updatedRecord],
      })
    );
    setTargetRecord(updatedRecord);
    const updatedRecordSet = targetRecordSet.map((d) => (d.id === updatedRecord.id ? updatedRecord : d));
    setTargetRecordSet(updatedRecordSet);

    setIsEditingRecord(false);
    return { isOK: true, message: '' };
  }, [
    targetRecord,
    targetLayer,
    latlon,
    isDecimal,
    temporaryDeletePhotoList,
    dispatch,
    targetRecordSet,
    setIsEditingRecord,
  ]);

  const deleteRecord = useCallback(() => {
    deleteRecordPhotos(targetLayer, targetRecord, projectId, targetRecord.userId);
    setTemporaryDeletePhotoList([]);
    setTemporaryAddedPhotoList([]);
    dispatch(
      deleteRecordsAction({
        layerId: targetLayer.id,
        userId: targetRecord.userId,
        data: [targetRecord],
      })
    );
  }, [targetRecord, targetLayer, deleteRecordPhotos, projectId, dispatch]);

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
    const latLonDms = LatLonDMS(latlon, isDecimal);
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
      const id = uuidv4();
      // const field = getDefaultField(targetLayer, ownRecordSet, id);

      const newData: RecordType = {
        ...originalRecord,
        id: id,
        userId: dataUser.uid,
        displayName: dataUser.displayName,
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
    addPhoto,
    removePhoto,
    selectPhoto,
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
