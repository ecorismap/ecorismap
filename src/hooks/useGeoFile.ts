import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { FeatureType, GeoJsonFeatureType, LayerType } from '../types';

import { AppState } from '../modules';
import { addLayerAction } from '../modules/layers';
import * as FileSystem from 'expo-file-system';
//@ts-ignore
import Base64 from 'Base64';
import { Gpx2Data, GeoJson2Data, createLayerFromGeoJson } from '../utils/Geometry';
import { Platform } from 'react-native';
import { addDataAction } from '../modules/dataSet';
import { cloneDeep } from 'lodash';
import { t } from '../i18n/config';
import { getExt } from '../utils/General';
import { kml } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';

import { unzipFromUri } from '../utils/Zip';
import { updateLayerIds } from '../utils/Layer';
import { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

export type UseGeoFileReturnType = {
  importGeoFile: (
    uri: string,
    fileName: string,
    fileSize: number | undefined
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
};

export const useGeoFile = (): UseGeoFileReturnType => {
  const dispatch = useDispatch();
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const user = useSelector((state: AppState) => state.user);

  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
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
      const recordSet = GeoJson2Data(geojson, layer, featureType, dataUser.uid, dataUser.displayName);

      if (recordSet === undefined) return;
      if (recordSet.length === 0) return;
      //ToDo Layerとデータの整合性のチェック

      //SET_LAYERSだとレンダリング時にしかdispatchの値が更新されず、連続で呼び出した際に不具合があるためADDする
      dispatch(addLayerAction(layer));
      dispatch(addDataAction([{ layerId: layer.id, userId: dataUser.uid, data: recordSet }]));
    },
    [dispatch, dataUser.displayName, dataUser.uid]
  );

  const loadFile = useCallback(
    async (name: string, uri: string) => {
      const ext = getExt(name)?.toLowerCase();

      switch (ext) {
        case 'zip': {
          await loadZip();
          break;
        }
        case 'kml': {
          await loadKml();
          break;
        }
        case 'kmz': {
          await loadKmz();
          break;
        }
        case 'gpx': {
          await loadGpx();
          break;
        }
        case 'geojson': {
          await loadGeojson();
          break;
        }
        default:
          throw 'invalid extension';
      }

      const geoJsonFeatureTypes: GeoJsonFeatureType[] = [
        'POINT',
        'MULTIPOINT',
        'LINE',
        'MULTILINE',
        'POLYGON',
        'MULTIPOLYGON',
      ];
      async function loadGeojson() {
        let geojsonStrings;
        if (Platform.OS === 'web') {
          const arr = uri.split(',');
          const base64 = arr[arr.length - 1];
          geojsonStrings = decodeURIComponent(escape(Base64.atob(base64)));
        } else {
          //console.log(geojson);
          geojsonStrings = await FileSystem.readAsStringAsync(uri);
        }

        const geojson = JSON.parse(geojsonStrings);
        geoJsonFeatureTypes.forEach((featureType) => {
          importGeoJson(geojson, featureType, name);
        });
      }

      async function loadGpx() {
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
      }

      async function loadKmz() {
        const loaded = await unzipFromUri(uri);
        const files = loaded.file(/\.kml$/);

        const parser = new DOMParser();
        for (const file of files) {
          const kmlString = await file.async('string');
          const xml = parser.parseFromString(kmlString, 'text/xml');
          const geojson = kml(xml);
          geoJsonFeatureTypes.forEach((featureType) => {
            importGeoJson(geojson, featureType, name);
          });
        }
      }

      async function loadKml() {
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
        const geojson = kml(xml);

        geoJsonFeatureTypes.forEach((featureType) => {
          importGeoJson(geojson, featureType, name);
        });
      }

      async function loadZip() {
        const loaded = await unzipFromUri(uri);
        //console.log(loaded);
        const files = Object.keys(loaded.files);
        const jsonFile = files.find((f) => getExt(f) === 'json' && !f.startsWith('__MACOS/'));
        if (jsonFile === undefined) throw 'invalid zip file';
        const jsonDecompressed = await loaded.files[jsonFile].async('text');
        const importedLayer: LayerType = updateLayerIds(JSON.parse(jsonDecompressed) as LayerType);

        const geojsonFile = files.find((f) => getExt(f) === 'geojson' && !f.startsWith('__MACOS/'));
        if (geojsonFile === undefined) throw 'invalid zip file';
        const geojsonStrings = await loaded.files[geojsonFile].async('text');
        const geojson = JSON.parse(geojsonStrings);
        //ToDo 有効なgeojsonファイルかチェック
        importGeoJson(geojson, importedLayer.type, name, importedLayer);
        //QGISでgeojsonをエクスポートするとマルチタイプになるので。厳密にするなら必要ない処理だが作業的に頻出するので対応
        if (importedLayer.type !== 'NONE') importGeoJson(geojson, `MULTI${importedLayer.type}`, name, importedLayer);
      }
    },
    [importGPX, importGeoJson]
  );

  const importGeoFile = useCallback(
    async (uri: string, fileName: string, fileSize: number | undefined) => {
      try {
        //console.log(file);
        const ext = getExt(fileName)?.toLowerCase();

        if (!(ext === 'gpx' || ext === 'geojson' || ext === 'kml' || ext === 'kmz' || ext === 'zip')) {
          return { isOK: false, message: t('hooks.message.wrongExtension') };
        }
        if (fileSize === undefined) {
          return { isOK: false, message: t('hooks.message.cannotGetFileSize') };
        }
        if (fileSize / 1024 > 1000) {
          return { isOK: false, message: t('hooks.message.cannotImportData') };
        }
        await loadFile(fileName, uri);
        return { isOK: true, message: t('hooks.message.receiveFile') };
      } catch (e: any) {
        return { isOK: true, message: t('hooks.message.failReceiveFile') };
      }
    },
    [loadFile]
  );

  return {
    importGeoFile,
  } as const;
};
