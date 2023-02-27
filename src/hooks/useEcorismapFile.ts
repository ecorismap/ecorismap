import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DataType, ExportType, LayerType, PhotoType, ProjectSettingsType, SettingsType, TileMapType } from '../types';

import { AppState } from '../modules';
import { setLayersAction, createLayersInitialState } from '../modules/layers';
import * as FileSystem from 'expo-file-system';
//@ts-ignore
import Base64 from 'Base64';
import { Platform } from 'react-native';
import { setDataSetAction, createDataSetInitialState } from '../modules/dataSet';
import { cloneDeep } from 'lodash';
import { createTileMapsInitialState, setTileMapsAction } from '../modules/tileMaps';
import { createSettingsInitialState, setSettingsAction } from '../modules/settings';
import { resetDataSetUser } from '../utils/Data';
import { t } from '../i18n/config';
import { getExt } from '../utils/General';
import { exportDataAndPhoto } from '../utils/File';

import dayjs from '../i18n/dayjs';
import sanitize from 'sanitize-filename';
import { PHOTO_FOLDER } from '../constants/AppConstants';
import { unzipFromUri } from '../utils/Zip';

export type UseEcorisMapFileReturnType = {
  importProject: (
    uri: string,
    name: string,
    size: number | undefined
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
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
  loadEcorisMapFile: (
    uri: string,
    name: string,
    size: number | undefined
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
};

export const useEcorisMapFile = (): UseEcorisMapFileReturnType => {
  const dispatch = useDispatch();

  const layers = useSelector((state: AppState) => state.layers);
  const dataSet = useSelector((state: AppState) => state.dataSet);
  const settings = useSelector((state: AppState) => state.settings);
  const maps = useSelector((state: AppState) => state.tileMaps);

  const importProject = useCallback(
    async (uri: string, name: string, size: number | undefined) => {
      // if (tracking !== undefined) {
      //   return { isOK: false, message: t('hooks.message.cannotInTracking') };
      // }
      // const file = await DocumentPicker.getDocumentAsync({});
      // if (file.type === 'cancel') {
      //   return { isOK: true, message: '' };
      // }

      const ext = name.split('.').pop();
      if (ext !== 'json') {
        return { isOK: false, message: t('hooks.message.invalidFileType') };
      }

      if (Platform.OS !== 'web') {
        //呼び出し元でチェックしているけど、サポートするときのために残す
        return { isOK: false, message: t('hooks.message.onlySupportWeb') };
      }
      const arr = uri.split(',');
      const base64 = arr[arr.length - 1];
      const json = decodeURIComponent(escape(Base64.atob(base64)));
      const data: { projectSettings: ProjectSettingsType; dataSet: DataType[] } = JSON.parse(json);
      const updatedDataSet = resetDataSetUser(data.dataSet);
      dispatch(setDataSetAction(updatedDataSet));
      dispatch(setLayersAction(data.projectSettings.layers));
      dispatch(setTileMapsAction(data.projectSettings.tileMaps));
      dispatch(setSettingsAction(createSettingsInitialState()));

      return { isOK: true, message: '' };
    },
    [dispatch]
  );

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
    [dataSet, layers, maps, settings]
  );

  const loadEcorisMapFile = useCallback(
    async (uri: string, name: string, size: number | undefined) => {
      const ext = getExt(name);
      if (ext?.toLowerCase() !== 'ecorismap') {
        return { isOK: false, message: t('hooks.message.wrongExtension') };
      }
      //console.log(file.uri);
      const loaded = await importEcorisMapFile(uri);
      if (loaded === undefined) {
        return { isOK: false, message: t('hooks.message.failGetData') };
      }
      //console.log('######', loaded);
      dispatch(setDataSetAction(loaded.dataSet));
      dispatch(setLayersAction(loaded.layers));
      dispatch(setSettingsAction(loaded.settings));
      dispatch(setTileMapsAction(loaded.maps));
      return { isOK: true, message: '' };
    },
    [dispatch]
  );

  const createNewEcorisMap = useCallback(async () => {
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
  }, [dispatch, settings.tutrials]);

  return {
    importProject,
    createNewEcorisMap,
    saveEcorisMapFile,
    loadEcorisMapFile,
  } as const;
};
