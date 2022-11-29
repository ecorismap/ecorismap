import { MapRef, ViewState } from 'react-map-gl';
import MapView, { Region } from 'react-native-maps';
import { RegionType, TileMapItemType } from '../types';

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
  const rows = csv.split(/\r?\n/);
  const headers: string[] = rows[0].split(delimiter);
  //console.log(headers);
  const data: string[] = rows.slice(1);
  const jsonArray = data.map((row) => {
    const values = row.split(delimiter);
    const el = headers.reduce((object, header, index) => {
      let val;
      if (values[index].toLowerCase() === 'true') {
        val = true;
      } else if (values[index].toLowerCase() === 'false') {
        val = false;
      } else if (!isNaN(Number(values[index]))) {
        val = Number(values[index]);
      } else {
        val = values[index];
      }
      //@ts-ignore
      object[header] = val;
      return object;
    }, {});
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

export const isValidMapListURL = (mapListURL: string) => {
  const pattern = /https:\/\/docs.google.com\/spreadsheets[-_.!~*\'()a-zA-Z0-9;\/?:\@&=+\$,%#]+output=csv/g;
  const regMatch = mapListURL.match(pattern);
  if (regMatch === null) {
    return false;
  } else {
    return true;
  }
};
