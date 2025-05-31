import { useCallback, useMemo, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { ExportType, FeatureType, GeoJsonFeatureType, LayerType, PhotoType, RecordType } from '../types';

import { RootState } from '../store';
import { addLayerAction } from '../modules/layers';
import * as FileSystem from 'expo-file-system';

import { gpx2Data, geoJson2Data, createLayerFromGeoJson, csv2Data, detectGeoJsonType } from '../utils/Geometry';
import { Platform } from 'react-native';
import { addDataAction } from '../modules/dataSet';
import { cloneDeep } from 'lodash';
import { t } from '../i18n/config';
import { getExt } from '../utils/General';
import { kml } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';

import { unzipFromUri } from '../utils/Zip';
import { changeLayerId, isLayerType } from '../utils/Layer';
import { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import { decodeUri } from '../utils/File.web';
import { importDictionary, exportDatabase } from '../utils/SQLite';
import { generateCSV, generateGeoJson, generateGPX, generateKML } from '../utils/Geometry';

export type UseGeoFileReturnType = {
  isLoading: boolean;
  importGeoFile: (
    uri: string,
    name: string
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  generateExportGeoData: (
    targetLayer: LayerType,
    exportedRecords: RecordType[],
    fileNameBase: string,
    option?: {
      settingsOnly?: boolean;
      folder?: string;
      exportPhoto?: boolean;
      exportDictionary?: boolean;
    }
  ) => Promise<
    {
      data: string;
      name: string;
      type: ExportType;
      folder: string;
    }[]
  >;
};

const geoJsonFeatureTypes: GeoJsonFeatureType[] = [
  'POINT',
  'MULTIPOINT',
  'LINE',
  'MULTILINE',
  'POLYGON',
  'MULTIPOLYGON',
];

export const useGeoFile = (): UseGeoFileReturnType => {
  const dispatch = useDispatch();
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: RootState) => state.user, shallowEqual);
  const [isLoading, setIsLoading] = useState(false);
  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );

  const importGPX = useCallback(
    (gpx: string, featureType: FeatureType, importFileName: string) => {
      const data = gpx2Data(gpx, featureType, importFileName, dataUser.uid, dataUser.displayName);
      if (data === undefined) return;
      //console.log(recordSet[0].field);
      if (data.recordSet.length > 0) {
        dispatch(addLayerAction(data.layer));
        dispatch(addDataAction([{ layerId: data.layer.id, userId: dataUser.uid, data: data.recordSet }]));
      }
    },
    [dispatch, dataUser.displayName, dataUser.uid]
  );

  const importCsv = useCallback(
    (csv: string, importFileName: string, importedLayer?: LayerType) => {
      const data = csv2Data(csv, importFileName, dataUser.uid, dataUser.displayName, importedLayer);
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
    (
      geojson: FeatureCollection<Geometry | null, GeoJsonProperties>,
      featureType: GeoJsonFeatureType,
      importFileName: string,
      importedLayer?: LayerType
    ) => {
      const layer =
        importedLayer === undefined
          ? createLayerFromGeoJson(geojson, importFileName, featureType)
          : cloneDeep(importedLayer);
      const recordSet = geoJson2Data(geojson, layer, featureType, dataUser.uid, dataUser.displayName);

      if (recordSet === undefined) return false;
      if (recordSet.length === 0) return false;
      //ToDo Layerとデータの整合性のチェック
      //console.log(layer);
      //SET_LAYERSだとレンダリング時にしかdispatchの値が更新されず、連続で呼び出した際に不具合があるためADDする
      dispatch(addLayerAction(layer));
      dispatch(addDataAction([{ layerId: layer.id, userId: dataUser.uid, data: recordSet }]));
      return true;
    },
    [dispatch, dataUser.displayName, dataUser.uid]
  );

  const loadGeojson = useCallback(
    async (uri: string, name: string) => {
      const geojsonStrings = Platform.OS === 'web' ? decodeUri(uri) : await FileSystem.readAsStringAsync(uri);
      const geojson = JSON.parse(geojsonStrings);
      const featureType = detectGeoJsonType(geojson);
      return importGeoJson(geojson, featureType, name);
    },
    [importGeoJson]
  );

  const loadGpx = useCallback(
    async (uri: string, name: string) => {
      const gpx = Platform.OS === 'web' ? decodeUri(uri) : await FileSystem.readAsStringAsync(uri);
      importGPX(gpx, 'POINT', name);
      importGPX(gpx, 'LINE', name);
    },
    [importGPX]
  );

  const loadKmz = useCallback(
    async (uri: string, name: string) => {
      const loaded = await unzipFromUri(uri);
      const files = loaded.file(/\.kml$/);

      const parser = new DOMParser();
      for (const file of files) {
        const kmlString = await file.async('string');
        const xml = parser.parseFromString(kmlString, 'text/xml');
        const geojson = kml(xml);
        const featureType = detectGeoJsonType(geojson);
        importGeoJson(geojson, featureType, name);
      }
    },
    [importGeoJson]
  );

  const loadKml = useCallback(
    async (uri: string, name: string) => {
      const kmlString = Platform.OS === 'web' ? decodeUri(uri) : await FileSystem.readAsStringAsync(uri);
      const parser = new DOMParser();
      const xml = parser.parseFromString(kmlString, 'text/xml');
      const geojson = kml(xml);

      geoJsonFeatureTypes.forEach((featureType) => {
        importGeoJson(geojson, featureType, name);
      });
    },
    [importGeoJson]
  );

  const loadCsv = useCallback(
    async (uri: string, name: string) => {
      //ToDo:スマホではcsvの文字コードがShift-JISの場合の対応が必要。webでは対応済み
      const csvStrings = Platform.OS === 'web' ? decodeUri(uri) : await FileSystem.readAsStringAsync(uri);
      importCsv(csvStrings, name);
    },
    [importCsv]
  );

  const loadZip = useCallback(
    async (uri: string, name: string) => {
      const loaded = await unzipFromUri(uri);
      //console.log(loaded);
      const files = Object.keys(loaded.files);
      const jsonFile = files.find((f) => getExt(f) === 'json' && !f.startsWith('__MACOS/'));
      if (jsonFile === undefined) throw new Error('invalid zip file');
      const jsonDecompressed = await loaded.files[jsonFile].async('text');
      //有効なjsonかチェック
      const json = JSON.parse(jsonDecompressed);
      if (!isLayerType(json)) throw new Error('invalid json file');
      const { layer: importedLayer, layerIdMap, fieldIdMap } = changeLayerId(json);
      const sqliteFile = files.find((f) => getExt(f) === 'sqlite' && !f.startsWith('__MACOS/'));
      if (sqliteFile !== undefined) {
        const sqlite =
          Platform.OS !== 'web'
            ? await loaded.files[sqliteFile].async('uint8array')
            : await loaded.files[sqliteFile].async('arraybuffer');

        await importDictionary(sqlite, layerIdMap, fieldIdMap);
      }
      const csvFile = files.find((f) => getExt(f) === 'csv' && !f.startsWith('__MACOS/'));
      const geojsonFile = files.find((f) => getExt(f) === 'geojson' && !f.startsWith('__MACOS/'));

      if (importedLayer.type === 'LAYERGROUP') {
        dispatch(addLayerAction(importedLayer));
      } else if (geojsonFile !== undefined && importedLayer.type !== 'NONE') {
        const geojsonStrings = await loaded.files[geojsonFile].async('text');
        const geojson = JSON.parse(geojsonStrings);
        //ToDo 有効なgeojsonファイルかチェック
        const result = importGeoJson(geojson, importedLayer.type, name, importedLayer);
        //QGISでgeojsonをエクスポートするとマルチタイプになるので。厳密にするなら必要ない処理だが作業的に頻出するので対応
        if (!result) importGeoJson(geojson, `MULTI${importedLayer.type}`, name, importedLayer);
      } else if (csvFile !== undefined) {
        const csv = await loaded.files[csvFile].async('text');
        //ToDo 有効なcsvファイルかチェック
        importCsv(csv, name, importedLayer);
      } else {
        //レイヤー設定のみの場合
        dispatch(addLayerAction(importedLayer));
      }
    },
    [dispatch, importCsv, importGeoJson]
  );

  const loadJson = useCallback(
    async (uri: string) => {
      const jsonStrings = Platform.OS === 'web' ? decodeUri(uri) : await FileSystem.readAsStringAsync(uri);
      const json = JSON.parse(jsonStrings);
      if (!isLayerType(json)) throw new Error('invalid json file');
      const { layer: importedLayer } = changeLayerId(json);
      dispatch(addLayerAction(importedLayer));
    },
    [dispatch]
  );

  const loadFile = useCallback(
    async (name: string, uri: string) => {
      const ext = getExt(name)?.toLowerCase();
      let result = true;
      switch (ext) {
        case 'csv': {
          await loadCsv(uri, name);
          break;
        }
        case 'zip': {
          await loadZip(uri, name);
          break;
        }
        case 'json': {
          await loadJson(uri);
          break;
        }
        case 'kml': {
          await loadKml(uri, name);
          break;
        }
        case 'kmz': {
          await loadKmz(uri, name);
          break;
        }
        case 'gpx': {
          await loadGpx(uri, name);
          break;
        }
        case 'geojson': {
          result = await loadGeojson(uri, name);
          break;
        }
        default:
          throw new Error('invalid extension');
      }
      return result;
    },
    [loadCsv, loadGeojson, loadGpx, loadJson, loadKml, loadKmz, loadZip]
  );

  const importGeoFile = useCallback(
    async (uri: string, name: string) => {
      try {
        //console.log(file);
        setIsLoading(true);

        const result = await loadFile(name, uri);
        if (result) {
          return { isOK: true, message: t('hooks.message.receiveFile') };
        } else {
          return { isOK: false, message: t('hooks.message.failLoadFile') };
        }
      } catch (e: any) {
        return { isOK: false, message: e.message + '\n' + t('hooks.message.failReceiveFile') };
      } finally {
        setIsLoading(false);
      }
    },
    [loadFile]
  );

  const generateExportGeoData = useCallback(
    async (
      targetLayer: LayerType,
      exportedRecords: RecordType[],
      fileNameBase: string,
      option?: { settingsOnly?: boolean; exportDictionary?: boolean; folder?: string; exportPhoto?: boolean }
    ) => {
      const exportData: { data: string; name: string; type: ExportType; folder: string }[] = [];
      const exportFolder = option?.folder ?? '';
      //LayerSetting
      const layerSetting = JSON.stringify(targetLayer);
      exportData.push({
        data: layerSetting,
        name: `${fileNameBase}.json`,
        type: 'JSON',
        folder: exportFolder,
      });

      if (option?.exportDictionary) {
        //Dictionary
        const hasDictionaryFieald = targetLayer.field.some((field) => field.format === 'STRING_DICTIONARY');
        if (hasDictionaryFieald) {
          const dictionaryData = await exportDatabase(targetLayer.id);
          if (dictionaryData !== undefined) {
            const dictionaryName = `${fileNameBase}.sqlite`;
            exportData.push({ data: dictionaryData, name: dictionaryName, type: 'SQLITE', folder: exportFolder });
          }
        }
      }
      if (option?.settingsOnly) return exportData;

      //GeoJSON
      if (targetLayer.type === 'POINT' || targetLayer.type === 'LINE' || targetLayer.type === 'POLYGON') {
        const geojson = generateGeoJson(exportedRecords, targetLayer.field, targetLayer.type, targetLayer.name);
        const geojsonData = JSON.stringify(geojson);
        const geojsonName = `${fileNameBase}.geojson`;
        exportData.push({ data: geojsonData, name: geojsonName, type: 'GeoJSON', folder: exportFolder });
      }
      //KML
      if (targetLayer.type === 'POINT' || targetLayer.type === 'LINE' || targetLayer.type === 'POLYGON') {
        const kmlData = generateKML(exportedRecords, targetLayer);
        const kmlName = `${fileNameBase}.kml`;
        exportData.push({ data: kmlData, name: kmlName, type: 'KML', folder: exportFolder });
      }
      //CSV
      if (
        targetLayer.type === 'POINT' ||
        targetLayer.type === 'LINE' ||
        targetLayer.type === 'POLYGON' ||
        targetLayer.type === 'NONE'
      ) {
        const csv = generateCSV(exportedRecords, targetLayer.field, targetLayer.type);
        const csvData = csv;
        const csvName = `${fileNameBase}.csv`;
        exportData.push({ data: csvData, name: csvName, type: 'CSV', folder: exportFolder });
      }
      //GPX
      if (targetLayer.type === 'POINT' || targetLayer.type === 'LINE') {
        const gpx = generateGPX(exportedRecords, targetLayer.type);
        const gpxData = gpx;
        const gpxName = `${fileNameBase}.gpx`;
        exportData.push({ data: gpxData, name: gpxName, type: 'GPX', folder: exportFolder });
      }
      //Photo
      if (option?.exportPhoto) {
        const photoFields = targetLayer.field.filter((f) => f.format === 'PHOTO');
        exportedRecords.forEach(({ field }) => {
          photoFields.forEach(({ name }) => {
            const photos = field[name] as PhotoType[];
            for (const photo of photos) {
              if (photo.uri) {
                exportData.push({ data: photo.uri, name: photo.name, type: 'PHOTO', folder: exportFolder });
              }
            }
          });
        });
      }
      return exportData;
    },
    []
  );

  return {
    isLoading,
    importGeoFile,
    generateExportGeoData,
  } as const;
};
