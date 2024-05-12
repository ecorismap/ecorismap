import * as RNFS from 'react-native-fs';
import { TILE_FOLDER } from '../constants/AppConstants';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { getTileRegion } from './Tile';
import { TileMapType } from '../types';

export async function generateTileMap(
  tileMaps: TileMapType[],
  pdfRegion: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  pdfTileMapZoomLevel: string
) {
  const tileZoom = parseInt(pdfTileMapZoomLevel, 10);
  const { leftTileX, rightTileX, bottomTileY, topTileY } = getTileRegion(pdfRegion, tileZoom);

  let tileContents = '';
  const maps = tileMaps.filter((m) => m.visible && m.id !== 'standard' && m.id !== 'hybrid').reverse();

  for (let y = topTileY; y <= bottomTileY; y++) {
    tileContents += '<div style="position: absolute; left: 0; top: 0;">';

    for (let x = leftTileX; x <= rightTileX; x++) {
      for (const map of maps) {
        let mapSrc;

        const mapUri = `${TILE_FOLDER}/${map.id}/${tileZoom}/${x}/${y}`;
        if (await RNFS.exists(mapUri)) {
          mapSrc = await manipulateAsync(mapUri, [], { base64: true, format: SaveFormat.PNG }).catch(() => {
            //console.error(e);
            return undefined;
          });
        } else if (map.url.startsWith('file://') && map.url.endsWith('.pdf')) {
          mapSrc = undefined;
        } else {
          const mapUrl = map.url
            .replace('{z}', tileZoom.toString())
            .replace('{x}', x.toString())
            .replace('{y}', y.toString());

          await FileSystem.makeDirectoryAsync(`${TILE_FOLDER}/${map.id}/${tileZoom}/${x}`, {
            intermediates: true,
          });
          const resp = await FileSystem.downloadAsync(mapUrl, `${TILE_FOLDER}/${map.id}/${tileZoom}/${x}/${y}`);
          if (resp.status === 200) {
            mapSrc = await manipulateAsync(resp.uri, [], { base64: true, format: SaveFormat.PNG }).catch(() => {
              //console.error(e);
              return undefined;
            });
          }
        }

        if (mapSrc) {
          tileContents += `<img src="data:image/png;base64,${
            mapSrc.base64
          }" style="position: absolute; width: 256px; height: 256px; left: ${256 * (x - leftTileX)}px; top: ${
            256 * (y - topTileY)
          }px; margin: 0; padding: 0; opacity:${(1 - map.transparency).toFixed(1)}" />`;
        }
      }
    }
    tileContents += '</div>';
  }
  return tileContents;
}
