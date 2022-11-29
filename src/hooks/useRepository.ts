import { useCallback } from 'react';
import {
  CreateProjectType,
  DataType,
  LayerType,
  PhotoType,
  ProjectSettingsType,
  ProjectType,
  RecordType,
  RegionType,
} from '../types';
import { PHOTO_FOLDER } from '../constants/AppConstants';
import * as projectStore from '../lib/firebase/firestore';
import * as projectStorage from '../lib/firebase/storage';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { setDataSetAction, updateDataAction, updateRecordsAction } from '../modules/dataSet';
import { createLayersInitialState, setLayersAction } from '../modules/layers';
import { createTileMapsInitialState, setTileMapsAction } from '../modules/tileMaps';
import { editSettingsAction } from '../modules/settings';
import { addProjectAction, deleteProjectAction, updateProjectAction } from '../modules/projects';
import { cloneDeep } from 'lodash';
import { getPhotoFields, getTargetLayers } from '../utils/Layer';
import { hasLoggedIn } from '../utils/Account';
import { getTargetRecordSet } from '../utils/Data';
import dayjs from '../i18n/dayjs';
import { Platform } from 'react-native';
import { usePhoto } from './usePhoto';
import { t } from '../i18n/config';

export type UseRepositoryReturnType = {
  createProject: (
    project: ProjectType,
    createType: CreateProjectType | undefined,
    isPhotoUpload: boolean,
    copiedProjectName: string | undefined
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  updateProject: (project: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  deleteProject: (project_: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
  }>;

  downloadProjectSettings: (project_: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
    region: RegionType | undefined;
  }>;
  fetchProjectSettings: (project: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
    data: ProjectSettingsType | undefined;
  }>;
  fetchAllData: (project: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
    data: DataType[] | undefined;
  }>;
  fetchAllPhotos: (
    layer: LayerType,
    records: RecordType[]
  ) => Promise<
    | {
        data: string;
        name: string;
      }
    | undefined
  >[];
  downloadAllData: (
    project: ProjectType,
    shouldPhotoDownload: boolean
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  downloadPublicAndCommonData: (
    project: ProjectType,
    shouldPhotoDownload: boolean
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  downloadPublicData: (
    project: ProjectType,
    shouldPhotoDownload: boolean
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  downloadPrivateData: (
    project: ProjectType,
    shouldPhotoDownload: boolean
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  downloadPublicAndAllPrivateData: (
    project: ProjectType,
    shouldPhotoDownload: boolean
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  uploadData: (
    project_: ProjectType,
    hasUploadLicense: boolean,
    uploadType: 'All' | 'PublicAndPrivate' | 'Common'
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  uploadProjectSettings: (project_: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
  }>;
};

export const useRepository = (): UseRepositoryReturnType => {
  const dispatch = useDispatch();
  const user = useSelector((state: AppState) => state.user);
  const projects = useSelector((state: AppState) => state.projects);
  const dataSet = useSelector((state: AppState) => state.dataSet);
  const layers = useSelector((state: AppState) => state.layers);
  const mapRegion = useSelector((state: AppState) => state.settings.mapRegion);
  const tileMaps = useSelector((state: AppState) => state.tileMaps);
  const mapType = useSelector((state: AppState) => state.settings.mapType);
  const drawTools = useSelector((state: AppState) => state.settings.drawTools);
  const updatedAt = useSelector((state: AppState) => state.settings.updatedAt);
  const { photosToBeDeleted } = usePhoto();

  const fetchProjectSettings = useCallback(async (project: ProjectType) => {
    const { isOK, message, data: projectSettings } = await projectStore.downloadProjectSettings(project.id);
    if (!isOK || projectSettings === undefined) {
      return { isOK: false, message, data: undefined };
    }
    return { isOK: true, message: '', data: projectSettings };
  }, []);

  const fetchAllData = useCallback(async (project: ProjectType) => {
    const { isOK, message, data } = await projectStore.downloadAllData(project.id);
    if (!isOK || data === undefined) {
      return { isOK: false, message, data: undefined };
    }
    return { isOK: true, message, data: data };
  }, []);

  const fetchAllPhotos = useCallback((layer: LayerType, records: RecordType[]) => {
    const photoFields = layer.field.filter((f) => f.format === 'PHOTO');
    const imagePromises = records
      .map((record) => {
        return photoFields
          .map((photoField) => {
            return (record.field[photoField.name] as PhotoType[]).map(async ({ url, key, name }) => {
              if (url !== null && key !== null) {
                const { data } = await projectStorage.fetchPhoto(url, key);
                if (data === undefined) return undefined;
                return { data: data, name: name };
              }
            });
          })
          .flat();
      })
      .flat();
    return imagePromises;
  }, []);

  const updateStoragePhoto = useCallback(
    async (
      hasUploadLicense: boolean,
      data: RecordType,
      project: ProjectType,
      layerId: string,
      photoField: LayerType['field']
    ) => {
      if (user.uid === undefined) return data;
      const uid = user.uid;
      const newData = cloneDeep(data);

      for (const { name } of photoField) {
        const photos = (data.field[name] as PhotoType[]).map(async (photo) => {
          if (photo.uri !== null && photo.uri !== undefined && photo.url === null) {
            //アップロード
            if (!hasUploadLicense) {
              //ライセンス制限あればアップロードしない
              return photo;
            }
            const { url, key } = await projectStorage.uploadPhoto(project.id, layerId, uid, photo.id, photo.uri);
            if (Platform.OS === 'web') {
              //Webはuriに直接写真データが入ってしまい重いのでアップロードしたら消す。
              return { ...photo, url, key, uri: null };
            } else {
              //モバイルはアップロードしても自分のは見たいので消さない。
              return { ...photo, url, key };
            }
          } else if (photo.uri === undefined && photo.url !== null) {
            //写真削除したものは、クラウド削除して、photoのフィールドの値も消す(undefinedで返す)
            await projectStorage.deleteStoragePhoto(project.id, layerId, uid, photo.id);
            return undefined;
          } else {
            //すでにアップロードしてある場合はなにもしない
            return photo;
          }
        });

        newData.field[name] = (await Promise.all(photos)).filter((v): v is PhotoType => v !== undefined);
      }
      return newData;
    },
    [user]
  );

  const updateStoragePhotos = useCallback(
    async (
      hasUploadLicense: boolean,
      data: RecordType[],
      project: ProjectType,
      layerId: string,
      photoFields: LayerType['field']
    ) => {
      return await Promise.all(
        data.map((d: RecordType) => {
          return updateStoragePhoto(hasUploadLicense, d, project, layerId, photoFields);
        })
      );
    },
    [updateStoragePhoto]
  );

  const uploadData = useCallback(
    async (project: ProjectType, hasUploadLicense: boolean, uploadType: 'All' | 'PublicAndPrivate' | 'Common') => {
      //ToDo バッチアップロード?
      //firestore上の対象レイヤの自分のデータを一旦すべて削除

      if (!hasLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }
      const storeUpdatedAt = await projectStore.getSettingsUpdatedAt(project.id);
      // if (typeof updatedAt === 'string') {
      //   return { isOK: false, message: '不明なエラーです。プロジェクトを開き直してください。' };
      // }
      //console.log(updatedAt, storeUpdatedAt);
      if (
        uploadType === 'PublicAndPrivate' &&
        (storeUpdatedAt === undefined || dayjs(updatedAt).valueOf() !== dayjs(storeUpdatedAt).valueOf())
      ) {
        //console.log(updatedAt, storeUpdatedAt);
        return { isOK: false, message: t('hooks.message.cannotUploadData') };
      }

      const targetLayers = getTargetLayers(layers, uploadType);

      for (const layer of targetLayers) {
        //自分のデータ削除
        await projectStore.deleteData(project.id, layer.id, user.uid);
        const photoFields = layer.field.filter((f) => f.format === 'PHOTO');
        const targetRecordSet = getTargetRecordSet(dataSet, layer, user);

        const updatedData = await updateStoragePhotos(
          hasUploadLicense,
          targetRecordSet,
          project,
          layer.id,
          photoFields
        );
        //データごと削除された写真をまとめて削除
        await Promise.all(
          photosToBeDeleted.map(async (photo) => {
            await projectStorage.deleteStoragePhoto(photo.projectId, photo.layerId, photo.userId, photo.photoId);
          })
        );

        const { isOK, message } = await projectStore.uploadData(project.id, {
          layerId: layer.id,
          userId: user.uid,
          permission: layer.permission,
          data: updatedData,
        });
        if (!isOK) {
          //ToDo 処理続けるかどうか？
          return { isOK: false, message: message };
        }
        dispatch(
          updateRecordsAction({
            layerId: layer.id,
            userId: user.uid,
            data: updatedData,
          })
        );
      }
      return { isOK: true, message: '' };
    },
    [dataSet, dispatch, layers, photosToBeDeleted, updateStoragePhotos, updatedAt, user]
  );

  const uploadProjectSettings = useCallback(
    async (project_: ProjectType) => {
      if (!hasLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }
      const { isOK, message, timestamp } = await projectStore.uploadProjectSettings(project_.id, user.uid, {
        layers,
        tileMaps,
        mapType,
        mapRegion,
        drawTools,
        updatedAt,
      });
      if (!isOK) {
        return { isOK: false, message };
      }
      dispatch(editSettingsAction({ updatedAt: timestamp }));
      return { isOK: true, message: '' };
    },
    [dispatch, drawTools, layers, mapRegion, mapType, tileMaps, updatedAt, user]
  );

  const uploadDefaultProjectSettings = useCallback(
    async (project_: ProjectType) => {
      if (!hasLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }
      const { isOK, message } = await projectStore.uploadProjectSettings(project_.id, user.uid, {
        layers: createLayersInitialState(),
        tileMaps: createTileMapsInitialState(),
        mapType: 'none',
        mapRegion: {
          latitude: 35,
          longitude: 135,
          latitudeDelta: 0.00922,
          longitudeDelta: 0.00922,
          zoom: 15,
        },
        drawTools: { hisyouzuTool: { active: true, layerId: undefined } },
        updatedAt,
      });
      if (!isOK) {
        return { isOK: false, message };
      }
      return { isOK: true, message: '' };
    },
    [updatedAt, user]
  );

  const uploadCurrentProjectSettingsAndData = useCallback(
    async (project_: ProjectType, isPhotoUpload: boolean) => {
      if (!hasLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }
      const { isOK: projectOK, message: projectMessage } = await projectStore.uploadProjectSettings(
        project_.id,
        user.uid,
        {
          layers,
          tileMaps,
          mapType,
          mapRegion,
          drawTools,
          updatedAt,
        }
      );
      if (!projectOK) {
        return { isOK: false, message: projectMessage };
      }
      const { isOK: dataOK, message: dataMessage } = await uploadData(project_, isPhotoUpload, 'All');
      if (!dataOK) {
        return { isOK: false, message: dataMessage };
      }
      return { isOK: true, message: '' };
    },
    [drawTools, layers, mapRegion, mapType, tileMaps, updatedAt, uploadData, user]
  );

  const copyProjectSettingsAndCommonData = useCallback(
    async (project: ProjectType, copiedProjectName: string, isPhotoUpload: boolean) => {
      if (!hasLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }
      const copiedProject = projects.find((v: ProjectType) => v.name === copiedProjectName);
      if (copiedProject === undefined) {
        return { isOK: false, message: t('hooks.message.noCopyProject') };
      }
      const { isOK: settingsOK, message: settingsMessage } = await projectStore.copyProjectSettings(
        copiedProject.id,
        project.id,
        user.uid
      );
      if (!settingsOK) {
        return { isOK: false, message: settingsMessage };
      }
      const { isOK: dataOK, message: dataMessage } = await projectStore.copyCommonData(
        copiedProject.id,
        project.id,
        isPhotoUpload
      );
      if (!dataOK) {
        return { isOK: false, message: dataMessage };
      }
      return { isOK: true, message: '' };
    },

    [projects, user]
  );

  const createProject = useCallback(
    async (
      project: ProjectType,
      createType: CreateProjectType | undefined,
      isPhotoUpload: boolean,
      copiedProjectName: string | undefined
    ) => {
      const { isOK, message } = await projectStore.addProject(project);
      if (!isOK) return { isOK: false, message };
      dispatch(addProjectAction(project));

      let result;
      switch (createType) {
        case 'DEFAULT':
          result = await uploadDefaultProjectSettings(project);
          break;
        case 'SAVE':
          result = await uploadCurrentProjectSettingsAndData(project, isPhotoUpload);
          break;
        case 'COPY':
          result = await copyProjectSettingsAndCommonData(project, copiedProjectName!, isPhotoUpload);
          break;
        default:
          result = { isOK: false, message: t('hooks.message.unknownError') };
      }
      return { isOK: result.isOK, message: result.message };
    },
    [copyProjectSettingsAndCommonData, dispatch, uploadCurrentProjectSettingsAndData, uploadDefaultProjectSettings]
  );

  const updateProject = useCallback(
    async (project: ProjectType) => {
      if (!hasLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }
      const { isOK, message } = await projectStore.updateProject(project);
      if (!isOK) {
        return { isOK, message };
      }
      dispatch(updateProjectAction(project));
      return { isOK: true, message: '' };
    },
    [dispatch, user]
  );

  const deleteProject = useCallback(
    async (project_: ProjectType) => {
      const { isOK: photoOK, message: photoMessage } = await projectStorage.deleteProjectPhotos(project_.id);
      if (!photoOK) {
        return { isOK: false, message: photoMessage };
      }
      const { isOK: projectOK, message: projectMessage } = await projectStore.deleteProject(project_.id);
      if (!projectOK) {
        return { isOK: false, message: projectMessage };
      }
      dispatch(deleteProjectAction(project_));
      return { isOK: true, message: '' };
    },
    [dispatch]
  );

  const downloadProjectSettings = useCallback(
    async (project: ProjectType) => {
      //データを最初に削除
      dispatch(setDataSetAction([]));
      const { isOK, message, data: projectSettings } = await projectStore.downloadProjectSettings(project.id);
      if (!isOK || projectSettings === undefined) {
        return { isOK: false, message, region: undefined };
      }
      //console.log(Object.keys(settings));
      const { layers: layers_, tileMaps: tileMaps_, ...settings } = projectSettings;
      const projectRegion = cloneDeep(settings.mapRegion);
      dispatch(setLayersAction(layers_));
      dispatch(setTileMapsAction(tileMaps_));
      dispatch(editSettingsAction({ ...settings, projectRegion }));
      return { isOK: true, message: '', region: projectRegion };
    },
    [dispatch]
  );

  const downloadPhoto = useCallback(
    async (data: RecordType, project_: ProjectType, layerId: string, photoFields: LayerType['field']) => {
      if (user.uid === undefined) return data;
      const uid = user.uid;
      const newData = cloneDeep(data);

      for (const { name } of photoFields) {
        const photos = (data.field[name] as PhotoType[]).map(async (photo) => {
          if (photo.url !== null && photo.key !== null) {
            const folder = `${PHOTO_FOLDER}/${project_.id}/${layerId}/${uid}`;
            const { isOK, uri } = await projectStorage.downloadPhoto(photo.url, photo.key, photo.name, folder);
            if (!isOK || uri === null) {
              //console.log(message);
              return photo;
            } else {
              return { ...photo, uri };
            }
          } else {
            //写真がアップロードされていない
            return photo;
          }
        });

        //@ts-ignore
        newData.field[name] = await Promise.all(photos);
      }

      return newData;
    },
    [user.uid]
  );

  const downloadPhotos = useCallback(
    //ToDo awaitされていない
    async (layers_: LayerType[], dataSet_: DataType[], project: ProjectType) => {
      const updatedDataSet: DataType[] = [];
      for (const d of dataSet_) {
        const layer = layers_.find((l) => l.id === d.layerId);
        const photoFields = layer ? getPhotoFields(layer) : [];
        const updatedRecordSet = d.data.map((record) => {
          return downloadPhoto(record, project, d.layerId, photoFields);
        });
        updatedDataSet.push({ ...d, data: await Promise.all(updatedRecordSet) });
      }
      return updatedDataSet;
    },
    [downloadPhoto]
  );

  const downloadAllData = useCallback(
    async (project: ProjectType, shouldPhotoDownload: boolean) => {
      const { isOK, message, data } = await projectStore.downloadAllData(project.id);
      if (!isOK || data === undefined) {
        return { isOK: false, message };
      }
      let updatedData = data;
      if (shouldPhotoDownload) {
        updatedData = await downloadPhotos(layers, data, project);
      }
      dispatch(updateDataAction(updatedData));
      return { isOK: true, message: '' };
    },
    [dispatch, downloadPhotos, layers]
  );

  const downloadPublicAndCommonData = useCallback(
    async (project_: ProjectType, shouldPhotoDownload: boolean) => {
      const { isOK, message, data } = await projectStore.downloadPublicAndCommonData(project_.id);
      if (!isOK || data === undefined) {
        return { isOK: false, message };
      }
      let updatedData: DataType[];
      if (shouldPhotoDownload) {
        updatedData = await downloadPhotos(layers, data, project_);
      } else {
        updatedData = data;
      }
      dispatch(updateDataAction(updatedData));
      return { isOK: true, message: '' };
    },
    [dispatch, downloadPhotos, layers]
  );

  const downloadPublicData = useCallback(
    async (project_: ProjectType, shouldPhotoDownload: boolean) => {
      const { isOK, message, data } = await projectStore.downloadPublicData(project_.id);
      if (!isOK || data === undefined) {
        return { isOK: false, message };
      }
      let updatedData: DataType[];
      if (shouldPhotoDownload) {
        updatedData = await downloadPhotos(layers, data, project_);
      } else {
        updatedData = data;
      }
      dispatch(updateDataAction(updatedData));
      return { isOK: true, message: '' };
    },
    [dispatch, downloadPhotos, layers]
  );

  const downloadPrivateData = useCallback(
    async (project_: ProjectType, shouldPhotoDownload: boolean) => {
      if (!hasLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }
      const { isOK, message, data } = await projectStore.downloadPrivateData(user.uid, project_.id);

      if (!isOK || data === undefined) {
        return { isOK: false, message };
      }
      let updatedData: DataType[];
      if (shouldPhotoDownload) {
        updatedData = await downloadPhotos(layers, data, project_);
      } else {
        updatedData = data;
      }
      dispatch(updateDataAction(updatedData));
      return { isOK: true, message: '' };
    },
    [dispatch, downloadPhotos, layers, user]
  );

  const downloadPublicAndAllPrivateData = useCallback(
    async (project_: ProjectType, shouldPhotoDownload: boolean) => {
      const { isOK, message, data } = await projectStore.downloadPublicAndAllPrivateData(project_.id);
      if (!isOK || data === undefined) {
        return { isOK: false, message };
      }
      let updatedData: DataType[];
      if (shouldPhotoDownload) {
        updatedData = await downloadPhotos(layers, data, project_);
      } else {
        updatedData = data;
      }
      dispatch(updateDataAction(updatedData));
      return { isOK: true, message: '' };
    },
    [dispatch, downloadPhotos, layers]
  );

  return {
    createProject,
    updateProject,
    deleteProject,
    fetchProjectSettings,
    fetchAllData,
    fetchAllPhotos,
    downloadProjectSettings,
    downloadAllData,
    downloadPublicAndCommonData,
    downloadPublicData,
    downloadPrivateData,
    downloadPublicAndAllPrivateData,
    uploadData,
    uploadProjectSettings,
  } as const;
};
