import { useCallback, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { FeatureType, GeoJsonFeatureType, LayerType } from '../types';

import { AppState } from '../modules';
import { addLayerAction } from '../modules/layers';
import * as FileSystem from 'expo-file-system';

import { Gpx2Data, GeoJson2Data, createLayerFromGeoJson } from '../utils/Geometry';
import { Platform } from 'react-native';
import { addDataAction } from '../modules/dataSet';
import { cloneDeep } from 'lodash';
import { t } from '../i18n/config';
import { getExt } from '../utils/General';
import { kml } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';

import { unzipFromUri } from '../utils/Zip';
import { updateLayerActiveAndIds } from '../utils/Layer';
import { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import { decodeUri } from '../utils/File.web';

export type UseGeoFileReturnType = {
  isLoading: boolean;
  importGeoFile: (
    uri: string,
    name: string
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
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
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const user = useSelector((state: AppState) => state.user);
  const [isLoading, setIsLoading] = useState(false);
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
      //console.log(layer);
      //SET_LAYERSだとレンダリング時にしかdispatchの値が更新されず、連続で呼び出した際に不具合があるためADDする
      dispatch(addLayerAction(layer));
      dispatch(addDataAction([{ layerId: layer.id, userId: dataUser.uid, data: recordSet }]));
    },
    [dispatch, dataUser.displayName, dataUser.uid]
  );

  const loadGeojson = useCallback(
    async (uri: string, name: string) => {
      const geojsonStrings = Platform.OS === 'web' ? decodeUri(uri) : await FileSystem.readAsStringAsync(uri);
      const geojson = JSON.parse(geojsonStrings);
      geoJsonFeatureTypes.forEach((featureType) => {
        importGeoJson(geojson, featureType, name);
      });
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
        geoJsonFeatureTypes.forEach((featureType) => {
          importGeoJson(geojson, featureType, name);
        });
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

  const loadZip = useCallback(
    async (uri: string, name: string) => {
      const loaded = await unzipFromUri(uri);
      //console.log(loaded);
      const files = Object.keys(loaded.files);
      const jsonFile = files.find((f) => getExt(f) === 'json' && !f.startsWith('__MACOS/'));
      if (jsonFile === undefined) throw 'invalid zip file';
      const jsonDecompressed = await loaded.files[jsonFile].async('text');
      const importedLayer: LayerType = updateLayerActiveAndIds(JSON.parse(jsonDecompressed) as LayerType);

      const geojsonFile = files.find((f) => getExt(f) === 'geojson' && !f.startsWith('__MACOS/'));
      if (geojsonFile === undefined) throw 'invalid zip file';
      const geojsonStrings = await loaded.files[geojsonFile].async('text');
      const geojson = JSON.parse(geojsonStrings);
      //ToDo 有効なgeojsonファイルかチェック
      importGeoJson(geojson, importedLayer.type, name, importedLayer);
      //QGISでgeojsonをエクスポートするとマルチタイプになるので。厳密にするなら必要ない処理だが作業的に頻出するので対応
      if (importedLayer.type !== 'NONE') importGeoJson(geojson, `MULTI${importedLayer.type}`, name, importedLayer);
    },
    [importGeoJson]
  );

  const loadFile = useCallback(
    async (name: string, uri: string) => {
      const ext = getExt(name)?.toLowerCase();

      switch (ext) {
        case 'zip': {
          await loadZip(uri, name);
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
          await loadGeojson(uri, name);
          break;
        }
        default:
          throw 'invalid extension';
      }
    },
    [loadGeojson, loadGpx, loadKml, loadKmz, loadZip]
  );

  const importGeoFile = useCallback(
    async (uri: string, name: string) => {
      try {
        //console.log(file);
        setIsLoading(true);

        await loadFile(name, uri);
        return { isOK: true, message: t('hooks.message.receiveFile') };
      } catch (e: any) {
        return { isOK: true, message: t('hooks.message.failReceiveFile') };
      } finally {
        setIsLoading(false);
      }
    },
    [loadFile]
  );

  return {
    isLoading,
    importGeoFile,
  } as const;
};
