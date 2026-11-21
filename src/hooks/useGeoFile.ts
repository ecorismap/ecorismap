import { useCallback, useMemo, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { ExportType, FeatureType, FieldType, GeoJsonFeatureType, LayerType, PhotoType, RecordType } from '../types';

import { RootState } from '../store';
import { addLayerAction, updateLayerAction } from '../modules/layers';
import * as FileSystem from 'expo-file-system/legacy';

import { gpx2Data, geoJson2Data, createLayerFromGeoJson, csv2Data, detectGeoJsonType } from '../utils/Geometry';
import { Image, Platform } from 'react-native';
import { addDataAction, deleteDataAction } from '../modules/dataSet';
import { cloneDeep } from 'lodash';
import { t } from '../i18n/config';
import { getBaseName, getExt, runAsync } from '../utils/General';
import { kml } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { ulid } from 'ulid';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { unzipFromUri } from '../utils/Zip';
import { changeLayerId, isLayerType } from '../utils/Layer';
import { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import { decodeUri } from '../utils/File.web';
import { importDictionary, exportDatabase } from '../utils/SQLite';
import { generateCSV, generateGeoJson, generateGPX, generateKML } from '../utils/Geometry';
import { DuplicateLayerConfirmAsync } from '../components/molecules/AlertAsync';
import { isSafePathSegment, isUriInsideFolder } from '../utils/safePath';
import { PHOTO_FOLDER } from '../constants/AppConstants';

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

/**
 * 取り込みの結果。失敗・0件・一部除外を利用者に伝えるため、各loadXXXはこれを返す。
 * - imported: レイヤかレコードを追加した（skipped件のフィーチャーは取り込めなかった）
 * - empty: 取り込めるデータが無く、何も追加していない
 * - cancelled: 利用者が中止した（メッセージは出さない）
 */
type LoadOutcome = {
  status: 'imported' | 'empty' | 'cancelled';
  skipped: number;
  missingPhotos: number;
};

const loadOutcome = (status: LoadOutcome['status'], skipped = 0, missingPhotos = 0): LoadOutcome => ({
  status,
  skipped,
  missingPhotos,
});

// geoJson2Dataは元のフィーチャーとの対応を返さず、PHOTOも常に[]にする。
// 写真名の照合と除外件数の算出のため、レイヤに無い一時項目でフィーチャーの番号を通しておく
const FEATURE_INDEX_KEY = '$$ecorismapImportFeatureIndex';

type ConvertedGeoJson = {
  records: RecordType[];
  // records[i]の元になったフィーチャーのproperties（写真名の照合に使う）
  sourceProperties: GeoJsonProperties[];
  // レコードになったフィーチャーの番号（MULTIは1フィーチャーが複数レコードになるので集合で持つ）
  featureIndices: Set<number>;
};

const convertGeoJson = (
  geojson: FeatureCollection<Geometry | null, GeoJsonProperties>,
  layer: LayerType,
  featureType: GeoJsonFeatureType,
  userId: string | undefined,
  displayName: string | null
): ConvertedGeoJson | undefined => {
  if (geojson === null || typeof geojson !== 'object' || !Array.isArray(geojson.features)) return undefined;
  const features = geojson.features.map((feature, index) =>
    feature === null || typeof feature !== 'object'
      ? feature
      : { ...feature, properties: { ...(feature.properties ?? {}), [FEATURE_INDEX_KEY]: String(index) } }
  );
  const indexField: FieldType = { id: FEATURE_INDEX_KEY, name: FEATURE_INDEX_KEY, format: 'STRING' };
  const records = geoJson2Data(
    { ...geojson, features },
    { ...layer, field: [...layer.field, indexField] },
    featureType,
    userId,
    displayName
  );
  if (records === undefined) return undefined;
  const sourceProperties: GeoJsonProperties[] = [];
  const featureIndices = new Set<number>();
  for (const record of records) {
    const index = Number(record.field[FEATURE_INDEX_KEY]);
    delete record.field[FEATURE_INDEX_KEY];
    const source = Number.isInteger(index) ? geojson.features[index] : undefined;
    if (source !== undefined) featureIndices.add(index);
    // propertiesがnullのフィーチャーは項目を作らない（{}）のが本来の結果。目印を足したことで空欄の項目が増えないよう戻す
    if (source !== undefined && source !== null && source.properties === null) record.field = {};
    sourceProperties.push(source?.properties ?? null);
  }
  return { records, sourceProperties, featureIndices };
};

const countFeatures = (geojson: FeatureCollection<Geometry | null, GeoJsonProperties>) =>
  geojson !== null && typeof geojson === 'object' && Array.isArray(geojson.features) ? geojson.features.length : 0;

// PhotoTypeのwidth/heightは原画の寸法（写真ビューアが拡大表示の大きさに使う）。
// Image.getSizeはネイティブのfile://とWebのblob:の両方を読める。取れなければ0/0にして、ビューア側のgetSizeに任せる
const getOriginalImageSize = (uri: string) =>
  new Promise<{ width: number; height: number }>((resolve) => {
    try {
      Image.getSize(
        uri,
        (width, height) => resolve({ width, height }),
        () => resolve({ width: 0, height: 0 })
      );
    } catch (e) {
      resolve({ width: 0, height: 0 });
    }
  });

// 写真を取り込んだときと同じ大きさのサムネイルを作る
const createImportedPhotoThumbnail = async (uri: string) => {
  const size = await getOriginalImageSize(uri);
  try {
    const result = await manipulateAsync(uri, [{ resize: { height: 150 } }], {
      compress: 0.7,
      format: SaveFormat.JPEG,
      base64: true,
    });
    return { thumbnail: result.base64 ? `data:image/jpeg;base64,${result.base64}` : null, ...size };
  } catch (e) {
    // 画像として読めなくても写真の参照は戻す（サムネイルが無いだけで、原本は開ける）
    return { thumbnail: null, ...size };
  }
};

/**
 * データ一覧の書き出しZIP（exportPhoto:true）に同梱した写真を写真フォルダへ展開し、PHOTO項目の参照を戻す。
 * 書き出し側はPHOTO項目を「写真名のカンマ区切り」で出し、写真本体を同じ名前でZIPに入れている。
 * 写真名とレイヤIDはファイル由来なので、パス区切りなどを含むものは取り込まない（写真フォルダの外へ書かない）。
 * @returns ZIPに見つからなかった・取り込めなかった写真の枚数
 */
const restorePhotosFromZip = async (converted: ConvertedGeoJson, layer: LayerType, zip: JSZip): Promise<number> => {
  const photoFields = layer.field.filter((f) => f.format === 'PHOTO');
  if (photoFields.length === 0) return 0;

  const entryByName = new Map<string, string>();
  for (const key of Object.keys(zip.files)) {
    if (zip.files[key].dir || key.split('/').includes('__MACOSX')) continue;
    const baseName = getBaseName(key);
    if (!entryByName.has(baseName)) entryByName.set(baseName, key);
  }

  const isLayerIdSafe = isSafePathSegment(layer.id);
  const toFolder = `${PHOTO_FOLDER}/LOCAL/${layer.id}/OWNER`;
  let isFolderReady = false;
  type RestoredPhoto = Pick<PhotoType, 'thumbnail' | 'width' | 'height'> & { uri: string };
  // 同じ写真を複数のレコードが参照していても、展開とサムネイル作成は1回にする
  const restored = new Map<string, RestoredPhoto | undefined>();
  let missing = 0;

  const extractPhoto = async (name: string): Promise<RestoredPhoto | undefined> => {
    if (restored.has(name)) return restored.get(name);
    let uri: string | undefined;
    const entry = entryByName.get(name) ?? entryByName.get(name.normalize('NFC'));
    if (entry !== undefined && isLayerIdSafe && isSafePathSegment(name)) {
      try {
        if (Platform.OS === 'web') {
          const content = await zip.files[entry].async('arraybuffer');
          uri = URL.createObjectURL(new Blob([content]));
        } else {
          const to = `${toFolder}/${name}`;
          if (isUriInsideFolder(to, PHOTO_FOLDER)) {
            if (!isFolderReady) {
              await FileSystem.makeDirectoryAsync(toFolder, { intermediates: true });
              isFolderReady = true;
            }
            const base64 = await zip.files[entry].async('base64');
            await FileSystem.writeAsStringAsync(to, base64, { encoding: FileSystem.EncodingType.Base64 });
            uri = to;
          }
        }
      } catch (e) {
        console.log(e);
        uri = undefined;
      }
    }
    const photo = uri === undefined ? undefined : { uri, ...(await createImportedPhotoThumbnail(uri)) };
    restored.set(name, photo);
    return photo;
  };

  for (let i = 0; i < converted.records.length; i++) {
    const record = converted.records[i];
    const properties = converted.sourceProperties[i];
    for (const field of photoFields) {
      const value = properties?.[field.name];
      if (typeof value !== 'string' || value === '') continue;
      const photos: PhotoType[] = [];
      for (const name of value.split(',').filter((n) => n !== '')) {
        const photo = await extractPhoto(name);
        if (photo === undefined) {
          missing++;
          continue;
        }
        photos.push({ id: ulid(), name, url: null, key: null, ...photo });
      }
      record.field[field.name] = photos;
    }
  }
  return missing;
};

export const useGeoFile = (): UseGeoFileReturnType => {
  const dispatch = useDispatch();
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: RootState) => state.user, shallowEqual);
  const layers = useSelector((state: RootState) => state.layers, shallowEqual);
  const [isLoading, setIsLoading] = useState(false);
  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );

  const importGPX = useCallback(
    (gpx: string, featureType: FeatureType, importFileName: string) => {
      const data = gpx2Data(gpx, featureType, importFileName, dataUser.uid, dataUser.displayName);
      if (data === undefined) return 0;
      //console.log(recordSet[0].field);
      if (data.recordSet.length > 0) {
        dispatch(addLayerAction(data.layer));
        dispatch(addDataAction([{ layerId: data.layer.id, userId: dataUser.uid, data: data.recordSet }]));
      }
      return data.recordSet.length;
    },
    [dispatch, dataUser.displayName, dataUser.uid]
  );

  const importCsv = useCallback(
    (csv: string, importFileName: string, importedLayer?: LayerType) => {
      const data = csv2Data(csv, importFileName, dataUser.uid, dataUser.displayName, importedLayer);
      if (data === undefined) return 0;
      //console.log(recordSet[0].field);
      if (data.recordSet.length > 0) {
        dispatch(addLayerAction(data.layer));
        dispatch(addDataAction([{ layerId: data.layer.id, userId: dataUser.uid, data: data.recordSet }]));
      }
      return data.recordSet.length;
    },
    [dispatch, dataUser.displayName, dataUser.uid]
  );

  const importGeoJson = useCallback(
    async (
      geojson: FeatureCollection<Geometry | null, GeoJsonProperties>,
      featureType: GeoJsonFeatureType,
      importFileName: string,
      importedLayer?: LayerType,
      photoZip?: JSZip
    ): Promise<{ featureIndices: Set<number>; missingPhotos: number } | undefined> => {
      const layer =
        importedLayer === undefined
          ? createLayerFromGeoJson(geojson, importFileName, featureType)
          : cloneDeep(importedLayer);
      const converted = convertGeoJson(geojson, layer, featureType, dataUser.uid, dataUser.displayName);

      if (converted === undefined) return undefined;
      if (converted.records.length === 0) return undefined;
      const missingPhotos = photoZip === undefined ? 0 : await restorePhotosFromZip(converted, layer, photoZip);
      //ToDo Layerとデータの整合性のチェック
      //console.log(layer);
      //SET_LAYERSだとレンダリング時にしかdispatchの値が更新されず、連続で呼び出した際に不具合があるためADDする
      dispatch(addLayerAction(layer));
      dispatch(addDataAction([{ layerId: layer.id, userId: dataUser.uid, data: converted.records }]));
      return { featureIndices: converted.featureIndices, missingPhotos };
    },
    [dispatch, dataUser.displayName, dataUser.uid]
  );

  // KMLは全フィーチャータイプを走査するため、含まれるジオメトリタイプだけ処理して無駄な走査を省く
  const presentFeatureTypes = useCallback((geojson: FeatureCollection<Geometry | null, GeoJsonProperties>) => {
    // geometryがnullのフィーチャーはPOINTとして扱われる（geoJson2Dataの仕様に合わせる）
    const geometryTypes = new Set<string>(
      geojson.features.map((f) => (f.geometry === null ? 'Point' : f.geometry.type))
    );
    const typeMap: Partial<Record<GeoJsonFeatureType, string>> = {
      POINT: 'Point',
      MULTIPOINT: 'MultiPoint',
      LINE: 'LineString',
      MULTILINE: 'MultiLineString',
      POLYGON: 'Polygon',
      MULTIPOLYGON: 'MultiPolygon',
    };
    return geoJsonFeatureTypes.filter((featureType) => {
      const geometryType = typeMap[featureType];
      return geometryType !== undefined && geometryTypes.has(geometryType);
    });
  }, []);

  const loadGeojson = useCallback(
    async (uri: string, name: string) => {
      const geojsonStrings = Platform.OS === 'web' ? await decodeUri(uri) : await FileSystem.readAsStringAsync(uri);
      // parseと変換は重いのでrunAsyncでUIスレッドをブロックしないようにする
      const geojson = await runAsync(() => JSON.parse(geojsonStrings));
      const featureCount = countFeatures(geojson);
      // detectGeoJsonTypeは空のfeaturesで例外になる。内部エラーではなく「取り込めるデータが無い」として返す
      if (featureCount === 0) return loadOutcome('empty');
      const featureType = detectGeoJsonType(geojson);
      const result = await runAsync(() => importGeoJson(geojson, featureType, name));
      if (result === undefined) return loadOutcome('empty');
      return loadOutcome('imported', featureCount - result.featureIndices.size);
    },
    [importGeoJson]
  );

  const loadGpx = useCallback(
    async (uri: string, name: string) => {
      const gpx = Platform.OS === 'web' ? await decodeUri(uri) : await FileSystem.readAsStringAsync(uri);
      const pointCount = await runAsync(() => importGPX(gpx, 'POINT', name));
      const lineCount = await runAsync(() => importGPX(gpx, 'LINE', name));
      return loadOutcome(pointCount + lineCount > 0 ? 'imported' : 'empty');
    },
    [importGPX]
  );

  const loadKmz = useCallback(
    async (uri: string, name: string) => {
      const loaded = await unzipFromUri(uri);
      const files = loaded.file(/\.kml$/);

      const parser = new DOMParser();
      let featureCount = 0;
      let importedCount = 0;
      for (const file of files) {
        const kmlString = await file.async('string');
        const xml = await runAsync(() => parser.parseFromString(kmlString, 'text/xml'));
        //@ts-ignore
        const geojson = await runAsync(() => kml(xml));
        const count = countFeatures(geojson);
        featureCount += count;
        // detectGeoJsonTypeは空のfeaturesで例外になるため、Placemarkの無いkmlは飛ばす
        if (count === 0) continue;
        const featureType = detectGeoJsonType(geojson);
        const result = await runAsync(() => importGeoJson(geojson, featureType, name));
        importedCount += result?.featureIndices.size ?? 0;
      }
      if (importedCount === 0) return loadOutcome('empty');
      return loadOutcome('imported', featureCount - importedCount);
    },
    [importGeoJson]
  );

  const loadKml = useCallback(
    async (uri: string, name: string) => {
      const kmlString = Platform.OS === 'web' ? await decodeUri(uri) : await FileSystem.readAsStringAsync(uri);
      const parser = new DOMParser();
      const xml = await runAsync(() => parser.parseFromString(kmlString, 'text/xml'));
      //@ts-ignore
      const geojson = await runAsync(() => kml(xml));

      // 除外件数は全タイプを通して数える（1フィーチャーは1タイプでしか取り込まれない）
      const importedIndices = new Set<number>();
      for (const featureType of presentFeatureTypes(geojson)) {
        const result = await runAsync(() => importGeoJson(geojson, featureType, name));
        result?.featureIndices.forEach((index) => importedIndices.add(index));
      }
      if (importedIndices.size === 0) return loadOutcome('empty');
      return loadOutcome('imported', countFeatures(geojson) - importedIndices.size);
    },
    [importGeoJson, presentFeatureTypes]
  );

  const loadCsv = useCallback(
    async (uri: string, name: string) => {
      //ToDo:スマホではcsvの文字コードがShift-JISの場合の対応が必要。webでは対応済み
      const csvStrings = Platform.OS === 'web' ? await decodeUri(uri) : await FileSystem.readAsStringAsync(uri);
      const count = await runAsync(() => importCsv(csvStrings, name));
      return loadOutcome(count > 0 ? 'imported' : 'empty');
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
      const json = JSON.parse(jsonDecompressed) as LayerType;
      if (!isLayerType(json)) throw new Error('invalid json file');

      // 重複チェック（PUBLIC/PRIVATEのレイヤのみ対象）
      const originalLayerId = json.id;
      const duplicateLayer =
        json.permission === 'PUBLIC' || json.permission === 'PRIVATE'
          ? layers.find(
              (layer) =>
                layer.id === originalLayerId &&
                layer.name === json.name &&
                (layer.permission === 'PUBLIC' || layer.permission === 'PRIVATE')
            )
          : undefined;

      let shouldReplace = false;
      let existingLayerToReplace: LayerType | undefined;

      if (duplicateLayer) {
        // 3択ダイアログを表示
        const choice = await DuplicateLayerConfirmAsync(json.name);

        if (choice === 'cancel') {
          return loadOutcome('cancelled'); // インポート中止
        }

        if (choice === 'replace') {
          shouldReplace = true;
          existingLayerToReplace = duplicateLayer;
        }
        // choice === 'newLayer' の場合は通常フロー（新規ID生成）
      }

      const sqliteFile = files.find((f) => getExt(f) === 'sqlite' && !f.startsWith('__MACOS/'));
      const csvFile = files.find((f) => getExt(f) === 'csv' && !f.startsWith('__MACOS/'));
      const geojsonFile = files.find((f) => getExt(f) === 'geojson' && !f.startsWith('__MACOS/'));

      if (shouldReplace && existingLayerToReplace) {
        // 置き換えモード
        const updatedLayer: LayerType = {
          ...json,
          id: existingLayerToReplace.id, // 既存IDを保持
          active: existingLayerToReplace.active,
          visible: existingLayerToReplace.visible,
          groupId: existingLayerToReplace.groupId,
          expanded: existingLayerToReplace.expanded,
        };

        // 既存データを消す前に変換しておく（壊れたGeoJSONで手元のデータだけが消え、「成功」と出るのを防ぐ）
        let replacing: ConvertedGeoJson | undefined;
        let replacingFeatureCount = 0;
        let missingPhotos = 0;
        if (updatedLayer.type !== 'LAYERGROUP' && geojsonFile !== undefined && updatedLayer.type !== 'NONE') {
          const geojsonStrings = await loaded.files[geojsonFile].async('text');
          const geojson = JSON.parse(geojsonStrings);
          replacingFeatureCount = countFeatures(geojson);
          replacing = convertGeoJson(geojson, updatedLayer, updatedLayer.type, dataUser.uid, dataUser.displayName);
          if (replacing === undefined || replacing.records.length === 0) {
            // MULTIタイプを試す
            const multi = convertGeoJson(
              geojson,
              updatedLayer,
              `MULTI${updatedLayer.type}` as GeoJsonFeatureType,
              dataUser.uid,
              dataUser.displayName
            );
            if (multi !== undefined) replacing = multi;
          }
          if (replacing === undefined) throw new Error('invalid geojson file');
          missingPhotos = await restorePhotosFromZip(replacing, updatedLayer, loaded);
        }
        // CSVもGeoJSONと同じく、消す前に変換して読めることを確かめる
        let replacingCsvRecords: RecordType[] | undefined;
        if (updatedLayer.type !== 'LAYERGROUP' && replacing === undefined && csvFile !== undefined) {
          const csv = await loaded.files[csvFile].async('text');
          const data = csv2Data(csv, name, dataUser.uid, dataUser.displayName, updatedLayer);
          if (data === undefined) throw new Error('invalid csv file');
          replacingCsvRecords = data.recordSet;
        }

        // SQLite辞書処理
        if (sqliteFile !== undefined) {
          const sqlite =
            Platform.OS !== 'web'
              ? await loaded.files[sqliteFile].async('uint8array')
              : await loaded.files[sqliteFile].async('arraybuffer');
          // 置き換えの場合は既存レイヤIDを使用。フィールドIDは元のまま引き継ぐので同じIDへ対応させる
          //（空の対応表だと辞書テーブルが対応なしとして取り込まれない）
          const sameFieldIdMap = Object.fromEntries(json.field.map((f) => [f.id, f.id]));
          await importDictionary(sqlite, { [originalLayerId]: existingLayerToReplace.id }, sameFieldIdMap);
        }

        // 既存データを削除
        dispatch(deleteDataAction([{ layerId: existingLayerToReplace.id, userId: dataUser.uid, data: [] }]));

        // レイヤ設定を更新
        dispatch(updateLayerAction(updatedLayer));

        // データのインポート処理
        if (updatedLayer.type === 'LAYERGROUP') {
          // LAYERGROUPの場合はデータなし
        } else if (replacing !== undefined) {
          if (replacing.records.length > 0) {
            dispatch(
              addDataAction([{ layerId: existingLayerToReplace.id, userId: dataUser.uid, data: replacing.records }])
            );
          }
          // レイヤ設定は置き換わっているので、レコードが0件でも中止ではなく取り込み扱い（除外件数で伝える）
          return loadOutcome('imported', replacingFeatureCount - replacing.featureIndices.size, missingPhotos);
        } else if (replacingCsvRecords !== undefined && replacingCsvRecords.length > 0) {
          dispatch(
            addDataAction([{ layerId: existingLayerToReplace.id, userId: dataUser.uid, data: replacingCsvRecords }])
          );
        }
      } else {
        // 通常モード（新規レイヤとして追加）
        const { layer: importedLayer, layerIdMap, fieldIdMap } = changeLayerId(json);

        if (sqliteFile !== undefined) {
          const sqlite =
            Platform.OS !== 'web'
              ? await loaded.files[sqliteFile].async('uint8array')
              : await loaded.files[sqliteFile].async('arraybuffer');

          await importDictionary(sqlite, layerIdMap, fieldIdMap);
        }

        if (importedLayer.type === 'LAYERGROUP') {
          dispatch(addLayerAction(importedLayer));
        } else if (geojsonFile !== undefined && importedLayer.type !== 'NONE') {
          const geojsonStrings = await loaded.files[geojsonFile].async('text');
          const geojson = JSON.parse(geojsonStrings);
          //ToDo 有効なgeojsonファイルかチェック
          const result =
            (await importGeoJson(geojson, importedLayer.type, name, importedLayer, loaded)) ??
            //QGISでgeojsonをエクスポートするとマルチタイプになるので。厳密にするなら必要ない処理だが作業的に頻出するので対応
            (await importGeoJson(geojson, `MULTI${importedLayer.type}`, name, importedLayer, loaded));
          if (result === undefined) return loadOutcome('empty');
          return loadOutcome('imported', countFeatures(geojson) - result.featureIndices.size, result.missingPhotos);
        } else if (csvFile !== undefined) {
          const csv = await loaded.files[csvFile].async('text');
          //ToDo 有効なcsvファイルかチェック
          if (importCsv(csv, name, importedLayer) === 0) return loadOutcome('empty');
        } else {
          //レイヤー設定のみの場合
          dispatch(addLayerAction(importedLayer));
        }
      }
      return loadOutcome('imported');
    },
    [dispatch, importCsv, importGeoJson, layers, dataUser.uid, dataUser.displayName]
  );

  const loadJson = useCallback(
    async (uri: string) => {
      const jsonStrings = Platform.OS === 'web' ? await decodeUri(uri) : await FileSystem.readAsStringAsync(uri);
      const json = JSON.parse(jsonStrings);
      if (!isLayerType(json)) throw new Error('invalid json file');
      const { layer: importedLayer } = changeLayerId(json);
      dispatch(addLayerAction(importedLayer));
      return loadOutcome('imported');
    },
    [dispatch]
  );

  const loadFile = useCallback(
    async (name: string, uri: string): Promise<LoadOutcome> => {
      const ext = getExt(name)?.toLowerCase();
      switch (ext) {
        case 'csv':
          return await loadCsv(uri, name);
        case 'zip':
          return await loadZip(uri, name);
        case 'json':
          return await loadJson(uri);
        case 'kml':
          return await loadKml(uri, name);
        case 'kmz':
          return await loadKmz(uri, name);
        case 'gpx':
          return await loadGpx(uri, name);
        case 'geojson':
          return await loadGeojson(uri, name);
        default:
          throw new Error('invalid extension');
      }
    },
    [loadCsv, loadGeojson, loadGpx, loadJson, loadKml, loadKmz, loadZip]
  );

  const importGeoFile = useCallback(
    async (uri: string, name: string) => {
      try {
        //console.log(file);
        setIsLoading(true);

        const result = await loadFile(name, uri);
        if (result.status === 'cancelled') {
          // キャンセル時はメッセージを空にする
          return { isOK: false, message: '' };
        }
        if (result.status === 'empty') {
          // 何も追加していないのに「インポートしました」と出すと、取り込めなかったことに気付けない
          return { isOK: false, message: t('hooks.message.noImportableData') };
        }
        const notes = [t('hooks.message.receiveFile')];
        if (result.skipped > 0) notes.push(t('hooks.message.someFeaturesSkipped', { count: result.skipped }));
        if (result.missingPhotos > 0) notes.push(t('hooks.message.somePhotosMissing', { count: result.missingPhotos }));
        return { isOK: true, message: notes.join('\n') };
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
      const exportData: { data: string; name: string; type: ExportType; folder: string; url?: string | null; key?: string | null }[] = [];
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
      // 各形式の変換は全レコードを走査する重い同期処理のため、runAsyncで形式ごとにUIへyieldする
      if (targetLayer.type === 'POINT' || targetLayer.type === 'LINE' || targetLayer.type === 'POLYGON') {
        // クロージャ内ではnarrowingが失われるため、narrow済みの型をconstに束縛する
        const geometryType = targetLayer.type;
        const geojsonData = await runAsync(() => {
          const geojson = generateGeoJson(
            exportedRecords,
            targetLayer.field,
            geometryType,
            targetLayer.name,
            targetLayer.permission
          );
          return JSON.stringify(geojson);
        });
        const geojsonName = `${fileNameBase}.geojson`;
        exportData.push({ data: geojsonData, name: geojsonName, type: 'GeoJSON', folder: exportFolder });
      }
      //KML
      if (targetLayer.type === 'POINT' || targetLayer.type === 'LINE' || targetLayer.type === 'POLYGON') {
        const kmlData = await runAsync(() => generateKML(exportedRecords, targetLayer));
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
        const csvType = targetLayer.type;
        const csvData = await runAsync(() => generateCSV(exportedRecords, targetLayer.field, csvType));
        const csvName = `${fileNameBase}.csv`;
        exportData.push({ data: csvData, name: csvName, type: 'CSV', folder: exportFolder });
      }
      //GPX
      if (targetLayer.type === 'POINT' || targetLayer.type === 'LINE') {
        const gpxType = targetLayer.type;
        const gpxData = await runAsync(() => generateGPX(exportedRecords, gpxType));
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
              // 写真データが存在する場合のみエクスポート
              if (photo.uri || photo.url) {
                // ローカルファイルがある場合はそれを使用、ない場合は空文字列
                // Firebase URLとキーは別途渡す
                exportData.push({ 
                  // 他メンバーのレコードのuriは送り手の端末のパスがそのまま届く。ネイティブでは写真フォルダ外の
                  // ファイル（端末内の任意ファイル）を書き出しに混ぜないよう、空にしてクラウドから取得させる
                  data: Platform.OS === 'web' || isUriInsideFolder(photo.uri, PHOTO_FOLDER) ? photo.uri || '' : '', 
                  name: photo.name, 
                  type: 'PHOTO', 
                  folder: exportFolder,
                  // Firebase URLとキーを追加（ローカルがない場合のフォールバック用）
                  url: photo.url,
                  key: photo.key 
                });
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
