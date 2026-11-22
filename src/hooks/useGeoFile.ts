import { useCallback, useMemo, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { ExportType, FeatureType, FieldType, GeoJsonFeatureType, LayerType, PhotoType, RecordType } from '../types';

import { RootState } from '../store';
import { addLayerAction, updateLayerAction } from '../modules/layers';
import * as FileSystem from 'expo-file-system/legacy';

import {
  gpx2Data,
  geoJson2Data,
  createLayerFromGeoJson,
  csv2Data,
  checkGeoJsonCrs,
  normalizeKmlGeoJson,
  splitGeometryCollections,
  GeoJson2DataOptions,
  countPolygonVertices,
  POLYGON_SIMPLIFY_CONFIRM_VERTICES,
} from '../utils/Geometry';
import { Buffer } from 'buffer';
import { Image, Platform } from 'react-native';
import { addDataAction, replaceRecordsKeepingTombstonesAction } from '../modules/dataSet';
import { cloneDeep } from 'lodash';
import { t } from '../i18n/config';
import { getBaseName, getExt, runAsync } from '../utils/General';
import { kml } from '@tmcw/togeojson';
import { DOMParser, Document as XmlDocument, Element as XmlElement, Node as XmlNode } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { ulid } from 'ulid';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { unzipFromUri } from '../utils/Zip';
import { changeLayerId, isLayerType } from '../utils/Layer';
import { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import { decodeTextBytes, decodeUri } from '../utils/File.web';
import { importDictionary, exportDatabase } from '../utils/SQLite';
import { generateCSV, generateGeoJson, generateGPX, generateKML } from '../utils/Geometry';
import { ConfirmAsync, DuplicateLayerConfirmAsync } from '../components/molecules/AlertAsync';
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
  // empty のとき、取り込めなかった理由（座標系が緯度経度でない等）。利用者に伝えるため
  emptyReason?: string;
};

const loadOutcome = (status: LoadOutcome['status'], skipped = 0, missingPhotos = 0): LoadOutcome => ({
  status,
  skipped,
  missingPhotos,
});

// 0件の原因が座標系なら、その理由を添えて返す（「取り込めるデータがありません」だけでは原因に気付けない）
const emptyOutcome = (geojson?: FeatureCollection<Geometry | null, GeoJsonProperties>): LoadOutcome => {
  if (geojson === undefined || geojson === null || typeof geojson !== 'object') return loadOutcome('empty');
  const crsCheck = checkGeoJsonCrs(geojson);
  return crsCheck.ok ? loadOutcome('empty') : { ...loadOutcome('empty'), emptyReason: crsCheck.reason };
};

// JSON.parse は先頭のBOMを受け付けない（Windowsのエディタで保存したファイルで起きる）
const stripBom = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

/**
 * 頂点の多いポリゴンを含むときだけ、簡略化して取り込むかを確かめる。測った形を黙って変えないよう既定は簡略化しない
 */
const askSimplifyPolygons = async (
  geojson: FeatureCollection<Geometry | null, GeoJsonProperties>
): Promise<GeoJson2DataOptions> => {
  const vertices = countPolygonVertices(geojson);
  if (vertices <= POLYGON_SIMPLIFY_CONFIRM_VERTICES) return {};
  const simplifyPolygons = await ConfirmAsync(t('hooks.simplifyPolygons.message', { count: vertices }), {
    true: t('hooks.simplifyPolygons.simplify'),
    false: t('hooks.simplifyPolygons.keep'),
  });
  return simplifyPolygons ? { simplifyPolygons: true } : {};
};

// 文字列として読む。Webは decodeUri（Shift_JIS/UTF-16LE判定つき）、ネイティブはUTF-8。
// 先頭のBOMは後段（JSONは stripBom、CSV・XMLは各パーサ）で吸収する
const readTextFile = (uri: string) =>
  Platform.OS === 'web' ? decodeUri(uri) : FileSystem.readAsStringAsync(uri);

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
  displayName: string | null,
  options: GeoJson2DataOptions = {}
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
    displayName,
    options
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

const KML_NAMESPACES = new Set([
  'http://www.opengis.net/kml/2.2',
  'http://earth.google.com/kml/2.0',
  'http://earth.google.com/kml/2.1',
  'http://earth.google.com/kml/2.2',
]);
const isKmlElement = (node: XmlNode) => {
  if (node.nodeType !== 1) return false;
  const ns = (node as XmlElement).namespaceURI;
  return ns !== null && KML_NAMESPACES.has(ns);
};

// togeojson はタグ名（接頭辞込み）で要素を探すため、kml:Placemark のような接頭辞付きの KML は0件になる。
// KML 名前空間の要素だけ接頭辞を外した複製に差し替える（gx: など他の名前空間はそのまま）
const stripKmlPrefixes = (doc: XmlDocument) => {
  const root = doc.documentElement;
  if (root === null) return;
  const hasPrefixed = Array.from(doc.getElementsByTagName('*')).some((el) => el.prefix !== null && isKmlElement(el));
  if (!hasPrefixed) return;
  const copy = (node: XmlNode): XmlNode => {
    if (node.nodeType !== 1) return doc.importNode(node, false);
    const el = node as XmlElement;
    const name = isKmlElement(el) && el.localName !== null ? el.localName : el.tagName;
    const out = doc.createElementNS(el.namespaceURI, name);
    for (const attr of Array.from(el.attributes)) out.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
    for (const child of Array.from(el.childNodes)) out.appendChild(copy(child));
    return out;
  };
  doc.replaceChild(copy(root), root);
};

const KML_GEOMETRY_TAGS = new Set([
  'Point',
  'LineString',
  'LinearRing',
  'Polygon',
  'MultiGeometry',
  'Track',
  'gx:Track',
  'MultiTrack',
  'gx:MultiTrack',
]);
const KML_GEOMETRY_MARKER = '__ecorismap_kml_geometry_';

/**
 * KML文字列を GeoJSON にする。
 * togeojson は座標が読めないジオメトリ（abc,def など）を黙って捨てて geometry:null にするため、
 * 元からジオメトリの無い Placemark（位置なしレコードとして取り込む）と区別できない。
 * ジオメトリ要素を持つ Placemark に一時的な id を付けて変換し、それが null になったものは取り込まずに件数を返す。
 */
const kmlToGeoJson = (kmlString: string) => {
  const doc = new DOMParser().parseFromString(kmlString, 'text/xml');
  stripKmlPrefixes(doc);
  const originalIds = new Map<string, string | null>();
  Array.from(doc.getElementsByTagName('Placemark')).forEach((placemark, index) => {
    const hasGeometry = Array.from(placemark.childNodes).some(
      (child) => child.nodeType === 1 && KML_GEOMETRY_TAGS.has((child as XmlElement).tagName)
    );
    if (!hasGeometry) return;
    const marker = `${KML_GEOMETRY_MARKER}${index}`;
    originalIds.set(marker, placemark.getAttribute('id'));
    placemark.setAttribute('id', marker);
  });
  //@ts-ignore xmldomのDocumentはDOMのDocumentと型が異なる
  const raw = kml(doc) as FeatureCollection<Geometry | null, GeoJsonProperties>;
  let invalidGeometryCount = 0;
  const features: Feature<Geometry | null, GeoJsonProperties>[] = [];
  for (const feature of raw.features) {
    if (typeof feature.id !== 'string' || !originalIds.has(feature.id)) {
      features.push(feature);
      continue;
    }
    if (feature.geometry === null) {
      invalidGeometryCount++;
      continue;
    }
    const { id, ...rest } = feature;
    const originalId = originalIds.get(id);
    features.push(originalId ? { ...rest, id: originalId } : rest);
  }
  return { geojson: normalizeKmlGeoJson({ ...raw, features }), invalidGeometryCount };
};

const GEOJSON_GEOMETRY_TYPES = ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'];

// .geojsonは単体のFeatureやGeometryだけのファイルも仕様上有効。取り込みはFeatureCollection前提なので包んでおく
const toFeatureCollection = (json: unknown): FeatureCollection<Geometry | null, GeoJsonProperties> => {
  const empty: FeatureCollection<Geometry | null, GeoJsonProperties> = { type: 'FeatureCollection', features: [] };
  if (json === null || typeof json !== 'object') return empty;
  const type = (json as { type?: unknown }).type;
  if (type === 'FeatureCollection') return json as FeatureCollection<Geometry | null, GeoJsonProperties>;
  if (type === 'Feature') {
    return { type: 'FeatureCollection', features: [json as Feature<Geometry | null, GeoJsonProperties>] };
  }
  if (typeof type === 'string' && GEOJSON_GEOMETRY_TYPES.includes(type)) {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: json as Geometry }] };
  }
  return empty;
};

// macOSのFinderで圧縮すると、本体と同じ拡張子のAppleDouble（__MACOSX/配下や._で始まるファイル）が入る。
// 中身は拡張属性のバイナリで、本体として読むと解析に失敗する
const isMacMetadataEntry = (path: string) =>
  path.split('/').includes('__MACOSX') || getBaseName(path).startsWith('._');

// dictionaryKeyはプロジェクトのクラウド辞書を復号する鍵。ファイルとして持ち出したレイヤに付けておく理由が無い
// （dictionaryVersionも、元のプロジェクトのクラウドにある辞書ファイルを指すだけなので一緒に外す）
const withoutDictionaryKey = (layer: LayerType): LayerType => {
  const { dictionaryKey: _dictionaryKey, dictionaryVersion: _dictionaryVersion, ...rest } = layer;
  return rest;
};

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
    if (zip.files[key].dir || isMacMetadataEntry(key)) continue;
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
      if (data === undefined) return { count: 0, skipped: 0 };
      //console.log(recordSet[0].field);
      if (data.recordSet.length > 0) {
        dispatch(addLayerAction(data.layer));
        dispatch(addDataAction([{ layerId: data.layer.id, userId: dataUser.uid, data: data.recordSet }]));
      }
      // 緯度経度が不正で捨てた点（wpt・trkpt・rtept）の数
      const skipped = 'skippedPoints' in data && typeof data.skippedPoints === 'number' ? data.skippedPoints : 0;
      return { count: data.recordSet.length, skipped };
    },
    [dispatch, dataUser.displayName, dataUser.uid]
  );

  const importCsv = useCallback(
    (csv: string, importFileName: string, importedLayer?: LayerType) => {
      const data = csv2Data(csv, importFileName, dataUser.uid, dataUser.displayName, importedLayer);
      if (data === undefined) return { count: 0, skipped: 0 };
      //console.log(recordSet[0].field);
      if (data.recordSet.length > 0) {
        dispatch(addLayerAction(data.layer));
        dispatch(addDataAction([{ layerId: data.layer.id, userId: dataUser.uid, data: data.recordSet }]));
      }
      // 座標が書かれていたのに読めなかったレコードの数（位置なしで取り込まれている）
      return { count: data.recordSet.length, skipped: data.invalidGeometryCount };
    },
    [dispatch, dataUser.displayName, dataUser.uid]
  );

  const importGeoJson = useCallback(
    async (
      geojson: FeatureCollection<Geometry | null, GeoJsonProperties>,
      featureType: GeoJsonFeatureType,
      importFileName: string,
      importedLayer?: LayerType,
      photoZip?: JSZip,
      options: GeoJson2DataOptions = {}
    ): Promise<{ featureIndices: Set<number>; missingPhotos: number } | undefined> => {
      const layer =
        importedLayer === undefined
          ? createLayerFromGeoJson(geojson, importFileName, featureType)
          : cloneDeep(importedLayer);
      const converted = convertGeoJson(geojson, layer, featureType, dataUser.uid, dataUser.displayName, options);

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

  // 1つのファイルに複数のジオメトリタイプが混ざることがあるため、全タイプを取り込む（先頭の型だけだと他が黙って消える）。
  // 含まれるジオメトリタイプだけ処理して無駄な走査を省く
  const presentFeatureTypes = useCallback((geojson: FeatureCollection<Geometry | null, GeoJsonProperties>) => {
    if (!Array.isArray(geojson.features)) return [];
    // geometryがnull・欠落のフィーチャーはPOINTとして扱われる（geoJson2Dataの仕様に合わせる）
    const geometryTypes = new Set<string>(
      geojson.features
        .filter((f) => f !== null && typeof f === 'object')
        .map((f) => (f.geometry === null || f.geometry === undefined ? 'Point' : f.geometry.type))
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

  /**
   * ファイルに含まれる全ジオメトリタイプを、タイプごとのレイヤとして取り込む（KMLと.geojson・KMZで同じ挙動にする）。
   * @returns レコードになったフィーチャーの番号。除外件数は全タイプを通して数える（1フィーチャーは1タイプでしか取り込まれない）
   */
  const importAllFeatureTypes = useCallback(
    async (
      geojson: FeatureCollection<Geometry | null, GeoJsonProperties>,
      name: string,
      options: GeoJson2DataOptions = {}
    ) => {
      const importedIndices = new Set<number>();
      if (!Array.isArray(geojson.features)) return importedIndices;
      // 線・面を先に取り込み、取り込んだフィーチャーは後のタイプに渡さない。
      // 自前の書き出し（_id付き）の線・面レイヤは1点のスタンプ(Point)や位置なし(null)も自分のレコードとして受け入れるため、
      // POINTを先に（または同時に）処理すると同じフィーチャーが点レイヤにも重複して入る
      const order: GeoJsonFeatureType[] = ['LINE', 'MULTILINE', 'POLYGON', 'MULTIPOLYGON', 'POINT', 'MULTIPOINT'];
      let remaining = geojson.features.map((feature, originalIndex) => ({ feature, originalIndex }));
      for (const featureType of order) {
        if (remaining.length === 0) break;
        const subset = { ...geojson, features: remaining.map((r) => r.feature) };
        if (!presentFeatureTypes(subset).includes(featureType)) continue;
        // 単体ファイルは常に新規レイヤになる。_id を使うと、同じファイルを2回取り込んだときや
        // 書き出し元のレイヤが残っているときに同じidのレコードが2レイヤにできるため振り直す
        const result = await runAsync(() =>
          importGeoJson(subset, featureType, name, undefined, undefined, { ...options, regenerateIds: true })
        );
        if (result === undefined) continue;
        result.featureIndices.forEach((index) => importedIndices.add(remaining[index].originalIndex));
        remaining = remaining.filter((_, index) => !result.featureIndices.has(index));
      }
      return importedIndices;
    },
    [importGeoJson, presentFeatureTypes]
  );

  const loadGeojson = useCallback(
    async (uri: string, name: string) => {
      const geojsonStrings = await readTextFile(uri);
      // parseと変換は重いのでrunAsyncでUIスレッドをブロックしないようにする
      // GeometryCollection は取り込めないため構成要素ごとのFeatureに分ける（除外件数は分けた後で数える）
      const geojson = splitGeometryCollections(
        toFeatureCollection(await runAsync(() => JSON.parse(stripBom(geojsonStrings))))
      );
      const featureCount = countFeatures(geojson);
      if (featureCount === 0) return loadOutcome('empty');
      const importedIndices = await importAllFeatureTypes(geojson, name, await askSimplifyPolygons(geojson));
      if (importedIndices.size === 0) return emptyOutcome(geojson);
      return loadOutcome('imported', featureCount - importedIndices.size);
    },
    [importAllFeatureTypes]
  );

  const loadGpx = useCallback(
    async (uri: string, name: string) => {
      const gpx = await readTextFile(uri);
      const points = await runAsync(() => importGPX(gpx, 'POINT', name));
      const lines = await runAsync(() => importGPX(gpx, 'LINE', name));
      if (points.count + lines.count === 0) return loadOutcome('empty');
      return loadOutcome('imported', points.skipped + lines.skipped);
    },
    [importGPX]
  );

  const loadKmz = useCallback(
    async (uri: string, name: string) => {
      const loaded = await unzipFromUri(uri);
      // Windows等で作ると拡張子が大文字(DOC.KML)になることがある
      const files = loaded.file(/\.kml$/i).filter((file) => !isMacMetadataEntry(file.name));

      let featureCount = 0;
      let importedCount = 0;
      for (const file of files) {
        const kmlString = await file.async('string');
        // MultiGeometry の分割とスタイル由来の項目の除去。除外件数は分割後の件数で数える
        const { geojson, invalidGeometryCount } = await runAsync(() => kmlToGeoJson(kmlString));
        const count = countFeatures(geojson);
        featureCount += count + invalidGeometryCount;
        if (count === 0) continue;
        const importedIndices = await importAllFeatureTypes(geojson, name, await askSimplifyPolygons(geojson));
        importedCount += importedIndices.size;
      }
      if (importedCount === 0) return loadOutcome('empty');
      return loadOutcome('imported', featureCount - importedCount);
    },
    [importAllFeatureTypes]
  );

  const loadKml = useCallback(
    async (uri: string, name: string) => {
      const kmlString = await readTextFile(uri);
      // MultiGeometry の分割とスタイル由来の項目の除去。除外件数は分割後の件数で数える
      const { geojson, invalidGeometryCount } = await runAsync(() => kmlToGeoJson(kmlString));

      const importedIndices = await importAllFeatureTypes(geojson, name, await askSimplifyPolygons(geojson));
      if (importedIndices.size === 0) return loadOutcome('empty');
      return loadOutcome('imported', countFeatures(geojson) + invalidGeometryCount - importedIndices.size);
    },
    [importAllFeatureTypes]
  );

  const loadCsv = useCallback(
    async (uri: string, name: string) => {
      // ExcelのCSVはShift_JISやUTF-16LEのことがあるため、Web・ネイティブとも同じ判定（decodeTextBytes）で読む
      const csvStrings =
        Platform.OS === 'web'
          ? await decodeUri(uri)
          : decodeTextBytes(
              new Uint8Array(Buffer.from(await FileSystem.readAsStringAsync(uri, { encoding: 'base64' }), 'base64'))
            );
      const { count, skipped } = await runAsync(() => importCsv(csvStrings, name));
      if (count === 0) return loadOutcome('empty');
      return loadOutcome('imported', skipped);
    },
    [importCsv]
  );

  const loadZip = useCallback(
    async (uri: string, name: string) => {
      const loaded = await unzipFromUri(uri);
      //console.log(loaded);
      const files = Object.keys(loaded.files);
      const jsonFile = files.find((f) => getExt(f) === 'json' && !isMacMetadataEntry(f));
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

      const sqliteFile = files.find((f) => getExt(f) === 'sqlite' && !isMacMetadataEntry(f));
      const csvFile = files.find((f) => getExt(f) === 'csv' && !isMacMetadataEntry(f));
      const geojsonFile = files.find((f) => getExt(f) === 'geojson' && !isMacMetadataEntry(f));

      if (shouldReplace && existingLayerToReplace) {
        // 置き換えモード
        // 旧版で書き出したファイルにはdictionaryKeyが入っていることがある。ファイル由来の鍵はレイヤに持ち込まない
        const updatedLayer: LayerType = {
          ...withoutDictionaryKey(json),
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
          const simplifyOptions = await askSimplifyPolygons(geojson);
          replacing = convertGeoJson(
            geojson,
            updatedLayer,
            updatedLayer.type,
            dataUser.uid,
            dataUser.displayName,
            simplifyOptions
          );
          if (replacing === undefined || replacing.records.length === 0) {
            // MULTIタイプを試す
            const multi = convertGeoJson(
              geojson,
              updatedLayer,
              `MULTI${updatedLayer.type}` as GeoJsonFeatureType,
              dataUser.uid,
              dataUser.displayName,
              simplifyOptions
            );
            if (multi !== undefined) replacing = multi;
          }
          if (replacing === undefined) throw new Error('invalid geojson file');
          missingPhotos = await restorePhotosFromZip(replacing, updatedLayer, loaded);
        }
        // CSVもGeoJSONと同じく、消す前に変換して読めることを確かめる
        let replacingCsvRecords: RecordType[] | undefined;
        let replacingCsvSkipped = 0;
        if (updatedLayer.type !== 'LAYERGROUP' && replacing === undefined && csvFile !== undefined) {
          const csv = await loaded.files[csvFile].async('text');
          const data = csv2Data(csv, name, dataUser.uid, dataUser.displayName, updatedLayer);
          if (data === undefined) throw new Error('invalid csv file');
          replacingCsvRecords = data.recordSet;
          replacingCsvSkipped = data.invalidGeometryCount;
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

        // 既存データを置き換える（消える記録のうちアップロード済みのものは墓標で残す）
        const replacementRecords =
          updatedLayer.type === 'LAYERGROUP' ? [] : replacing?.records ?? replacingCsvRecords ?? [];
        dispatch(
          replaceRecordsKeepingTombstonesAction({
            layerId: existingLayerToReplace.id,
            userId: dataUser.uid,
            data: replacementRecords,
          })
        );

        // レイヤ設定を更新
        dispatch(updateLayerAction(updatedLayer));

        // データのインポート処理
        if (updatedLayer.type === 'LAYERGROUP') {
          // LAYERGROUPの場合はデータなし
        } else if (replacing !== undefined) {
          // レイヤ設定は置き換わっているので、レコードが0件でも中止ではなく取り込み扱い（除外件数で伝える）
          return loadOutcome('imported', replacingFeatureCount - replacing.featureIndices.size, missingPhotos);
        } else if (replacingCsvRecords !== undefined && replacingCsvRecords.length > 0) {
          return loadOutcome('imported', replacingCsvSkipped);
        }
      } else {
        // 通常モード（新規レイヤとして追加）
        const { layer: importedLayer, layerIdMap, fieldIdMap } = changeLayerId(withoutDictionaryKey(json));

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
          // 書き出し元のレイヤが手元に残っている（重複ダイアログで「新規レイヤ」を選んだ等）ときに _id を使うと、
          // 同じidのレコードが2レイヤにできる。そのときだけ振り直し、それ以外は _id（_group の参照先）を保つ
          const idOptions: GeoJson2DataOptions = {
            ...(await askSimplifyPolygons(geojson)),
            ...(layers.some((layer) => layer.id === originalLayerId) ? { regenerateIds: true } : {}),
          };
          //ToDo 有効なgeojsonファイルかチェック
          const result =
            (await importGeoJson(geojson, importedLayer.type, name, importedLayer, loaded, idOptions)) ??
            //QGISでgeojsonをエクスポートするとマルチタイプになるので。厳密にするなら必要ない処理だが作業的に頻出するので対応
            (await importGeoJson(geojson, `MULTI${importedLayer.type}`, name, importedLayer, loaded, idOptions));
          if (result === undefined) return emptyOutcome(geojson);
          return loadOutcome('imported', countFeatures(geojson) - result.featureIndices.size, result.missingPhotos);
        } else if (csvFile !== undefined) {
          const csv = await loaded.files[csvFile].async('text');
          //ToDo 有効なcsvファイルかチェック
          const { count, skipped } = importCsv(csv, name, importedLayer);
          if (count === 0) return loadOutcome('empty');
          return loadOutcome('imported', skipped);
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
      const jsonStrings = await readTextFile(uri);
      const json = JSON.parse(stripBom(jsonStrings));
      if (!isLayerType(json)) throw new Error('invalid json file');
      const { layer: importedLayer } = changeLayerId(withoutDictionaryKey(json));
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
          if (result.emptyReason !== undefined) {
            // 座標系が緯度経度でないなど、原因が分かっているときはそれを伝える（理由はcrsの名前を含む）
            return {
              isOK: false,
              message: `${t('hooks.message.noImportableData')}\n${t('hooks.message.failLoadFile')}\n(${result.emptyReason})`,
            };
          }
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
      const exportData: {
        data: string;
        name: string;
        type: ExportType;
        folder: string;
        url?: string | null;
        key?: string | null;
        photoId?: string;
      }[] = [];
      const exportFolder = option?.folder ?? '';
      //LayerSetting
      // 書き出したファイルはプロジェクトの外へ渡りうるので、クラウド辞書の鍵は含めない
      const layerSetting = JSON.stringify(withoutDictionaryKey(targetLayer));
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
                  key: photo.key,
                  // 写真名は秒単位の自動命名で別レコード（別メンバー）と重なりうる。ZIP内でphoto.idのフォルダに分けて
                  // 上書きし合わないようにする。パスに使えないidは付けない（従来どおりレイヤのフォルダ直下に入る）
                  ...(isSafePathSegment(photo.id) && { photoId: photo.id }),
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
