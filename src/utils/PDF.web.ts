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
        const mapUrl = map.url
          .replace('{z}', tileZoom.toString())
          .replace('{x}', x.toString())
          .replace('{y}', y.toString());

        tileContents += `<img src="${mapUrl}" style="position: absolute; width: 256px; height: 256px; left: ${
          256 * (x - leftTileX)
        }px; top: ${256 * (y - topTileY)}px; margin: 0; padding: 0; opacity:${(1 - map.transparency).toFixed(1)}" />`;
      }
    }
    tileContents += '</div>';
  }
  return tileContents;
}
