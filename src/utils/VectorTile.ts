import Pbf from 'pbf';
import VectorTile from '@mapbox/vector-tile';
import { Position } from '@turf/turf';
import { pointToLineDistance, booleanPointInPolygon, distance, polygon, point, lineString } from '@turf/turf';
import * as FileSystem from 'expo-file-system';
import { TILE_FOLDER } from '../constants/AppConstants';
import { Buffer } from 'buffer';
import { getMetersPerPixelAtZoomLevel } from './Coords';

//const pmtile = new PMTiles('https://www.ecoris.co.jp/map/kitakami_h30.pmtiles');

export const fetchVectorTileInfo = async (
  tileMapId: string,
  latlon: Position,
  tile: { x: number; y: number; z: number }
) => {
  //const LAYER_NAME = '北上川H30';
  //console.log(tile.z, tile.x, tile.y);

  const maxDistanceToLine = getMetersPerPixelAtZoomLevel(latlon[1], tile.z) * 10;

  const localLocation = `${TILE_FOLDER}/${tileMapId}/${tile.z}/${tile.x}/${tile.y}.pbf`;
  if (!(await FileSystem.getInfoAsync(localLocation)).exists) {
    //console.log('not found');
    return;
  }
  const base64String = await FileSystem.readAsStringAsync(localLocation);

  const binaryData = Buffer.from(base64String, 'base64');

  const pbf = new Pbf(binaryData);
  const layers = new VectorTile.VectorTile(pbf).layers;

  for (const layerName of Object.keys(layers)) {
    const layer = layers[layerName];
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const geometry = feature.toGeoJSON(tile.x, tile.y, tile.z);
      try {
        if (geometry.geometry.type === 'Point') {
          if (distance(point(latlon), point(geometry.geometry.coordinates), { units: 'meters' }) <= maxDistanceToLine) {
            return feature.properties;
          }
        } else if (geometry.geometry.type === 'LineString') {
          if (
            pointToLineDistance(point(latlon), lineString(geometry.geometry.coordinates), { units: 'meters' }) <=
            maxDistanceToLine
          ) {
            return feature.properties;
          }
        } else if (geometry.geometry.type === 'Polygon') {
          //@ts-ignore
          const coords = geometry.geometry.coordinates[0];
          if (coords.length > 3) {
            const isInside = booleanPointInPolygon(point(latlon), polygon([coords]));
            if (isInside) {
              return feature.properties;
              //console.log(feature.properties);
            } else {
              //console.log('not found');
            }
          }
        }
      } catch (e) {
        console.log(e);
      }
    }
  }
};
