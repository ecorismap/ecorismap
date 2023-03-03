import { Platform } from 'react-native';
import { LayerType, PhotoType, RecordType } from '../types';
import * as FileSystem from 'expo-file-system';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { useCallback } from 'react';
import { editSettingsAction } from '../modules/settings';
import { getPhotoFields } from '../utils/Layer';
import * as ImagePicker from 'expo-image-picker';
import dayjs from '../i18n/dayjs';
import { createThumbnail, saveToStorage } from '../utils/Photo';

export type UsePhotoReturnType = {
  photosToBeDeleted: {
    projectId: string;
    layerId: string;
    userId: string;
    photoId: string;
  }[];
  addToBeDeletedPhoto: (photo: { projectId: string; layerId: string; userId: string; photoId: string }) => void;
  clearToBeDeletedPhotos: () => void;
  deleteLocalAllPhotos: (uri: string) => void;
  deleteRecordPhotos: (
    layer: LayerType,
    record: RecordType,
    projectId: string | undefined,
    userId: string | undefined
  ) => void;
  deleteLocalPhoto: (uri: string) => void;
  createThumbnail: (uri: string) => Promise<string | null>;
  pickImage: (photoFolder: string) => Promise<
    | {
        uri: string;
        thumbnail: string | null;
        name: string;
        width: number | undefined;
        height: number | undefined;
      }
    | undefined
  >;
  takePhoto: (photoFolder: string) => Promise<
    | {
        uri: string;
        thumbnail: string | null;
        name: string;
        width: number;
        height: number;
      }
    | undefined
  >;
};

export const usePhoto = (): UsePhotoReturnType => {
  const dispatch = useDispatch();
  const photosToBeDeleted = useSelector((state: AppState) => state.settings.photosToBeDeleted);
  //console.log('####photosToBeDeleted###', photosToBeDeleted);

  const clearToBeDeletedPhotos = useCallback(() => {
    dispatch(editSettingsAction({ photosToBeDeleted: [] }));
  }, [dispatch]);

  const addToBeDeletedPhoto = useCallback(
    (photo: { projectId: string; layerId: string; userId: string; photoId: string }) => {
      //console.log('A', photo);
      const filteredPhoto = photosToBeDeleted.filter(({ photoId }) => photoId !== photo.photoId);
      dispatch(editSettingsAction({ photosToBeDeleted: [...filteredPhoto, photo] }));
    },
    [dispatch, photosToBeDeleted]
  );

  const deleteLocalAllPhotos = (uri: string) => {
    if (Platform.OS === 'web') {
      return;
    } else {
      FileSystem.deleteAsync(uri, { idempotent: true });
    }
  };

  const deleteLocalPhoto = (uri: string) => {
    if (Platform.OS === 'web') {
      return;
    } else {
      FileSystem.deleteAsync(uri, { idempotent: true });
    }
  };

  const deleteRecordPhotos = (
    layer: LayerType,
    record: RecordType,
    projectId: string | undefined,
    userId: string | undefined
  ) => {
    const photoFields = getPhotoFields(layer);

    for (const { name } of photoFields) {
      (record.field[name] as PhotoType[]).forEach((photo) => {
        if (photo.uri) deleteLocalPhoto(photo.uri);

        if (projectId !== undefined && userId !== undefined) {
          addToBeDeletedPhoto({
            projectId,
            layerId: layer.id,
            userId: userId,
            photoId: photo.id,
          });
        }
      });
    }
  };

  const pickImage = useCallback(async (photoFolder: string) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        //aspect: [4, 3],
        quality: 1,
      });
      if (result.canceled) return;

      let extension;
      let name;
      let uri;
      //ImagePickerのバグのためwebに処理を追加
      //https://github.com/expo/expo/issues/9984
      uri = result.assets[0].uri;
      if (Platform.OS === 'web') {
        extension = uri.split(';')[0].split('/')[1];
        name = `EMAP_${dayjs().format('YYYYMMDD_HHmmss')}.${extension}`;
        const res = await fetch(uri);
        const blob = await res.blob();
        uri = URL.createObjectURL(blob);
        //写真のデータそのもの。変更可能？
      } else {
        extension = uri.split('.').pop();
        name = `EMAP_${dayjs().format('YYYYMMDD_HHmmss')}.${extension}`;
        uri = await saveToStorage(uri, name, photoFolder);
      }
      const thumbnail = await createThumbnail(uri);
      const width = result.assets[0].width;
      const height = result.assets[0].height;
      return { uri, thumbnail, name, width, height };
    } catch (error) {
      console.log(error);
    }
  }, []);

  const takePhoto = useCallback(async (photoFolder: string) => {
    try {
      let res = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (res.status !== 'granted') return;
      res = await ImagePicker.requestCameraPermissionsAsync();
      if (res.status !== 'granted') return;
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        exif: true,
      });
      if (result.canceled) return;
      let uri = result.assets[0].uri;
      const extension = uri.split('.').pop();
      const name = `EMAP_${dayjs().format('YYYYMMDD_HHmmss')}.${extension}`;
      uri = await saveToStorage(uri, name, photoFolder, { copy: true });
      const width = result.assets[0].width;
      const height = result.assets[0].height;
      const thumbnail = await createThumbnail(uri);
      return { uri, thumbnail, name, width, height };
    } catch (e) {
      console.log(e);
    }
  }, []);

  return {
    photosToBeDeleted,
    pickImage,
    takePhoto,
    addToBeDeletedPhoto,
    clearToBeDeletedPhotos,
    deleteLocalAllPhotos,
    deleteLocalPhoto,
    deleteRecordPhotos,
    createThumbnail,
  } as const;
};
