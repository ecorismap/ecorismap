import Pbf from 'pbf';
import VectorTile from '@mapbox/vector-tile';
import { pointToLineDistance, booleanPointInPolygon, distance, polygon, point, lineString } from '@turf/turf';
import * as FileSystem from 'expo-file-system';
import { TILE_FOLDER } from '../constants/AppConstants';
import { Buffer } from 'buffer';
import { getMetersPerPixelAtZoomLevel } from './Coords';
import { Position } from 'geojson';

//const pmtile = new PMTiles('https://www.ecoris.co.jp/map/kitakami_h30.pmtiles');

export const fetchVectorTileInfo = async (
  tileMapId: string,
  latlon: Position,
  tile: { x: number; y: number; z: number }
) => {
  //const LAYER_NAME = '北上川H30';
  //console.log(tile.z, tile.x, tile.y);
  try {
    // ズームレベルに応じて検索範囲を調整（低いズームレベルのタイルは広い範囲をカバー）
    const maxDistanceToLine = getMetersPerPixelAtZoomLevel(latlon[1], tile.z) * 10;

    const localLocation = `${TILE_FOLDER}/${tileMapId}/${tile.z}/${tile.x}/${tile.y}.pbf`;
    const info = await FileSystem.getInfoAsync(localLocation);
    //console.log(info);
    if (!info.exists) return [];
    const base64String = await FileSystem.readAsStringAsync(localLocation);

    const binaryData = Buffer.from(base64String, 'base64');

    const pbf = new Pbf(binaryData);
    const layers = new VectorTile.VectorTile(pbf).layers;
    const propertyList: { [key: string]: any }[] = [];
    for (const layerName of Object.keys(layers).reverse()) {
      const layer = layers[layerName];
      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i);
        const geometry = feature.toGeoJSON(tile.x, tile.y, tile.z);
        //console.log(i, geometry.geometry.type);
        if (geometry.geometry.type === 'Point') {
          if (distance(point(latlon), point(geometry.geometry.coordinates), { units: 'meters' }) <= maxDistanceToLine)
            propertyList.push(feature.properties);
        } else if (geometry.geometry.type === 'LineString') {
          if (
            pointToLineDistance(point(latlon), lineString(geometry.geometry.coordinates), { units: 'meters' }) <=
            maxDistanceToLine
          )
            propertyList.push(feature.properties);
        } else if (geometry.geometry.type === 'Polygon') {
          const coords = geometry.geometry.coordinates;
          const isInside = booleanPointInPolygon(point(latlon), polygon(coords));
          if (isInside) propertyList.push(feature.properties);
        } else if (geometry.geometry.type === 'MultiPolygon') {
          for (const coords of geometry.geometry.coordinates) {
            const isInside = booleanPointInPolygon(point(latlon), polygon(coords));
            if (isInside) propertyList.push(feature.properties);
          }
        }
      }
    }
    return propertyList;
  } catch (e) {
    console.log(e);
    return [];
  }
};
