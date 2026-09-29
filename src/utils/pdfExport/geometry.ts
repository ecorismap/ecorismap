import * as turf from '@turf/turf';
import { LocationType, PaperOrientationType, PaperSizeType, ScaleType } from '../../types';
import { getTileRegion, tileToWebMercator } from '../Tile';
import { toPixel } from '../General';

export type PdfRegion = { minLon: number; minLat: number; maxLon: number; maxLat: number };

export type PaperSize = {
  widthMillimeter: number;
  heightMillimeter: number;
  widthPoint: number;
  heightPoint: number;
  widthPixel: number;
  heightPixel: number;
};

export type PageLayout = {
  paper: PaperSize;
  margin: { millimeter: number; pixel: number };
  scale: { value: number; webMercator: number; text: string };
  //余白を除いた地図枠の大きさ（用紙上のpxと地上のm）
  page: { widthPixel: number; heightPixel: number; widthMeter: number; heightMeter: number };
  region: PdfRegion;
  centerLatitude: number;
};

//SVGを描くタイル画像全体の範囲。メルカトル座標の四辺と、タイルピクセル単位の大きさ
export type TileFrame = {
  leftX: number;
  rightX: number;
  bottomY: number;
  topY: number;
  width: number;
  height: number;
};

const PAPER_SIZES: Record<PaperSizeType, PaperSize> = {
  A4: { widthMillimeter: 210, heightMillimeter: 297, widthPoint: 595, heightPoint: 842, widthPixel: 794, heightPixel: 1123 },
  A3: { widthMillimeter: 297, heightMillimeter: 420, widthPoint: 842, heightPoint: 1191, widthPixel: 1123, heightPixel: 1587 },
  A2: { widthMillimeter: 420, heightMillimeter: 594, widthPoint: 1191, heightPoint: 1684, widthPixel: 1587, heightPixel: 2245 },
  A1: { widthMillimeter: 594, heightMillimeter: 841, widthPoint: 1684, heightPoint: 2384, widthPixel: 2245, heightPixel: 3179 },
  A0: { widthMillimeter: 841, heightMillimeter: 1189, widthPoint: 2384, heightPoint: 3370, widthPixel: 3179, heightPixel: 4494 },
};

const PAGE_MARGIN_MILLIMETER = 10;

export const getPaperSize = (paperSize: PaperSizeType, orientation: PaperOrientationType): PaperSize => {
  const p = PAPER_SIZES[paperSize];
  if (orientation === 'PORTRAIT') return p;
  return {
    widthMillimeter: p.heightMillimeter,
    heightMillimeter: p.widthMillimeter,
    widthPoint: p.heightPoint,
    heightPoint: p.widthPoint,
    widthPixel: p.heightPixel,
    heightPixel: p.widthPixel,
  };
};

export const computePageLayout = (params: {
  paperSize: PaperSizeType;
  orientation: PaperOrientationType;
  scale: ScaleType;
  center: { latitude: number; longitude: number };
}): PageLayout => {
  const { center } = params;
  const paper = getPaperSize(params.paperSize, params.orientation);
  const margin = { millimeter: PAGE_MARGIN_MILLIMETER, pixel: toPixel(PAGE_MARGIN_MILLIMETER) };
  const scaleInt = parseInt(params.scale, 10);
  const cosLat = Math.cos((center.latitude * Math.PI) / 180);
  const scale = {
    value: scaleInt,
    webMercator: Math.round(scaleInt / cosLat),
    text: scaleInt.toLocaleString('en-US'),
  };
  const innerWidthMillimeter = paper.widthMillimeter - margin.millimeter * 2;
  const innerHeightMillimeter = paper.heightMillimeter - margin.millimeter * 2;
  const page = {
    widthPixel: toPixel(innerWidthMillimeter),
    heightPixel: toPixel(innerHeightMillimeter),
    widthMeter: (innerWidthMillimeter * scale.value) / 1000,
    heightMeter: (innerHeightMillimeter * scale.value) / 1000,
  };

  const centerXY = turf.toMercator([center.longitude, center.latitude]);
  const [minLon, minLat] = turf.toWgs84([
    centerXY[0] - page.widthMeter / 2 / cosLat,
    centerXY[1] - page.heightMeter / 2 / cosLat,
  ]);
  const [maxLon, maxLat] = turf.toWgs84([
    centerXY[0] + page.widthMeter / 2 / cosLat,
    centerXY[1] + page.heightMeter / 2 / cosLat,
  ]);

  return { paper, margin, scale, page, region: { minLon, minLat, maxLon, maxLat }, centerLatitude: center.latitude };
};

//zoomのタイル1ピクセルあたりの地上距離(m)
export const getTileResolution = (zoom: number, latitude: number) => {
  const resolutionX = (2 * Math.PI * 6378137 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom);
  return resolutionX / 256;
};

//タイル1ピクセルを用紙上の何pxに拡大するか
export const getTileScale = (layout: PageLayout, tileZoom: number) => {
  const resolution = getTileResolution(tileZoom, layout.centerLatitude);
  const pageResolutionX = layout.page.widthMeter / layout.page.widthPixel;
  return resolution / pageResolutionX;
};

/**
 * 用紙上の1pxが地図画面の1ptと同じ地上距離になるズーム（小数）。
 * 地図画面で「このズームのときの見た目」をPDFに再現するために使う（線幅・記号の大きさのズーム連動）。
 * タイルscale倍はズーム差の2の冪そのものなので、tileZoom + log2(tileScale)で求まる。
 */
export const getEquivalentZoom = (tileZoom: number, tileScale: number) => tileZoom + Math.log2(tileScale);

export const getTileShift = (layout: PageLayout, tileZoom: number) => {
  const { minLon, maxLat } = layout.region;
  const { leftTileX, topTileY } = getTileRegion(layout.region, tileZoom);
  const { mercatorX, mercatorY } = tileToWebMercator(leftTileX, topTileY, tileZoom);
  const [x, y] = turf.toMercator([minLon, maxLat]);
  const resolution = getTileResolution(tileZoom, layout.centerLatitude);
  const res = Math.cos((layout.centerLatitude * Math.PI) / 180) / resolution;
  return { shiftX: (x - mercatorX) * res, shiftY: (mercatorY - y) * res };
};

export const getBoundingBox = (region: PdfRegion) => {
  const [minX, minY] = turf.toMercator([region.minLon, region.minLat]);
  const [maxX, maxY] = turf.toMercator([region.maxLon, region.maxLat]);
  return { minX, minY, maxX, maxY };
};

export const getTileFrame = (region: PdfRegion, tileZoom: number): TileFrame => {
  const { leftTileX, rightTileX, bottomTileY, topTileY } = getTileRegion(region, tileZoom);
  const { mercatorX: leftX, mercatorY: bottomY } = tileToWebMercator(leftTileX, bottomTileY + 1, tileZoom);
  const { mercatorX: rightX, mercatorY: topY } = tileToWebMercator(rightTileX + 1, topTileY, tileZoom);
  return {
    leftX,
    rightX,
    bottomY,
    topY,
    width: 256 * (rightTileX - leftTileX + 1),
    height: 256 * (bottomTileY - topTileY + 1),
  };
};

export const projectToPixel = (coord: LocationType, frame: TileFrame) => {
  const [mercatorX, mercatorY] = turf.toMercator([coord.longitude, coord.latitude]);
  const pixelX = ((mercatorX - frame.leftX) / (frame.rightX - frame.leftX)) * frame.width;
  const pixelY = frame.height - ((mercatorY - frame.bottomY) / (frame.topY - frame.bottomY)) * frame.height;
  return { pixelX, pixelY };
};

export const projectAllToPixel = (coords: LocationType[], frame: TileFrame) =>
  coords.map((c) => projectToPixel(c, frame));
