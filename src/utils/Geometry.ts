import { XMLParser } from 'fast-xml-parser';
import { ulid } from 'ulid';
import xmlBuilder from 'xmlbuilder';
import {
  RecordType,
  FeatureType,
  LayerType,
  LocationType,
  GeoJsonFeatureType,
  PhotoType,
  FormatType,
  FieldType,
} from '../types';
import * as turf from '@turf/helpers';
import simplify from '@turf/simplify';
import area from '@turf/area';
import { COLOR } from '../constants/AppConstants';
import dayjs from '../i18n/dayjs';
import sanitize from 'sanitize-filename';
import { formattedInputs } from './Format';
import { parseCsv } from './csvParse';
import { kmzPhotoEntryNames } from './kmzPhotoNames';
import { calcCentroid, calcLineMidPoint, latlonToLatLonObject } from './Coords';
import {
  Feature,
  FeatureCollection,
  LineString,
  MultiLineString,
  MultiPoint,
  MultiPolygon,
  Point,
  Polygon,
  GeoJsonProperties,
  Geometry,
  GeometryCollection,
  Position,
} from 'geojson';
import { rgbaString2qgis } from './Color';
import { cloneDeep } from 'lodash';
import { isLocationType, isLocationTypeArray } from './General';
import { generateLabel, getColor, getLineWidth } from './Layer';
import { fixQualityLabel } from '../lib/gnss/toLocation';
import { FIX_QUALITY } from '../lib/gnss/nmea';

// QGIS などは "Point (139 35)" や "POINT Z (139 35 10)" のように大文字小文字・空白・次元指定が混ざるため、
// 部分一致ではなくタグを取り出して判定する（部分一致だと MULTIPOINT まで POINT と誤解析していた）
const WKT_PATTERN = /^\s*([A-Za-z]+)(?:\s+(?:ZM|Z|M))?\s*\(([\s\S]*)\)\s*$/;
const WKT_RING_PATTERN = /\(([^()]*)\)/g;

const parseWktTag = (geometryString: string): { tag: string; body: string } | undefined => {
  const match = WKT_PATTERN.exec(geometryString);
  return match === null ? undefined : { tag: match[1].toUpperCase(), body: match[2] };
};

/** MULTI* は1レコード1ジオメトリに収まらないので扱わない（NONE） */
export const getGeometryType = (geometryString: string): FeatureType => {
  switch (parseWktTag(geometryString)?.tag) {
    case 'POINT':
      return 'POINT';
    case 'LINESTRING':
      return 'LINE';
    case 'POLYGON':
      return 'POLYGON';
    default:
      return 'NONE';
  }
};

// 範囲外・数値でない座標を (0,0) で埋めると赤道ギニア沖に黙って置かれるため、読めなければ欠損にする
const parseWktPosition = (text: string): LocationType | undefined => {
  const [lon, lat] = text.trim().split(/\s+/);
  if (lon === undefined || lat === undefined) return undefined;
  const latitude = formattedInputs(lat, 'latitude-decimal', false);
  const longitude = formattedInputs(lon, 'longitude-decimal', false);
  if (!latitude.isOK || !longitude.isOK) return undefined;
  return { latitude: Number(latitude.result), longitude: Number(longitude.result) };
};

// 1点でも読めなければ形が変わるので、部分的に取り込まずジオメトリごと欠損にする
const parseWktPositions = (text: string): LocationType[] | undefined => {
  const positions = text.split(',').map(parseWktPosition);
  return positions.every((p): p is LocationType => p !== undefined) ? positions : undefined;
};

const parseWktRings = (body: string): LocationType[][] | undefined => {
  // 環の間はカンマと空白だけのはず。旧版が穴なしで書き出した "((外周),)" の末尾カンマも読めるよう空の区切りは許す
  if (body.replace(WKT_RING_PATTERN, '').replace(/[\s,]/g, '') !== '') return undefined;
  const rings: LocationType[][] = [];
  for (const ring of body.match(WKT_RING_PATTERN) ?? []) {
    const positions = parseWktPositions(ring.slice(1, -1));
    if (positions === undefined) return undefined;
    rings.push(positions);
  }
  return rings.length > 0 ? rings : undefined;
};

/** レイヤの種類に合うWKTだけを座標にする。合わない・読めない場合は undefined */
const parseCsvGeometry = (
  geometryString: string,
  layerType: FeatureType
): Pick<RecordType, 'coords' | 'holes'> | undefined => {
  const wkt = parseWktTag(geometryString);
  if (wkt === undefined) return undefined;
  if (layerType === 'POINT' && wkt.tag === 'POINT') {
    const coords = parseWktPosition(wkt.body);
    return coords && { coords };
  }
  if (layerType === 'LINE' && wkt.tag === 'POINT') {
    // マップメモのスタンプ（1点のLINE）は generateCSV が POINT で書き出している
    const coords = parseWktPosition(wkt.body);
    return coords && { coords: [coords] };
  }
  if (layerType === 'LINE' && wkt.tag === 'LINESTRING') {
    const coords = parseWktPositions(wkt.body);
    return coords && { coords };
  }
  if (layerType === 'POLYGON' && wkt.tag === 'POLYGON') {
    const rings = parseWktRings(wkt.body);
    if (rings === undefined) return undefined;
    const [outer, ...holes] = rings;
    return holes.length === 0
      ? { coords: outer }
      : { coords: outer, holes: Object.fromEntries(holes.map((hole) => [ulid(), hole])) };
  }
  return undefined;
};

/**
 * escapeCSVValue が数式注入対策で付けた先頭の ' を外す。付ける条件（数式の開始文字で始まり数値でない）の
 * ちょうど逆だけを外すので、書き出し→取り込みで元の値に戻る。Excel で ' を付けて入力した値は
 * CSV に ' が残らないため、外部の CSV で利用者の ' が消えることはほぼない
 */
export const unguardCSVValue = (value: string): string =>
  value.startsWith("'") && needsFormulaGuard(value.slice(1)) ? value.slice(1) : value;

// parseCsv が BOM・\r・引用符を外すので、ここでは見た目の空白だけを除く
const csvHeaderFromRows = (rows: string[][]) => (rows[0] ?? []).map((field) => unguardCSVValue(field).trim());

const detectCsvTypeFromRows = (rows: string[][]): { type: FeatureType; column: number } => {
  const geometryColumn = csvHeaderFromRows(rows).findIndex((field) => field === 'geometry');
  if (geometryColumn === -1) {
    return { type: 'NONE', column: -1 }; // geometryカラムがない場合
  }
  // 先頭レコードの座標が空・ヘッダ直後の空行・未対応のWKTで全件を NONE にしないよう、読める最初の値で決める
  for (const row of rows.slice(1)) {
    const geometryType = getGeometryType(row[geometryColumn] ?? '');
    if (geometryType !== 'NONE') return { type: geometryType, column: geometryColumn };
  }
  // 位置なしでも geometry 列を項目にしないよう列番号は返す
  return { type: 'NONE', column: geometryColumn };
};

/** 引用符が閉じていないなど CSV として読めない場合は例外を投げる */
export const detectCsvType = (csv: string): { type: FeatureType; column: number } =>
  detectCsvTypeFromRows(parseCsv(csv));

// geometry 列の無い外部のCSV（GPSロガー・Excel）は緯度・経度の列で位置を持つことが多い。
// x/y は投影座標のこともあるので、緯度経度系の名前が無いときだけ使い、範囲外の値は位置にしない
const CSV_LATLON_COLUMN_NAMES: [string[], string[]][] = [
  [
    ['latitude', 'lat', '緯度'],
    ['longitude', 'lon', 'lng', 'long', '経度'],
  ],
  [['y'], ['x']],
];

const csvLatLonColumns = (header: string[]): { lat: number; lon: number } | undefined => {
  const names = header.map((name) => name.toLowerCase());
  for (const [latNames, lonNames] of CSV_LATLON_COLUMN_NAMES) {
    const lat = names.findIndex((name) => latNames.includes(name));
    const lon = names.findIndex((name) => lonNames.includes(name));
    if (lat !== -1 && lon !== -1) return { lat, lon };
  }
  return undefined;
};

const parseCsvLatLon = (row: string[], columns: { lat: number; lon: number }): LocationType | undefined =>
  parseWktPosition(`${row[columns.lon] ?? ''} ${row[columns.lat] ?? ''}`);

// 空行（空白だけの行を含む）は従来どおりレコードとして扱わない
const isBlankCsvRow = (row: string[]) => row.length === 1 && row[0].trim() === '';

/**
 * CSV は全て文字列なので、レイヤの項目型に合わせて戻す。
 * 文字列のままだと PHOTO の forEach/map（削除・同期）が例外になり、数値も文字列に落ちる。
 */
const convertCsvValue = (value: string, format: FormatType | undefined): string | number | PhotoType[] => {
  switch (format) {
    case 'PHOTO':
      // CSV には写真名しか無く写真本体と結びつけられないため空にする（GeoJSON経路と同じ）
      return [];
    case 'INTEGER':
    case 'DECIMAL':
    case 'SERIAL': {
      if (value.trim() === '') return '';
      const num = Number(value);
      return Number.isFinite(num) ? num : '';
    }
    default:
      return value;
  }
};

export const csv2Data = (
  csv: string,
  fileName: string,
  userId: string | undefined,
  displayName: string | null,
  importedLayer?: LayerType
) => {
  try {
    //console.log(type);
    // 引用符内の改行でレコードが分裂しないよう、本文・ヘッダ・型判定で同じパーサの結果を使う
    const rows = parseCsv(csv);
    const detected = detectCsvTypeFromRows(rows);
    const header = csvHeaderFromRows(rows);
    // 緯度経度の列は属性としても残す（元の表記・精度を失わないため）。1行でも読めればポイントにする
    const latLonColumns =
      importedLayer === undefined && detected.column === -1 ? csvLatLonColumns(header) : undefined;
    const useLatLon =
      latLonColumns !== undefined &&
      rows.slice(1).some((row) => !isBlankCsvRow(row) && parseCsvLatLon(row, latLonColumns) !== undefined);
    // レイヤ設定があれば、レコードの座標から推測した種類より設定の種類を信じる
    const type = importedLayer?.type ?? (useLatLon ? 'POINT' : detected.type);
    const column = detected.column;
    const attributeColumns = csvAttributeColumns(header);
    const layer =
      importedLayer === undefined
        ? createLayerFromCsvColumns(attributeColumns, fileName, type)
        : cloneDeep(importedLayer);
    // 値の前後の空白も利用者の入力なので trim しない
    // （parseCsv は引用符の内外を区別して返さないため、引用符の外の空白も値に残る）
    const body = rows.slice(1).filter((row) => !isBlankCsvRow(row));

    // 位置で対応させると displayName 列の有無などで全項目が1列ずれるため、列名で対応させる。
    // 名前で見つからない項目（旧版がエスケープせずに書き出したカンマ入りの項目名など）は従来どおり位置で拾う
    const offset = header[0] === 'displayName' ? 1 : 0;
    const fieldColumns =
      importedLayer === undefined
        ? attributeColumns.map((attribute) => attribute.column)
        : layer.field.map((field, idx) => {
            // displayName 列と座標列は項目の値ではないので、同名の項目があってもそこから拾わない
            const named = header.findIndex(
              (name, col) => name === field.name && !(offset === 1 && col === 0) && col !== column
            );
            return named === -1 ? idx + offset : named;
          });
    let invalidGeometryCount = 0;

    const importedData: RecordType[] = body.map((data) => {
      //layer.fieldとdataの配列からfieldを作成
      const fields = layer.field
        .map((field, idx) => {
          //CSVの列数がレイヤのフィールド数より少ない場合にundefinedが入るのを防ぐ
          const value = unguardCSVValue(data[fieldColumns[idx]] ?? '');
          return { [field.name]: importedLayer === undefined ? value : convertCsvValue(value, field.format) };
        })
        .reduce((obj, userObj) => Object.assign(obj, userObj), {});
      let geometry: Pick<RecordType, 'coords' | 'holes'> | undefined;
      if (useLatLon && latLonColumns !== undefined) {
        const coords = parseCsvLatLon(data, latLonColumns);
        geometry = coords && { coords };
        const written = [latLonColumns.lat, latLonColumns.lon].some((col) => (data[col] ?? '').trim() !== '');
        if (geometry === undefined && written) invalidGeometryCount++;
      } else {
        const geometryString = column === -1 ? '' : data[column] ?? '';
        geometry = type === 'NONE' ? undefined : parseCsvGeometry(geometryString, type);
        // 書かれていたのに読めなかった座標（範囲外・MULTI*・種類違い）は欠損にし、件数で知らせる
        if (geometry === undefined && geometryString.trim() !== '') invalidGeometryCount++;
      }

      return {
        id: ulid(),
        userId: userId,
        displayName: displayName,
        redraw: false,
        visible: true,
        coords: geometry?.coords,
        ...(geometry?.holes !== undefined ? { holes: geometry.holes } : {}),
        field: fields,
      };
    });
    //csvから
    return { layer: layer, recordSet: importedData, invalidGeometryCount };
  } catch (e) {
    return undefined;
  }
};

const GPX_ARRAY_TAGS = new Set(['wpt', 'trk', 'trkseg', 'trkpt', 'rte', 'rtept']);
const GPX_CDATA_PROP = '__cdata';
// GNSS品質を書き出す<extensions>の子要素の名前空間（識別子なので解決できるURLである必要はない）
const GPX_GNSS_NAMESPACE = 'https://ecorismap.web.app/xmlns/gpx-gnss/1';

// XMLParserの出力には型が無く、要素の中身はファイル次第なので any で受ける（値は下で個別に検証する）
type GpxXmlNode = Record<string, any>;
// <trk/>や<trkseg/>は''としてパースされるため、オブジェクトのものだけを扱う
const isGpxXmlObject = (v: unknown): v is GpxXmlNode => typeof v === 'object' && v !== null && !Array.isArray(v);

const XML_PREDEFINED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
// processEntities は DOCTYPE の内部実体まで展開してしまう（billion laughs）うえ数値文字参照を復号しないため、
// 定義済みの5実体と数値文字参照だけを自前で復号する。それ以外の &name; はそのまま残す
const decodeXmlEntities = (text: string): string =>
  text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (match, ref: string) => {
    if (ref[0] !== '#') return XML_PREDEFINED_ENTITIES[ref];
    const codePoint = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    return isXmlChar(codePoint) ? String.fromCodePoint(codePoint) : match;
  });

// XML 1.0 の Char（#x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]）。
// 範囲外の数値文字参照（&#0; など）は整形式でないので復号せず、制御文字を値に入れない
const isXmlChar = (codePoint: number): boolean =>
  Number.isFinite(codePoint) &&
  (codePoint === 0x9 ||
    codePoint === 0xa ||
    codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff));

// 要素のテキストを文字列で返す。CDATAの中身は実体参照として扱わず、そのまま使う。
// 前後の空白は利用者の入力の一部なので削らない
const gpxText = (value: unknown): string | undefined => {
  if (typeof value === 'string') return decodeXmlEntities(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (!isGpxXmlObject(value)) return undefined;
  const text = typeof value['#text'] === 'string' ? decodeXmlEntities(value['#text']) : '';
  const cdataValue = value[GPX_CDATA_PROP];
  const cdata = Array.isArray(cdataValue) ? cdataValue.join('') : typeof cdataValue === 'string' ? cdataValue : '';
  return text + cdata;
};

// 数値・時刻として読む要素は、整形で入った前後の改行や空白を無視する
const gpxNumber = (value: unknown): number | undefined => {
  const text = gpxText(value)?.trim();
  if (text === undefined || text === '') return undefined;
  const num = Number(text);
  return Number.isFinite(num) ? num : undefined;
};

const gpxTimestamp = (value: unknown): number | undefined => {
  const text = gpxText(value)?.trim();
  if (text === undefined || text === '') return undefined;
  const time = dayjs(text);
  return time.isValid() ? time.valueOf() : undefined;
};

// 緯度経度が欠けた・範囲外・数値でない点は (0,0) で埋めず、その点だけを捨てる
const gpxLatLon = (node: GpxXmlNode): { latitude: number; longitude: number } | undefined => {
  if (typeof node.lat !== 'string' || typeof node.lon !== 'string') return undefined;
  const { isOK: latIsOK, result: lat } = formattedInputs(node.lat.trim(), 'latitude-decimal', false);
  const { isOK: lonIsOK, result: lon } = formattedInputs(node.lon.trim(), 'longitude-decimal', false);
  if (!latIsOK || !lonIsOK) return undefined;
  const latitude = Number(lat as string);
  const longitude = Number(lon as string);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  return { latitude, longitude };
};

// <extensions>の中のEcorisMapのGNSS要素を探す。他のツールが名前空間に接頭辞を付け直しても読めるようにする
const gpxGnssExtension = (node: GpxXmlNode): GpxXmlNode | undefined => {
  const extensions = node.extensions;
  if (!isGpxXmlObject(extensions)) return undefined;
  const key = Object.keys(extensions).find((k) => k === 'gnss' || k.endsWith(':gnss'));
  const gnss = key === undefined ? undefined : extensions[key];
  return isGpxXmlObject(gnss) ? gnss : undefined;
};

// GPXの楕円体高は ele + geoidheight で表す（書き出し側と同じ定義）
const gpxEllipsoidHeight = (altitude: number | undefined, node: GpxXmlNode): number | undefined => {
  const geoidHeight = gpxNumber(node.geoidheight);
  if (altitude === undefined || geoidHeight === undefined) return undefined;
  return Number((altitude + geoidHeight).toFixed(3));
};

// GPXの項目は name/time/cmt しか無く、EcorisMapはそれ以外の項目を desc に「項目名: 値」で書き出す。
// 値に改行や「: 」を含みうるので項目には分解せず、desc 全体を文字列の項目として残す（型は戻らない）
const GPX_DESC_FIELD = 'desc';

const gpxDescField = (node: GpxXmlNode): { desc: string } | Record<string, never> => {
  const desc = gpxText(node.desc);
  return desc === undefined || desc === '' ? {} : { desc };
};

export const gpx2Data = (
  gpx: string,
  type: FeatureType,
  fileName: string,
  userId: string | undefined,
  displayName: string | null
) => {
  try {
    //console.log(type);
    const newLayer: LayerType = createGpxLayer(fileName, type);
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      // DOCTYPEの内部実体（billion laughs）や外部実体を展開しないよう無効化し、定義済み実体はgpxTextで復号する
      processEntities: false,
      // "007"や"0"が数値に変わらないよう、値は文字列のまま受け取り、数値の要素だけを個別に変換する
      parseTagValue: false,
      // nameやcmtの前後の空白も利用者の入力なので削らない
      trimValues: false,
      // CDATAの中身は実体参照を含まない生の文字列なので、復号の対象から分けて受け取る
      cdataPropName: GPX_CDATA_PROP,
      // 要素が1個だとオブジェクト、0個だと''になり.mapで例外→全軌跡が消えるため、常に配列にそろえる
      isArray: (tagName, _jPath, _isLeafNode, isAttribute) => !isAttribute && GPX_ARRAY_TAGS.has(tagName),
    });
    const json = parser.parse(gpx);
    const gpxkey = json.gpx ? 'gpx' : 'GPX';
    const root: GpxXmlNode = json[gpxkey];
    let importedData: RecordType[] = [];
    // 緯度経度が不正で捨てた点の数（呼び出し側で利用者に知らせるため）
    let skippedPoints = 0;

    const nodesOf = (parent: GpxXmlNode, tagName: string): GpxXmlNode[] =>
      Array.isArray(parent[tagName]) ? parent[tagName].filter(isGpxXmlObject) : [];

    switch (type) {
      case 'POINT':
        importedData = nodesOf(root, 'wpt').flatMap((wpt) => {
          const latlon = gpxLatLon(wpt);
          if (latlon === undefined) {
            skippedPoints++;
            return [];
          }
          const altitude = gpxNumber(wpt.ele);
          // time の無い wpt に dayjs(undefined)＝取り込んだ時刻が入らないよう、要素が無いときは空にする
          const timestamp = gpxTimestamp(wpt.time);
          const coords: LocationType = { ...latlon, altitude };
          const gnssExtension = gpxGnssExtension(wpt);
          const fixQuality = gnssExtension === undefined ? undefined : gpxNumber(gnssExtension.fixQuality);
          if (gnssExtension !== undefined && fixQuality !== undefined) {
            const ellipsoidHeight = gpxEllipsoidHeight(altitude, wpt);
            const averagedCount = gpxNumber(gnssExtension.averagedCount);
            coords.gnss = {
              fixQuality,
              satellites: gpxNumber(wpt.sat) ?? null,
              hdop: gpxNumber(wpt.hdop) ?? null,
              diffAge: gpxNumber(wpt.ageofdgpsdata) ?? null,
              ...(ellipsoidHeight !== undefined && { ellipsoidHeight }),
              ...(averagedCount !== undefined && { averagedCount }),
            };
          }
          const record: RecordType = {
            id: ulid(),
            userId: userId,
            displayName: displayName,
            redraw: false,
            visible: true,
            coords,
            field: {
              name: gpxText(wpt.name) ?? '',
              time: timestamp === undefined ? '' : dayjs(timestamp).format(),
              cmt: gpxText(wpt.cmt) ?? '',
              ...gpxDescField(wpt),
            },
          };
          return [record];
        });
        break;
      case 'LINE': {
        const toLocation = (point: GpxXmlNode): LocationType | undefined => {
          const latlon = gpxLatLon(point);
          if (latlon === undefined) {
            skippedPoints++;
            return undefined;
          }
          const altitude = gpxNumber(point.ele);
          const location: LocationType = { ...latlon, timestamp: gpxTimestamp(point.time), altitude };
          const ellipsoidHeight = gpxEllipsoidHeight(altitude, point);
          if (ellipsoidHeight !== undefined) location.ellipsoidHeight = ellipsoidHeight;
          const gnssExtension = gpxGnssExtension(point);
          const fixQuality = gnssExtension === undefined ? undefined : gpxNumber(gnssExtension.fixQuality);
          if (fixQuality !== undefined) location.fixQuality = fixQuality;
          return location;
        };
        const toLocations = (points: GpxXmlNode[]): LocationType[] =>
          points.map(toLocation).filter((c): c is LocationType => c !== undefined);

        const toRecord = (line: GpxXmlNode, coords: LocationType[]): RecordType => {
          // trk.time は GPX 1.1 には無い要素で、無いことが多いため、そのときは最初の点の時刻を使う
          const lineTimestamp = gpxTimestamp(line.time) ?? coords[0]?.timestamp;
          return {
            id: ulid(),
            userId: userId,
            displayName: displayName,
            redraw: false,
            visible: true,
            coords: coords,
            centroid: calcLineMidPoint(coords),
            field: {
              name: gpxText(line.name) ?? '',
              time: lineTimestamp === undefined ? '' : dayjs(lineTimestamp).format(),
              cmt: gpxText(line.cmt) ?? '',
              ...gpxDescField(line),
            },
          };
        };

        // セグメントは連結し、有効な点が1つも無いtrkは飛ばして他のtrkの取り込みを巻き添えにしない
        // （1点だけのセグメントは残す）
        const trackRecords = nodesOf(root, 'trk').flatMap((trk) => {
          const coords = nodesOf(trk, 'trkseg').flatMap((trkseg) => toLocations(nodesOf(trkseg, 'trkpt')));
          return coords.length === 0 ? [] : [toRecord(trk, coords)];
        });
        // ルートだけのGPX（山行計画・ナビアプリ）を0件で成功扱いにしないよう、rteもラインとして取り込む
        const routeRecords = nodesOf(root, 'rte').flatMap((rte) => {
          const coords = toLocations(nodesOf(rte, 'rtept'));
          return coords.length === 0 ? [] : [toRecord(rte, coords)];
        });
        importedData = [...trackRecords, ...routeRecords];
        break;
      }
      case 'POLYGON':
        break;
    }
    // desc の無いGPXの項目構成を変えないよう、desc を持つ要素があるときだけ項目を足す
    if (importedData.some((record) => record.field[GPX_DESC_FIELD] !== undefined)) {
      newLayer.field.push({ id: ulid(), name: GPX_DESC_FIELD, format: 'STRING' });
      importedData = importedData.map((record) =>
        record.field[GPX_DESC_FIELD] === undefined
          ? { ...record, field: { ...record.field, [GPX_DESC_FIELD]: '' } }
          : record
      );
    }
    // 正常なファイルの戻り値の形を変えないよう、捨てた点があるときだけ件数を付ける
    return skippedPoints > 0
      ? { layer: newLayer, recordSet: importedData, skippedPoints }
      : { layer: newLayer, recordSet: importedData };
  } catch (e) {
    return undefined;
  }
};

// 経度・緯度の順が定義のCRS（GeoJSONの既定）
const LONLAT_CRS_NAMES = new Set([
  'urn:ogc:def:crs:ogc:1.3:crs84',
  'urn:ogc:def:crs:ogc::crs84',
  'urn:ogc:def:crs:ogc:2:84',
  'http://www.opengis.net/def/crs/ogc/1.3/crs84',
  'https://www.opengis.net/def/crs/ogc/1.3/crs84',
  'ogc:crs84',
  'crs:84',
  'crs84',
]);
// EPSG:4326 は定義上は緯度・経度の順だが、実際のGeoJSONはほぼ経度・緯度で書かれている（GeoJSON 2008 の運用）
const EPSG4326_CRS_PATTERN =
  /^(?:epsg:4326|urn:ogc:def:crs:epsg:(?:[\d.]*:)?4326|https?:\/\/www\.opengis\.net\/def\/crs\/epsg\/[\d.]+\/4326)$/;

export type GeoJsonCrsCheck = { ok: true; swapAxes: boolean } | { ok: false; reason: string };

const crsNameOf = (crs: unknown): string | undefined => {
  if (typeof crs !== 'object' || crs === null) return undefined;
  const { type, properties } = crs as { type?: unknown; properties?: unknown };
  if (typeof properties !== 'object' || properties === null) return undefined;
  const { name, code } = properties as { name?: unknown; code?: unknown };
  if (type === 'name' && typeof name === 'string') return name.trim();
  // 古い形式のEPSG指定 {"type":"EPSG","properties":{"code":4326}}
  if (type === 'EPSG' && (typeof code === 'number' || typeof code === 'string')) return `EPSG:${code}`;
  return undefined;
};

/**
 * EPSG:4326 と書かれたファイルの軸の順を座標から判定する。
 * 経度の値域（±180）にしか収まらない値がどちらの位置にあるかで決め、決められなければ慣例どおり経度・緯度とみなす。
 */
const looksLatLonOrder = (geojson: FeatureCollection<Geometry | null, GeoJsonProperties>): boolean => {
  let firstExceeds90 = false;
  let secondExceeds90 = false;
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      if (Math.abs(value[0]) > 90) firstExceeds90 = true;
      if (Math.abs(value[1]) > 90) secondExceeds90 = true;
      return;
    }
    value.forEach(visit);
  };
  geojson.features.forEach((feature) => {
    const geometry: unknown = feature?.geometry;
    if (typeof geometry === 'object' && geometry !== null) visit((geometry as { coordinates?: unknown }).coordinates);
  });
  return secondExceeds90 && !firstExceeds90;
};

/**
 * ルートの crs が WGS84 の経緯度かを判定する。取り込めないときは理由（crsの名前）を返し、画面に出せるようにする。
 * crs が無い場合は GeoJSON の既定（WGS84 経度・緯度）とみなす。
 * crs はあるが読めない（type:link 等）場合は、投影座標系の可能性があるため従来どおり取り込まない。
 */
export const checkGeoJsonCrs = (geojson: FeatureCollection<Geometry | null, GeoJsonProperties>): GeoJsonCrsCheck => {
  const crs: unknown = (geojson as { crs?: unknown }).crs;
  if (crs === undefined || crs === null) return { ok: true, swapAxes: false };
  const name = crsNameOf(crs);
  if (name === undefined) return { ok: false, reason: 'unsupported crs' };
  const normalized = name.toLowerCase();
  if (LONLAT_CRS_NAMES.has(normalized)) return { ok: true, swapAxes: false };
  if (EPSG4326_CRS_PATTERN.test(normalized)) {
    return { ok: true, swapAxes: Array.isArray(geojson.features) && looksLatLonOrder(geojson) };
  }
  return { ok: false, reason: `unsupported crs: ${name}` };
};

const swapPositions = (value: unknown): unknown => {
  if (!Array.isArray(value)) return value;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    return [value[1], value[0], ...value.slice(2)];
  }
  return value.map(swapPositions);
};

const swapGeometryAxes = (geometry: Geometry | null | undefined): Geometry | null | undefined => {
  if (typeof geometry !== 'object' || geometry === null) return geometry;
  if (geometry.type === 'GeometryCollection') {
    return {
      ...geometry,
      geometries: Array.isArray(geometry.geometries)
        ? (geometry.geometries.map((g) => swapGeometryAxes(g)) as Geometry[])
        : geometry.geometries,
    };
  }
  // 座標配列の入れ子の深さは型ごとに違うため、末端の位置だけを入れ替える汎用の走査にしている
  return { ...geometry, coordinates: swapPositions(geometry.coordinates) } as Geometry;
};

// GeoJSONは外部ファイル由来なので、座標が数値であることと値域を検証する。
// GeoJSONの座標は [経度, 緯度] の順（高度が続く場合がある）。
export const isValidPosition = (pos: unknown): pos is Position =>
  Array.isArray(pos) &&
  pos.length >= 2 &&
  typeof pos[0] === 'number' &&
  Number.isFinite(pos[0]) &&
  pos[0] >= -180 &&
  pos[0] <= 180 &&
  typeof pos[1] === 'number' &&
  Number.isFinite(pos[1]) &&
  pos[1] >= -90 &&
  pos[1] <= 90;

const isPositionArray = (v: unknown): boolean => Array.isArray(v) && v.length > 0 && v.every(isValidPosition);
const isPositionArrayList = (v: unknown): boolean => Array.isArray(v) && v.length > 0 && v.every(isPositionArray);

export const hasValidCoordinates = (geometry: Geometry | null): boolean => {
  // geometryがnullのフィーチャ（属性のみ）は従来どおり許容する
  if (geometry == null) return true;
  switch (geometry.type) {
    case 'Point':
      return isValidPosition(geometry.coordinates);
    case 'MultiPoint':
    case 'LineString':
      return isPositionArray(geometry.coordinates);
    case 'MultiLineString':
    case 'Polygon':
      return isPositionArrayList(geometry.coordinates);
    case 'MultiPolygon':
      return (
        Array.isArray(geometry.coordinates) &&
        geometry.coordinates.length > 0 &&
        geometry.coordinates.every(isPositionArrayList)
      );
    default:
      return false;
  }
};

// 3番目の値は標高（GeoJSON・KMLとも）。latlonToLatLonObject は2次元しか扱わないため、ここで補う。
// 0 は戻さない: Google Earth の KML や QGIS 等の GeoJSON は標高が無くても常に 0 を出すため、
// 全点に「標高0m」が付いてしまう（海抜0mの実測値が落ちるのは許容する）
const positionToLocation = (position: Position): LocationType => {
  const altitude = position[2];
  return typeof altitude === 'number' && Number.isFinite(altitude) && altitude !== 0
    ? { ...latlonToLatLonObject(position), altitude }
    : latlonToLatLonObject(position);
};

const flattenGeometryCollection = (collection: GeometryCollection): Geometry[] =>
  (Array.isArray(collection.geometries) ? collection.geometries : []).flatMap((geometry) =>
    geometry !== null && typeof geometry === 'object' && geometry.type === 'GeometryCollection'
      ? flattenGeometryCollection(geometry)
      : [geometry]
  );

// togeojson は KML の MultiGeometry を（同種の要素だけでも）常に GeometryCollection にする。
// 取り込みは単一型のジオメトリが前提で、そのままだと属性ごと黙って捨てられるため、
// 構成要素ごとに属性を複製した Feature に分ける（1つの地物が複数のレコードになる）
export const splitGeometryCollections = (
  geojson: FeatureCollection<Geometry | null, GeoJsonProperties>
): FeatureCollection<Geometry | null, GeoJsonProperties> => {
  if (geojson === null || typeof geojson !== 'object' || !Array.isArray(geojson.features)) return geojson;
  const features = geojson.features.flatMap((feature) => {
    if (feature === null || typeof feature !== 'object' || feature.geometry?.type !== 'GeometryCollection') {
      return [feature];
    }
    const geometries = flattenGeometryCollection(feature.geometry);
    // 空の GeometryCollection は分けようがないので、そのまま残して「取り込めなかった件数」に数えさせる
    if (geometries.length === 0) return [feature];
    return geometries.map((geometry) => ({
      ...feature,
      properties: feature.properties === null ? null : { ...feature.properties },
      geometry,
    }));
  });
  return { ...geojson, features };
};

// togeojson が KML の Style から作るプロパティ（ExtendedData とは別物で、利用者の項目ではない）
const KML_STYLE_PROPERTY_KEYS = new Set([
  'styleUrl',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'fill',
  'fill-opacity',
  'icon',
  'icon-color',
  'icon-opacity',
  'icon-scale',
  'icon-heading',
  'icon-offset',
  'icon-offset-units',
  'label-color',
  'label-opacity',
  'label-scale',
]);

/**
 * togeojson で変換した KML を取り込める形にそろえる（KML/KMZ の取り込みでだけ使う）。
 * - MultiGeometry（GeometryCollection）を構成要素ごとの Feature に分ける
 * - スタイル由来のプロパティを除き、項目が name/description/ExtendedData だけになるようにする
 *   （.geojson の simplestyle の stroke/fill 等は利用者の属性でありうるため、GeoJSON には適用しない）
 */
export const normalizeKmlGeoJson = (
  geojson: FeatureCollection<Geometry | null, GeoJsonProperties>
): FeatureCollection<Geometry | null, GeoJsonProperties> => {
  const split = splitGeometryCollections(geojson);
  if (split === null || typeof split !== 'object' || !Array.isArray(split.features)) return split;
  return {
    ...split,
    features: split.features.map((feature) =>
      feature === null || typeof feature !== 'object' || feature.properties === null || feature.properties === undefined
        ? feature
        : {
            ...feature,
            properties: Object.fromEntries(
              Object.entries(feature.properties).filter(([key]) => !KML_STYLE_PROPERTY_KEYS.has(key))
            ),
          }
    ),
  };
};

export const geoJson2Data = (
  geojson: FeatureCollection<Geometry | null, GeoJsonProperties>,
  layer: LayerType,
  type: GeoJsonFeatureType,
  userId: string | undefined,
  displayName: string | null,
  options: GeoJson2DataOptions = {}
) => {
  try {
    let importedData: RecordType[] = [];

    if (typeof geojson !== 'object' || geojson === null) return undefined;
    const crsCheck = checkGeoJsonCrs(geojson);
    if (!crsCheck.ok) {
      return undefined;
    }
    // featuresが配列でないファイルは取り込めない
    if (!Array.isArray(geojson.features)) {
      return undefined;
    }
    const features = crsCheck.swapAxes
      ? geojson.features.map((feature) =>
          feature === null || typeof feature !== 'object'
            ? feature
            : { ...feature, geometry: swapGeometryAxes(feature.geometry) ?? null }
        )
      : geojson.features;
    // 座標が数値でない、範囲外などの壊れたフィーチャは取り込まない。
    // 取り込むと緯度経度がNaNや(0,0)になり、地図がアフリカ沖へ飛ぶなどの実害が出る。
    const validFeatures = features.filter(
      (feature) => feature != null && typeof feature === 'object' && hasValidCoordinates(feature.geometry ?? null)
    );
    const ids = new RecordIdAssigner(options.regenerateIds === true);
    const createBase = (feature: Feature<Geometry | null>) => createRecordBase(userId, displayName, feature, ids);
    switch (type) {
      case 'POINT':
        importedData = validFeatures
          .filter(
            (feature): feature is Feature<Point> => feature.geometry === null || feature.geometry.type === 'Point'
          )
          .map((feature) => {
            return {
              ...createBase(feature),
              coords:
                feature.geometry === null
                  ? undefined
                  : restoreGnssCoords(positionToLocation(feature.geometry.coordinates), feature),
              field: { ...createFields(layer.field, feature), ...createGroupField(feature) },
            };
          });
        break;
      case 'MULTIPOINT':
        importedData = validFeatures
          .filter(
            (feature): feature is Feature<MultiPoint> =>
              feature.geometry === null || feature.geometry.type === 'MultiPoint'
          )
          .map((feature) => {
            if (feature.geometry === null) {
              return {
                ...createBase(feature),
                coords: undefined,
                field: createFields(layer.field, feature),
              };
            } else {
              return feature.geometry.coordinates.map((partCoords) => ({
                ...createBase(feature),
                coords: feature.geometry === null ? undefined : positionToLocation(partCoords),
                field: createFields(layer.field, feature),
              }));
            }
          })
          .flat();
        break;
      case 'LINE':
        importedData = mapFeaturesSkippingInvalid(
          validFeatures.filter(
            // 1点のLINEレコード（マップメモ・飛翔図のスタンプ等）は書き出しでPointになるため、1点の線として受け入れる。
            // 位置なしレコードは書き出しでnullになる。どちらも自前の書き出し由来に限る
            // （KMLは全タイプで走査するため、外部のPoint・ジオメトリ無しがPOINTレイヤと重複して入る）
            (feature): feature is Feature<LineString | Point | null> =>
              feature.geometry === null || feature.geometry.type === 'Point'
                ? isEcorisMapExportFeature(feature)
                : feature.geometry.type === 'LineString'
          ),
          (feature) => ({
            ...createBase(feature),
            ...createGeometryFromLineStringGeoJson(
              feature.geometry === null
                ? undefined
                : feature.geometry.type === 'Point'
                ? [feature.geometry.coordinates]
                : feature.geometry.coordinates
            ),
            field: createLineOrPolygonFields(layer.field, feature),
          })
        );
        break;
      case 'MULTILINE':
        importedData = validFeatures
          .filter(
            (feature): feature is Feature<MultiLineString> =>
              feature.geometry === null || feature.geometry.type === 'MultiLineString'
          )
          .map((feature) => {
            if (feature.geometry === null) {
              return {
                ...createBase(feature),
                coords: undefined,
                field: createLineOrPolygonFields(layer.field, feature),
              };
            } else {
              return feature.geometry.coordinates.map((partCoords) => ({
                ...createBase(feature),
                ...createGeometryFromLineStringGeoJson(partCoords),
                field: createLineOrPolygonFields(layer.field, feature),
              }));
            }
          })
          .flat();
        break;

      case 'POLYGON':
        importedData = mapFeaturesSkippingInvalid(
          validFeatures.filter(
            // 位置なしレコード（null）は自前の書き出し由来に限って残す（理由はLINEと同じ）
            (feature): feature is Feature<Polygon | null> =>
              feature.geometry === null ? isEcorisMapExportFeature(feature) : feature.geometry.type === 'Polygon'
          ),
          (feature) => ({
            ...createBase(feature),
            ...createGeometryFromPolygonGeoJson(
              feature.geometry === null ? undefined : feature.geometry.coordinates,
              options.simplifyPolygons === true
            ),
            field: createLineOrPolygonFields(layer.field, feature),
          })
        );
        break;
      case 'MULTIPOLYGON':
        importedData = validFeatures
          .filter(
            (feature): feature is Feature<MultiPolygon> =>
              feature.geometry === null || feature.geometry.type === 'MultiPolygon'
          )
          .map((feature) => {
            if (feature.geometry === null) {
              return {
                ...createBase(feature),
                coords: undefined,
                field: createLineOrPolygonFields(layer.field, feature),
              };
            } else {
              return feature.geometry.coordinates.map((partCoords) => ({
                ...createBase(feature),
                ...createGeometryFromPolygonGeoJson(partCoords, options.simplifyPolygons === true),
                field: createLineOrPolygonFields(layer.field, feature),
              }));
            }
          })
          .flat();
        break;
    }
    return ids.remapGroups(importedData);
  } catch (e) {
    //console.log(e);
    return undefined;
  }
};

// 先頭がこれらの文字だとExcel/Sheetsが数式として解釈する（フォーミュラインジェクション）
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
// -3.5 のような負数まで無害化するとExcelで数値として扱えなくなるため、数値は対象外にする
const isNumericValue = (value: string) => value.trim() !== '' && Number.isFinite(Number(value));

/**
 * 先頭に ' を付けて書き出す値。数式になりうる値に加え、取り込み時に unguardCSVValue が ' を外す形
 * （利用者が入力した "'=A1" など）にも付ける。こうすると書き出し→取り込みで必ず元の値に戻る
 */
const needsFormulaGuard = (value: string): boolean =>
  (FORMULA_TRIGGER.test(value) && !isNumericValue(value)) ||
  (value.startsWith("'") && needsFormulaGuard(value.slice(1)));

export const escapeCSVValue = (value: unknown): string => {
  const str = value === null || value === undefined ? '' : String(value);
  const guarded = needsFormulaGuard(str) ? `'${str}` : str;
  return `"${guarded.replace(/"/g, '""')}"`;
};

const MAP_MEMO_EXPORT_KEYS = ['_group', '_strokeWidth', '_strokeColor', '_strokeStyle', '_stamp', '_zoom', '_visible'];

// 既存の書き出し（ヘッダは素の列名）と同じ見た目を保つため、区切り・引用符・改行・数式になりうる名前だけをエスケープする
const escapeCSVHeader = (name: string): string =>
  /[",\r\n]/.test(name) || needsFormulaGuard(name) || name !== name.trim() ? escapeCSVValue(name) : name;

const GNSS_EXPORT_KEYS = [
  '_gnssFix',
  '_accuracy',
  '_altitude',
  '_ellipsoidHeight',
  '_satellites',
  '_hdop',
  '_diffAge',
  '_averaged',
] as const;

/** 外部GNSS受信機で記録したポイントがあるか（あれば測位情報の列を書き出す） */
const hasGnssPoints = (dataSet: RecordType[], type: FeatureType | GeoJsonFeatureType) =>
  type === 'POINT' && dataSet.some((d) => isLocationType(d.coords) && d.coords.gnss !== undefined);

/** 測位品質・精度・標高などの書き出し用の値。受信機で測っていない点は空にする */
export const gnssExportProperties = (coords: RecordType['coords']): Record<(typeof GNSS_EXPORT_KEYS)[number], string | number> => {
  const gnss = isLocationType(coords) ? coords.gnss : undefined;
  if (!isLocationType(coords) || gnss === undefined) {
    return {
      _gnssFix: '',
      _accuracy: '',
      _altitude: '',
      _ellipsoidHeight: '',
      _satellites: '',
      _hdop: '',
      _diffAge: '',
      _averaged: '',
    };
  }
  return {
    _gnssFix: fixQualityLabel(gnss.fixQuality),
    _accuracy: typeof coords.accuracy === 'number' ? Number(coords.accuracy.toFixed(3)) : '',
    _altitude: typeof coords.altitude === 'number' ? Number(coords.altitude.toFixed(3)) : '',
    _ellipsoidHeight: typeof gnss.ellipsoidHeight === 'number' ? Number(gnss.ellipsoidHeight.toFixed(3)) : '',
    _satellites: gnss.satellites ?? '',
    _hdop: gnss.hdop ?? '',
    _diffAge: gnss.diffAge ?? '',
    _averaged: gnss.averagedCount ?? '',
  };
};

export const generateCSV = (dataSet: RecordType[], field: LayerType['field'], type: FeatureType) => {
  const isMapMemoLayer = dataSet.some((d) => d.field._strokeColor !== undefined);
  const withGnss = hasGnssPoints(dataSet, type);

  let header = field.map((f) => escapeCSVHeader(f.name)).join(',');
  header = 'displayName' + ',' + header;
  if (isMapMemoLayer) {
    header = header + ',' + '_id' + ',' + MAP_MEMO_EXPORT_KEYS.join(',') + ',' + '_qgisColor';
  }
  if (withGnss) {
    header = header + ',' + GNSS_EXPORT_KEYS.join(',');
  }
  header = header + ',' + 'geometry';

  const properties = dataSet.map((record) => {
    let fieldCSV = field
      .map(({ name }) => {
        const fieldValue = record.field[name];
        if (isPhotoField(fieldValue)) {
          return escapeCSVValue(fieldValue.map((p) => p.name).join(','));
        } else {
          return escapeCSVValue(fieldValue);
        }
      })
      .join(',');

    fieldCSV = escapeCSVValue(record.displayName === null ? '' : record.displayName) + ',' + fieldCSV;
    if (isMapMemoLayer) {
      // _strokeColorのrgba(0,0,0,1)のようにカンマを含む値があるため必ずクォートする
      const mapMemoProperties = MAP_MEMO_EXPORT_KEYS.map((name) => escapeCSVValue(record.field[name] ?? '')).join(',');
      const id = escapeCSVValue(record.id);
      const qgisColor = escapeCSVValue(
        record.field._strokeColor ? rgbaString2qgis(record.field._strokeColor as string) : ''
      );
      fieldCSV = fieldCSV + ',' + id + ',' + mapMemoProperties + ',' + qgisColor;
    }
    if (withGnss) {
      const gnss = gnssExportProperties(record.coords);
      fieldCSV = fieldCSV + ',' + GNSS_EXPORT_KEYS.map((key) => escapeCSVValue(gnss[key])).join(',');
    }
    return fieldCSV;
  });

  let geometries: string[];
  switch (type) {
    case 'NONE':
      geometries = dataSet.map(() => '');
      break;
    case 'POINT':
      geometries = dataSet.map(({ coords }) => {
        if (isLocationType(coords)) {
          return `"POINT(${coords.longitude} ${coords.latitude})"`;
        } else {
          return '';
        }
      });
      break;
    case 'LINE':
      geometries = dataSet.map(({ coords }) => {
        if (isLocationTypeArray(coords)) {
          if (coords.length === 1) {
            //MapMemoのSTAMPの場合
            return `"POINT(${coords[0].longitude} ${coords[0].latitude})"`;
          }
          const linestring = coords.map((coord) => `${coord.longitude} ${coord.latitude}`).join(',');
          return `"LINESTRING(${linestring})"`;
        } else {
          return '';
        }
      });
      break;
    case 'POLYGON':
      geometries = dataSet.map(({ coords, holes }) => {
        if (isLocationTypeArray(coords)) {
          // 穴なしで "((外周),)" のように末尾カンマを付けると不正なWKTになるため、環を並べてから連結する
          const rings = [coords, ...(holes !== undefined ? (Object.values(holes) as LocationType[][]) : [])].map(
            (ring) => `(${ring.map((coord) => `${coord.longitude} ${coord.latitude}`).join(',')})`
          );
          return `"POLYGON(${rings.join(',')})"`;
        } else {
          return '';
        }
      });
      break;
  }
  const csv =
    '\ufeff' +
    header +
    String.fromCharCode(10) +
    properties.map((property, i) => property + ',' + geometries[i]).join(String.fromCharCode(10));
  return csv;
};

const generateDescription = (record: RecordType, field: FieldType[]) => {
  const userInfo = record.displayName ? `User: ${record.displayName}\n` : '';

  const fieldInfo = field.map(({ name }) => `${name}: ${kmlFieldValue(record.field[name])}`).join('\n');

  return userInfo + fieldInfo;
};

// 後から追加した項目などは値が undefined/null のことがあり、そのまま文字列にすると "undefined"/"null" と出るため空にする
const kmlFieldValue = (fieldValue: unknown): string => {
  if (isPhotoField(fieldValue)) return fieldValue.map((p) => p.name).join(',');
  if (fieldValue === undefined || fieldValue === null) return '';
  return String(fieldValue);
};

// description は1つの文字列なので、取り込み直すと項目が戻らない。項目ごとの値を ExtendedData にも出す
// （KML に型は無いため、取り込みで戻るのは文字列）
const appendKmlExtendedData = (placemark: xmlBuilder.XMLElement, record: RecordType, field: FieldType[]) => {
  if (field.length === 0) return;
  const extendedData = placemark.ele('ExtendedData');
  field.forEach(({ name }) => {
    extendedData.ele('Data', { name }).ele('value', kmlFieldValue(record.field[name]));
  });
};

const kmlCoordinates = (coords: LocationType[]) =>
  coords.map((coord) => `${coord.longitude},${coord.latitude}`).join(' ');

// 写真ファイル名を img の属性値に入れるため、HTML として意味を持つ文字をエスケープする。
// " で属性が閉じて任意の属性を注入されるのを防ぎ、> も消えることで CDATA の終端 "]]>" が現れなくなる
const escapeHtmlAttribute = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => HTML_ATTRIBUTE_ESCAPES[char]);
const HTML_ATTRIBUTE_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// XML 1.0で使えない制御文字(\u000B等)や孤立サロゲートが1文字でもあるとxmlbuilderが例外を投げ、
// エクスポート全体が失敗する。外部ファイル由来の値に混ざりうるため、書き出し時に取り除く（< & 等のエスケープは従来どおり）
const XML_INVALID_CHAR_REPLACEMENT = '';

const rgbaToKmlColor = (rgba: string, transparency: boolean): string => {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d*\.?\d+))?\)/);
  if (!match) return transparency ? '00ffffff' : 'ffffffff';

  const r = parseInt(match[1], 10).toString(16).padStart(2, '0');
  const g = parseInt(match[2], 10).toString(16).padStart(2, '0');
  const b = parseInt(match[3], 10).toString(16).padStart(2, '0');
  const a = transparency
    ? '00'
    : match[4]
      ? Math.round(parseFloat(match[4]) * 255)
          .toString(16)
          .padStart(2, '0')
      : 'ff';

  return `${a}${b}${g}${r}`;
};

export const generateKML = (data: RecordType[], layer: LayerType) => {
  const kml = xmlBuilder
    .create('kml', {
      encoding: 'UTF-8',
      invalidCharReplacement: XML_INVALID_CHAR_REPLACEMENT,
    })
    .att('xmlns', 'http://www.opengis.net/kml/2.2');

  const document = kml.ele('Document');

  const addStyleToPlacemark = (placemark: any, feature: RecordType) => {
    const rgbaColor = getColor(layer, feature);
    const transparency = Boolean(layer.colorStyle.transparency);
    const kmlColor = rgbaToKmlColor(rgbaColor, false);
    const lineWidth = getLineWidth(layer, feature);
    const style = placemark.ele('Style');

    switch (layer.type) {
      case 'POINT':
        const iconStyle = style.ele('IconStyle');
        iconStyle.ele('color', kmlColor);
        const icon = iconStyle.ele('Icon');
        icon.ele('href', 'http://maps.google.com/mapfiles/kml/paddle/wht-blank.png');
        break;
      case 'LINE':
        const lineStyle = style.ele('LineStyle');
        lineStyle.ele('color', kmlColor);
        lineStyle.ele('width', lineWidth);
        break;
      case 'POLYGON':
        const polyStyle = style.ele('PolyStyle');
        polyStyle.ele('color', rgbaToKmlColor(rgbaColor, transparency));
        polyStyle.ele('fill', '1');
        polyStyle.ele('outline', '1');
        // Add LineStyle for polygon outline
        const polygonLineStyle = style.ele('LineStyle');
        polygonLineStyle.ele('color', kmlColor); // Outline is always visible
        polygonLineStyle.ele('width', lineWidth);
        break;
    }
  };

  switch (layer.type) {
    case 'POINT':
      data.forEach((point) => {
        if (isLocationType(point.coords)) {
          const placemark = document.ele('Placemark');
          addStyleToPlacemark(placemark, point);
          const pointElement = placemark.ele('Point');
          const { longitude, latitude, altitude } = point.coords;
          pointElement.ele(
            'coordinates',
            typeof altitude === 'number' && Number.isFinite(altitude)
              ? `${longitude},${latitude},${altitude}`
              : `${longitude},${latitude}`
          );
          placemark.ele('name', generateLabel(layer, point));
          placemark.ele('description', generateDescription(point, layer.field));
          appendKmlExtendedData(placemark, point, layer.field);
        }
      });
      break;
    case 'LINE':
      data.forEach((line) => {
        if (isLocationTypeArray(line.coords)) {
          const placemark = document.ele('Placemark');
          addStyleToPlacemark(placemark, line);
          const lineString = placemark.ele('LineString');
          lineString.ele('coordinates', kmlCoordinates(line.coords));
          placemark.ele('name', generateLabel(layer, line));
          placemark.ele('description', generateDescription(line, layer.field));
          appendKmlExtendedData(placemark, line, layer.field);
        }
      });
      break;
    case 'POLYGON':
      data.forEach((polygon) => {
        if (isLocationTypeArray(polygon.coords)) {
          const placemark = document.ele('Placemark');
          addStyleToPlacemark(placemark, polygon);
          const polygonElement = placemark.ele('Polygon');
          const outerBoundary = polygonElement.ele('outerBoundaryIs');
          const linearRing = outerBoundary.ele('LinearRing');
          linearRing.ele('coordinates', kmlCoordinates(polygon.coords));
          // 外部から取り込んだポリゴンの穴を、書き出しで黙って埋めないようにする
          Object.values(polygon.holes ?? {}).forEach((hole) => {
            if (!isLocationTypeArray(hole) || hole.length === 0) return;
            polygonElement.ele('innerBoundaryIs').ele('LinearRing').ele('coordinates', kmlCoordinates(hole));
          });
          placemark.ele('name', generateLabel(layer, polygon));
          placemark.ele('description', generateDescription(polygon, layer.field));
          appendKmlExtendedData(placemark, polygon, layer.field);
        }
      });
      break;
  }

  return kml.end({
    allowEmpty: true,
    indent: '  ',
    newline: '\n',
    pretty: true,
  });
};
// 軌跡の点をtrkptとして書き出す。データ一覧（generateGPX）と軌跡サマリー（generateTrackGPXWithPhotos）の
// 両方から使い、点ごとの属性（標高・時刻・ジオイド高）が出口によって食い違わないようにする
const appendTrackPoints = (trkseg: xmlBuilder.XMLElement, coords: LocationType[]) => {
  coords.forEach((coord) => {
    const trkpt = trkseg.ele('trkpt').att('lat', coord.latitude).att('lon', coord.longitude);
    // GPX 1.1スキーマの要素順: ele → time → magvar → geoidheight。時刻はUTC（ISO形式）
    if (coord.altitude !== null && coord.altitude !== undefined) {
      trkpt.ele('ele', coord.altitude);
    }
    // 0（1970-01-01T00:00:00Z）も時刻なので真偽値では判定しない。NaN は toISOString が例外になるので除く
    if (typeof coord.timestamp === 'number' && Number.isFinite(coord.timestamp)) {
      trkpt.ele('time', new Date(coord.timestamp).toISOString());
    }
    // 外部GNSS受信機の点は、GPX 1.1のgeoidheight（楕円体からのジオイド高。GGAと同じ定義）を残す。
    // 楕円体高 = ele + geoidheight で復元できる
    if (typeof coord.ellipsoidHeight === 'number' && typeof coord.altitude === 'number') {
      trkpt.ele('geoidheight', Number((coord.ellipsoidHeight - coord.altitude).toFixed(3)));
    }
    if (typeof coord.fixQuality === 'number') {
      appendGnssExtension(trkpt, { fixQuality: coord.fixQuality });
    }
  });
};

// GPX 1.1 の <fix> は none/2d/3d/dgps/pps しか無く RTK の FIX と FLOAT を区別できないため、
// GGAの測位品質は独自名前空間の <extensions> に残す（スキーマ上 extensions は子要素の最後）
const appendGnssExtension = (
  parent: xmlBuilder.XMLElement,
  values: { fixQuality: number; averagedCount?: number }
) => {
  const gnss = parent.ele('extensions').ele('gnss').att('xmlns', GPX_GNSS_NAMESPACE);
  gnss.ele('fixQuality', values.fixQuality);
  if (typeof values.averagedCount === 'number') {
    gnss.ele('averagedCount', values.averagedCount);
  }
};

// TrackSummaryからのエクスポート用: 軌跡(trk)と軌跡上の写真(wpt)を1つのGPXにまとめる。
// GPX 1.1スキーマの正規順=wpt→trkで出力する
export interface TrackExportPhoto {
  filename: string; // wptのname・link href（zip内の写真ファイル名と一致させる）
  timestamp: number; // 撮影時刻（ms）
  latitude: number; // 軌跡上の補間位置
  longitude: number;
}

export const generateTrackGPXWithPhotos = (
  coords: LocationType[],
  trackName: string,
  photos: TrackExportPhoto[] = []
): string => {
  const gpx = xmlBuilder
    .create('gpx', {
      encoding: 'UTF-8',
      invalidCharReplacement: XML_INVALID_CHAR_REPLACEMENT,
    })
    .att('creator', 'ecoris')
    .att('version', '1.1');

  // GPX 1.1の要素順はwpt*→trk*
  photos.forEach((photo) => {
    const wpt = gpx.ele('wpt').att('lat', photo.latitude).att('lon', photo.longitude);
    wpt.ele('time', new Date(photo.timestamp).toISOString());
    wpt.ele('name', photo.filename);
    wpt.ele('link').att('href', photo.filename);
  });

  const trk = gpx.ele('trk');
  trk.ele('name', trackName);
  appendTrackPoints(trk.ele('trkseg'), coords);

  return gpx.end({
    allowEmpty: true,
    indent: '  ',
    newline: '\n',
    pretty: true,
  });
};

// 写真ポイントをCSV/GeoJSON/KMLでも出力するための擬似レイヤ・レコード。
// 既存のgenerateCSV/generateGeoJson/generateKMLをそのまま使えるようにする
// （軌跡本体はGPXのtrkとして出力するため、ここでは写真だけを扱う）
// Google Earth用のKML（KMZのdoc.kmlにもなる）。軌跡のラインと写真ポイントを1つにまとめる。
// 写真のdescriptionはimgタグをCDATAで囲い、吹き出しに写真を表示する。
// 写真はKMLと同じ階層にある前提の相対参照（KMZに同梱するか、解凍して同じフォルダに置く）
export const generateTrackKML = (
  coords: LocationType[],
  trackName: string,
  photos: TrackExportPhoto[] = [],
  photoFolderName = 'Photos'
): string => {
  const kml = xmlBuilder
    .create('kml', {
      encoding: 'UTF-8',
      invalidCharReplacement: XML_INVALID_CHAR_REPLACEMENT,
    })
    .att('xmlns', 'http://www.opengis.net/kml/2.2');

  const document = kml.ele('Document');
  document.ele('name', trackName);

  const trackPlacemark = document.ele('Placemark');
  trackPlacemark.ele('name', trackName);
  const lineStyle = trackPlacemark.ele('Style').ele('LineStyle');
  // KMLの色はaabbggrr順
  lineStyle.ele('color', 'ffff0000');
  lineStyle.ele('width', 4);
  const lineString = trackPlacemark.ele('LineString');
  // 地形に沿わせて表示する（GPSの標高は誤差が大きく、絶対高度だと浮いて見えるため）
  lineString.ele('tessellate', 1);
  lineString.ele(
    'coordinates',
    coords
      .map((coord) =>
        coord.altitude !== null && coord.altitude !== undefined
          ? `${coord.longitude},${coord.latitude},${coord.altitude}`
          : `${coord.longitude},${coord.latitude}`
      )
      .join(' ')
  );

  if (photos.length > 0) {
    // Google Earthのサイドバーで軌跡と写真を分けて扱えるようフォルダにまとめる
    const folder = document.ele('Folder');
    folder.ele('name', photoFolderName);
    // KMZに同梱するファイル名（generateKMZFile と同じ関数・同じ並び順で決める）。不正な文字や同名の写真でも参照が一致するようにする
    const entryNames = kmzPhotoEntryNames(photos.map((p) => p.filename));
    photos.forEach((photo, photoIndex) => {
      const placemark = folder.ele('Placemark');
      placemark.ele('name', photo.filename);
      // CDATAで囲うことでGoogle EarthがHTMLとして解釈する
      placemark
        .ele('description')
        .cdata(
          `<img src="${escapeHtmlAttribute(entryNames[photoIndex])}" width="480" /><br/>${dayjs(photo.timestamp).format('YYYY-MM-DD HH:mm:ss')}`
        );
      // タイムスライダーで撮影時刻順に辿れるようにする
      placemark.ele('TimeStamp').ele('when', new Date(photo.timestamp).toISOString());
      const iconStyle = placemark.ele('Style').ele('IconStyle');
      iconStyle.ele('Icon').ele('href', 'http://maps.google.com/mapfiles/kml/shapes/camera.png');
      placemark.ele('Point').ele('coordinates', `${photo.longitude},${photo.latitude}`);
    });
  }

  return kml.end({
    allowEmpty: true,
    indent: '  ',
    newline: '\n',
    pretty: true,
  });
};

// 軌跡本体をGeoJSONで出力するための擬似レイヤ・レコード（写真ポイントと同じ考え方）
export const trackExportLayer = (layerName: string): LayerType => ({
  id: 'track_export',
  name: layerName,
  type: 'LINE',
  permission: 'PRIVATE',
  colorStyle: {
    colorType: 'SINGLE',
    transparency: 0.2,
    color: COLOR.TRACK,
    fieldName: 'name',
    customFieldValue: '',
    colorRamp: 'RANDOM',
    colorList: [],
    lineWidth: 4,
  },
  label: 'name',
  visible: true,
  active: false,
  field: [
    { id: ulid(), name: 'name', format: 'STRING' },
    { id: ulid(), name: 'time', format: 'DATETIME' },
  ],
});

export const trackExportRecords = (coords: LocationType[], trackName: string): RecordType[] => {
  const startTime = coords.find((c) => c.timestamp !== undefined)?.timestamp;
  return [
    {
      id: ulid(),
      userId: undefined,
      displayName: null,
      visible: true,
      redraw: false,
      coords,
      field: { name: trackName, time: startTime === undefined ? '' : new Date(startTime).toISOString() },
    },
  ];
};

export const trackPhotoExportLayer = (layerName: string): LayerType => ({
  id: 'track_photo_export',
  name: layerName,
  type: 'POINT',
  permission: 'PRIVATE',
  colorStyle: {
    colorType: 'SINGLE',
    transparency: 0.2,
    color: COLOR.RED,
    fieldName: 'name',
    customFieldValue: '',
    colorRamp: 'RANDOM',
    colorList: [],
  },
  label: 'name',
  visible: true,
  active: false,
  field: [
    { id: ulid(), name: 'name', format: 'STRING' },
    { id: ulid(), name: 'time', format: 'DATETIME' },
  ],
});

export const trackPhotoExportRecords = (photos: TrackExportPhoto[]): RecordType[] =>
  photos.map((photo) => ({
    id: ulid(),
    userId: undefined,
    displayName: null,
    visible: true,
    redraw: false,
    coords: { latitude: photo.latitude, longitude: photo.longitude },
    // nameはzip内の写真ファイル名。CSV/GeoJSON/KMLから写真を参照する手がかりになる
    field: { name: photo.filename, time: new Date(photo.timestamp).toISOString() },
  }));

export const generateGPX = (data: RecordType[], type: FeatureType) => {
  const gpx = xmlBuilder
    .create('gpx', {
      encoding: 'UTF-8',
      invalidCharReplacement: XML_INVALID_CHAR_REPLACEMENT,
    })
    .att('creator', 'ecoris')
    .att('version', '1.1');

  // Generate description with all fields except name, time, cmt
  const generateGPXDescription = (record: RecordType) => {
    const descriptions: string[] = [];
    // GPXから取り込んだ desc はそのまま書き戻す。「desc: …」と包むと書き出すたびに入れ子になって増えるため
    const importedDesc = typeof record.field[GPX_DESC_FIELD] === 'string' ? (record.field[GPX_DESC_FIELD] as string) : '';

    // Add user info first if available（取り込んだ desc に同じ行があれば重ねない）
    const userLine = record.displayName ? `User: ${record.displayName}` : '';
    if (userLine !== '' && !importedDesc.split(/\r?\n/).includes(userLine)) {
      descriptions.push(userLine);
    }

    // Add all other fields except name, time, cmt
    Object.entries(record.field).forEach(([fieldName, fieldValue]) => {
      // 文字列の desc は取り込んだ説明文として下でそのまま書き戻す。文字列でない desc（他レイヤの数値項目など）は通常の項目として扱う
      if (fieldName !== 'name' && fieldName !== 'time' && fieldName !== 'cmt' && !(fieldName === GPX_DESC_FIELD && typeof record.field[fieldName] === 'string')) {
        if (isPhotoField(fieldValue)) {
          descriptions.push(`${fieldName}: ${fieldValue.map((p) => p.name).join(',')}`);
        } else if (fieldValue !== undefined && fieldValue !== '') {
          descriptions.push(`${fieldName}: ${fieldValue}`);
        }
      }
    });
    if (importedDesc !== '') descriptions.push(importedDesc);

    return descriptions.join('\n');
  };

  switch (type) {
    case 'POINT':
      data.forEach((point) => {
        if (isLocationType(point.coords)) {
          const time =
            point.field.time === undefined || point.field.time === '' ? undefined : dayjs(point.field.time as string);
          const wpt = gpx.ele('wpt').att('lat', point.coords.latitude).att('lon', point.coords.longitude);

          // GPX 1.1スキーマの要素順: ele → time → name → cmt → desc
          if (point.coords.altitude !== null && point.coords.altitude !== undefined) {
            wpt.ele('ele', point.coords.altitude);
          }
          wpt.ele('time', time === undefined ? undefined : time.isValid() ? time.toISOString() : undefined);
          const gnss = point.coords.gnss;
          // 楕円体高 = ele + geoidheight で復元できるようにする（軌跡の点と同じ定義）
          if (gnss && typeof gnss.ellipsoidHeight === 'number' && typeof point.coords.altitude === 'number') {
            wpt.ele('geoidheight', Number((gnss.ellipsoidHeight - point.coords.altitude).toFixed(3)));
          }
          wpt.ele('name', point.field.name);
          wpt.ele('cmt', point.field.cmt);
          // Add all other fields to description
          const desc = generateGPXDescription(point);
          if (desc) {
            wpt.ele('desc', desc);
          }
          // GPX 1.1スキーマの要素順: desc → … → sat → hdop → … → ageofdgpsdata → … → extensions
          if (gnss && typeof gnss.fixQuality === 'number') {
            if (typeof gnss.satellites === 'number') wpt.ele('sat', gnss.satellites);
            if (typeof gnss.hdop === 'number') wpt.ele('hdop', gnss.hdop);
            if (typeof gnss.diffAge === 'number') wpt.ele('ageofdgpsdata', gnss.diffAge);
            appendGnssExtension(wpt, { fixQuality: gnss.fixQuality, averagedCount: gnss.averagedCount });
          }
        }
      });
      break;
    case 'LINE':
      data.forEach((line, id) => {
        if (isLocationTypeArray(line.coords)) {
          const time =
            line.field.time === undefined || line.field.time === '' ? undefined : dayjs(line.field.time as string);
          const trk = gpx.ele('trk');
          trk.ele('name', line.field.name ?? id.toString());
          //console.log(dayjs(line.field.time ? (line.field.time as string) : 0));
          trk.ele('time', time === undefined ? undefined : time.isValid() ? time.toISOString() : undefined);
          trk.ele('cmt', line.field.cmt ?? '');
          // Add all other fields to description
          const desc = generateGPXDescription(line);
          if (desc) {
            trk.ele('desc', desc);
          }
          appendTrackPoints(trk.ele('trkseg'), line.coords);
        }
      });
      break;
  }

  // Close the `<gpx>` element and pretty format it
  return gpx.end({
    allowEmpty: true,
    indent: '  ',
    newline: '\n',
    pretty: true,
  });
};

export const isPhotoField = (value: any): value is PhotoType[] => {
  if (Array.isArray(value)) {
    if (value.length === 0) return true;
    if (value[0].thumbnail !== undefined) return true;
  }
  return false;
};

const generateProperties = (record: RecordType, field: LayerType['field'], permission?: LayerType['permission']) => {
  const properties = field
    .map(({ name }) => {
      const fieldValue = record.field[name];
      if (isPhotoField(fieldValue)) {
        const photoIds = fieldValue.map((p) => p.name).join(',');
        return { [name]: photoIds };
      } else {
        return { [name]: fieldValue };
      }
    })
    .reduce((obj, userObj) => Object.assign(obj, userObj), {});
  if (permission !== 'COMMON') {
    if ('displayName' in record) {
      properties.displayName === undefined
        ? (properties.displayName = record.displayName as string)
        : (properties.displayName_ = record.displayName as string);
    }
  }
  return properties;
};

export const generateGeoJson = (
  data: RecordType[] | RecordType[],
  field: LayerType['field'],
  type: GeoJsonFeatureType,
  layerName: string,
  permission?: LayerType['permission'],
  labelLayer?: LayerType
) => {
  //ラベル用(CENTROID/LINEEND)はネイティブと同じ文字列・色をWebでも出すため、整形済みの値を持たせる。
  //maplibreの式ではDATETIMEの整形や個別色の解決ができないので、ここでgenerateLabel/getColorを通す
  const labelProperties = (record: RecordType) =>
    labelLayer ? { _label: generateLabel(labelLayer, record), _labelColor: getColor(labelLayer, record) } : {};
  const isMapMemoLayer = data.some((d) => d.field._strokeColor !== undefined);
  const withGnss = hasGnssPoints(data, type);
  // 親子（_group）はマップメモ以外のレイヤでも使う。書き出さないと取り込み直したときに子が独立したレコードになる。
  // 親子の無いレイヤの出力は従来どおりにするため、使っているときだけ出す
  const withGroup = data.some((d) => typeof d.field._group === 'string' && d.field._group !== '');
  const groupProperties = (record: RecordType) => (withGroup ? { _group: record.field._group ?? '' } : {});

  const geojson = {
    type: 'FeatureCollection',
    name: layerName,
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
    },
  };
  let features;
  switch (type) {
    case 'POINT':
      features = data.map((record) => {
        const properties = generateProperties(record, field, permission);

        const feature = {
          type: 'Feature',
          properties: {
            ...properties,
            _visible: record.visible,
            _id: record.id,
            ...groupProperties(record),
            ...(withGnss && gnssExportProperties(record.coords)),
          },
          geometry: isLocationType(record.coords)
            ? {
                type: 'Point',
                coordinates: [record.coords.longitude, record.coords.latitude],
              }
            : null,
        };
        return feature;
      });
      break;
    case 'LINE':
      features = data.map((record) => {
        const properties = generateProperties(record, field, permission);
        const mapMemoProperties = isMapMemoLayer
          ? {
              _visible: record.visible,
              _id: record.id,
              _group: record.field._group ?? '',
              _strokeWidth: record.field._strokeWidth ?? '',
              _strokeColor: record.field._strokeColor ?? '',
              _strokeStyle: record.field._strokeStyle ?? '',
              _stamp: record.field._stamp ?? '',
              _zoom: record.field._zoom ?? '',
              _qgisColor: record.field._strokeColor ? rgbaString2qgis(record.field._strokeColor as string) : '',
            }
          : { _visible: record.visible, _id: record.id, ...groupProperties(record) };
        let geometry;
        if (isLocationTypeArray(record.coords)) {
          if (record.coords.length === 1) {
            //MapMemoのSTAMPの場合

            geometry = {
              type: 'Point',
              coordinates: [record.coords[0].longitude, record.coords[0].latitude],
            };
          } else {
            geometry = {
              type: 'LineString',
              coordinates: record.coords.map((coords) => [coords.longitude, coords.latitude]),
            };
          }
        } else {
          geometry = null;
        }
        const feature = {
          type: 'Feature',
          properties: {
            ...properties,
            ...mapMemoProperties,
          },
          geometry: geometry,
        };
        return feature;
      });
      break;

    case 'POLYGON':
      features = data.map((record) => {
        const properties = generateProperties(record, field, permission);
        //手書きの面も色分け「個別」で描けるよう、ラインと同じくストロークのスタイルを属性に載せる
        const mapMemoProperties = isMapMemoLayer
          ? {
              _visible: record.visible,
              _id: record.id,
              _group: record.field._group ?? '',
              _strokeWidth: record.field._strokeWidth ?? '',
              _strokeColor: record.field._strokeColor ?? '',
              _strokeStyle: record.field._strokeStyle ?? '',
              _stamp: record.field._stamp ?? '',
              _zoom: record.field._zoom ?? '',
              _qgisColor: record.field._strokeColor ? rgbaString2qgis(record.field._strokeColor as string) : '',
            }
          : { _visible: record.visible, _id: record.id, ...groupProperties(record) };
        let geometry;
        if (isLocationTypeArray(record.coords)) {
          const coordinates = record.coords.map((coords) => [coords.longitude, coords.latitude]);
          const holes = (record.holes !== undefined ? (Object.values(record.holes) as LocationType[][]) : []).map(
            (hole) => hole.map((coords) => [coords.longitude, coords.latitude])
          );
          geometry = {
            type: 'Polygon',
            coordinates: [coordinates, ...holes],
          };
        } else {
          geometry = null;
        }

        const feature = {
          type: 'Feature',
          properties: { ...properties, ...mapMemoProperties },
          geometry: geometry,
        };
        return feature;
      });
      break;
    case 'CENTROID':
      features = data.map((d) => {
        const properties = field
          .map(({ name }) => ({ [name]: d.field[name] }))
          .reduce((obj, userObj) => Object.assign(obj, userObj), {});
        const coordinates = d.centroid ? [d.centroid!.longitude, d.centroid!.latitude] : [];
        const feature = {
          type: 'Feature',
          properties: { ...properties, _visible: d.visible, _id: d.id, ...labelProperties(d) },
          geometry: {
            type: 'Point',
            coordinates: coordinates,
          },
        };
        return feature;
      });
      break;
    case 'LINEEND':
      features = data.map((d) => {
        const properties = field
          .map(({ name }) => ({ [name]: d.field[name] }))
          .reduce((obj, userObj) => Object.assign(obj, userObj), {});
        let geometry;
        if (isLocationTypeArray(d.coords)) {
          const coords = d.coords;
          const coordinates = coords[coords.length - 1];
          geometry = {
            type: 'Point',
            coordinates: [coordinates.longitude, coordinates.latitude],
          };
        } else {
          geometry = null;
        }
        const feature = {
          type: 'Feature',
          properties: { ...properties, _visible: d.visible, _id: d.id, ...labelProperties(d) },
          geometry: geometry,
        };
        return feature;
      });
      break;
  }
  return { ...geojson, features: features };
};

function createGeometryFromLineStringGeoJson(coordinates: Position[] | undefined) {
  if (coordinates === undefined) return { coords: undefined, centroid: undefined };
  const coords = coordinates.map((xy) => latlonToLatLonObject(xy));
  const centroid = calcLineMidPoint(coords);
  return { coords, centroid };
}

// 面積に応じた許容値で頂点を間引く（1ha未満で約0.1m、100km²超で約100mまで形が変わる）
function simplifyPolygonByArea(polygon: Feature<Polygon>): Feature<Polygon> {
  // ポリゴンの面積を計算（平方キロメートル単位）
  const polygonArea = area(polygon) / 1000000; // 平方メートルから平方キロメートルに変換

  // 面積に応じてtoleranceを動的に計算
  // 小さなポリゴン（< 0.01 km²）: 0.000001
  // 中程度のポリゴン（0.01 - 1 km²）: 0.00001
  // 大きなポリゴン（1 - 100 km²）: 0.0001
  // 非常に大きなポリゴン（> 100 km²）: 0.001
  let tolerance: number;
  if (polygonArea < 0.01) {
    tolerance = 0.000001;
  } else if (polygonArea < 1) {
    tolerance = 0.00001;
  } else if (polygonArea < 100) {
    tolerance = 0.0001;
  } else {
    tolerance = 0.001;
  }

  return simplify(polygon, {
    tolerance: tolerance,
    highQuality: true,
  });
}

function createGeometryFromPolygonGeoJson(coordinates: Position[][] | undefined, simplifyPolygon: boolean) {
  if (coordinates === undefined) return { coords: undefined, holes: undefined, centroid: undefined };
  const polygon = turf.polygon(coordinates);
  const simplified = simplifyPolygon ? simplifyPolygonByArea(polygon) : polygon;
  const coords = simplified.geometry.coordinates[0].map((xy) => latlonToLatLonObject(xy));
  const holes = simplified.geometry.coordinates
    .slice(1)
    .reduce((result, hole, index) => ({ ...result, [`hole${index}`]: hole.map((xy) => latlonToLatLonObject(xy)) }), {});
  const centroid = calcCentroid(coords);
  return { coords, holes, centroid };
}

export type GeoJson2DataOptions = {
  // 書き出し時の _id をレコードidに使わず振り直す。元のレイヤを残したまま同じZIPを別レイヤとして
  // 取り込むときなど、同じidのレコードが2つできてしまう場合に指定する（_group は振り直したidへ付け替える）
  regenerateIds?: boolean;
  // ポリゴンの頂点を面積に応じて間引く。測った形を黙って変えないよう既定では行わず、
  // 頂点が多いファイルで利用者が選んだときだけ指定する（countPolygonVertices と POLYGON_SIMPLIFY_CONFIRM_VERTICES）
  simplifyPolygons?: boolean;
};

// これを超える頂点数のポリゴンを含むファイルは、取り込み時に簡略化するかを利用者に確かめる（表示・編集が重くなるため）
export const POLYGON_SIMPLIFY_CONFIRM_VERTICES = 50000;

/** Polygon・MultiPolygon の全リング（穴を含む）の頂点数の合計。形が壊れたジオメトリは数えない */
export const countPolygonVertices = (geojson: FeatureCollection<Geometry | null, GeoJsonProperties>): number => {
  if (geojson === null || typeof geojson !== 'object' || !Array.isArray(geojson.features)) return 0;
  const countRings = (rings: unknown): number =>
    Array.isArray(rings) ? rings.reduce((sum: number, ring) => sum + (Array.isArray(ring) ? ring.length : 0), 0) : 0;
  return geojson.features.reduce((total, feature) => {
    const geometry = feature !== null && typeof feature === 'object' ? feature.geometry : null;
    if (geometry === null || typeof geometry !== 'object') return total;
    if (geometry.type === 'Polygon') return total + countRings(geometry.coordinates);
    if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
      return total + geometry.coordinates.reduce((sum: number, polygon) => sum + countRings(polygon), 0);
    }
    return total;
  }, 0);
};

// 外部ファイルの _id に極端に長い文字列が入っていてもidにしない（アプリのidはULIDの26文字）
const MAX_IMPORTED_RECORD_ID_LENGTH = 128;

/**
 * 取り込むレコードのidを決める。
 * 自前の書き出し（_id 付き）はそのidを使う。REFERENCE（主キー=_id）で他のレイヤから参照されているため、
 * idが変わると参照元が親を見失う。同じファイル内で重複した _id（MULTIのパート等）は新しいidにする。
 * 旧id→新idの対応を覚えておき、_group（親子）の参照を付け替える。
 */
class RecordIdAssigner {
  private readonly used = new Set<string>();
  private readonly oldToNew = new Map<string, string>();

  constructor(private readonly regenerate: boolean) {}

  assign(feature: Feature<Geometry | null>): string {
    const exportedId = isEcorisMapExportFeature(feature) ? String(featureProperties(feature)?._id) : undefined;
    const keep =
      !this.regenerate &&
      exportedId !== undefined &&
      exportedId.length <= MAX_IMPORTED_RECORD_ID_LENGTH &&
      !this.used.has(exportedId);
    const id = keep && exportedId !== undefined ? exportedId : ulid();
    this.used.add(id);
    if (exportedId !== undefined && !this.oldToNew.has(exportedId)) this.oldToNew.set(exportedId, id);
    return id;
  }

  remapGroups(records: RecordType[]): RecordType[] {
    records.forEach((record) => {
      const group = record.field._group;
      if (typeof group !== 'string' || group === '') return;
      const newId = this.oldToNew.get(group);
      if (newId !== undefined && newId !== group) record.field._group = newId;
    });
    return records;
  }
}

// properties がオブジェクトでないフィーチャー（null・欠落・壊れたファイル）は属性なしとして扱う
function featureProperties(feature: Feature<Geometry | null>): Record<string, unknown> | undefined {
  const properties: unknown = feature.properties;
  return typeof properties === 'object' && properties !== null && !Array.isArray(properties)
    ? (properties as Record<string, unknown>)
    : undefined;
}

// "constructor" や "__proto__" などの項目名でプロトタイプ上の値を拾わないよう、自前のプロパティだけを読む
function ownProperty(properties: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(properties, key) ? properties[key] : undefined;
}

function createRecordBase(
  userId: string | undefined,
  displayName: string | null,
  feature: Feature<Geometry | null>,
  ids: RecordIdAssigner
) {
  const properties = featureProperties(feature);
  return {
    id: ids.assign(feature),
    userId: userId,
    displayName: displayName,
    redraw: false,
    // 書き出しは _visible を出しているので、非表示にしていたレコードは非表示のまま戻す。
    // 外部ファイルの同名キーで黙って非表示にならないよう、自前の書き出しに限る
    visible:
      properties === undefined ||
      !isEcorisMapExportFeature(feature) ||
      ownProperty(properties, '_visible') !== false,
  };
}

const FIX_QUALITY_BY_LABEL = new Map<string, number>([
  ['FIX', FIX_QUALITY.RTK_FIX],
  ['FLOAT', FIX_QUALITY.RTK_FLOAT],
  ['DGPS', FIX_QUALITY.DGPS],
  ['NO FIX', FIX_QUALITY.INVALID],
  ['SINGLE', FIX_QUALITY.SINGLE],
]);

const finiteNumberOf = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * 外部GNSSで測ったポイントの書き出し（gnssExportProperties の _altitude/_gnssFix 等）を coords に戻す。
 * 項目ではないので layer.field からは拾えない。自前の書き出しに限る（外部ファイルの同名キーは属性として扱う）
 */
function restoreGnssCoords(coords: LocationType, feature: Feature<Geometry | null>): LocationType {
  const properties = featureProperties(feature);
  if (properties === undefined || !isEcorisMapExportFeature(feature)) return coords;
  const altitude = finiteNumberOf(ownProperty(properties, '_altitude'));
  const accuracy = finiteNumberOf(ownProperty(properties, '_accuracy'));
  const fixLabel = ownProperty(properties, '_gnssFix');
  const fixQuality = typeof fixLabel === 'string' ? FIX_QUALITY_BY_LABEL.get(fixLabel) : undefined;
  if (altitude === undefined && accuracy === undefined && fixQuality === undefined) return coords;
  const restored: LocationType = { ...coords };
  if (altitude !== undefined) restored.altitude = altitude;
  if (accuracy !== undefined) restored.accuracy = accuracy;
  if (fixQuality !== undefined) {
    const ellipsoidHeight = finiteNumberOf(ownProperty(properties, '_ellipsoidHeight'));
    const averagedCount = finiteNumberOf(ownProperty(properties, '_averaged'));
    restored.gnss = {
      fixQuality,
      satellites: finiteNumberOf(ownProperty(properties, '_satellites')) ?? null,
      hdop: finiteNumberOf(ownProperty(properties, '_hdop')) ?? null,
      diffAge: finiteNumberOf(ownProperty(properties, '_diffAge')) ?? null,
      ...(ellipsoidHeight !== undefined && { ellipsoidHeight }),
      ...(averagedCount !== undefined && { averagedCount }),
    };
  }
  return restored;
}

// ポイントの親子（_group）。ライン・ポリゴンは createDrawingStyleFields で戻す
function createGroupField(feature: Feature<Geometry | null>): Record<string, string> {
  const properties = featureProperties(feature);
  const group = properties === undefined ? undefined : ownProperty(properties, '_group');
  return typeof group === 'string' && group !== '' ? { _group: group } : {};
}

/**
 * 外部ファイルの属性値を RecordType の値（string | number）にそろえる。
 * 入れ子・配列・真偽値をそのまま入れると、編集画面や書き出しが型を前提にしているため壊れる。
 * null/欠落は空欄にする（|| だと数値の0が空欄になり、「0件」と「未記録」の区別が消える）
 */
function normalizeImportedValue(value: unknown): string | number {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  const unwrapped = unwrapKmlHtmlValue(value);
  if (typeof unwrapped === 'string') return unwrapped;
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

function createFields(fields: FieldType[], feature: Feature<Geometry | null>): RecordType['field'] {
  const properties = featureProperties(feature);
  if (properties === undefined) return {};
  // Object.assign で組み立てると "__proto__" という項目名でレコードのプロトタイプが差し替わるため、
  // Object.fromEntries で自前のプロパティとして作る
  return Object.fromEntries(
    fields.map((field) => [
      field.name,
      field.format === 'PHOTO' ? [] : normalizeImportedValue(ownProperty(properties, field.name)),
    ])
  );
}

// togeojson は KML の CDATA の description を {"@type":"html", value} で返す。そのまま入れると
// 編集画面に [object Object] と出て、保存・再書き出しで中身が消えるため、文字列の value を取り出す
function unwrapKmlHtmlValue<T>(value: T): T | string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  // 他のオブジェクト（外部GeoJSONの入れ子属性など）は value キーがあっても JSON 文字列化に任せる
  if ((value as { '@type'?: unknown })['@type'] !== 'html') return value;
  const inner: unknown = (value as { value?: unknown }).value;
  return typeof inner === 'string' ? inner : value;
}

// 手書き・マップメモの線のスタイルとスタンプ。layer.field に無い内部項目なので createFields では拾えず、
// 書き出し（generateGeoJson）が出しているものだけを許可リストで戻す（外部ファイルの任意の _ キーは取り込まない）
const DRAWING_STYLE_KEYS = ['_strokeColor', '_strokeWidth', '_strokeStyle', '_group', '_stamp', '_zoom'] as const;

// 自前の書き出し（generateGeoJson）は全フィーチャーの properties に _id（レコードID）を出す。
// KML（togeojson）や他のソフトのGeoJSONには通常無いため、書き出し由来かどうかの印に使う。
// _stamp に限らないのは、スタンプ以外の1点の線（1点だけのGPX軌跡など）もPointで書き出されるため
function isEcorisMapExportFeature(feature: Feature<Geometry | null>): boolean {
  const id: unknown = feature.properties?._id;
  return typeof id === 'string' && id !== '';
}

function createDrawingStyleFields(feature: Feature<Geometry | null>): Record<string, string | number> {
  const properties = feature.properties;
  if (properties === null || properties === undefined) return {};
  const result: Record<string, string | number> = {};
  DRAWING_STYLE_KEYS.forEach((key) => {
    const value: unknown = properties[key];
    // 書き出しは未設定を '' で出すため、空は戻さない（通常のレイヤに空の内部項目を増やさない）
    if ((typeof value === 'string' && value !== '') || (typeof value === 'number' && Number.isFinite(value))) {
      result[key] = value;
    }
  });
  return result;
}

function createLineOrPolygonFields(fields: FieldType[], feature: Feature<Geometry | null>) {
  return { ...createFields(fields, feature), ...createDrawingStyleFields(feature) };
}

// 1件の壊れたフィーチャ（閉じていないリング等で turf が例外）で全件の取り込みが失敗しないよう、そのフィーチャだけ除外する
function mapFeaturesSkippingInvalid<T>(features: T[], convert: (feature: T) => RecordType | RecordType[]): RecordType[] {
  return features.flatMap((feature) => {
    try {
      return convert(feature);
    } catch {
      return [];
    }
  });
}

export function createLayerFromGeoJson(
  geojson: FeatureCollection<Geometry | null, GeoJsonProperties>,
  fileName: string,
  geoJsonFeatureType: GeoJsonFeatureType
): LayerType {
  let featureType: FeatureType;
  if (geoJsonFeatureType === 'POINT') {
    featureType = 'POINT';
  } else if (geoJsonFeatureType === 'MULTIPOINT') {
    featureType = 'POINT';
  } else if (geoJsonFeatureType === 'LINE') {
    featureType = 'LINE';
  } else if (geoJsonFeatureType === 'MULTILINE') {
    featureType = 'LINE';
  } else if (geoJsonFeatureType === 'POLYGON') {
    featureType = 'POLYGON';
  } else if (geoJsonFeatureType === 'MULTIPOLYGON') {
    featureType = 'POLYGON';
  } else {
    featureType = 'NONE';
  }
  return {
    id: ulid(),
    name: sanitize(fileName),
    type: featureType,
    permission: 'COMMON',
    colorStyle: {
      colorType: 'SINGLE',
      transparency: 0.8,
      color: COLOR.RED,
      fieldName: '',
      customFieldValue: '',
      colorRamp: 'RANDOM',
      colorList: [],
      lineWidth: 1.5,
    },
    label: '',
    visible: true,
    active: false,
    field: createAllStringFieldsFromGeoJson(geojson),
  };
}

function createGpxLayer(fileName: string, featureType: FeatureType): LayerType {
  return {
    id: ulid(),
    name: sanitize(fileName),
    type: featureType,
    permission: 'COMMON',
    colorStyle: {
      colorType: 'SINGLE',
      transparency: 0.8,
      color: COLOR.RED,
      fieldName: '',
      customFieldValue: '',
      colorRamp: 'RANDOM',
      colorList: [],
      lineWidth: 1.5,
    },
    label: 'name',
    visible: true,
    active: false,
    field: [
      { id: ulid(), name: 'name', format: 'STRING' },
      { id: ulid(), name: 'time', format: 'DATETIME' },
      { id: ulid(), name: 'cmt', format: 'STRING' },
    ],
  };
}

// 先頭のフィーチャーだけで項目を作ると、2件目以降にしかない属性（OSMのタグ・KMLのExtendedData等）が全件から消えるため、
// 全フィーチャーのキーの和集合（出現順）で作る
function createAllStringFieldsFromGeoJson(geojson: FeatureCollection<Geometry | null, GeoJsonProperties>) {
  if (typeof geojson !== 'object' || geojson === null || !Array.isArray(geojson.features)) return [];
  const names = new Set<string>();
  geojson.features.forEach((feature) => {
    if (feature === null || typeof feature !== 'object') return;
    const properties = featureProperties(feature);
    if (properties !== undefined) Object.keys(properties).forEach((key) => names.add(key));
  });
  return [...names].map((fieldName) => ({
    id: ulid(),
    name: fieldName,
    format: 'STRING' as FormatType,
  }));
}

type CsvAttributeColumn = { name: string; column: number };

/**
 * CSV のヘッダから項目にする列を選ぶ。
 * displayName・geometry と、EcorisMap の書き出し（先頭列が displayName）が付ける付帯列は属性ではないので除く。
 */
function csvAttributeColumns(header: string[]): CsvAttributeColumn[] {
  const isEcorisMapExport = header[0] === 'displayName';
  const excluded = new Set<string>([
    'displayName',
    'geometry',
    ...(isEcorisMapExport ? ['_id', ...MAP_MEMO_EXPORT_KEYS, '_qgisColor', ...GNSS_EXPORT_KEYS] : []),
  ]);
  const used = new Set<string>();
  const columns: CsvAttributeColumn[] = [];
  header.forEach((headerName, column) => {
    if (excluded.has(headerName)) return;
    // 同名の列をそのまま項目名にすると後の列の値で前の列が上書きされて消えるため、連番を付けて別の項目にする
    let name = headerName;
    for (let n = 2; used.has(name); n++) name = `${headerName}_${n}`;
    used.add(name);
    columns.push({ name, column });
  });
  return columns;
}

export function createLayerFromCsv(csv: string, fileName: string, featureType: FeatureType): LayerType {
  return createLayerFromCsvColumns(csvAttributeColumns(csvHeaderFromRows(parseCsv(csv))), fileName, featureType);
}

function createLayerFromCsvColumns(
  columns: CsvAttributeColumn[],
  fileName: string,
  featureType: FeatureType
): LayerType {
  return {
    id: ulid(),
    name: sanitize(fileName),
    type: featureType,
    permission: 'COMMON',
    colorStyle: {
      colorType: 'SINGLE',
      transparency: 0.8,
      color: COLOR.RED,
      fieldName: '',
      customFieldValue: '',
      colorRamp: 'RANDOM',
      colorList: [],
      lineWidth: 1.5,
    },
    label: '',
    visible: true,
    active: false,
    field: columns.map(({ name }) => ({
      id: ulid(),
      name,
      format: 'STRING' as FormatType,
    })),
  };
}

const GEOJSON_GEOMETRY_TYPE_NAMES = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'GeometryCollection',
]);

// FeatureCollection・単体のFeature・Geometry単体のどれでも、各フィーチャーのgeometryの並びにする（nullの要素は除く）
function geoJsonGeometries(geojson: unknown): (Geometry | null)[] {
  if (typeof geojson !== 'object' || geojson === null) return [];
  const { type, features, geometry } = geojson as { type?: unknown; features?: unknown; geometry?: unknown };
  const toGeometry = (value: unknown): Geometry | null =>
    typeof value === 'object' && value !== null ? (value as Geometry) : null;
  if (Array.isArray(features)) {
    return features
      .filter((feature): feature is { geometry?: unknown } => typeof feature === 'object' && feature !== null)
      .map((feature) => toGeometry(feature.geometry));
  }
  if (type === 'Feature') return [toGeometry(geometry)];
  if (typeof type === 'string' && GEOJSON_GEOMETRY_TYPE_NAMES.has(type)) return [geojson as Geometry];
  return [];
}

/**
 * 取り込むジオメトリの型を決める。先頭のフィーチャーに依存しないよう、nullでない最初のgeometryで判定する。
 * 全件 geometry が null（属性のみ）のときは位置なしのポイントとして取り込めるよう POINT にする
 * （useGeoFile の presentFeatureTypes も null を Point として数えている）。フィーチャーが無ければ NONE。
 * 混在したファイルは型ごとに取り込む必要がある（presentFeatureTypes）。
 */
export function detectGeoJsonType(geojson: FeatureCollection<Geometry | null, GeoJsonProperties>): GeoJsonFeatureType {
  const geometries = geoJsonGeometries(geojson);
  if (geometries.length === 0) return 'NONE';
  const geometry = geometries.find((g) => g !== null);
  if (geometry === undefined) return 'POINT';
  switch (geometry.type) {
    case 'Point':
      return 'POINT';
    case 'MultiPoint':
      return 'MULTIPOINT';
    case 'LineString':
      return 'LINE';
    case 'MultiLineString':
      return 'MULTILINE';
    case 'Polygon':
      return 'POLYGON';
    case 'MultiPolygon':
      return 'MULTIPOLYGON';
    default:
      return 'NONE';
  }
}
