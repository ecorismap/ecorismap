import { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DataType, EcorisMapFileType, ExportType, PhotoType, ProjectSettingsType } from '../types';

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

import dayjs from '../i18n/dayjs';
import { PHOTO_FOLDER } from '../constants/AppConstants';
import { unzipFromUri } from '../utils/Zip';
import JSZip from 'jszip';

export type UseEcorisMapFileReturnType = {
  isLoading: boolean;
  importProject: (
    uri: string,
    name: string,
    size: number | undefined
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  clearEcorisMap: () => Promise<{
    isOK: boolean;
    message: string;
  }>;
  generateEcorisMapData: (includePhoto: boolean) => {
    data: string;
    name: string;
    type: ExportType | 'JSON' | 'PHOTO';
    folder: string;
  }[];

  openEcorisMapFile: (uri: string) => Promise<{
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
  const [isLoading, setIsLoading] = useState(false);

  const importProject = useCallback(
    async (uri: string, name: string) => {
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

  const generateEcorisMapData = useCallback(
    (includePhoto: boolean) => {
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
      return exportData;
    },
    [dataSet, layers, maps, settings]
  );

  async function importPhotos(
    files: {
      [key: string]: JSZip.JSZipObject;
    },
    layerId: string,
    photoName: string,
    photoId: string,
    folder: string
  ) {
    let newUri;
    if (Platform.OS === 'web') {
      const content = await files[`${layerId}/${photoId}`].async('arraybuffer');
      const buffer = new Uint8Array(content);
      const photoData = new Blob([buffer.buffer]);
      newUri = URL.createObjectURL(photoData);
      //console.log(newUri);
    } else {
      const photoData = await files[`${layerId}/${photoId}`].async('base64');
      newUri = folder + '/' + photoName;
      //console.log(newUri);
      await FileSystem.writeAsStringAsync(newUri, photoData, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
    return newUri;
  }

  const updatePhotoField = useCallback(
    async (
      data: EcorisMapFileType,
      files: {
        [key: string]: JSZip.JSZipObject;
      }
    ) => {
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
                  const newUri = await importPhotos(files, layer.id, photo.name, photo.id, folder);
                  return { ...photo, uri: newUri };
                } else {
                  return photo;
                }
              });
              newRecord.field[photoField.name] = await Promise.all(photos);
            }

            return newRecord;
          });
          return { ...layerData, data: await Promise.all(newRecords) };
        });
        newDataSet = [...newDataSet, ...(await Promise.all(newLayerDataSet))];
      }
      return newDataSet;
    },
    []
  );

  const loadEcorisMapFile = useCallback(
    async (uri: string) => {
      try {
        setIsLoading(true);
        const loaded = await unzipFromUri(uri);
        const jsonFile = Object.keys(loaded.files).find((f) => getExt(f) === 'json');
        if (jsonFile === undefined) return;
        const decompressed = await loaded.files[jsonFile].async('text');
        const data = JSON.parse(decompressed) as EcorisMapFileType;

        const updatedDataSet = await updatePhotoField(data, loaded.files);

        return { ...data, dataSet: updatedDataSet };
      } catch (e) {
        console.log(e);
        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    [updatePhotoField]
  );

  const openEcorisMapFile = useCallback(
    async (uri: string) => {
      //console.log('######', loaded);
      const loaded = await loadEcorisMapFile(uri);
      if (loaded === undefined) {
        return { isOK: true, message: t('hooks.message.failGetData') };
      }
      //ToDo: データのサイズチェック。もともと書き出したものだからチェックいらない？
      dispatch(setDataSetAction(loaded.dataSet));
      dispatch(setLayersAction(loaded.layers));
      dispatch(setSettingsAction(loaded.settings));
      dispatch(setTileMapsAction(loaded.maps));
      return { isOK: true, message: '' };
    },
    [dispatch, loadEcorisMapFile]
  );

  const clearEcorisMap = useCallback(async () => {
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
  }, [dispatch, settings?.tutrials]);

  return {
    isLoading,
    importProject,
    clearEcorisMap,
    generateEcorisMapData,
    openEcorisMapFile,
  } as const;
};
