import { useCallback, useMemo, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import {
  DataType,
  EcorisMapFileType,
  ExportType,
  LayerType,
  PhotoType,
  RecordType,
  RegionType,
  SettingsType,
  TileMapType,
} from '../types';

import { RootState } from '../store';
import { layersInitialState, setLayersAction } from '../modules/layers';
import { dataSetInitialState } from '../modules/dataSet';
import { tileMapsInitialState } from '../modules/tileMaps';
import { settingsInitialState } from '../modules/settings';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { setDataSetAction } from '../modules/dataSet';
import { cloneDeep } from 'lodash';
import { setTileMapsAction } from '../modules/tileMaps';
import { setSettingsAction } from '../modules/settings';
import { t } from '../i18n/config';
import { getExt } from '../utils/General';

import dayjs from '../i18n/dayjs';
import { PHOTO_FOLDER } from '../constants/AppConstants';
import { unzipFromUri } from '../utils/Zip';
import JSZip from 'jszip';
import { generateCSV, generateGPX, generateGeoJson } from '../utils/Geometry';
import sanitize from 'sanitize-filename';
import { ulid } from 'ulid';

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
    region?: RegionType;
  }>;
  createExportSettings: () => SettingsType;
};

export const useEcorisMapFile = (): UseEcorisMapFileReturnType => {
  const dispatch = useDispatch();
  const settings = useSelector((state: RootState) => state.settings);
  const [isLoading, setIsLoading] = useState(false);

  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: RootState) => state.user, shallowEqual);
  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );

  const createExportSettings = useCallback(() => {
    return {
      ...settings,
      tutrials: { ...settings.tutrials, TERMS_OF_USE: false },
      isSettingProject: false,
      isSynced: false,
      isEditingRecord: false,
      role: undefined,
      tileRegions: [],
      projectId: undefined,
      projectName: undefined,
      memberLocation: [],
      tracking: undefined,
      selectedRecord: undefined,
      plugins: {},
      photosToBeDeleted: [],
    } as SettingsType;
  }, [settings]);

  const sortGroupData = (data: RecordType[]) => {
    // 親要素を取得
    const parents = data.filter((item) => (item.field._group ? item.field._group === '' : true));
    // 子要素を取得（一時的に使用しないが、後のステップで役立つかもしれない）
    // const children = data.filter(item => item._group !== "");

    // ソートされたデータを保持する配列
    const sortedData: RecordType[] = [];

    // 各親要素に対して、その子要素を見つけて配列に追加する
    parents.forEach((parent) => {
      sortedData.push(parent); // 親要素を追加
      // この親の子要素を見つけて追加
      data
        .filter((child) => child.field._group === parent.id)
        .forEach((child) => {
          sortedData.push(child);
        });
    });

    return sortedData;
  };

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
          folder: sanitize(layer.name),
        });
        if (layer.type === 'LAYERGROUP') continue;
        const records = data.dataSet.map((d) => (d.layerId === layer.id ? d.data.map((v) => v) : [])).flat();
        const isMapMemoLayer = records.some((r) => r.field._strokeColor !== undefined);
        const sortedRecords = isMapMemoLayer ? sortGroupData(records) : records;
        if (option?.includeGISData) {
          //GeoJSON
          const geojson = generateGeoJson(sortedRecords, layer.field, layer.type, layer.id, isMapMemoLayer);
          const geojsonData = JSON.stringify(geojson);
          const geojsonName = `${layer.name}_${time}.geojson`;
          exportData.push({ data: geojsonData, name: geojsonName, type: 'GeoJSON', folder: sanitize(layer.name) });
          //CSV
          const csv = generateCSV(sortedRecords, layer.field, layer.type, isMapMemoLayer);
          const csvData = csv;
          const csvName = `${layer.name}_${time}.csv`;
          exportData.push({ data: csvData, name: csvName, type: 'CSV', folder: sanitize(layer.name) });
          //GPX
          if (layer.type === 'POINT' || layer.type === 'LINE') {
            const gpx = generateGPX(sortedRecords, layer.type);
            const gpxData = gpx;
            const gpxName = `${layer.name}_${time}.gpx`;
            exportData.push({ data: gpxData, name: gpxName, type: 'GPX', folder: sanitize(layer.name) });
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
                  exportData.push({ data: uri, name: id, type: 'PHOTO', folder: sanitize(layer.name) });
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

  const updateDataSetUser = useCallback(
    (dataSet: DataType[]) => {
      //userとidを書き換える
      //複数の管理者がデータをアップロードするときに、同じidが発生する？ので書き換える。要調査
      const newDataSet = dataSet.map((d) => {
        const newData = d.data.map((v) => {
          return { ...v, id: ulid(), userId: dataUser.uid, displayName: dataUser.displayName };
        });
        return { ...d, userId: dataUser.uid, data: newData };
      });
      return newDataSet;
    },
    [dataUser.displayName, dataUser.uid]
  );

  const mergeSameLayer = useCallback(
    (dataSet: DataType[]) => {
      //同じレイヤーのデータをマージ.ユーザーも書き換える
      const newDataSet: DataType[] = [];
      const layerIds = dataSet.map((d) => d.layerId);
      const uniqueLayerIds = layerIds.filter((x, i, self) => self.indexOf(x) === i);
      uniqueLayerIds.forEach((layerId) => {
        const layerDataSet = dataSet.filter((d) => d.layerId === layerId);
        const mergedData = layerDataSet.map((d) => d.data).flat();
        newDataSet.push({ layerId: layerId, userId: dataUser.uid, data: mergedData });
      });
      return newDataSet;
    },
    [dataUser.uid]
  );

  const loadEcorisMapFile = useCallback(
    async (uri: string) => {
      try {
        setIsLoading(true);
        const loaded = await unzipFromUri(uri);
        const jsonFile = Object.keys(loaded.files).find((f) => {
          return getExt(f) === 'json' && !f.includes('/');
        });

        if (jsonFile === undefined) return;
        const decompressed = await loaded.files[jsonFile].async('text');
        const data = JSON.parse(decompressed) as EcorisMapFileType;

        const updatedPhotoDataSet = await updatePhotoField(data, loaded.files);
        const updatedUserDataSet = updateDataSetUser(updatedPhotoDataSet);
        const mergedDataSet = mergeSameLayer(updatedUserDataSet);
        // console.log('updatedUserDataSet', updatedUserDataSet);
        return { ...data, dataSet: mergedDataSet };
      } catch (e) {
        console.log(e);
        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    [mergeSameLayer, updateDataSetUser, updatePhotoField]
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
      dispatch(
        setSettingsAction({ ...settings, mapRegion: loaded.settings.mapRegion, mapType: loaded.settings.mapType })
      );
      dispatch(setTileMapsAction(loaded.maps));

      return { isOK: true, message: '', region: loaded.settings.mapRegion };
    },
    [dispatch, loadEcorisMapFile, settings]
  );

  const clearEcorisMap = useCallback(async () => {
    //レイヤ、データ、地図情報、設定をリセット。設定のtutrialは現在の状況を引き継ぐ
    dispatch(setLayersAction(layersInitialState));
    dispatch(setDataSetAction(dataSetInitialState));
    dispatch(setTileMapsAction(tileMapsInitialState));
    dispatch(setSettingsAction({ ...settingsInitialState, tutrials: settings.tutrials }));
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
    createExportSettings,
  } as const;
};
