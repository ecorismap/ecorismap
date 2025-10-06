import { getTileRegion } from './Tile';
import { TileMapType } from '../types';
//@ts-ignore
import * as pdfjs from 'pdfjs-dist/webpack';
import initGdalJs from 'gdal3.js';
import { warpedFileType } from 'react-native-gdalwarp';
import { GeoInfo } from './PDF';

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
        if (
          map.url.includes('file://') ||
          map.url.includes('pmtiles://') ||
          map.url.includes('.pmtiles') ||
          map.url.includes('pdf://') ||
          map.url.includes('.pdf') ||
          map.url.includes('.pbf') ||
          map.url.includes('blob:')
        )
          continue;
        const mapUrl = map.url
          .replace('{z}', tileZoom.toString())
          .replace('{x}', x.toString())
          .replace('{y}', y.toString());

        try {
          const response = await fetch(mapUrl, { method: 'HEAD' });
          if (response.ok) {
            tileContents += `<img src="${mapUrl}" style="position: absolute; width: 256px; height: 256px; left: ${
              256 * (x - leftTileX)
            }px; top: ${256 * (y - topTileY)}px; margin: 0; padding: 0; opacity:${(1 - map.transparency).toFixed(
              1
            )}" />`;
          }
        } catch (error) {
          console.error(`Failed to fetch tile: ${mapUrl}`, error);
        }
      }
    }
    tileContents += '</div>';
  }
  return tileContents;
}

async function decodeBase64(base64: string): Promise<Uint8Array> {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function loadPdfDocument(uri: string): Promise<pdfjs.PDFDocumentProxy> {
  //data:の形式の場合はbase64に変換
  const base64 = uri.split(',')[1];
  const bytes = await decodeBase64(base64);
  return await pdfjs.getDocument({ data: bytes }).promise;
}

async function convertPDFToPNG(page: pdfjs.PDFPageProxy) {
  const viewport = page.getViewport({ scale: 1.0 });
  const canvas = document.createElement('canvas');
  const PRINT_UNITS = 200 / 72; //200dpi
  canvas.width = Math.floor(viewport.width * PRINT_UNITS);
  canvas.height = Math.floor(viewport.height * PRINT_UNITS);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  const context = canvas.getContext('2d');

  await page.render({
    canvasContext: context!,
    viewport,
    transform: [PRINT_UNITS, 0, 0, PRINT_UNITS, 0, 0],
    intent: 'print',
  }).promise;
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
  return { file: new File([blob], 'temp.png'), width: canvas.width, height: canvas.height };
}

async function createGCPs(geo: GeoInfo, width: number, height: number, Gdal: any): Promise<string[]> {
  // bbox: 左上、左下、右下、右上の順
  const bbox = [
    [0, 0],
    [0, height],
    [width, height],
    [width, 0],
  ];

  // gpts配列から座標を取得
  const geoPoints = [];
  for (let i = 0; i < 8; i += 2) {
    geoPoints.push({
      lat: geo.gpts[i],
      lon: geo.gpts[i + 1],
    });
  }

  // 緯度・経度の範囲を取得
  const lats = geoPoints.map(p => p.lat);
  const lons = geoPoints.map(p => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  // 各点の位置を判定（上下左右）
  const coords = geoPoints.map(p => {
    const isTop = Math.abs(p.lat - maxLat) < Math.abs(p.lat - minLat);
    const isLeft = Math.abs(p.lon - minLon) < Math.abs(p.lon - maxLon);
    return { ...p, isTop, isLeft };
  });

  // bbox順に並べ替える: 左上、左下、右下、右上
  const topLeft = coords.find(p => p.isTop && p.isLeft);
  const bottomLeft = coords.find(p => !p.isTop && p.isLeft);
  const bottomRight = coords.find(p => !p.isTop && !p.isLeft);
  const topRight = coords.find(p => p.isTop && !p.isLeft);

  const orderedCoords = [
    [topLeft?.lon, topLeft?.lat],
    [bottomLeft?.lon, bottomLeft?.lat],
    [bottomRight?.lon, bottomRight?.lat],
    [topRight?.lon, topRight?.lat],
  ];

  // EPSG:4326の座標を直接GCPとして使用
  return orderedCoords
    .map((coord, index) => [
      '-gcp',
      bbox[index][0].toString(),
      bbox[index][1].toString(),
      coord[0]!.toString(),
      coord[1]!.toString(),
    ])
    .flat();
}

async function convertPNGToGeoTiff(
  png: { file: File; width: number; height: number },
  geo: GeoInfo
): Promise<warpedFileType> {
  //yarn build:webで/appにアップロードする場合は以下のようにパスを指定してもよい。yarn webの場合は/staticにする
  //const Gdal = await initGdalJs({ path: '/app/static'});
  //useWorker: falseにすると、yarn webでもyarn build:webでも動作する.ただし、gdal3.jsのコードにパッチを当てる必要がある
  const Gdal = await initGdalJs({ path: 'static', useWorker: false });
  const gcps = await createGCPs(geo, png.width, png.height, Gdal);
  const dataset = (await Gdal.open(png.file)).datasets[0];
  // GCPはEPSG:4326（WGS84）の座標なので、a_srsもEPSG:4326を指定
  const translateOptions = ['-of', 'GTiff', '-a_srs', 'EPSG:4326', ...gcps];
  const translated = await Gdal.gdal_translate(dataset, translateOptions);
  const translatedDs = (await Gdal.open(translated.local)).datasets[0];

  const warpOptions = ['-of', 'GTiff', '-t_srs', 'EPSG:3857', '-r', 'bilinear'];
  const warped = await Gdal.gdalwarp(translatedDs, warpOptions);
  const warpedDs = (await Gdal.open(warped.local)).datasets[0];
  const warpedInfo = await Gdal.getInfo(warpedDs);
  //console.log(warpedInfo);
  Gdal.close(warpedDs);
  Gdal.close(translatedDs);
  const files = await Gdal.getOutputFiles();
  const fileBytes = await Gdal.getFileBytes(files[0].path);
  const blob = new Blob([fileBytes], { type: 'image/tiff' });
  const uri = URL.createObjectURL(blob);
  return {
    uri,
    blob,
    width: warpedInfo.width!,
    height: warpedInfo.height!,
    topLeft: { x: warpedInfo.corners![0][0], y: warpedInfo.corners![0][1] },
    bottomRight: { x: warpedInfo.corners![2][0], y: warpedInfo.corners![2][1] },
  };
}

export const convertPDFToGeoTiff = async (uri: string) => {
  const outputFiles: warpedFileType[] = [];
  try {
    const pdfDoc = await loadPdfDocument(uri);

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const geo = page._pageInfo.geo as GeoInfo;
      const png = await convertPDFToPNG(page);
      const geotiff = await convertPNGToGeoTiff(png, geo);
      outputFiles.push(geotiff);
    }
    return outputFiles;
  } catch (e) {
    //console.error('Error processing PDF:', e);
    return [];
  }
};

export const generateTilesFromPDF = {};
