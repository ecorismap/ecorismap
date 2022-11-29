import { Platform } from 'react-native';
import { LayerType, PhotoType, RecordType } from '../types';
import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { useCallback } from 'react';
import { editSettingsAction } from '../modules/settings';
import { getPhotoFields } from '../utils/Layer';

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

  const createThumbnail = async (uri: string) => {
    const thumbnail = await manipulateAsync(uri, [{ resize: { height: 150 } }], {
      compress: 0.7,
      format: SaveFormat.JPEG,
      base64: true,
    });

    if (Platform.OS === 'web') {
      return thumbnail.base64 ? thumbnail.base64 : null;
    } else {
      return thumbnail.base64 ? `data:image/jpeg;base64,${thumbnail.base64}` : null;
    }
  };

  return {
    photosToBeDeleted,
    addToBeDeletedPhoto,
    clearToBeDeletedPhotos,
    deleteLocalAllPhotos,
    deleteLocalPhoto,
    deleteRecordPhotos,
    createThumbnail,
  } as const;
};
