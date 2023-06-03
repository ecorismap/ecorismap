import { LayerType, PhotoType, RecordType } from '../types';

import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { useCallback } from 'react';
import { editSettingsAction } from '../modules/settings';
import { getPhotoFields } from '../utils/Layer';
import { deleteLocalPhoto } from '../utils/Photo';

export type UsePhotoReturnType = {
  photosToBeDeleted: {
    projectId: string;
    layerId: string;
    userId: string;
    photoId: string;
  }[];
  addToBeDeletedPhoto: (photo: { projectId: string; layerId: string; userId: string; photoId: string }) => void;
  clearToBeDeletedPhotos: () => void;

  deleteRecordPhotos: (
    layer: LayerType,
    record: RecordType,
    projectId: string | undefined,
    userId: string | undefined
  ) => void;
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

  const deleteRecordPhotos = useCallback(
    (layer: LayerType, record: RecordType, projectId: string | undefined, userId: string | undefined) => {
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
    },
    [addToBeDeletedPhoto]
  );

  return {
    photosToBeDeleted,
    addToBeDeletedPhoto,
    clearToBeDeletedPhotos,
    deleteRecordPhotos,
  } as const;
};
