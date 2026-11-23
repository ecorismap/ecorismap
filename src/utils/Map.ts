import { MapRef, ViewState } from 'react-map-gl/maplibre';
import MapView, { Region } from 'react-native-maps';
import { RegionType, TileMapItemType, TileMapType } from '../types';
import { isSafeTileMapId } from './tileMapId';
import { parseCsv } from './csvParse';

export const isMapView = (map: any): map is MapView => {
  return map && typeof map.animateCamera === 'function';
};

export const isMapRef = (map: any): map is MapRef => {
  return map && typeof map.getMap().getBounds === 'function';
};
export const isRegionType = (region: any): region is RegionType => {
  return 'zoom' in region && 'latitudeDelta' in region;
};

export const isRegion = (region: any): region is Region => {
  return !('zoom' in region) && 'latitudeDelta' in region;
};

export const isViewState = (region: any): region is ViewState => {
  return 'zoom' in region && !('latitudeDelta' in region);
};

export const csvToJsonArray = (csv: string, delimiter = ',') => {
  const rows = csv
    .split(/\r?\n/) // 改行コード対応
    .map((row) => row.trim()) // 前後の空白を削除
    .filter((row) => row.length > 0); // 空行を除外

  if (rows.length < 2) {
    // データが存在しない場合の処理
    return [];
  }

  const headers: string[] = rows[0].split(delimiter).map((header) => header.trim());
  const dataRows: string[] = rows.slice(1);

  const jsonArray = dataRows.map((row) => {
    const values = row.split(delimiter).map((value) => value.trim());
    const el = headers.reduce((object, header, index) => {
      let val;
      const currentValue = values[index] ?? ''; // 列が欠けている場合、空文字列にする

      if (currentValue.toLowerCase() === 'true') {
        val = true;
      } else if (currentValue.toLowerCase() === 'false') {
        val = false;
      } else if (!isNaN(Number(currentValue)) && currentValue !== '') {
        val = Number(currentValue);
      } else {
        val = currentValue;
      }

      object[header] = val; // ヘッダーと値をマッピング
      return object;
    }, {} as Record<string, any>);
    return el;
  });

  return jsonArray;
};

const isTileMapItem = (data: any): data is TileMapItemType => {
  return (
    typeof data === 'object' &&
    data !== null &&
    data.name !== undefined &&
    typeof data.name === 'string' &&
    data.url !== undefined &&
    typeof data.url === 'string' &&
    data.attribution !== undefined &&
    typeof data.attribution === 'string' &&
    data.transparency !== undefined &&
    typeof data.transparency === 'number' &&
    data.transparency >= 0 &&
    data.transparency <= 1 &&
    data.overzoomThreshold !== undefined &&
    typeof data.overzoomThreshold === 'number' &&
    data.overzoomThreshold >= 0 &&
    data.overzoomThreshold <= 22 &&
    data.highResolutionEnabled !== undefined &&
    typeof data.highResolutionEnabled === 'boolean' &&
    data.minimumZ !== undefined &&
    typeof data.minimumZ === 'number' &&
    data.minimumZ >= 0 &&
    data.minimumZ <= 22 &&
    data.maximumZ !== undefined &&
    typeof data.maximumZ === 'number' &&
    data.maximumZ >= 0 &&
    data.maximumZ <= 22 &&
    data.flipY !== undefined &&
    typeof data.flipY === 'boolean' &&
    // オプショナルフィールドのチェック
    (data.styleURL === undefined || typeof data.styleURL === 'string') &&
    (data.isVector === undefined || typeof data.isVector === 'boolean') &&
    (data.tileSize === undefined || typeof data.tileSize === 'number') &&
    (data.isGroup === undefined || typeof data.isGroup === 'boolean') &&
    (data.groupId === undefined || typeof data.groupId === 'string') &&
    (data.expanded === undefined || typeof data.expanded === 'boolean')
  );
};

// 地図リストの列ごとの型。名前などを Number に変えると「2024」のような名前の行が不正になるため、列で決める（M-M9）
const MAP_LIST_STRING_COLUMNS = ['name', 'url', 'attribution', 'styleURL', 'groupId'] as const;
const MAP_LIST_NUMBER_COLUMNS = ['transparency', 'overzoomThreshold', 'minimumZ', 'maximumZ', 'tileSize'] as const;
const MAP_LIST_BOOLEAN_COLUMNS = ['highResolutionEnabled', 'flipY', 'isVector', 'isGroup', 'expanded'] as const;

const toMapListValue = (column: string, raw: string): string | number | boolean | undefined => {
  const value = raw.trim();
  if ((MAP_LIST_STRING_COLUMNS as readonly string[]).includes(column)) {
    // 任意の列の空欄は「指定なし」。空文字の styleURL などを渡すと別の意味になる
    return value === '' && column !== 'name' && column !== 'url' && column !== 'attribution' ? undefined : value;
  }
  if (value === '') return undefined;
  if ((MAP_LIST_NUMBER_COLUMNS as readonly string[]).includes(column)) {
    const num = Number(value);
    // 数値にならない値はそのまま残し、検査で不正な行として除く
    return Number.isNaN(num) ? value : num;
  }
  if ((MAP_LIST_BOOLEAN_COLUMNS as readonly string[]).includes(column)) {
    const lower = value.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
    return value;
  }
  return undefined;
};

/**
 * 地図リスト（Google スプレッドシートの output=csv）を読み、地図の項目と、不正で除いた行の数を返す。
 * 引用符で囲まれたカンマ・改行・"" を含むセルを扱う（RFC 4180）。知らない列は取り込まない。
 * 1行でも不正だと一覧ごと拒否していたが、正しい行は使えるよう不正な行だけ除く（M-M9）
 */
export const parseMapListCsv = (csv: string): { items: TileMapItemType[]; invalidCount: number } => {
  const rows = parseCsv(csv).filter((row) => row.some((cell) => cell.trim() !== ''));
  if (rows.length < 2) return { items: [], invalidCount: 0 };
  const headers = rows[0].map((header) => header.trim());
  const items: TileMapItemType[] = [];
  let invalidCount = 0;
  for (const row of rows.slice(1)) {
    const record: Record<string, string | number | boolean> = {};
    headers.forEach((header, index) => {
      const value = toMapListValue(header, row[index] ?? '');
      if (value !== undefined) record[header] = value;
    });
    if (isTileMapItem(record)) {
      items.push(record);
    } else {
      invalidCount++;
    }
  }
  return { items, invalidCount };
};

export const isMapListArray = (data: any): data is TileMapItemType[] => data.every((d: any) => isTileMapItem(d));
export const isTileMapType = (data: any): data is TileMapType => {
  if (!data || typeof data !== 'object') return false;
  
  const { id, maptype, visible, boundary, encryptKey, redraw, ...mapItem } = data;
  return (
    isTileMapItem(mapItem) &&
    // idはTILE_FOLDER配下のフォルダ名になるため、フォルダの外を指せる値は受け付けない
    isSafeTileMapId(id) &&
    typeof maptype === 'string' &&
    typeof visible === 'boolean' &&
    ['standard', 'satellite', 'hybrid', 'terrain', 'none'].includes(maptype) &&
    // オプショナルフィールドのチェック
    (boundary === undefined || (typeof boundary === 'object' && boundary !== null)) &&
    (encryptKey === undefined || typeof encryptKey === 'string') &&
    (redraw === undefined || typeof redraw === 'boolean')
  );
};

export const isValidMapListURL = (mapListURL: string) => {
  const pattern = /https:\/\/docs.google.com\/spreadsheets[-_.!~*\'()a-zA-Z0-9;\/?:\@&=+\$,%#]+output=csv/g;
  const regMatch = mapListURL.match(pattern);
  if (regMatch === null) {
    return false;
  } else {
    return true;
  }
};
