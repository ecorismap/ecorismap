import { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DataType, EcorisMapFileType, ExportType, LayerType, PhotoType, SettingsType, TileMapType } from '../types';

import { AppState } from '../modules';
import { setLayersAction, createLayersInitialState } from '../modules/layers';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { setDataSetAction, createDataSetInitialState } from '../modules/dataSet';
import { cloneDeep } from 'lodash';
import { createTileMapsInitialState, setTileMapsAction } from '../modules/tileMaps';
import { createSettingsInitialState, setSettingsAction } from '../modules/settings';
import { t } from '../i18n/config';
import { getExt } from '../utils/General';

import dayjs from '../i18n/dayjs';
import { PHOTO_FOLDER } from '../constants/AppConstants';
import { unzipFromUri } from '../utils/Zip';
import JSZip from 'jszip';
import { generateCSV, generateGPX, generateGeoJson } from '../utils/Geometry';

export type UseEcorisMapFileReturnType = {
  isLoading: boolean;
  clearEcorisMap: () => Promise<{
    isOK: boolean;
    message: string;
  }>;
  generateEcorisMapData: (
    data: {
      dataSet: DataType[];
      layers: LayerType[];
      settings: SettingsType;
      maps: TileMapType[];
    },
    option?: {
      includePhoto: boolean;
      fromProject: boolean;
      includeGISData: boolean;
    }
  ) => Promise<
    {
      data: string;
      name: string;
      type: ExportType | 'JSON' | 'PHOTO';
      folder: string;
    }[]
  >;

  openEcorisMapFile: (uri: string) => Promise<{
    isOK: boolean;
    message: string;
  }>;
};

export const useEcorisMapFile = (): UseEcorisMapFileReturnType => {
  const dispatch = useDispatch();
  const settings = useSelector((state: AppState) => state.settings);
  const [isLoading, setIsLoading] = useState(false);

  const generateEcorisMapData = useCallback(
    async (
      data: {
        dataSet: DataType[];
        layers: LayerType[];
        settings: SettingsType;
        maps: TileMapType[];
      },
      option?: { includePhoto: boolean; fromProject: boolean; includeGISData: boolean }
    ) => {
      const exportData: { data: string; name: string; type: ExportType | 'JSON' | 'PHOTO'; folder: string }[] = [];
      const savedData = JSON.stringify(data);
      const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');
      const savedDataName = `local_${time}.json`;
      exportData.push({ data: savedData, name: savedDataName, type: 'JSON', folder: '' });

      for (const layer of data.layers) {
        //LayerSetting
        const layerSetting = JSON.stringify(layer);
        exportData.push({
          data: layerSetting,
          name: `${layer.name}_${time}.json`,
          type: 'JSON',
          folder: `${layer.id}`,
        });
        const records = data.dataSet.map((d) => (d.layerId === layer.id ? d.data.map((v) => v) : [])).flat();
        if (option?.includeGISData) {
          //GeoJSON
          const geojson = generateGeoJson(records, layer.field, layer.type, layer.id);
          const geojsonData = JSON.stringify(geojson);
          const geojsonName = `${layer.name}_${time}.geojson`;
          exportData.push({ data: geojsonData, name: geojsonName, type: 'GeoJSON', folder: `${layer.id}` });
          //CSV
          const csv = generateCSV(records, layer.field, layer.type);
          const csvData = csv;
          const csvName = `${layer.name}_${time}.csv`;
          exportData.push({ data: csvData, name: csvName, type: 'CSV', folder: `${layer.id}` });
          //GPX
          if (layer.type === 'POINT' || layer.type === 'LINE') {
            const gpx = generateGPX(records, layer.type);
            const gpxData = gpx;
            const gpxName = `${layer.name}_${time}.gpx`;
            exportData.push({ data: gpxData, name: gpxName, type: 'GPX', folder: `${layer.id}` });
          }
        }
        //Photo

        //fromLocal
        if (option?.includePhoto && option?.fromProject) {
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
    []
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
    clearEcorisMap,
    generateEcorisMapData,
    openEcorisMapFile,
  } as const;
};
