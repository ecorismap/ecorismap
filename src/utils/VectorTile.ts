import { PMTiles } from './pmtiles';
import Pbf from 'pbf';
import VectorTile from '@mapbox/vector-tile';
import { Position } from '@turf/turf';
import { booleanPointInPolygon, polygon, point } from '@turf/turf';

const pmtile = new PMTiles('https://www.ecoris.co.jp/map/kitakami_h30.pmtiles');

export const getVectorTileInfo = async (latlon: Position, tile: { x: number; y: number; z: number }) => {
  const LAYER_NAME = '北上川H30';
  const a = await pmtile.getZxy(tile.z, tile.x, tile.y);
  //console.log(a);
  if (a === undefined) return;
  console.log(tile.z, tile.x, tile.y);
  const pbf = new Pbf(a.data);
  const layer = new VectorTile.VectorTile(pbf).layers[LAYER_NAME];

  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    const geometry = feature.toGeoJSON(tile.x, tile.y, tile.z);
    try {
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
    } catch (e) {
      console.log(e);
    }
  }
};
