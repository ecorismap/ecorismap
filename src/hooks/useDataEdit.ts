import { useDispatch, useSelector } from 'react-redux';
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
import { deleteRecordsAction, updateRecordsAction } from '../modules/dataSet';
import { v4 as uuidv4 } from 'uuid';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LatLonDMSTemplate, PHOTO_FOLDER, SelectedPhotoTemplate } from '../constants/AppConstants';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { cloneDeep } from 'lodash';
import { LatLonDMS, toLatLonDMS } from '../utils/Coords';
import { formattedInputs } from '../utils/Format';
import * as FileSystem from 'expo-file-system';
import { checkCoordsInput, checkFieldInput, updateRecordCoords, updateReferenceFieldValue } from '../utils/Data';
import { editSettingsAction } from '../modules/settings';
import dayjs from '../i18n/dayjs';
import { usePhoto } from './usePhoto';
import { t } from '../i18n/config';
import { useRecord } from './useRecord';
import { useHisyouToolSetting } from '../plugins/hisyoutool/useHisyouToolSetting';

// let fs: any;
// if (Platform.OS === 'web') {
//   fs = require('fs');
// }
export type UseDataEditReturnType = {
  targetRecord: RecordType;
  targetLayer: LayerType;
  latlon: LatLonDMSType;
  selectedPhoto: SelectedPhotoType;
  isEditingRecord: boolean;
  isDecimal: boolean;
  recordNumber: number;
  maxRecordNumber: number;
  changeRecord: (value: number) => void;
  saveData: () => {
    isOK: boolean;
    message: string;
  };
  pickImage: (name: string) => Promise<void>;
  takePhoto: (name: string) => Promise<void>;
  removeSelectedPhoto: () => Promise<void>;

  setPhoto: (fieldName: string, photo: PhotoType, index: number) => void;
  deleteRecord: () => {
    isOK: boolean;
    message: string;
  };
  changeLatLonType: () => void;
  changeField: (name: string, value: string) => void;
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
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const user = useSelector((state: AppState) => state.user);
  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );

  const tracking = useSelector((state: AppState) => state.settings.tracking);
  const isEditingRecord = useSelector((state: AppState) => state.settings.isEditingRecord);
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

  const { deleteLocalPhoto, createThumbnail, deleteRecordPhotos } = usePhoto();
  const { selectRecord } = useRecord();
  const { hisyouLayerId } = useHisyouToolSetting();
  const isHisyouLayer = targetLayer.id === hisyouLayerId;
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

  const setIsEditingRecord = useCallback(
    (value: boolean) => {
      dispatch(editSettingsAction({ isEditingRecord: value }));
    },
    [dispatch]
  );

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

  const saveToStorage = useCallback(
    async (fileUri: string, fileName: string, options?: { copy: boolean }) => {
      const folder =
        projectId !== undefined
          ? `${PHOTO_FOLDER}/${projectId}/${targetLayer.id}/${dataUser.uid}`
          : `${PHOTO_FOLDER}/LOCAL/${targetLayer.id}/OWNER`;
      await FileSystem.makeDirectoryAsync(folder, {
        intermediates: true,
      });
      const newUri = folder + '/' + fileName;
      await FileSystem.copyAsync({ from: fileUri, to: newUri });
      if (options && options.copy) {
        await MediaLibrary.createAssetAsync(newUri);
      }

      return newUri;
    },
    [dataUser.uid, projectId, targetLayer.id]
  );

  const pickImage = useCallback(
    async (name: string) => {
      try {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false,
          //aspect: [4, 3],
          quality: 1,
        });

        if (!result.cancelled) {
          //console.log(result);
          let extension;
          let fileName;
          let uri;
          //ImagePickerのバグのためwebに処理を追加
          //https://github.com/expo/expo/issues/9984
          if (result.uri === undefined) throw new Error('result.uri is undefined');
          if (Platform.OS === 'web') {
            extension = result.uri.split(';')[0].split('/')[1];
            fileName = `EMAP_${dayjs().format('YYYYMMDD_HHmmss')}.${extension}`;
            const res = await fetch(result.uri);
            const blob = await res.blob();
            uri = URL.createObjectURL(blob);
            //写真のデータそのもの。変更可能？
          } else {
            extension = result.uri.split('.').pop();
            fileName = `EMAP_${dayjs().format('YYYYMMDD_HHmmss')}.${extension}`;
            uri = result.uri;
            uri = await saveToStorage(uri, fileName);
          }
          //console.log('###', result.uri);
          const thumbnail = await createThumbnail(uri);
          //console.log('$$$', uri);
          const m = cloneDeep(targetRecord);
          const photoId = uuidv4();
          (m.field[name] as PhotoType[]).push({
            id: photoId,
            name: fileName,
            uri: uri,
            url: null,
            width: result.width,
            height: result.height,
            thumbnail: thumbnail,
            key: null,
          } as PhotoType);

          //console.log(m.field[name]);
          setTargetRecord(m);
          setIsEditingRecord(true);
          setTemporaryAddedPhotoList([...temporaryAddedPhotoList, { photoId, uri }]);
        }

        //console.log(result);
      } catch (error) {
        console.log(error);
      }
    },
    [createThumbnail, saveToStorage, setIsEditingRecord, targetRecord, temporaryAddedPhotoList]
  );

  const takePhoto = useCallback(
    async (name: string) => {
      try {
        let res = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (res.status !== 'granted') {
          //console.log('require camera permission');
          return;
        }
        res = await ImagePicker.requestCameraPermissionsAsync();
        if (res.status !== 'granted') {
          //console.log('require camera permission');
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          allowsEditing: false,
          exif: true,
        });
        if (!result.cancelled) {
          if (result.uri === undefined || result.width === undefined || result.height === undefined)
            throw new Error('result.uri is undefined');
          const extension = result.uri.split('.').pop();
          const fileName = `EMAP_${dayjs().format('YYYYMMDD_HHmmss')}.${extension}`;
          const uri = await saveToStorage(result.uri, fileName, {
            copy: true,
          });

          const thumbnail = await createThumbnail(uri);
          const m = cloneDeep(targetRecord);
          const photoId = uuidv4();
          (m.field[name] as PhotoType[]).push({
            id: photoId,
            name: fileName,
            uri: uri,
            url: null,
            width: result.width,
            height: result.height,
            thumbnail: thumbnail,
            key: null,
          });
          setTargetRecord(m);
          setIsEditingRecord(true);
          setTemporaryAddedPhotoList([...temporaryAddedPhotoList, { photoId, uri }]);
        }
      } catch (e) {
        console.log(e);
      }
    },
    [createThumbnail, saveToStorage, setIsEditingRecord, targetRecord, temporaryAddedPhotoList]
  );

  const removeSelectedPhoto = useCallback(async () => {
    if (selectedPhoto.uri) {
      const addedPhoto = temporaryAddedPhotoList.find(({ photoId }) => photoId === selectedPhoto.id);
      if (addedPhoto === undefined) {
        setTemporaryDeletePhotoList([
          ...temporaryDeletePhotoList,
          { photoId: selectedPhoto.id, uri: selectedPhoto.uri },
        ]);
      } else {
        //一旦追加したものを削除する場合
        const updatedList = temporaryAddedPhotoList.filter(({ photoId }) => photoId !== selectedPhoto.id);
        setTemporaryAddedPhotoList(updatedList);
      }
    }
    const m = cloneDeep(targetRecord);
    if (projectId === undefined) {
      (m.field[selectedPhoto!.fieldName] as PhotoType[]).splice(selectedPhoto!.index, 1);
    } else {
      //アップロードする際に削除すべきものはuriをundefinedにする
      (m.field[selectedPhoto!.fieldName] as PhotoType[])[selectedPhoto!.index] = { ...selectedPhoto, uri: undefined };
    }

    setSelectedPhoto({} as SelectedPhotoType);
    setTargetRecord(m);
    setIsEditingRecord(true);
  }, [projectId, selectedPhoto, setIsEditingRecord, targetRecord, temporaryAddedPhotoList, temporaryDeletePhotoList]);

  const setPhoto = useCallback(async (fieldName: string, photo: PhotoType, index: number) => {
    //console.log('!!! photo !!!', photo);
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

  const saveData = useCallback(() => {
    if (tracking !== undefined && tracking.dataId === targetRecord.id) {
      return { isOK: false, message: t('hooks.message.cannotEditInTracking') };
    }

    if (!targetLayer.active && !isHisyouLayer) {
      return { isOK: false, message: t('hooks.message.noEditMode') };
    }

    const { isOK, message } = checkFieldInput(targetLayer, targetRecord);

    if (!isOK) {
      return { isOK: false, message: message };
    }
    if (!checkCoordsInput(latlon, isDecimal)) {
      return { isOK: false, message: t('hooks.message.invalidCoordinate') };
    }

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
    tracking,
    targetRecord,
    targetLayer,
    isHisyouLayer,
    latlon,
    isDecimal,
    temporaryDeletePhotoList,
    dispatch,
    targetRecordSet,
    setIsEditingRecord,
    deleteLocalPhoto,
  ]);

  const deleteRecord = useCallback(() => {
    if (tracking !== undefined && tracking.dataId === targetRecord.id) {
      return { isOK: false, message: t('hooks.message.cannotDeleteInTracking') };
    }

    if (!targetLayer.active) {
      return { isOK: false, message: t('hooks.message.noEditMode') };
    }

    if (isEditingRecord) {
      saveData();
    }

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
    return { isOK: true, message: '' };
  }, [tracking, targetRecord, targetLayer, isEditingRecord, deleteRecordPhotos, projectId, dispatch, saveData]);

  const changeField = useCallback(
    (name: string, value: string) => {
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
    if (!checkCoordsInput(latlon, isDecimal)) {
      return { isOK: false, message: t('hooks.message.invalidCoordinate') };
    }
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
  }, [deleteLocalPhoto, setIsEditingRecord, temporaryAddedPhotoList]);

  return {
    targetRecord,
    targetLayer,
    latlon,
    selectedPhoto,
    isEditingRecord,
    isDecimal,
    recordNumber,
    maxRecordNumber,
    changeRecord,
    saveData,
    pickImage,
    takePhoto,
    removeSelectedPhoto,
    setPhoto,
    deleteRecord,
    changeLatLonType,
    changeField,
    submitField,
    changeLatLon,
    cancelUpdate,
  } as const;
};
