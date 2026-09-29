import * as RNFS from 'react-native-fs';
import { TILE_FOLDER } from '../constants/AppConstants';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { tileToWebMercator } from './Tile';
import { TileMapType } from '../types';
import { warpedFileType } from 'react-native-gdalwarp';
import ImageEditor from '@react-native-community/image-editor';
import { moveFile, unlink } from '../utils/File';
import {
  buildTileMapHTML,
  buildTileUrl,
  isPmtilesMap,
  listPdfTiles,
  PdfTileMapOptions,
  PdfTileRequest,
} from './pdfExport/tiles';
import { runTasks } from './pdfExport/runTasks';
import { renderPmtile } from './terrain3d/pmtileRasterizer';
import { withTileSignature } from './TileSignature';
import { getPmtileMaximumNativeZ } from './pmtileProps';

//PDF用に取得したタイルの一時置き場。オフライン地図のタイルフォルダ（TILE_FOLDER）には保存しない
//（保存範囲の一覧や容量管理の外で溜まり続けるため）
const PDF_TILE_TEMP_DIR = `${FileSystem.cacheDirectory}pdf-tiles/`;
//同時に取得・変換するタイル数。多すぎると端末のメモリと通信が詰まる
const PDF_TILE_CONCURRENCY = 6;

// manipulateAsyncを通さないと特殊なpngタイルが正常に出力されないため使用する
// iOSにおいて、拡張子がないpngを処理できないバグがmanipulateAsyncにあるため、拡張子付きの一時ファイルを使う
async function toBase64Png(tempFileUri: string) {
  const result = await manipulateAsync(tempFileUri, [], { base64: true, format: SaveFormat.PNG }).catch(
    () => undefined
  );
  await FileSystem.deleteAsync(tempFileUri, { idempotent: true });
  //manipulateAsyncの出力ファイルも残さない
  if (result) await FileSystem.deleteAsync(result.uri, { idempotent: true });
  return result?.base64;
}

/**
 * PMTiles・pbfは2Dの地図と同じネイティブ描画（3Dと共用のPMTileRasterizer）でPNGにする。
 * 2Dと同じキャッシュ・オフライン保存（TILE_FOLDER/{地図ID}）を使い、ラベルやオーバーズームも2Dと同じになる
 */
async function renderPmtileBase64(
  tile: PdfTileRequest,
  tempFileUri: string,
  options: PdfTileMapOptions
): Promise<string | undefined> {
  const { map, z, x, y } = tile;
  const signatures = options.tileSignatures ?? {};
  const isOffline = options.isOffline ?? false;
  await FileSystem.deleteAsync(tempFileUri, { idempotent: true });
  const tileSize = await renderPmtile({
    urlTemplate: withTileSignature(map.url, signatures).replace('pmtiles://', ''),
    styleURL: map.styleURL ? withTileSignature(map.styleURL, signatures) : undefined,
    tileCachePath: `${TILE_FOLDER}/${map.id}`,
    z,
    x,
    y,
    //2DのPMTileと同じく範囲はアーカイブ任せ
    minimumZ: 0,
    maximumZ: 22,
    maximumNativeZ: getPmtileMaximumNativeZ(map, isOffline),
    flipY: false,
    offlineMode: isOffline,
    isVector: !!map.isVector,
    outputPath: tempFileUri,
  });
  //0はタイルなし（範囲外）
  if (tileSize === 0) {
    await FileSystem.deleteAsync(tempFileUri, { idempotent: true });
    return undefined;
  }
  return await toBase64Png(tempFileUri);
}

async function loadTileBase64(tile: PdfTileRequest, options: PdfTileMapOptions): Promise<string | undefined> {
  const { map, z, x, y } = tile;
  const tempFileUri = `${PDF_TILE_TEMP_DIR}${map.id}_${z}_${x}_${y}.png`;
  try {
    if (isPmtilesMap(map)) return await renderPmtileBase64(tile, tempFileUri, options);
    // オフライン保存済みのタイルがあればそれを使う
    const localUri = `${TILE_FOLDER}/${map.id}/${z}/${x}/${y}`;
    if (await RNFS.exists(localUri)) {
      await FileSystem.deleteAsync(tempFileUri, { idempotent: true });
      await RNFS.copyFile(localUri, tempFileUri);
      return await toBase64Png(tempFileUri);
    }
    // PDF(file://)などダウンロードできないURLはスキップ
    if (!map.url.startsWith('http://') && !map.url.startsWith('https://')) return undefined;
    const resp = await FileSystem.downloadAsync(buildTileUrl(map, z, x, y), tempFileUri);
    if (resp.status !== 200) {
      await FileSystem.deleteAsync(tempFileUri, { idempotent: true });
      return undefined;
    }
    return await toBase64Png(tempFileUri);
  } catch (e) {
    // 1タイルの取得失敗でPDF全体の生成を止めない
    return undefined;
  }
}

export async function generateTileMap(
  tileMaps: TileMapType[],
  pdfRegion: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  pdfTileMapZoomLevel: string,
  options: PdfTileMapOptions = {}
) {
  const tiles = listPdfTiles(tileMaps, pdfRegion, parseInt(pdfTileMapZoomLevel, 10), false);
  await FileSystem.makeDirectoryAsync(PDF_TILE_TEMP_DIR, { intermediates: true }).catch(() => undefined);
  try {
    const base64s = await runTasks(tiles, PDF_TILE_CONCURRENCY, (tile) => loadTileBase64(tile, options), options);
    return buildTileMapHTML(
      tiles,
      base64s.map((b) => (b === undefined ? undefined : `data:image/png;base64,${b}`))
    );
  } finally {
    await FileSystem.deleteAsync(PDF_TILE_TEMP_DIR, { idempotent: true }).catch(() => undefined);
  }
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
  coordPerPixel: number,
  onProgress?: (ratio: number) => void
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
      onProgress?.(batchCount / tiles.length);
    }
  }
  await Promise.all(batch);
  onProgress?.(1);

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
