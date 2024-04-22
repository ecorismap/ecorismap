import { useCallback } from 'react';
import { DataType, LayerType, PhotoType, ProjectSettingsType, ProjectType, RecordType, RegionType } from '../types';
import { PHOTO_FOLDER } from '../constants/AppConstants';
import * as projectStore from '../lib/firebase/firestore';
import * as projectStorage from '../lib/firebase/storage';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { setDataSetAction, updateDataAction, updateRecordsAction } from '../modules/dataSet';
import { createLayersInitialState, setLayersAction } from '../modules/layers';
import { createTileMapsInitialState, setTileMapsAction } from '../modules/tileMaps';
import { editSettingsAction } from '../modules/settings';
import { addProjectAction, deleteProjectAction, updateProjectAction } from '../modules/projects';
import { cloneDeep } from 'lodash';
import { getPhotoFields, getTargetLayers } from '../utils/Layer';
import { isLoggedIn } from '../utils/Account';
import { createRecordSetFromTemplate, getTargetRecordSet } from '../utils/Data';
import dayjs from '../i18n/dayjs';
import { Platform } from 'react-native';
import { usePhoto } from './usePhoto';
import { t } from '../i18n/config';

export type UseRepositoryReturnType = {
  createProject: (project: ProjectType) => Promise<{
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
  downloadPublicAndCommonData: (
    project: ProjectType,
    shouldPhotoDownload: boolean
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  downloadCommonData: (
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
    publicOwnLayerIds?: string[];
  }>;
  downloadPrivateData: (
    project: ProjectType,
    shouldPhotoDownload: boolean
  ) => Promise<{
    isOK: boolean;
    message: string;
    privateLayerIds?: string[];
  }>;
  downloadAllPrivateData: (
    project: ProjectType,
    shouldPhotoDownload: boolean
  ) => Promise<{
    isOK: boolean;
    message: string;
    privateLayerIds?: string[];
  }>;
  downloadTemplateData: (
    project_: ProjectType,
    shouldPhotoDownload: boolean,
    publicOwnLayerIds: string[],
    privateLayerIds: string[]
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
    isLicenseOK: boolean,
    uploadType: 'All' | 'PublicAndPrivate' | 'Common' | 'Template'
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  uploadProjectSettings: (project_: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  deleteCommonAndTemplateData: (project: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
  }>;
};

export const useRepository = (): UseRepositoryReturnType => {
  const dispatch = useDispatch();
  const user = useSelector((state: AppState) => state.user);
  const dataSet = useSelector((state: AppState) => state.dataSet);
  const layers = useSelector((state: AppState) => state.layers);
  const mapRegion = useSelector((state: AppState) => state.settings.mapRegion, shallowEqual);
  const tileMaps = useSelector((state: AppState) => state.tileMaps);
  const mapType = useSelector((state: AppState) => state.settings.mapType, shallowEqual);
  const isSettingProject = useSelector((state: AppState) => state.settings.isSettingProject, shallowEqual);
  //const drawTools = useSelector((state: AppState) => state.settings.drawTools);
  const plugins = useSelector((state: AppState) => state.settings.plugins, shallowEqual);
  const updatedAt = useSelector((state: AppState) => state.settings.updatedAt, shallowEqual);
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
      isLicenseOK: boolean,
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
            if (!isLicenseOK) {
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
      isLicenseOK: boolean,
      data: RecordType[],
      project: ProjectType,
      layerId: string,
      photoFields: LayerType['field']
    ) => {
      return await Promise.all(
        data.map((d: RecordType) => {
          return updateStoragePhoto(isLicenseOK, d, project, layerId, photoFields);
        })
      );
    },
    [updateStoragePhoto]
  );

  const deleteCommonAndTemplateData = useCallback(
    async (project: ProjectType) => {
      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }
      const targetLayers = getTargetLayers(layers, 'All');
      //もともとあったレイヤが削除された場合、この処理ではそのレイヤのデータは削除されないままになってしまう。
      //ToDO: レイヤを削除した場合は、そのレイヤのデータも削除する処理を追加する。or　レイヤid関係なく全てのデータを削除する処理を追加する。
      for (const layer of targetLayers) {
        await projectStore.deleteData(project.id, layer.id, 'TEMPLATE', user.uid);
        await projectStore.deleteData(project.id, layer.id, 'COMMON', user.uid);
      }
      return { isOK: true, message: '' };
    },
    [layers, user]
  );

  const uploadData = useCallback(
    async (
      project: ProjectType,
      isLicenseOK: boolean,
      uploadType: 'All' | 'PublicAndPrivate' | 'Common' | 'Template'
    ) => {
      //ToDo バッチアップロード?
      //firestore上の対象レイヤの自分のデータを一旦すべて削除

      if (!isLoggedIn(user)) {
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
        if (!isSettingProject) {
          await projectStore.deleteData(project.id, layer.id, layer.permission, user.uid);
        }
        const photoFields = layer.field.filter((f) => f.format === 'PHOTO');
        const isTemplate = uploadType === 'Template';
        const targetRecordSet = getTargetRecordSet(dataSet, layer, user, isTemplate);

        const updatedData = await updateStoragePhotos(isLicenseOK, targetRecordSet, project, layer.id, photoFields);
        //データごと削除された写真をまとめて削除
        await Promise.all(
          photosToBeDeleted.map(async (photo) => {
            await projectStorage.deleteStoragePhoto(photo.projectId, photo.layerId, photo.userId, photo.photoId);
          })
        );

        if (uploadType === 'Template') {
          const { isOK, message } = await projectStore.uploadTemplateData(project.id, {
            layerId: layer.id,
            userId: user.uid,
            permission: 'TEMPLATE',
            data: updatedData,
          });
          if (!isOK) {
            //ToDo 処理続けるかどうか？
            return { isOK: false, message: message };
          }
        } else if (uploadType === 'Common') {
          const { isOK, message } = await projectStore.uploadCommonData(project.id, {
            layerId: layer.id,
            userId: user.uid,
            permission: layer.permission,
            data: updatedData,
          });
          if (!isOK) {
            //ToDo 処理続けるかどうか？
            return { isOK: false, message: message };
          }
        } else {
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
        }
        if (!isSettingProject) {
          dispatch(
            updateRecordsAction({
              layerId: layer.id,
              userId: user.uid,
              data: updatedData,
            })
          );
        }
      }
      return { isOK: true, message: '' };
    },
    [dataSet, dispatch, isSettingProject, layers, photosToBeDeleted, updateStoragePhotos, updatedAt, user]
  );

  const uploadProjectSettings = useCallback(
    async (project_: ProjectType) => {
      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }
      const { isOK, message, timestamp } = await projectStore.uploadProjectSettings(project_.id, user.uid, {
        layers,
        tileMaps,
        mapType,
        mapRegion,
        plugins,
        updatedAt,
      });
      if (!isOK) {
        return { isOK: false, message };
      }
      dispatch(editSettingsAction({ updatedAt: timestamp }));
      return { isOK: true, message: '' };
    },
    [dispatch, layers, mapRegion, mapType, plugins, tileMaps, updatedAt, user]
  );

  const uploadDefaultProjectSettings = useCallback(
    async (project_: ProjectType) => {
      if (!isLoggedIn(user)) {
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
        plugins: {},
        updatedAt,
      });
      if (!isOK) {
        return { isOK: false, message };
      }
      return { isOK: true, message: '' };
    },
    [updatedAt, user]
  );

  const createProject = useCallback(
    async (project: ProjectType) => {
      const { isOK, message } = await projectStore.addProject(project);
      if (!isOK) return { isOK: false, message };
      dispatch(addProjectAction(project));
      const result = await uploadDefaultProjectSettings(project);
      return { isOK: result.isOK, message: result.message };
    },
    [dispatch, uploadDefaultProjectSettings]
  );

  const updateProject = useCallback(
    async (project: ProjectType) => {
      if (!isLoggedIn(user)) {
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

  const downloadCommonData = useCallback(
    async (project_: ProjectType, shouldPhotoDownload: boolean) => {
      const { isOK, message, data } = await projectStore.downloadCommonData(project_.id);
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
      const publicOwnLayerIds = updatedData.filter((d) => d.userId === user.uid).map((d) => d.layerId);
      dispatch(updateDataAction(updatedData));
      return { isOK: true, message: '', publicOwnLayerIds };
    },
    [dispatch, downloadPhotos, layers, user.uid]
  );

  const downloadPrivateData = useCallback(
    async (project_: ProjectType, shouldPhotoDownload: boolean) => {
      if (!isLoggedIn(user)) {
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
      const privateLayerIds = updatedData.map((d) => d.layerId);
      dispatch(updateDataAction(updatedData));
      return { isOK: true, message: '', privateLayerIds };
    },
    [dispatch, downloadPhotos, layers, user]
  );

  const downloadAllPrivateData = useCallback(
    async (project_: ProjectType, shouldPhotoDownload: boolean) => {
      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }
      const { isOK, message, data } = await projectStore.downloadAllPrivateData(user.uid, project_.id);

      if (!isOK || data === undefined) {
        return { isOK: false, message };
      }
      let updatedData: DataType[];
      if (shouldPhotoDownload) {
        updatedData = await downloadPhotos(layers, data, project_);
      } else {
        updatedData = data;
      }
      const privateLayerIds = updatedData.map((d) => d.layerId);
      dispatch(updateDataAction(updatedData));
      return { isOK: true, message: '', privateLayerIds };
    },
    [dispatch, downloadPhotos, layers, user]
  );

  const downloadTemplateData = useCallback(
    async (
      project_: ProjectType,
      shouldPhotoDownload: boolean,
      publicOwnLayerIds: string[],
      privateLayerIds: string[]
    ) => {
      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }
      const { isOK, message, data } = await projectStore.downloadTemplateData(user.uid, project_.id);
      //console.log(project_.id);
      //console.log(data);
      if (!isOK || data === undefined) {
        return { isOK: false, message };
      }
      let updatedData: DataType[];
      if (shouldPhotoDownload) {
        updatedData = await downloadPhotos(layers, data, project_);
      } else {
        updatedData = data;
      }

      updatedData = createRecordSetFromTemplate(updatedData, user, publicOwnLayerIds, privateLayerIds);
      //console.log(updatedData.length);
      //console.log(updatedData[0]);
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
    downloadPublicAndCommonData,
    downloadCommonData,
    downloadPublicData,
    downloadPrivateData,
    downloadAllPrivateData,
    downloadTemplateData,
    downloadPublicAndAllPrivateData,
    uploadData,
    uploadProjectSettings,
    deleteCommonAndTemplateData,
  } as const;
};
