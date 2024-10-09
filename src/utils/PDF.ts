import * as RNFS from 'react-native-fs';
import { TILE_FOLDER } from '../constants/AppConstants';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { getTileRegion, tileToWebMercator } from './Tile';
import { TileMapType } from '../types';
import { warpedFileType } from 'react-native-gdalwarp';
import ImageEditor from '@react-native-community/image-editor';
import { moveFile, unlink } from '../utils/File';

// 一時ファイルにコピーし、画像を操作する関数
// manipulateAsyncを通さないと特殊なpngタイルが正常に出力されないため使用する
//　iOSにおいて、拡張子がないpngを処理できないバグがmanipulateAsyncにあるため、一時ファイルを使って操作する
async function handleImageManipulation(sourceUri: string, tempFileUri: string) {
  // 既存の一時ファイルを削除して上書き
  if (await RNFS.exists(tempFileUri)) {
    await RNFS.unlink(tempFileUri);
  }
  await RNFS.copyFile(sourceUri, tempFileUri);
  // manipulateAsync に渡して、操作後に一時ファイルを削除
  const result = await manipulateAsync(tempFileUri, [], { base64: true, format: SaveFormat.PNG }).catch(
    () => undefined
  );
  await RNFS.unlink(tempFileUri); // 一時ファイルを削除
  return result;
}

export async function generateTileMap(
  tileMaps: TileMapType[],
  pdfRegion: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  pdfTileMapZoomLevel: string
) {
  const tileZoom = parseInt(pdfTileMapZoomLevel, 10);
  const { leftTileX, rightTileX, bottomTileY, topTileY } = getTileRegion(pdfRegion, tileZoom);

  let tileContents = '';
  const maps = tileMaps.filter((m) => !m.isGroup && m.visible && m.id !== 'standard' && m.id !== 'hybrid').reverse();

  for (let y = topTileY; y <= bottomTileY; y++) {
    tileContents += '<div style="position: absolute; left: 0; top: 0;">';

    for (let x = leftTileX; x <= rightTileX; x++) {
      for (const map of maps) {
        let mapSrc;
        const mapUri = `${TILE_FOLDER}/${map.id}/${tileZoom}/${x}/${y}`;
        const tempFileUri = `${FileSystem.cacheDirectory}${map.id}_${x}_${y}.png`; // 一時ファイル

        // 画像が既にローカルにある場合
        if (await RNFS.exists(mapUri)) {
          mapSrc = await handleImageManipulation(mapUri, tempFileUri);
        }
        // PDFの場合はスキップ
        else if (map.url.startsWith('file://') && map.url.endsWith('.pdf')) {
          mapSrc = undefined;
        }
        // インターネットから画像をダウンロードする場合
        else {
          const mapUrl = map.url
            .replace('{z}', tileZoom.toString())
            .replace('{x}', x.toString())
            .replace('{y}', y.toString());

          await FileSystem.makeDirectoryAsync(`${TILE_FOLDER}/${map.id}/${tileZoom}/${x}`, {
            intermediates: true,
          });
          const resp = await FileSystem.downloadAsync(mapUrl, `${TILE_FOLDER}/${map.id}/${tileZoom}/${x}/${y}`);
          if (resp.status === 200) {
            mapSrc = await handleImageManipulation(resp.uri, tempFileUri);
          }
        }

        // 画像が正常に取得できた場合のみHTMLに追加
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

const calculateOffset = (
  pdfTopLeftCoord: { x: number; y: number },
  topLeftCoord: { mercatorX: number; mercatorY: number },
  coordPerPixel: number
) => {
  const offsetLeft = pdfTopLeftCoord.x - topLeftCoord.mercatorX;
  const offsetTop = topLeftCoord.mercatorY - pdfTopLeftCoord.y;
  return { x: -offsetLeft / coordPerPixel, y: -offsetTop / coordPerPixel };
};

const calculateCropSize = (zoomLevel: number, coordPerPixel: number) => {
  const earthCircumference = Math.PI * 2 * 6378137;
  return {
    width: earthCircumference / Math.pow(2, zoomLevel) / coordPerPixel,
    height: earthCircumference / Math.pow(2, zoomLevel) / coordPerPixel,
  };
};

const calculateTile = (coordinate: { x: number; y: number }, zoomLevel: number): { tileX: number; tileY: number } => {
  const earthCircumference = 40075016.686;
  const offset = 20037508.342789244;
  const tileX = Math.floor(((coordinate.x + offset) / earthCircumference) * Math.pow(2, zoomLevel));
  const tileY = Math.floor(((offset - coordinate.y) / earthCircumference) * Math.pow(2, zoomLevel));
  return { tileX, tileY };
};

export const generateTilesFromPDF = async (
  pdfImage: string,
  outputFile: warpedFileType,
  mapId: string,
  tileSize: number,
  minimumZ: number,
  baseZoomLevel: number,
  coordPerPixel: number
) => {
  const tiles = [];
  for (let tileZ = baseZoomLevel; tileZ >= minimumZ; tileZ--) {
    const topLeftTile = calculateTile(outputFile.topLeft, tileZ);
    const bottomRightTile = calculateTile(outputFile.bottomRight, tileZ);
    const topLeftCoord = tileToWebMercator(topLeftTile.tileX, topLeftTile.tileY, tileZ);
    const offset = calculateOffset(outputFile.topLeft, topLeftCoord, coordPerPixel);
    const cropSize = calculateCropSize(tileZ, coordPerPixel);
    const tileX = topLeftTile.tileX;
    const tileY = topLeftTile.tileY;
    const loopX = bottomRightTile.tileX - topLeftTile.tileX + 1;
    const loopY = bottomRightTile.tileY - topLeftTile.tileY + 1;
    // console.log('topLeftTile', topLeftTile, 'bottomRightTile', bottomRightTile);
    // console.log('topLeftCoord', topLeftCoord);
    // console.log('offset', offset);
    // console.log('cropSize', cropSize);
    // console.log('tileX', tileX, 'tileY', tileY, 'tileZ', tileZ);

    for (let y = 0; y < loopY; y++) {
      for (let x = 0; x < loopX; x++) {
        const offsetX = offset.x + x * cropSize.width;
        const offsetY = offset.y + y * cropSize.height;
        tiles.push({ x: tileX + x, y: tileY + y, z: tileZ, offsetX, offsetY, cropSize });
      }
    }
  }
  const BATCH_SIZE = 10;
  let batch: Promise<void>[] = [];

  for (const tile of tiles) {
    const folder = `${TILE_FOLDER}/${mapId}/${tile.z}/${tile.x}`;
    const folderPromise = FileSystem.makeDirectoryAsync(folder, {
      intermediates: true,
    });
    batch.push(folderPromise);
    if (batch.length >= BATCH_SIZE) {
      await Promise.all(batch);
      batch = [];
    }
  }
  await Promise.all(batch);

  let batchCount = 0;
  batch = [];

  for (const tile of tiles) {
    const tileUri = `${TILE_FOLDER}/${mapId}/${tile.z}/${tile.x}/${tile.y}`;

    const cropImagePromise = ImageEditor.cropImage(pdfImage, {
      offset: { x: tile.offsetX, y: tile.offsetY },
      size: tile.cropSize,
      displaySize: { width: tileSize, height: tileSize },
      resizeMode: 'cover',
    })
      .then((croppedImageUri) => {
        moveFile(croppedImageUri, tileUri);
      })
      .catch((e) => {
        console.log(tile, e);
      });

    batch.push(cropImagePromise);
    if (batch.length >= BATCH_SIZE) {
      batchCount = batchCount + BATCH_SIZE;
      await Promise.all(batch);
      batch = [];
    }
  }
  await Promise.all(batch);

  unlink(pdfImage);
};

export const convertPDFToGeoTiff = async (_uri: string): Promise<warpedFileType[]> => {
  return [];
};

export interface GeoInfo {
  bbox: number[];
  gpts: number[];
  epsg: string;
  wkt: string;
}
