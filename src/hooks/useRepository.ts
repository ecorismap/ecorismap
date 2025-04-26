import { useCallback, useState } from 'react';
import {
  DataType,
  LayerType,
  PhotoType,
  ProjectSettingsType,
  ProjectType,
  RecordType,
  RegionType,
  TileMapType,
} from '../types';
import { PHOTO_FOLDER } from '../constants/AppConstants';
import * as projectStore from '../lib/firebase/firestore';
import * as projectStorage from '../lib/firebase/storage';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { setDataSetAction, updateDataAction, updateRecordsAction } from '../modules/dataSet';
import { layersInitialState, setLayersAction } from '../modules/layers';
import { tileMapsInitialState, setTileMapsAction } from '../modules/tileMaps';
import { editSettingsAction } from '../modules/settings';
import { addProjectAction, deleteProjectAction, updateProjectAction } from '../modules/projects';
import { cloneDeep } from 'lodash';
import { getPhotoFields, getTargetLayers } from '../utils/Layer';
import { isLoggedIn } from '../utils/Account';
import { getTargetRecordSet, mergeLayerData } from '../utils/Data';
import dayjs from '../i18n/dayjs';
import { Platform } from 'react-native';
import { t } from '../i18n/config';
import { AlertAsync } from '../components/molecules/AlertAsync';
import { exportDatabase, importDictionary } from '../utils/SQLite';

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
  downloadTemplateData: (
    project: ProjectType,
    shouldPhotoDownload: boolean
  ) => Promise<{
    isOK: boolean;
    message: string;
    data: DataType[];
  }>;
  fetchPublicData: (
    project_: ProjectType,
    shouldPhotoDownload: boolean,
    mode: 'all' | 'others'
  ) => Promise<{
    isOK: boolean;
    message: string;
    data: DataType[];
  }>;
  fetchPrivateData: (
    project: ProjectType,
    shouldPhotoDownload: boolean,
    mode: 'own' | 'all' | 'others'
  ) => Promise<{
    isOK: boolean;
    message: string;
    data: DataType[];
  }>;
  fetchTemplateData: (
    project_: ProjectType,
    shouldPhotoDownload: boolean
  ) => Promise<{
    isOK: boolean;
    message: string;
    data: DataType[];
  }>;

  uploadDataToRepository: (
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
  createMergedDataSet: ({
    privateData,
    publicData,
    templateData,
  }: {
    privateData: DataType[];
    publicData: DataType[];
    templateData: DataType[];
  }) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  handleSelect: (selected: any) => void;
  handleBulkSelect: (mode: 'self' | 'latest') => void;
};

// キューアイテムの型
export type ConflictQueueItem = {
  id: string;
  candidates: RecordType[];
  resolve: (result: RecordType) => void;
};

// state の型
export type ConflictState = {
  queue: { id: string; candidates: RecordType[]; resolve: (r: RecordType) => void }[];
  bulkMode: null | 'self' | 'latest';
  visible: boolean;
};

export const useRepository = (): UseRepositoryReturnType & {
  conflictState: any;
  setConflictState: any;
  conflictsResolver: any;
} => {
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.user);
  const fullDataSet = useSelector((state: RootState) => state.dataSet);
  const layers = useSelector((state: RootState) => state.layers);
  const mapRegion = useSelector((state: RootState) => state.settings.mapRegion, shallowEqual);
  const tileMaps = useSelector((state: RootState) => state.tileMaps);
  const mapType = useSelector((state: RootState) => state.settings.mapType, shallowEqual);
  const isSettingProject = useSelector((state: RootState) => state.settings.isSettingProject, shallowEqual);
  //const drawTools = useSelector((state: RootState) => state.settings.drawTools);
  const plugins = useSelector((state: RootState) => state.settings.plugins, shallowEqual);
  const updatedAt = useSelector((state: RootState) => state.settings.updatedAt, shallowEqual);

  const [conflictState, setConflictState] = useState<ConflictState>({
    queue: [],
    bulkMode: null,
    visible: false,
  });

  const conflictsResolver = useCallback(
    (candidates: RecordType[], id: string): Promise<RecordType> =>
      new Promise<RecordType>((resolve) => {
        setConflictState((prev) => {
          // bulkMode が設定済みなら即時解決
          if (prev.bulkMode) {
            const chosen =
              prev.bulkMode === 'self'
                ? candidates.find((c) => c.userId === user.uid) || candidates[0]
                : candidates.reduce((a, b) => (a.updatedAt && b.updatedAt && b.updatedAt > a.updatedAt ? b : a));
            resolve(chosen);
            return prev;
          }
          // まだ bulkMode なし → モーダルキューに積む
          return {
            ...prev,
            queue: [...prev.queue, { id, candidates, resolve }],
            visible: true,
          };
        });
      }),
    [user.uid]
  );

  // 競合解決: 選択された候補を resolve してキューから取り除く
  const handleSelect = useCallback(
    (selected: any) => {
      setConflictState((prev: ConflictState) => {
        const [current, ...rest] = prev.queue;
        if (current) {
          current.resolve(selected);
        }
        return {
          ...prev,
          queue: rest,
          visible: rest.length > 0,
        };
      });
    },
    [setConflictState]
  );

  // 一括選択（残りすべて self か latest）
  const handleBulkSelect = useCallback(
    (mode: 'self' | 'latest') => {
      setConflictState((prev) => {
        // 1) いまキューにある全件を一括解決
        prev.queue.forEach(({ candidates, resolve }) => {
          const chosen =
            mode === 'self'
              ? candidates.find((c) => c.userId === user.uid) || candidates[0]
              : candidates.reduce((a, b) => (a.updatedAt && b.updatedAt && b.updatedAt > a.updatedAt ? b : a));
          resolve(chosen);
        });
        // 2) 今後はこのモードで自動解決
        return { queue: [], bulkMode: mode, visible: false };
      });
    },
    [user.uid]
  );

  const createMergedDataSet = useCallback(
    async ({
      privateData,
      publicData,
      templateData,
    }: {
      privateData: DataType[];
      publicData: DataType[];
      templateData: DataType[];
    }) => {
      // すべてのlayerIdを抽出
      const allLayerIds = Array.from(
        new Set([
          ...privateData.map((d) => d.layerId),
          ...publicData.map((d) => d.layerId),
          ...templateData.map((d) => d.layerId),
        ])
      );

      for (const layerId of allLayerIds) {
        const templateItem = templateData.find((d) => d.layerId === layerId);
        const privateItems = privateData.filter((d) => d.layerId === layerId);
        if (privateItems.length > 0) {
          //privateItemsは基本的には一つだが、Admin用だと複数人の可能性がある。

          // プライベートとテンプレートのマージ
          const [mergedPrivate, mergedTemplate] = await mergeLayerData({
            layerData: privateItems,
            templateData: templateItem,
            ownUserId: user.uid,
            strategy: 'manual',
            conflictsResolver,
          });

          if (mergedPrivate.length > 0) {
            dispatch(updateDataAction(mergedPrivate));
          }
          if (mergedTemplate && templateItem) {
            dispatch(updateDataAction([mergedTemplate]));
          }
        }
        const publicItems = publicData.filter((d) => d.layerId === layerId);
        if (publicItems.length > 0) {
          // 複数人のパブリックとテンプレートのマージ
          const [mergedPublic, mergedTemplate] = await mergeLayerData({
            layerData: publicItems,
            templateData: templateItem,
            ownUserId: user.uid,
            strategy: 'manual',
            conflictsResolver,
          });

          dispatch(updateDataAction(mergedPublic));

          // 2) マージ結果に自分(user.uid)が含まれなければ、空配列をセットしてローカルデータをクリア
          const hasSelf = mergedPublic.some((dt) => dt.userId === user.uid);
          if (!hasSelf) {
            dispatch(
              updateDataAction([
                {
                  layerId,
                  userId: user.uid,
                  data: [], // 空にすることで既存の自分データを消去
                },
              ])
            );
          }

          if (mergedTemplate && templateItem) {
            dispatch(updateDataAction([mergedTemplate]));
          }
        }
        // private/publicがなくtemplateのみの場合
        if (privateItems.length === 0 && publicItems.length === 0 && templateItem) {
          dispatch(updateDataAction([templateItem]));
        }
      }
      return { isOK: true, message: '' };
    },
    [dispatch, user.uid, conflictsResolver]
  );

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
          console.log(data);
          if (data.deleted) {
            //データごと削除された写真をストレージから削除
            await projectStorage.deleteStoragePhoto(project.id, layerId, uid, photo.id);
          } else if (photo.uri !== null && photo.uri !== undefined && photo.url === null) {
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

  const deleteCommonAndTemplateData = useCallback(
    async (project: ProjectType) => {
      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }

      const commonLayers = getTargetLayers(layers, 'Common');
      for (const layer of commonLayers) {
        //コモンレイヤと同じidのデータ（テンプレートと全員のデータ）を一旦すべて削除
        await projectStore.deleteData(project.id, layer.id);
      }
      const templateLayers = getTargetLayers(layers, 'Template');
      for (const layer of templateLayers) {
        //テンプレートレイヤを一旦すべて削除。データは残す。
        //ToDo: ただし構造が大きく変わる場合は、データも消さないとエラーになる可能性がある。
        await projectStore.deleteData(project.id, layer.id, 'TEMPLATE');
      }
      return { isOK: true, message: '' };
    },
    [layers, user]
  );

  const uploadDataToRepository = useCallback(
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
        const photoFields = layer.field.filter((f) => f.format === 'PHOTO');
        const isTemplate = uploadType === 'Template';
        const targetRecordSet = getTargetRecordSet(fullDataSet, layer, user, isTemplate);

        //写真の更新
        const updatedData = await Promise.all(
          targetRecordSet.map((d: RecordType) => {
            return updateStoragePhoto(isLicenseOK, d, project, layer.id, photoFields);
          })
        );

        const { isOK, message } = await projectStore.uploadDataHelper(project.id, {
          layerId: layer.id,
          userId: user.uid,
          permission: uploadType === 'Template' ? 'TEMPLATE' : layer.permission,
          data: updatedData,
        });
        if (!isOK) {
          //ToDo 処理続けるかどうか？
          return { isOK: false, message: message };
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
    [dispatch, fullDataSet, isSettingProject, layers, updateStoragePhoto, updatedAt, user]
  );

  const uploadTileMaps = useCallback(
    async (projectId: string) => {
      const uploadedTileMaps: TileMapType[] = [];
      for (const tileMap of tileMaps) {
        if (tileMap.url.startsWith('file://') && tileMap.url.endsWith('.pdf')) {
          const { isOK, message, url, key } = await projectStorage.uploadPDF(projectId, tileMap.id);
          if (!isOK || url === null) {
            await AlertAsync(message);
            uploadedTileMaps.push(tileMap);
          } else {
            uploadedTileMaps.push({ ...tileMap, url, encryptKey: key });
          }
        } else if (tileMap.url.includes('blob:')) {
          //ローカルのPMTilesはアップロードしない
        } else {
          uploadedTileMaps.push(tileMap);
        }
      }

      return uploadedTileMaps;
    },
    [tileMaps]
  );

  const uploadDictionary = useCallback(
    async (projectId: string) => {
      //Dictionary
      const uploadedLayers: LayerType[] = [];
      for (const layer of layers) {
        const hasDictionaryFieald = layer.field.some((field) => field.format === 'STRING_DICTIONARY');
        if (!hasDictionaryFieald) {
          uploadedLayers.push(layer);
          continue;
        }
        const dictionaryData = await exportDatabase(layer.id);
        if (dictionaryData === undefined) {
          await AlertAsync(t('hooks.message.failUploadDictionary'));
          uploadedLayers.push(layer);
          continue;
        }
        const { isOK, message, key } = await projectStorage.uploadDictionary(projectId, layer.id, dictionaryData);
        if (!isOK) {
          await AlertAsync(message);
          uploadedLayers.push(layer);
          continue;
        }
        uploadedLayers.push({ ...layer, dictionaryKey: key });
      }
      return uploadedLayers;
    },
    [layers]
  );

  const uploadProjectSettings = useCallback(
    async (project_: ProjectType) => {
      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }
      // 旧レイヤ設定を取得してpermissionの変更を検知
      const oldSettingsRes = await projectStore.downloadProjectSettings(project_.id);
      const oldLayers = oldSettingsRes.isOK && oldSettingsRes.data ? oldSettingsRes.data.layers : [];
      // 変更後のレイヤ設定をアップロード前に作成
      const excludeItems = tileMaps.map((tileMap) => tileMap.id);
      await projectStorage.deleteProjectPDF(project_.id, excludeItems);
      const updatedTileMaps = await uploadTileMaps(project_.id);
      const updatedLayers = await uploadDictionary(project_.id);
      // permission変更があればサーバーデータも一括更新
      for (const newLayer of updatedLayers) {
        const oldLayer = oldLayers.find((l) => l.id === newLayer.id);
        if (oldLayer && oldLayer.permission !== newLayer.permission) {
          await projectStore.updateLayerDataPermission(
            project_.id,
            newLayer.id,
            oldLayer.permission,
            newLayer.permission
          );
        }
      }
      const { isOK, message, timestamp } = await projectStore.uploadProjectSettings(project_.id, user.uid, {
        layers: updatedLayers,
        tileMaps: updatedTileMaps,
        mapType,
        mapRegion,
        plugins,
        updatedAt,
      });
      if (!isOK) {
        return { isOK: false, message };
      }
      dispatch(editSettingsAction({ updatedAt: timestamp?.toISOString() }));
      return { isOK: true, message: '' };
    },
    [dispatch, mapRegion, mapType, plugins, tileMaps, updatedAt, uploadDictionary, uploadTileMaps, user]
  );

  const uploadDefaultProjectSettings = useCallback(
    async (project_: ProjectType) => {
      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }
      const { isOK, message } = await projectStore.uploadProjectSettings(project_.id, user.uid, {
        layers: layersInitialState,
        tileMaps: tileMapsInitialState,
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
      const { isOK: photoOK, message: photoMessage } = await projectStorage.deleteProjectStorageData(project_.id);
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

  const downloadDictionaries = useCallback(async (projectId: string, layers_: LayerType[]) => {
    for (const layer of layers_) {
      if (layer.dictionaryKey === undefined) continue;
      const { isOK, data } = await projectStorage.downloadDictionary(projectId, layer.id, layer.dictionaryKey);
      if (!isOK) {
        //メッセージは出ないようにする
        //await AlertAsync(message);
        continue;
      }
      await importDictionary(data);
    }
  }, []);

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
      await downloadDictionaries(project.id, layers_);
      const projectRegion = cloneDeep(settings.mapRegion);
      dispatch(setLayersAction(layers_));
      dispatch(setTileMapsAction(tileMaps_));
      dispatch(editSettingsAction({ ...settings, projectRegion }));
      return { isOK: true, message: '', region: projectRegion };
    },
    [dispatch, downloadDictionaries]
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

  const fetchPublicData = useCallback(
    async (project_: ProjectType, shouldPhotoDownload: boolean, mode: 'all' | 'others' = 'all') => {
      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin'), data: [] };
      }
      const options: { excludeUserId?: string } = {};
      if (mode === 'others') {
        options.excludeUserId = user.uid;
      }
      const { isOK, message, data } = await projectStore.downloadPublicData(project_.id, options);

      if (!isOK || data === undefined) {
        return { isOK: false, message, data: [] };
      }
      const updatedData = shouldPhotoDownload ? await downloadPhotos(layers, data, project_) : data;

      return { isOK: true, message: '', data: updatedData };
    },
    [downloadPhotos, layers, user]
  );

  const fetchPrivateData = useCallback(
    async (project_: ProjectType, shouldPhotoDownload: boolean, mode: 'own' | 'all' | 'others' = 'own') => {
      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin'), data: [] };
      }

      const options: { userId?: string; excludeUserId?: string } = {};
      if (mode === 'own') {
        options.userId = user.uid;
      } else if (mode === 'others') {
        options.excludeUserId = user.uid;
      }
      const res = await projectStore.downloadPrivateData(project_.id, options);
      const { isOK, message, data } = res;

      if (!isOK || data === undefined) {
        return { isOK: false, message, data: [] };
      }
      const updatedData = shouldPhotoDownload ? await downloadPhotos(layers, data, project_) : data;
      return { isOK: true, message: '', data: updatedData };
    },
    [downloadPhotos, layers, user]
  );

  const fetchTemplateData = useCallback(
    async (project_: ProjectType, shouldPhotoDownload: boolean) => {
      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin'), data: [] };
      }
      const { isOK, message, data } = await projectStore.downloadTemplateData(project_.id);

      if (!isOK || data === undefined) {
        return { isOK: false, message, data: [] };
      }
      let updatedData: DataType[];
      if (shouldPhotoDownload) {
        updatedData = await downloadPhotos(layers, data, project_);
      } else {
        updatedData = data;
      }
      return { isOK: true, message: '', data: updatedData.map((d) => ({ ...d, userId: 'template' })) };
    },
    [downloadPhotos, layers, user]
  );

  const downloadTemplateData = useCallback(
    async (project: ProjectType, shouldPhotoDownload: boolean) => {
      const res = await fetchTemplateData(project, shouldPhotoDownload);
      if (res.isOK && res.data) {
        dispatch(updateDataAction(res.data));
      }
      return res;
    },
    [dispatch, fetchTemplateData]
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
    fetchPublicData,
    fetchPrivateData,
    fetchTemplateData,
    uploadDataToRepository,
    uploadProjectSettings,
    deleteCommonAndTemplateData,
    conflictState,
    setConflictState,
    conflictsResolver,
    createMergedDataSet,
    downloadTemplateData,
    handleBulkSelect,
    handleSelect,
  } as const;
};
