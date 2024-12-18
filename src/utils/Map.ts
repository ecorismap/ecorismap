import { MapRef, ViewState } from 'react-map-gl/maplibre';
import MapView, { Region } from 'react-native-maps';
import { RegionType, TileMapItemType, TileMapType } from '../types';

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
    typeof data.flipY === 'boolean'
  );
};

export const isMapListArray = (data: any): data is TileMapItemType[] => data.every((d: any) => isTileMapItem(d));
export const isTileMapType = (data: any): data is TileMapType => {
  const { id, mapType, visible, ...mapItem } = data;
  return (
    isTileMapItem(mapItem) &&
    typeof id === 'string' &&
    typeof mapType === 'string' &&
    typeof visible === 'boolean' &&
    ['standard', 'satellite', 'hybrid', 'terrain', 'none'].includes(mapType)
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
