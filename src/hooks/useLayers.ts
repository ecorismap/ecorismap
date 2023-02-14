import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  DataType,
  ExportType,
  FeatureType,
  GeoJsonFeatureType,
  LayerType,
  PhotoType,
  ProjectSettingsType,
  SettingsType,
  TileMapType,
} from '../types';

import { AppState } from '../modules';
import { updateLayerAction, setLayersAction, addLayerAction, createLayersInitialState } from '../modules/layers';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
//@ts-ignore
import Base64 from 'Base64';
import { Gpx2Data, GeoJson2Data, createGeoJsonLayer } from '../utils/Geometry';
import { Platform } from 'react-native';
import { setDataSetAction, createDataSetInitialState, addDataAction } from '../modules/dataSet';
import { cloneDeep } from 'lodash';
import { createTileMapsInitialState, setTileMapsAction } from '../modules/tileMaps';
import { createSettingsInitialState, setSettingsAction } from '../modules/settings';
import { hasOpened } from '../utils/Project';
import { resetDataSetUser } from '../utils/Data';
import { t } from '../i18n/config';
import { getExt } from '../utils/General';
import { AlertAsync } from '../components/molecules/AlertAsync';
import { clearCacheData, exportDataAndPhoto } from '../utils/File';
import { kml } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';

import dayjs from '../i18n/dayjs';
import sanitize from 'sanitize-filename';
import { AppID, PHOTO_FOLDER } from '../constants/AppConstants';

import { unzipFromUri } from '../utils/Zip';
import { updateLayerIds } from '../utils/Layer';

export type UseLayersReturnType = {
  layers: LayerType[];
  editable: boolean;
  changeLabel: (index: number, labelValue: string) => void;
  changeVisible: (index: number, layer: LayerType) => void;
  changeActiveLayer: (index: number) => void;
  changeLayerOrder: (index: number) => {
    isOK: boolean;
    message: string;
  };
  importProject: () => Promise<{
    isOK: boolean;
    message: string;
  }>;
  importFile: () => Promise<{
    isOK: boolean;
    message: string;
  }>;
  importDropedFile: (acceptedFiles: any) => Promise<string[]>;
  loadFile: (
    name: string,
    uri: string,
    option?: {
      drop?: boolean;
    }
  ) => Promise<void>;
  getReceivedFile: () => Promise<void>;
  createNewEcorisMap: () => Promise<{
    isOK: boolean;
    message: string;
  }>;
  saveEcorisMapFile: (
    fileName: string,
    includePhoto: boolean
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  loadEcorisMapFile: () => Promise<{
    isOK: boolean;
    message: string;
  }>;
};

export const useLayers = (): UseLayersReturnType => {
  const dispatch = useDispatch();
  const layers = useSelector((state: AppState) => state.layers);
  const dataSet = useSelector((state: AppState) => state.dataSet);
  const settings = useSelector((state: AppState) => state.settings);
  const maps = useSelector((state: AppState) => state.tileMaps);

  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const user = useSelector((state: AppState) => state.user);
  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );
  const tracking = useSelector((state: AppState) => state.settings.tracking);
  const role = useSelector((state: AppState) => state.settings.role);
  const isSettingProject = useSelector((state: AppState) => state.settings.isSettingProject);
  const editable = useMemo(
    () =>
      ((role === 'OWNER' || role === 'ADMIN') && isSettingProject) || user.uid === undefined || projectId === undefined,
    [isSettingProject, projectId, role, user.uid]
  );
  const changeLabel = useCallback(
    (index: number, labelValue: string) => {
      const newLayer = cloneDeep(layers[index]);
      newLayer.label = labelValue;
      dispatch(updateLayerAction(newLayer));
    },
    [dispatch, layers]
  );

  const changeVisible = useCallback(
    (index: number, layer: LayerType) => {
      const newLayer = cloneDeep(layers[index]);
      newLayer.visible = !layer.visible;
      dispatch(updateLayerAction(newLayer));
    },
    [dispatch, layers]
  );

  const changeActiveLayer = useCallback(
    (index: number) => {
      //自分がアクティブになる場合、同じタイプの他のものはfalseにする
      const newlayers = cloneDeep(layers);

      if (layers[index].active) {
        newlayers[index].active = false;
      } else {
        newlayers.forEach((item, idx) => {
          if (layers[index].type === item.type) {
            newlayers[idx].active = index === idx ? true : false;
          }
        });
      }

      dispatch(setLayersAction(newlayers));
    },
    [dispatch, layers]
  );

  const importGPX = useCallback(
    (gpx: string, featureType: FeatureType, importFileName: string) => {
      const data = Gpx2Data(gpx, featureType, importFileName, dataUser.uid, dataUser.displayName);
      if (data === undefined) return;
      //console.log(recordSet[0].field);
      if (data.recordSet.length > 0) {
        dispatch(addLayerAction(data.layer));
        dispatch(addDataAction([{ layerId: data.layer.id, userId: dataUser.uid, data: data.recordSet }]));
      }
    },
    [dispatch, dataUser.displayName, dataUser.uid]
  );

  const importGeoJson = useCallback(
    (geojson: string, featureType: GeoJsonFeatureType, importFileName: string, layer?: LayerType) => {
      const data = GeoJson2Data(geojson, featureType, dataUser.uid, dataUser.displayName);
      //console.log('data', data);
      if (data === undefined) {
        return;
      }
      let importedLayer;
      if (layer === undefined) {
        importedLayer = createGeoJsonLayer(importFileName, data.featureType, data.fields);
      } else {
        importedLayer = cloneDeep(layer);
        //ToDo Layerとデータの整合性のチェック
      }
      //SET_LAYERSだとレンダリング時にしかdispatchの値が更新されず、連続で呼び出した際に不具合があるためADDする
      if (data.recordSet.length > 0) {
        dispatch(addLayerAction(importedLayer));
        dispatch(addDataAction([{ layerId: importedLayer.id, userId: dataUser.uid, data: data.recordSet }]));
      }
    },
    [dispatch, dataUser.displayName, dataUser.uid]
  );

  const loadFile = useCallback(
    async (name: string, uri: string) => {
      const ext = getExt(name);
      switch (ext?.toLowerCase()) {
        case 'zip': {
          const loaded = await unzipFromUri(uri);
          const jsonFiles = loaded.file(/\.json$/);
          if (jsonFiles.length !== 1) throw 'invalid zip file';
          const jsonDecompressed = await jsonFiles[0].async('text');
          const importedLayer: LayerType = updateLayerIds(JSON.parse(jsonDecompressed) as LayerType);

          const geojsonFiles = loaded.file(/\.geojson$/);
          if (geojsonFiles.length !== 1) throw 'invalid zip file';
          const geojson = await geojsonFiles[0].async('text');
          //ToDo 有効なgeojsonファイルかチェック
          importGeoJson(geojson, 'POINT', name, importedLayer);
          importGeoJson(geojson, 'MULTIPOINT', name, importedLayer);
          importGeoJson(geojson, 'LINE', name, importedLayer);
          importGeoJson(geojson, 'MULTILINE', name, importedLayer);
          importGeoJson(geojson, 'POLYGON', name, importedLayer);
          importGeoJson(geojson, 'MULTIPOLYGON', name, importedLayer);
          break;
        }
        case 'kml': {
          let kmlString;
          if (Platform.OS === 'web') {
            const arr = uri.split(',');
            const base64 = arr[arr.length - 1];

            kmlString = decodeURIComponent(escape(Base64.atob(base64)));
          } else {
            kmlString = await FileSystem.readAsStringAsync(uri);
          }

          const parser = new DOMParser();
          const xml = parser.parseFromString(kmlString, 'text/xml');
          const geojson = JSON.stringify(kml(xml));
          importGeoJson(geojson, 'POINT', name);
          importGeoJson(geojson, 'MULTIPOINT', name);
          importGeoJson(geojson, 'LINE', name);
          importGeoJson(geojson, 'MULTILINE', name);
          importGeoJson(geojson, 'POLYGON', name);
          importGeoJson(geojson, 'MULTIPOLYGON', name);

          break;
        }
        case 'kmz': {
          const loaded = await unzipFromUri(uri);
          const files = loaded.file(/\.kml$/);

          const parser = new DOMParser();
          for (const file of files) {
            const kmlString = await file.async('string');
            const xml = parser.parseFromString(kmlString, 'text/xml');
            const geojson = JSON.stringify(kml(xml));
            importGeoJson(geojson, 'POINT', name);
            importGeoJson(geojson, 'MULTIPOINT', name);
            importGeoJson(geojson, 'LINE', name);
            importGeoJson(geojson, 'MULTILINE', name);
            importGeoJson(geojson, 'POLYGON', name);
            importGeoJson(geojson, 'MULTIPOLYGON', name);
          }

          break;
        }
        case 'gpx': {
          let gpx;
          if (Platform.OS === 'web') {
            const arr = uri.split(',');
            const base64 = arr[arr.length - 1];

            gpx = decodeURIComponent(escape(Base64.atob(base64)));
          } else {
            gpx = await FileSystem.readAsStringAsync(uri);
          }

          //console.log(gpx);
          importGPX(gpx, 'POINT', name);
          importGPX(gpx, 'LINE', name);
          break;
        }
        case 'geojson': {
          let geojson;
          if (Platform.OS === 'web') {
            const arr = uri.split(',');
            const base64 = arr[arr.length - 1];
            geojson = decodeURIComponent(escape(Base64.atob(base64)));
          } else {
            //console.log(geojson);
            geojson = await FileSystem.readAsStringAsync(uri);
          }

          importGeoJson(geojson, 'POINT', name);
          importGeoJson(geojson, 'MULTIPOINT', name);
          importGeoJson(geojson, 'LINE', name);
          importGeoJson(geojson, 'MULTILINE', name);
          importGeoJson(geojson, 'POLYGON', name);
          importGeoJson(geojson, 'MULTIPOLYGON', name);
          break;
        }
        default:
          throw 'invalid extension';
      }
    },
    [importGPX, importGeoJson]
  );

  const importDropedFile = useCallback(
    async (acceptedFiles) => {
      const filePromises = acceptedFiles.map((f: any) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onabort = (error) => reject(error);
          reader.onerror = (error) => reject(error);
          reader.onload = async () => {
            try {
              const uri = reader.result;
              if (typeof uri === 'string') {
                await loadFile(f.name, uri);
                resolve(f.name);
              }
            } catch (error) {
              reject(error);
            }
          };
          reader.readAsDataURL(f);
          //console.log(f);
        });
      });
      const fileInfos = await Promise.all(filePromises);
      return fileInfos as string[];
    },
    [loadFile]
  );

  const importFile = useCallback(async () => {
    try {
      const file = await DocumentPicker.getDocumentAsync({});
      if (file.type === 'cancel') {
        return { isOK: true, message: '' };
      }
      //console.log(file);
      const ext = getExt(file.name);

      if (
        ext?.toLowerCase() !== 'gpx' &&
        ext?.toLowerCase() !== 'geojson' &&
        ext?.toLowerCase() !== 'kml' &&
        ext?.toLowerCase() !== 'kmz' &&
        ext?.toLowerCase() !== 'zip'
      ) {
        return { isOK: false, message: t('hooks.message.wrongExtension') };
      }
      if (file.size === undefined) {
        return { isOK: false, message: t('hooks.message.cannotGetFileSize') };
      }
      if (file.size / 1024 > 1000) {
        return { isOK: false, message: t('hooks.message.cannotImportData') };
      }
      const name = file.name;
      const uri = file.uri;
      //console.log('$$$', uri);

      await loadFile(name, uri);
      return { isOK: true, message: t('hooks.message.receiveFile') };
    } catch (e: any) {
      return { isOK: true, message: t('hooks.message.failReceiveFile') };
    }
  }, [loadFile]);

  const importProject = useCallback(async () => {
    if (hasOpened(projectId)) {
      return { isOK: false, message: t('hooks.message.cannotImportInProjectOpen') };
    }
    if (tracking !== undefined) {
      return { isOK: false, message: t('hooks.message.cannotInTracking') };
    }
    const file = await DocumentPicker.getDocumentAsync({});
    if (file.type === 'cancel') {
      return { isOK: true, message: '' };
    }
    const ext = file.name.split('.').pop();
    if (ext !== 'json') {
      return { isOK: false, message: t('hooks.message.invalidFileType') };
    }

    if (Platform.OS !== 'web') {
      //呼び出し元でチェックしているけど、サポートするときのために残す
      return { isOK: false, message: t('hooks.message.onlySupportWeb') };
    }
    const arr = file.uri.split(',');
    const base64 = arr[arr.length - 1];
    const json = decodeURIComponent(escape(Base64.atob(base64)));
    const data: { projectSettings: ProjectSettingsType; dataSet: DataType[] } = JSON.parse(json);
    const updatedDataSet = resetDataSetUser(data.dataSet);
    dispatch(setDataSetAction(updatedDataSet));
    dispatch(setLayersAction(data.projectSettings.layers));
    dispatch(setTileMapsAction(data.projectSettings.tileMaps));
    dispatch(setSettingsAction(createSettingsInitialState()));

    return { isOK: true, message: '' };
  }, [dispatch, projectId, tracking]);

  const getReceivedFile = useCallback(async () => {
    try {
      if (hasOpened(projectId)) throw t('hooks.message.cannotImportInProjectOpen');

      const dirPath = FileSystem.cacheDirectory + '';
      if (Platform.OS === 'android') {
      } else if (Platform.OS === 'ios') {
        const inboxPath = FileSystem.documentDirectory + `../tmp/${AppID}-Inbox/`;
        const dirInfo = await FileSystem.getInfoAsync(inboxPath).catch(() => {
          return;
        });
        if (dirInfo === undefined || !dirInfo.exists) {
          //console.log('No Inbox');
          return;
        }
        const dir = await FileSystem.readDirectoryAsync(inboxPath);

        for (const fileName of dir) {
          //console.log('!!!!', fileName);
          const ext = getExt(fileName)?.toLowerCase();
          if (ext === 'geojson' || ext === 'gpx' || ext === 'kml' || ext === 'kmz') {
            //console.log('#', inboxPath + encodeURI(fileName));
            await FileSystem.copyAsync({ from: inboxPath + encodeURI(fileName), to: dirPath + encodeURI(fileName) });
            await FileSystem.deleteAsync(inboxPath);
          }
        }
      }

      const dir = await FileSystem.readDirectoryAsync(dirPath);
      //console.log('######', dirPath);
      //console.log('##', dir);
      for (const fileName of dir) {
        //console.log('####', fileName);
        const filePath = dirPath + encodeURI(fileName);
        const ext = getExt(fileName)?.toLowerCase();
        if (ext === 'geojson' || ext === 'gpx' || ext === 'kml' || ext === 'kmz') {
          await loadFile(fileName, filePath);
          await FileSystem.deleteAsync(filePath);
          await AlertAsync(`${fileName}${t('hooks.message.receiveFile')}`);
        }
      }
    } catch (e: any) {
      console.log(e);
      await clearCacheData();
      //await AlertAsync(t('hooks.message.failGetData') + e);
    }
  }, [loadFile, projectId]);

  const importEcorisMapFile = async (uri: string) => {
    try {
      const loaded = await unzipFromUri(uri);
      const files = Object.keys(loaded.files);
      const jsonFile = files.find((f) => getExt(f) === 'json');
      if (jsonFile === undefined) return;
      const decompressed = await loaded.files[jsonFile].async('text');
      const data: { dataSet: DataType[]; layers: LayerType[]; settings: SettingsType; maps: TileMapType[] } =
        JSON.parse(decompressed);
      //console.log(data);
      //写真をコピー
      //URIを書き換える
      let newDataSet: DataType[] = [];
      for (const layer of data.layers) {
        const folder = `${PHOTO_FOLDER}/LOCAL/${layer.id}/OWNER`;
        if (Platform.OS !== 'web') {
          await FileSystem.makeDirectoryAsync(folder, {
            intermediates: true,
          });
        }
        const photoFields = layer.field.filter((f) => f.format === 'PHOTO');
        const layerDataSet = data.dataSet.filter((d) => d.layerId === layer.id);

        const newLayerDataSet = layerDataSet.map(async (layerData) => {
          const newRecords = layerData.data.map(async (record) => {
            const newRecord = cloneDeep(record);
            for (const photoField of photoFields) {
              const photos = (record.field[photoField.name] as PhotoType[]).map(async (photo) => {
                if (photo.uri) {
                  let newUri;
                  if (Platform.OS === 'web') {
                    const content = await loaded.files[`${layer.id}/${photo.id}`].async('arraybuffer');
                    const buffer = new Uint8Array(content);
                    const photoData = new Blob([buffer.buffer]);
                    newUri = URL.createObjectURL(photoData);
                    //console.log(newUri);
                  } else {
                    const photoData = await loaded.files[`${layer.id}/${photo.id}`].async('base64');
                    newUri = folder + '/' + photo.name;
                    //console.log(newUri);
                    await FileSystem.writeAsStringAsync(newUri, photoData, {
                      encoding: FileSystem.EncodingType.Base64,
                    });
                  }
                  return { ...photo, uri: newUri };
                } else {
                  return photo;
                }
              });
              newRecord.field[photoField.name] = await Promise.all(photos);
            }

            return newRecord;
          });
          const newData: DataType = { ...layerData, data: await Promise.all(newRecords) };
          return newData;
        });
        newDataSet = [...newDataSet, ...(await Promise.all(newLayerDataSet))];
      }

      //console.log(data.dataSet);
      //console.log(newDataSet);
      return { ...data, dataSet: newDataSet };
    } catch (e) {
      console.log(e);
      return undefined;
    }
  };

  const saveEcorisMapFile = useCallback(
    async (fileName: string, includePhoto: boolean) => {
      if (hasOpened(projectId)) {
        return { isOK: false, message: t('hooks.message.cannotSaveDataToLocalStorage') };
      }
      if (sanitize(fileName) === '') {
        return { isOK: false, message: t('hooks.message.inputCorrectFilename') };
      }
      const exportData: { data: string; name: string; type: ExportType | 'JSON' | 'PHOTO'; folder: string }[] = [];
      const savedData = JSON.stringify({ dataSet, layers, settings, maps });
      const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');
      const savedDataName = `${time}.json`;
      exportData.push({ data: savedData, name: savedDataName, type: 'JSON', folder: '' });

      if (includePhoto) {
        for (const layer of layers) {
          const records = dataSet.map((d) => (d.layerId === layer.id ? d.data.map((v) => v) : [])).flat();
          const photoFields = layer.field.filter((f) => f.format === 'PHOTO');
          records.forEach((record) => {
            photoFields.forEach((photoField) => {
              (record.field[photoField.name] as PhotoType[]).forEach(({ uri, id }) => {
                if (uri) {
                  exportData.push({ data: uri, name: id, type: 'PHOTO', folder: layer.id });
                }
              });
            });
          });
        }
      }

      const isOK = await exportDataAndPhoto(exportData, fileName, 'ecorismap');
      if (!isOK) {
        return { isOK: false, message: t('hooks.message.failSaveFile') };
      }
      return { isOK: true, message: '' };
    },
    [dataSet, layers, maps, projectId, settings]
  );

  const loadEcorisMapFile = useCallback(async () => {
    if (hasOpened(projectId)) {
      return { isOK: false, message: t('hooks.message.cannotLoadEcorisMapFile') };
    }
    if (tracking !== undefined) {
      return { isOK: false, message: t('hooks.message.cannotLoadDataInTrackking') };
    }

    const file = await DocumentPicker.getDocumentAsync({});
    if (file.type === 'cancel') {
      return { isOK: false, message: '' };
    }
    const ext = getExt(file.name);

    if (ext?.toLowerCase() !== 'ecorismap') {
      return { isOK: false, message: t('hooks.message.wrongExtension') };
    }
    //console.log(file.uri);
    const loaded = await importEcorisMapFile(file.uri);
    if (loaded === undefined) {
      return { isOK: false, message: t('hooks.message.failGetData') };
    }
    //console.log('######', loaded);
    dispatch(setDataSetAction(loaded.dataSet));
    dispatch(setLayersAction(loaded.layers));
    dispatch(setSettingsAction(loaded.settings));
    dispatch(setTileMapsAction(loaded.maps));
    return { isOK: true, message: '' };
  }, [dispatch, projectId, tracking]);

  const createNewEcorisMap = useCallback(async () => {
    if (hasOpened(projectId)) {
      return { isOK: false, message: t('hooks.message.cannotInProjectOpen') };
    }
    if (tracking !== undefined) {
      return { isOK: false, message: t('hooks.message.cannotInTracking') };
    }
    //レイヤ、データ、地図情報、設定をリセット。設定のtutrialは現在の状況を引き継ぐ
    dispatch(setLayersAction(createLayersInitialState()));
    dispatch(setDataSetAction(createDataSetInitialState()));
    dispatch(setTileMapsAction(createTileMapsInitialState()));
    const initialSettings = createSettingsInitialState();
    const newSettings = { ...initialSettings, tutrials: settings.tutrials };
    dispatch(setSettingsAction(newSettings));
    //ログインしていない前提なので、プロジェクトで使うかもしれない写真、地図キャッシュは消さない
    // const { uri } = await FileSystem.getInfoAsync(TILE_FOLDER);
    // if (uri) {
    //   await FileSystem.deleteAsync(uri);
    // }
    return { isOK: true, message: '' };
  }, [dispatch, projectId, settings.tutrials, tracking]);

  const changeLayerOrder = useCallback(
    (index: number) => {
      if (!editable) {
        return { isOK: false, message: t('hooks.message.lockProject') };
      }
      if (index === 0) return { isOK: true, message: '' };
      const newLayers = cloneDeep(layers);
      [newLayers[index], newLayers[index - 1]] = [newLayers[index - 1], newLayers[index]];
      dispatch(setLayersAction(newLayers));
      return { isOK: true, message: '' };
    },
    [dispatch, editable, layers]
  );

  return {
    layers,
    editable,
    changeLabel,
    changeVisible,
    changeActiveLayer,
    changeLayerOrder,
    importProject,
    importFile,
    importDropedFile,
    loadFile,
    getReceivedFile,
    createNewEcorisMap,
    saveEcorisMapFile,
    loadEcorisMapFile,
  } as const;
};
