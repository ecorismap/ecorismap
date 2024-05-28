import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  DataType,
  LayerType,
  LocationType,
  ScaleType,
  TileRegionType,
  PaperOrientationType,
  PaperSizeType,
  RecordType,
  ArrowStyleType,
} from '../types';

import { AppState } from '../modules';
import * as Print from 'expo-print';
import { getTileRegion, tileToWebMercator } from '../utils/Tile';
import { useWindow } from './useWindow';
import * as turf from '@turf/turf';
import { generateLabel } from './useLayers';
import { getColor } from '../utils/Layer';
import { isPhotoField } from '../utils/Geometry';
import { Platform } from 'react-native';
import { isBrushTool, isStampTool, toPDFCoordinate, toPixel, toPoint } from '../utils/General';
import { t } from '../i18n/config';
import { convert } from 'react-native-gdalwarp';
import * as FileSystem from 'expo-file-system';
import { COLOR } from '../constants/AppConstants';
import { interpolateLineString, latLonObjectsToLatLonArray } from '../utils/Coords';
import { generateTileMap } from '../utils/PDF';

export type UseEcorisMapFileReturnType = {
  isPDFSettingsVisible: boolean;
  pdfArea: TileRegionType;
  pdfOrientation: PaperOrientationType;
  pdfScale: ScaleType;
  pdfPaperSize: PaperSizeType;
  pdfPaperSizes: PaperSizeType[];
  pdfScales: ScaleType[];
  pdfOrientations: PaperOrientationType[];
  pdfTileMapZoomLevel: string;
  pdfTileMapZoomLevels: string[];
  outputVRT: boolean;
  outputDataPDF: boolean;
  generatePDF: (data: { dataSet: DataType[]; layers: LayerType[] }) => Promise<string | Window | null>;
  generateDataPDF: (data: { dataSet: DataType[]; layers: LayerType[] }) => Promise<string | Window | null>;
  generateVRT: (fileName: string) => string;
  setPdfOrientation: React.Dispatch<React.SetStateAction<PaperOrientationType>>;
  setPdfScale: React.Dispatch<React.SetStateAction<ScaleType>>;
  setPdfPaperSize: React.Dispatch<React.SetStateAction<PaperSizeType>>;
  setIsPDFSettingsVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setPdfTileMapZoomLevel: React.Dispatch<React.SetStateAction<string>>;
  setOutputVRT: React.Dispatch<React.SetStateAction<boolean>>;
  setOutputDataPDF: React.Dispatch<React.SetStateAction<boolean>>;
};

export const usePDF = (): UseEcorisMapFileReturnType => {
  const tileMaps = useSelector((state: AppState) => state.tileMaps);
  const { mapRegion } = useWindow();
  const [outputVRT, setOutputVRT] = useState(false);
  const [outputDataPDF, setOutputDataPDF] = useState(false);
  const [isPDFSettingsVisible, setIsPDFSettingsVisible] = useState(false);
  const [pdfOrientation, setPdfOrientation] = useState<PaperOrientationType>('PORTRAIT');
  const [pdfScale, setPdfScale] = useState<ScaleType>('10000');
  const [pdfPaperSize, setPdfPaperSize] = useState<PaperSizeType>('A4');
  const [pdfTileMapZoomLevel, setPdfTileMapZoomLevel] = useState('16');
  const pdfPaperSizes: PaperSizeType[] = ['A4', 'A3', 'A2', 'A1', 'A0'];
  const pdfScales: ScaleType[] = ['500', '1000', '1500', '2500', '5000', '10000', '25000', '50000', '100000'];
  const pdfOrientations: PaperOrientationType[] = ['PORTRAIT', 'LANDSCAPE'];
  const tracking = useSelector((state: AppState) => state.settings.tracking);

  const pageScale = useMemo(() => {
    const scaleInt = parseInt(pdfScale, 10);
    return {
      value: scaleInt,
      webMercator: Math.round(scaleInt / Math.cos((mapRegion.latitude * Math.PI) / 180)),
      text: scaleInt.toLocaleString('en-US'),
    };
  }, [mapRegion.latitude, pdfScale]);

  const pageMargin = useMemo(() => {
    const millimeter = 10;
    return { millimeter, pixel: toPixel(millimeter) };
  }, []);

  const pdfTileMapZoomLevels = useMemo(() => {
    if (pdfPaperSize === 'A0' || pdfPaperSize === 'A1') {
      switch (pdfScale) {
        case '500':
          return ['17', '18', '19', '20', '21'];
        case '1000':
          return ['16', '17', '18', '19', '20'];
        case '1500':
          return ['15', '16', '17', '18', '19'];
        case '2500':
          return ['14', '15', '16', '17', '18'];
        case '5000':
          return ['13', '14', '15', '16', '17'];
        case '10000':
          return ['12', '13', '14', '15', '16'];
        case '25000':
          return ['11', '12', '13', '14', '15'];
        case '50000':
          return ['10', '11', '12', '13', '14'];
        case '100000':
          return ['9', '10', '11', '12', '13'];
        default:
          return ['10', '11', '12', '13', '14', '15', '16'];
      }
    } else if (pdfPaperSize === 'A2' || pdfPaperSize === 'A3') {
      switch (pdfScale) {
        case '500':
          return ['18', '19', '20', '21', '22'];
        case '1000':
          return ['17', '18', '19', '20', '21'];
        case '1500':
          return ['16', '17', '18', '19', '20'];
        case '2500':
          return ['15', '16', '17', '18', '19'];
        case '5000':
          return ['14', '15', '16', '17', '18'];
        case '10000':
          return ['13', '14', '15', '16', '17'];
        case '25000':
          return ['12', '13', '14', '15', '16'];
        case '50000':
          return ['11', '12', '13', '14', '15'];
        case '100000':
          return ['10', '11', '12', '13', '14'];
        default:
          return ['10', '11', '12', '13', '14', '15', '16'];
      }
    } else if (pdfPaperSize === 'A4') {
      switch (pdfScale) {
        case '500':
          return ['18', '19', '20', '21', '22'];
        case '1000':
          return ['17', '18', '19', '20', '21'];
        case '1500':
          return ['16', '17', '18', '19', '20'];
        case '2500':
          return ['15', '16', '17', '18', '19'];
        case '5000':
          return ['15', '16', '17', '18', '19'];
        case '10000':
          return ['14', '15', '16', '17', '18'];
        case '25000':
          return ['13', '14', '15', '16', '17'];
        case '50000':
          return ['12', '13', '14', '15', '16'];
        case '100000':
          return ['11', '12', '13', '14', '15'];
        default:
          return ['10', '11', '12', '13', '14', '15', '16'];
      }
    } else {
      return ['10', '11', '12', '13', '14', '15', '16'];
    }
  }, [pdfPaperSize, pdfScale]);

  const paperSize = useMemo(() => {
    let widthMillimeter;
    let heightMillimeter;
    let widthPoint;
    let heightPoint;
    let widthPixel;
    let heightPixel;
    switch (pdfPaperSize) {
      case 'A4':
        widthMillimeter = 210;
        heightMillimeter = 297;
        widthPoint = 595;
        heightPoint = 842;
        widthPixel = 794;
        heightPixel = 1123;
        break;
      case 'A3':
        widthMillimeter = 297;
        heightMillimeter = 420;
        widthPoint = 842;
        heightPoint = 1191;
        widthPixel = 1123;
        heightPixel = 1587;

        break;
      case 'A2':
        widthMillimeter = 420;
        heightMillimeter = 594;
        widthPoint = 1191;
        heightPoint = 1684;
        widthPixel = 1587;
        heightPixel = 2245;

        break;
      case 'A1':
        widthMillimeter = 594;
        heightMillimeter = 841;
        widthPoint = 1684;
        heightPoint = 2384;
        widthPixel = 2245;
        heightPixel = 3179;
        break;
      case 'A0':
        widthMillimeter = 841;
        heightMillimeter = 1189;
        widthPoint = 2384;
        heightPoint = 3370;
        widthPixel = 3179;
        heightPixel = 4494;
        break;
    }
    //pdfOrientationによってwidthとheightを入れ替える
    if (pdfOrientation === 'PORTRAIT') {
      return { widthMillimeter, heightMillimeter, widthPoint, heightPoint, widthPixel, heightPixel };
    } else {
      return {
        widthMillimeter: heightMillimeter,
        heightMillimeter: widthMillimeter,
        widthPoint: heightPoint,
        heightPoint: widthPoint,
        widthPixel: heightPixel,
        heightPixel: widthPixel,
      };
    }
  }, [pdfOrientation, pdfPaperSize]);

  const pageSize = useMemo(() => {
    const widthPixel = toPixel(paperSize.widthMillimeter - pageMargin.millimeter * 2);
    const heightPixel = toPixel(paperSize.heightMillimeter - pageMargin.millimeter * 2);
    const widthMeter = ((paperSize.widthMillimeter - pageMargin.millimeter * 2) * pageScale.value) / 1000;
    const heightMeter = ((paperSize.heightMillimeter - pageMargin.millimeter * 2) * pageScale.value) / 1000;
    return { widthPixel, heightPixel, widthMeter, heightMeter };
  }, [pageMargin.millimeter, pageScale.value, paperSize.heightMillimeter, paperSize.widthMillimeter]);

  //引数のzoomに対応するタイルの1ピクセルあたりの距離を返す関数
  const getTileResolution = useCallback((zoom: number, latitude: number) => {
    const resolutionX = (2 * Math.PI * 6378137 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom);
    //const resolutionY = (2 * Math.PI * 6378137) / Math.pow(2, zoom);
    return resolutionX / 256;
  }, []);

  const pdfRegion = useMemo(() => {
    const centerXY = turf.toMercator([mapRegion.longitude, mapRegion.latitude]);
    const minLatLon = turf.toWgs84([
      centerXY[0] - pageSize.widthMeter / 2 / Math.cos((mapRegion.latitude * Math.PI) / 180),
      centerXY[1] - pageSize.heightMeter / 2 / Math.cos((mapRegion.latitude * Math.PI) / 180),
    ]);
    const maxLatLon = turf.toWgs84([
      centerXY[0] + pageSize.widthMeter / 2 / Math.cos((mapRegion.latitude * Math.PI) / 180),
      centerXY[1] + pageSize.heightMeter / 2 / Math.cos((mapRegion.latitude * Math.PI) / 180),
    ]);
    const minLon = minLatLon[0];
    const minLat = minLatLon[1];
    const maxLon = maxLatLon[0];
    const maxLat = maxLatLon[1];
    return { minLon, minLat, maxLon, maxLat };
  }, [mapRegion.latitude, mapRegion.longitude, pageSize.heightMeter, pageSize.widthMeter]);

  const pdfArea: TileRegionType = useMemo(() => {
    const { minLon, minLat, maxLon, maxLat } = pdfRegion;
    return {
      id: '',
      tileMapId: '',
      coords: [
        { latitude: minLat, longitude: minLon },
        { latitude: maxLat, longitude: minLon },
        { latitude: maxLat, longitude: maxLon },
        { latitude: minLat, longitude: maxLon },
      ],
      centroid: {
        latitude: mapRegion.latitude,
        longitude: mapRegion.longitude,
      },
    };
  }, [mapRegion.latitude, mapRegion.longitude, pdfRegion]);

  const convertCoordToPixel = useCallback(
    (
      coord: LocationType,
      leftX: number,
      rightX: number,
      bottomY: number,
      topY: number,
      width: number,
      height: number
    ) => {
      const mercatorCoords = turf.toMercator([coord.longitude, coord.latitude]);
      const mercatorX = mercatorCoords[0];
      const mercatorY = mercatorCoords[1];
      const pixelX = ((mercatorX - leftX) / (rightX - leftX)) * width;
      const pixelY = height - ((mercatorY - bottomY) / (topY - bottomY)) * height;
      return { pixelX, pixelY };
    },
    []
  );
  const convertCoordsToPixels = useCallback(
    (
      coords: LocationType[],
      leftX: number,
      rightX: number,
      bottomY: number,
      topY: number,
      width: number,
      height: number
    ) => coords.map((c) => convertCoordToPixel(c, leftX, rightX, bottomY, topY, width, height)),
    [convertCoordToPixel]
  );

  const getTileScale = useCallback(
    (tileZoom: number) => {
      const resolution = getTileResolution(tileZoom, mapRegion.latitude);
      const pageResolutionX = pageSize.widthMeter / pageSize.widthPixel;
      return resolution / pageResolutionX;
    },
    [getTileResolution, mapRegion.latitude, pageSize.widthMeter, pageSize.widthPixel]
  );

  const getTileShift = useCallback(
    (tileZoom: number) => {
      const { minLon, maxLat } = pdfRegion;
      const { leftTileX, topTileY } = getTileRegion(pdfRegion, tileZoom);
      const { mercatorX, mercatorY } = tileToWebMercator(leftTileX, topTileY, tileZoom);
      const [x, y] = turf.toMercator([minLon, maxLat]);
      const resolution = getTileResolution(tileZoom, mapRegion.latitude);
      const res = Math.cos((mapRegion.latitude * Math.PI) / 180) / resolution;
      const shiftX = (x - mercatorX) * res;
      const shiftY = (mercatorY - y) * res;
      return { shiftX, shiftY };
    },
    [pdfRegion, getTileResolution, mapRegion.latitude]
  );

  const getBoundingBox = useCallback(() => {
    const { minLon, minLat, maxLon, maxLat } = pdfRegion;
    const [minX, minY] = turf.toMercator([minLon, minLat]);
    const [maxX, maxY] = turf.toMercator([maxLon, maxLat]);
    return { minX, minY, maxX, maxY };
  }, [pdfRegion]);

  const generateScaleBar = useCallback(() => {
    const width = (96 / 2.54) * 4;
    const rightScale = (pageScale.value / 100) * 4;
    const middleScale = rightScale / 2;

    const scaleBar = `
      <svg height="80px" style="position: absolute; left: ${pageMargin.pixel}px; top: ${
      pageMargin.pixel + pageSize.heightPixel - 80
    }px;z-index:2">
       <g>
          <!-- スケール比率のテキスト -->
          <text x="${50 + width / 2}" y="25" font-family="Arial" font-size="20" text-anchor="middle">1:${
      pageScale.text
    }</text>
          <!-- スケールバーのライン -->
          <line x1="50" y1="50" x2="${50 + width}" y2="50" stroke="black" stroke-width="2" />
          <!-- 左端のキャップ -->
          <line x1="50" y1="45" x2="50" y2="55" stroke="black" stroke-width="2" />
          <!-- 中間のキャップ -->
          <line x1="${50 + width / 2}" y1="45" x2="${50 + width / 2}" y2="55" stroke="black" stroke-width="2" />
          <!-- 右端のキャップ -->
          <line x1="${50 + width}" y1="45" x2="${50 + width}" y2="55" stroke="black" stroke-width="2" />
          <!-- スケールの値 -->
          <text x="50" y="70" font-family="Arial" font-size="12" text-anchor="middle">0</text>
          <text x="${
            50 + width / 2
          }" y="70" font-family="Arial" font-size="12" text-anchor="middle">${middleScale}</text>
          <text x="${50 + width}" y="70" font-family="Arial" font-size="12" text-anchor="middle">${rightScale}m</text>
       </g>
      </svg>`;
    return scaleBar;
  }, [pageMargin.pixel, pageScale.text, pageScale.value, pageSize.heightPixel]);

  const generateNorthArrow = useCallback(() => {
    const northArrow = `
      <svg style="position: absolute; left: ${pageMargin.pixel + 5}px; top: ${pageMargin.pixel + 10}px;z-index:2">
        <g>
          <circle cx="50" cy="50" r="25" stroke="black" stroke-width="2" fill="none" />
          <path d="M 50,25 L 33,68 L 50,60 L 67,68 Z" fill="black" />
          <text x="50" y="20" font-family="Arial" font-size="20" text-anchor="middle">N</text>
        </g>
      </svg>`;
    return northArrow;
  }, [pageMargin.pixel]);

  const generateCaptions = useCallback(() => {
    const captions = [
      ...new Set(
        tileMaps.filter((m) => m.visible && m.id !== 'standard' && m.id !== 'hybrid').map((m) => m.attribution)
      ),
      'EcorisMap',
    ].join(', ');

    const captionContents = `
      <div
      style="position: absolute; left: ${pageMargin.pixel}; top: ${
      pageMargin.pixel + pageSize.heightPixel - 20
    }; z-index: 2;  width: ${pageSize.widthPixel}px; display: flex; align-items: center; justify-content: flex-end;">
      <span style="margin:0 10px;font-family: Arial; font-size: 12px; color: black;">${captions}</span>
      </div>`;
    return captionContents;
  }, [pageMargin.pixel, pageSize.heightPixel, pageSize.widthPixel, tileMaps]);

  const generateComment = useCallback(() => {
    const commentContents = `
      <div
      style="position: absolute; left: ${pageMargin.pixel}; top: ${
      pageMargin.pixel + pageSize.heightPixel + 3
    }; z-index: 2;  width: ${pageSize.widthPixel}px; display: flex; align-items: center; justify-content: flex-end;">
      <span style="margin:0 10px;font-family: Arial; font-size: 9px; color: black;">${t('hooks.pdf.comment')}</span>
      </div>`;
    return commentContents;
  }, [pageMargin.pixel, pageSize.heightPixel, pageSize.widthPixel]);

  const generateStampSvg = useCallback(
    (
      feature: RecordType,
      tileScale: number,
      leftX: number,
      rightX: number,
      bottomY: number,
      topY: number,
      width: number,
      height: number,
      color: string
    ) => {
      // 緯度経度からピクセル座標に変換
      const pixels = convertCoordsToPixels(
        feature.coords as LocationType[],
        leftX,
        rightX,
        bottomY,
        topY,
        width,
        height
      );

      const stamp = feature.field._stamp as string;
      let svg = '';
      switch (stamp) {
        case 'NUMBERS':
          svg = `<text x="${pixels[0].pixelX}" y="${pixels[0].pixelY}" font-family="Arial" font-size="${
            16 / tileScale
          }" fill="${color}" text-anchor="middle">1</text>`;
          break;
        case 'ALPHABETS':
          svg = `<text x="${pixels[0].pixelX}" y="${pixels[0].pixelY}" font-family="Arial" font-size="${
            16 / tileScale
          }" fill="${color}" text-anchor="middle">A</text>`;
          break;
        case 'TEXT':
          svg = `<text x="${pixels[0].pixelX}" y="${pixels[0].pixelY}" font-family="Arial" font-size="${
            12 / tileScale
          }" fill="${color}" text-anchor="middle">クマタカ</text>`;
          break;
        case 'SQUARE':
          svg = `<rect x="${pixels[0].pixelX - 6 / tileScale}" y="${pixels[0].pixelY - 6 / tileScale}" width="${
            12 / tileScale
          }" height="${12 / tileScale}" stroke="${color}" stroke-width="${2 / tileScale}" fill="${color}" />`;
          break;
        case 'CIRCLE':
          svg = `<circle cx="${pixels[0].pixelX}" cy="${pixels[0].pixelY}" r="${
            6 / tileScale
          }" stroke="${color}" stroke-width="${3 / tileScale}" fill="${color}" />`;
          break;
        case 'TRIANGLE':
          svg = `<polygon points="${pixels[0].pixelX},${pixels[0].pixelY - 6 / tileScale} ${
            pixels[0].pixelX - 6 / tileScale
          },${pixels[0].pixelY + 6 / tileScale} ${pixels[0].pixelX + 6 / tileScale},${
            pixels[0].pixelY + 6 / tileScale
          }" stroke="${color}" stroke-width="${2 / tileScale}" fill="${color}" />`;
          break;
        case 'TOMARI':
          svg = `<circle cx="${pixels[0].pixelX}" cy="${pixels[0].pixelY}" r="${
            4 / tileScale
          }" stroke="#ffffffaa" stroke-width="${1 / tileScale}" fill="${color}" />`;
          break;
        case 'KARI':
          svg = `<line x1="${pixels[0].pixelX - 6 / tileScale}" y1="${pixels[0].pixelY - 6 / tileScale}" x2="${
            pixels[0].pixelX + 6 / tileScale
          }" y2="${pixels[0].pixelY + 6 / tileScale}" stroke="${color}" stroke-width="${2 / tileScale}" />
                <line x1="${pixels[0].pixelX + 6 / tileScale}" y1="${pixels[0].pixelY - 6 / tileScale}" x2="${
            pixels[0].pixelX - 6 / tileScale
          }" y2="${pixels[0].pixelY + 6 / tileScale}" stroke="${color}" stroke-width="${2 / tileScale}" />`;
          break;
        case 'HOVERING':
          svg = `<circle cx="${pixels[0].pixelX}" cy="${pixels[0].pixelY}" r="${
            7 / tileScale
          }" stroke="${color}" stroke-width="${1 / tileScale}" fill="#ffffffaa" />
                <text x="${pixels[0].pixelX}" y="${pixels[0].pixelY + 4 / tileScale}" font-family="Arial" font-size="${
            12 / tileScale
          }" fill="${color}" text-anchor="middle">H</text>`;
          break;
        default:
          svg = '';
          break;
      }

      return svg;
    },
    [convertCoordsToPixels]
  );

  const generateBrushSvg = useCallback(
    (
      feature: RecordType,
      tileScale: number,
      leftX: number,
      rightX: number,
      bottomY: number,
      topY: number,
      width: number,
      height: number,
      color: string
    ) => {
      const latlon = latLonObjectsToLatLonArray(feature.coords as LocationType[]);
      const brushLatLon = interpolateLineString(latlon, (pageScale.value / 10000) * 0.1);

      const brush = feature.field._strokeStyle as string;
      let svg = '';
      brushLatLon.forEach(({ coordinates, angle }) => {
        const point = convertCoordToPixel(
          { latitude: coordinates[1], longitude: coordinates[0] },
          leftX,
          rightX,
          bottomY,
          topY,
          width,
          height
        );

        switch (brush) {
          case 'PLUS':
            svg += `<line x1="${point.pixelX - 5 / tileScale}" y1="${point.pixelY}" x2="${
              point.pixelX + 5 / tileScale
            }" y2="${point.pixelY}" stroke="${color}" stroke-width="${1.5 / tileScale}"  transform="rotate(${angle}, ${
              point.pixelX
            }, ${point.pixelY})"/>`;
            break;
          case 'CROSS':
            svg += `<line x1="${point.pixelX}" y1="${point.pixelY}" x2="${point.pixelX + 10 / tileScale}" y2="${
              point.pixelY
            }" stroke="${color}" stroke-width="${1.5 / tileScale}"  transform="rotate(${angle}, ${point.pixelX}, ${
              point.pixelY
            })"/>`;
            break;
          case 'SENKAI':
            svg += `<circle cx="${point.pixelX + 5 / tileScale}" cy="${point.pixelY}" r="${
              4 / tileScale
            }" stroke="${color}" stroke-width="${1.5 / tileScale}" fill="none" transform="rotate(${angle}, ${
              point.pixelX
            }, ${point.pixelY})" />`;
            break;
          case 'SENJYOU':
            svg += `<circle cx="${point.pixelX + 5 / tileScale}" cy="${point.pixelY}" r="${
              4 / tileScale
            }" stroke="${color}" stroke-width="${1.5 / tileScale}" fill="none" transform="rotate(${angle}, ${
              point.pixelX
            }, ${point.pixelY})" />
              <circle cx="${point.pixelX + 5 / tileScale}" cy="${point.pixelY}" r="${
              2 / tileScale
            }" stroke="${color}" stroke-width="${1.5 / tileScale}" fill="none" transform="rotate(${angle}, ${
              point.pixelX
            }, ${point.pixelY})" />`;
            break;
          case 'KOUGEKI':
            svg += `<polygon points="${point.pixelX},${point.pixelY - 6 / tileScale} ${point.pixelX + 10 / tileScale},${
              point.pixelY
            } ${point.pixelX},${
              point.pixelY + 6 / tileScale
            }" stroke="none" fill="${color}" transform="rotate(${angle}, ${point.pixelX}, ${point.pixelY})" />`;
            break;

          case 'DISPLAY':
            svg += `<path d="M${point.pixelX - 6 / tileScale},${point.pixelY + 9 / tileScale} L${
              point.pixelX + 6 / tileScale
            },${point.pixelY + 3 / tileScale} L${point.pixelX - 6 / tileScale},${point.pixelY - 3 / tileScale}  L${
              point.pixelX + 6 / tileScale
            },${point.pixelY - 9 / tileScale}" 
            stroke="${color}" stroke-width="${1.5 / tileScale}" fill="none" transform="rotate(${angle}, ${
              point.pixelX
            }, ${point.pixelY})" />`;
            break;
          case 'KYUKOKA':
            svg += `<path d="M${point.pixelX - 5 / tileScale},${point.pixelY - 3 / tileScale} L${point.pixelX},${
              point.pixelY - 8 / tileScale
            } L${point.pixelX + 5 / tileScale},${point.pixelY - 3 / tileScale}" stroke="${color}" stroke-width="${
              1.5 / tileScale
            }" fill="none" transform="rotate(${angle},
              ${point.pixelX}, ${point.pixelY})" />
              <path d="M${point.pixelX - 5 / tileScale},${point.pixelY + 2 / tileScale} L${point.pixelX},${
              point.pixelY - 3 / tileScale
            } L${point.pixelX + 5 / tileScale},${point.pixelY + 2 / tileScale}" stroke="${color}" stroke-width="${
              1.5 / tileScale
            }" fill="none" transform="rotate(${angle},
              ${point.pixelX}, ${point.pixelY})" />
              <path d="M${point.pixelX - 5 / tileScale},${point.pixelY + 7 / tileScale} L${point.pixelX},${
              point.pixelY + 2 / tileScale
            } L${point.pixelX + 5 / tileScale},${point.pixelY + 7 / tileScale}" stroke="${color}" stroke-width="${
              1.5 / tileScale
            }" fill="none" transform="rotate(${angle},
              ${point.pixelX}, ${point.pixelY})" />`;

            break;
          default:
            svg += '';
            break;
        }
      });

      return svg;

      // return `<polyline points="${points}" style="fill:none; stroke:${color}; stroke-width:${
      //   strokeWidth + 5
      // }; stroke-opacity:1;"/>`;
    },
    [convertCoordToPixel, pageScale.value]
  );

  const generatePointSvg = useCallback(
    (
      feature: RecordType,
      layer: LayerType,
      tileScale: number,
      leftX: number,
      rightX: number,
      bottomY: number,
      topY: number,
      width: number,
      height: number
    ) => {
      const label = generateLabel(layer, feature);
      const color = getColor(layer, feature, 0);
      const pixels = convertCoordsToPixels(
        [feature.coords] as LocationType[],
        leftX,
        rightX,
        bottomY,
        topY,
        width,
        height
      );
      const pixelX = pixels[0].pixelX;
      const pixelY = pixels[0].pixelY;

      return `<circle cx="${pixelX}" cy="${pixelY}" r="${
        4 / tileScale
      }" style="fill:${color}; stroke:white; stroke-width:${0.2 / tileScale};"></circle>
            <text x="${pixelX + 0.5}" y="${pixelY + 0.5}" fill="${color}" font-size="${
        12 / tileScale
      }" font-family="Arial" text-anchor="start" stroke="white" stroke-width="0.2" paint-order="stroke">${label}</text>`;
    },
    [convertCoordsToPixels]
  );

  const generateArrowSvg = useCallback(
    (
      pixels: { pixelX: number; pixelY: number }[],
      color: string,
      strokeWidth: number,
      arrowStyle: ArrowStyleType | undefined,
      tileScale: number
    ) => {
      let svg = '';
      if (arrowStyle === 'NONE' || arrowStyle === undefined) return svg;
      const p0 = [pixels[0].pixelX, pixels[0].pixelY];
      const p1 = [pixels[1].pixelX, pixels[1].pixelY];
      const p2 = [pixels[pixels.length - 2].pixelX, pixels[pixels.length - 2].pixelY];
      const p3 = [pixels[pixels.length - 1].pixelX, pixels[pixels.length - 1].pixelY];
      // 矢印の向きを計算. 0度が北で時計回り.三角関数で計算
      const bearingEnd = Math.atan2(p3[1] - p2[1], p3[0] - p2[0]) * (180 / Math.PI);
      const angleEnd = (bearingEnd + 360 + 90) % 360;
      const bearingStart = Math.atan2(p0[1] - p1[1], p0[0] - p1[0]) * (180 / Math.PI);
      const angleStart = (bearingStart + 360 + 90) % 360;

      const scale = Math.sqrt(strokeWidth - 1) / tileScale;
      const originalSize = 20;
      // scaleに基づいた新しいサイズを計算
      const size = originalSize * scale;

      // Pathのd属性をscaleに基づいて調整
      const scaledPath = `M${10 * scale} ${7 * scale} L${5 * scale} ${20 * scale} L${10 * scale} ${18 * scale} L${
        15 * scale
      } ${20 * scale} Z`;

      svg += `<path d="${scaledPath}" fill="${color}" stroke="white" stroke-width="0.2" transform="translate(${
        p3[0] - size / 2
      },${p3[1] - size / 2}) rotate(${angleEnd}, ${size / 2}, ${size / 2})" />`;

      if (arrowStyle === 'ARROW_BOTH') {
        svg += `<path d="${scaledPath}" fill="${color}" stroke="white" stroke-width="0.2" transform="translate(${
          p0[0] - size / 2
        },${p0[1] - size / 2}) rotate(${angleStart}, ${size / 2}, ${size / 2})" />`;
      }
      return svg;
    },
    []
  );

  const generatePolyLineSvg = useCallback(
    (
      feature: RecordType,
      layer: LayerType,
      tileScale: number,
      leftX: number,
      rightX: number,
      bottomY: number,
      topY: number,
      width: number,
      height: number,
      lineColor: string
    ) => {
      let label = generateLabel(layer, feature);

      let strokeWidth;
      if (tracking?.dataId === feature.id) {
        strokeWidth = 4;
        label = '';
      } else if (layer.colorStyle.colorType === 'INDIVIDUAL') {
        if (feature.field._strokeWidth !== undefined) {
          strokeWidth = feature.field._strokeWidth as number;
        } else {
          strokeWidth = 1.5;
        }
      } else if (layer.colorStyle.lineWidth !== undefined) {
        strokeWidth = layer.colorStyle.lineWidth;
      } else {
        strokeWidth = 1.5;
      }

      const arrowStyle = feature.field._strokeStyle as ArrowStyleType | undefined;
      const pixels = convertCoordsToPixels(
        feature.coords as LocationType[],
        leftX,
        rightX,
        bottomY,
        topY,
        width,
        height
      );
      let points = '';
      pixels.forEach((p) => {
        points += `${p.pixelX},${p.pixelY} `;
      });

      const labelPosition = { x: pixels[pixels.length - 1].pixelX + 5, y: pixels[pixels.length - 1].pixelY + 5 };
      let svg = '';
      svg += `<polyline points="${points}" fill="none" stroke="${lineColor}" stroke-width="${
        strokeWidth / tileScale
      }" />`;

      svg += generateArrowSvg(pixels, lineColor, strokeWidth, arrowStyle, tileScale);

      svg += `<text x="${labelPosition.x}" y="${labelPosition.y}" fill="${lineColor}" font-size="${
        12 / tileScale
      }" font-family="Arial" text-anchor="start" stroke="white" stroke-width="${
        0.2 / tileScale
      }" paint-order="stroke">${label}</text>`;
      return svg;
    },
    [convertCoordsToPixels, generateArrowSvg, tracking?.dataId]
  );

  const generateLineSvg = useCallback(
    (
      feature: RecordType,
      layer: LayerType,
      tileScale: number,
      leftX: number,
      rightX: number,
      bottomY: number,
      topY: number,
      width: number,
      height: number
    ) => {
      const color = getColor(layer, feature, 0);
      const lineColor = tracking?.dataId === feature.id ? COLOR.TRACK : color;
      if (isStampTool(feature.field._stamp as string)) {
        return generateStampSvg(feature, tileScale, leftX, rightX, bottomY, topY, width, height, lineColor);
      } else if (isBrushTool(feature.field._strokeStyle as string)) {
        return generateBrushSvg(feature, tileScale, leftX, rightX, bottomY, topY, width, height, lineColor);
      } else {
        return generatePolyLineSvg(feature, layer, tileScale, leftX, rightX, bottomY, topY, width, height, lineColor);
      }
    },
    [generateBrushSvg, generatePolyLineSvg, generateStampSvg, tracking?.dataId]
  );

  const generatePolygonSvg = useCallback(
    (
      feature: RecordType,
      layer: LayerType,
      tileScale: number,
      leftX: number,
      rightX: number,
      bottomY: number,
      topY: number,
      width: number,
      height: number
    ) => {
      const label = generateLabel(layer, feature);
      const color = getColor(layer, feature, 0);
      const transparency = layer.colorStyle.transparency;
      const polygonColor = getColor(layer, feature, transparency);
      const strokeWidth = layer.colorStyle.lineWidth || 1.5;

      const pixels = convertCoordsToPixels(
        feature.coords as LocationType[],
        leftX,
        rightX,
        bottomY,
        topY,
        width,
        height
      );
      const outerPath = 'M ' + pixels.map((p) => `${p.pixelX},${p.pixelY}`).join(' L ') + ' Z';
      let innerPaths = '';

      if (feature.holes) {
        Object.values(feature.holes).forEach((hole) => {
          const holePixels = convertCoordsToPixels(hole, leftX, rightX, bottomY, topY, width, height);
          innerPaths += ' M ' + holePixels.map((p) => `${p.pixelX},${p.pixelY}`).join(' L ') + ' Z';
        });
      }

      return `<path d="${outerPath} ${innerPaths}" fill="${polygonColor}" stroke="${color}" stroke-width="${
        strokeWidth / tileScale
      }" />
            <text x="${pixels[pixels.length - 1].pixelX + 5}" y="${
        pixels[pixels.length - 1].pixelY + 5
      }" fill="${color}" font-size="${
        12 / tileScale
      }" font-family="Arial" text-anchor="start" stroke="white" stroke-width="${
        0.2 / tileScale
      }" paint-order="stroke">${label}</text>`;
    },
    [convertCoordsToPixels]
  );

  const generateVectorMap = useCallback(
    (data: { dataSet: DataType[]; layers: LayerType[] }) => {
      const tileZoom = parseInt(pdfTileMapZoomLevel, 10);
      const { leftTileX, rightTileX, bottomTileY, topTileY } = getTileRegion(pdfRegion, tileZoom);
      const width = 256 * (rightTileX - leftTileX + 1);
      const height = 256 * (bottomTileY - topTileY + 1);
      const { mercatorX: leftX, mercatorY: bottomY } = tileToWebMercator(leftTileX, bottomTileY + 1, tileZoom);
      const { mercatorX: rightX, mercatorY: topY } = tileToWebMercator(rightTileX + 1, topTileY, tileZoom);
      const tileScale = getTileScale(tileZoom);
      // SVG コンテナの開始
      let svgContent = `<svg width="${width}px" height="${height}px" style="position: absolute; left: 0; top: 0;">`;

      data.dataSet.forEach((d) => {
        const layer = data.layers.find((l) => l.id === d.layerId);
        if (layer === undefined) return;
        // レイヤータイプごとに適切なSVG生成関数を呼び出し
        if (layer.type === 'POINT' && layer.visible) {
          d.data.forEach((f) => {
            svgContent += generatePointSvg(f, layer, tileScale, leftX, rightX, bottomY, topY, width, height);
          });
        } else if (layer.type === 'LINE' && layer.visible) {
          d.data.forEach((f) => {
            svgContent += generateLineSvg(f, layer, tileScale, leftX, rightX, bottomY, topY, width, height);
          });
        } else if (layer.type === 'POLYGON' && layer.visible) {
          d.data.forEach((f) => {
            svgContent += generatePolygonSvg(f, layer, tileScale, leftX, rightX, bottomY, topY, width, height);
          });
        }
      });
      svgContent += '</svg>';
      return svgContent;
    },
    [generateLineSvg, generatePointSvg, generatePolygonSvg, getTileScale, pdfRegion, pdfTileMapZoomLevel]
  );

  const generateVRT = useCallback(
    (fileName: string) => {
      const { minX, minY, maxX, maxY } = getBoundingBox();
      const leftPDFCoordinate = toPDFCoordinate(pageMargin.millimeter);
      const rightPDFCoordinate = toPDFCoordinate(paperSize.widthMillimeter - pageMargin.millimeter);
      const topPDFCoordinate = toPDFCoordinate(pageMargin.millimeter);
      const bottomPDFCoordinate = toPDFCoordinate(paperSize.heightMillimeter - pageMargin.millimeter);
      //PointからPDFCoordinateに変換しないと出力されたPDFと値がずれてQGISでエラーになる
      //roundではなくfloorにしないとWebの出力と値がずれてQGISでエラーになる
      //gdalinfo ecorismap.pdfの出力結果と計算したXsize,YSizeが異なるとQGISでエラーになる。
      //出力されるPDFのサイズがOSによって微妙に異なるため調整が必要
      const XSize = Math.floor((paperSize.widthPoint * 150) / 72);
      const YSize = Math.floor((paperSize.heightPoint * 150) / 72);

      //gdal_translateでVRTを作成するコマンド
      //const cmd = `gdal_translate -of vrt -a_srs epsg:3857 ecorismap.pdf ecorismap.vrt -gcp ${leftPDFCoordinate} ${topPDFCoordinate} ${minX} ${maxY} -gcp ${rightPDFCoordinate} ${topPDFCoordinate} ${maxX} ${maxY} -gcp ${leftPDFCoordinate} ${bottomPDFCoordinate} ${minX} ${minY} -gcp ${rightPDFCoordinate} ${bottomPDFCoordinate} ${maxX} ${minY}`;
      //console.log(cmd);

      const vrt = `
    <VRTDataset rasterXSize="${XSize}" rasterYSize="${YSize}">
      <Metadata>
      </Metadata>
      <GCPList Projection="PROJCS[&quot;WGS 84 / Pseudo-Mercator&quot;,GEOGCS[&quot;WGS 84&quot;,DATUM[&quot;WGS_1984&quot;,SPHEROID[&quot;WGS 84&quot;,6378137,298.257223563,AUTHORITY[&quot;EPSG&quot;,&quot;7030&quot;]],AUTHORITY[&quot;EPSG&quot;,&quot;6326&quot;]],PRIMEM[&quot;Greenwich&quot;,0,AUTHORITY[&quot;EPSG&quot;,&quot;8901&quot;]],UNIT[&quot;degree&quot;,0.0174532925199433,AUTHORITY[&quot;EPSG&quot;,&quot;9122&quot;]],AUTHORITY[&quot;EPSG&quot;,&quot;4326&quot;]],PROJECTION[&quot;Mercator_1SP&quot;],PARAMETER[&quot;central_meridian&quot;,0],PARAMETER[&quot;scale_factor&quot;,1],PARAMETER[&quot;false_easting&quot;,0],PARAMETER[&quot;false_northing&quot;,0],UNIT[&quot;metre&quot;,1,AUTHORITY[&quot;EPSG&quot;,&quot;9001&quot;]],AXIS[&quot;Easting&quot;,EAST],AXIS[&quot;Northing&quot;,NORTH],EXTENSION[&quot;PROJ4&quot;,&quot;+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs&quot;],AUTHORITY[&quot;EPSG&quot;,&quot;3857&quot;]]" dataAxisToSRSAxisMapping="1,2">
        <GCP Id="" Pixel="${leftPDFCoordinate}" Line="${topPDFCoordinate}" X="${minX}" Y="${maxY}" />
        <GCP Id="" Pixel="${rightPDFCoordinate}" Line="${topPDFCoordinate}" X="${maxX}" Y="${maxY}" />
        <GCP Id="" Pixel="${leftPDFCoordinate}" Line="${bottomPDFCoordinate}" X="${minX}" Y="${minY}" />
        <GCP Id="" Pixel="${rightPDFCoordinate}" Line="${bottomPDFCoordinate}" X="${maxX}" Y="${minY}" />
      </GCPList>
      <VRTRasterBand dataType="Byte" band="1" blockYSize="1">
        <ColorInterp>Red</ColorInterp>
        <SimpleSource>
          <SourceFilename relativeToVRT="1">${fileName}</SourceFilename>
          <SourceBand>1</SourceBand>
          <SourceProperties RasterXSize="${XSize}" RasterYSize="${YSize}" DataType="Byte" BlockXSize="${XSize}" BlockYSize="1" />
          <SrcRect xOff="0" yOff="0" xSize="${XSize}" ySize="${YSize}" />
          <DstRect xOff="0" yOff="0" xSize="${XSize}" ySize="${YSize}" />
        </SimpleSource>
      </VRTRasterBand>
      <VRTRasterBand dataType="Byte" band="2" blockYSize="1">
        <ColorInterp>Green</ColorInterp>
        <SimpleSource>
          <SourceFilename relativeToVRT="1">${fileName}</SourceFilename>
          <SourceBand>2</SourceBand>
          <SourceProperties RasterXSize="${XSize}" RasterYSize="${YSize}" DataType="Byte" BlockXSize="${XSize}" BlockYSize="1" />
          <SrcRect xOff="0" yOff="0" xSize="${XSize}" ySize="${YSize}" />
          <DstRect xOff="0" yOff="0" xSize="${XSize}" ySize="${YSize}" />
        </SimpleSource>
      </VRTRasterBand>
      <VRTRasterBand dataType="Byte" band="3" blockYSize="1">
        <ColorInterp>Blue</ColorInterp>
        <SimpleSource>
          <SourceFilename relativeToVRT="1">${fileName}</SourceFilename>
          <SourceBand>3</SourceBand>
          <SourceProperties RasterXSize="${XSize}" RasterYSize="${YSize}" DataType="Byte" BlockXSize="${XSize}" BlockYSize="1" />
          <SrcRect xOff="0" yOff="0" xSize="${XSize}" ySize="${YSize}" />
          <DstRect xOff="0" yOff="0" xSize="${XSize}" ySize="${YSize}" />
        </SimpleSource>
      </VRTRasterBand>
    </VRTDataset>
    `;
      return vrt;
    },
    [
      getBoundingBox,
      pageMargin.millimeter,
      paperSize.heightMillimeter,
      paperSize.heightPoint,
      paperSize.widthMillimeter,
      paperSize.widthPoint,
    ]
  );

  const generateCompositionXML = useCallback(
    async (uri: string) => {
      const { minX, minY, maxX, maxY } = getBoundingBox();
      //bboxに対応するpdfのポイント座標を計算する
      const leftPoint = toPoint(pageMargin.millimeter);
      const rightPoint = toPoint(paperSize.widthMillimeter - pageMargin.millimeter);
      const topPoint = toPoint(pageMargin.millimeter);
      const bottomPoint = toPoint(paperSize.heightMillimeter - pageMargin.millimeter);

      //以下のコマンドでgeoPDFを作成することができる
      //現時点では、VRTの方がQGISで直接読み込めるため、使用しない
      //gdal_create test.pdf -co COMPOSITION_FILE=input.xml

      const xml = `
    <PDFComposition>
      <Metadata>
          <Author>EcorisMap</Author>
      </Metadata>
      <Page id="page_1">
          <DPI>300</DPI>
          <Width>${paperSize.widthPoint}</Width>
          <Height>${paperSize.heightPoint}</Height>
          <Georeferencing id="georeferenced">
            <SRS dataAxisToSRSAxisMapping="2,1">EPSG:3857</SRS>
            <ControlPoint x="${leftPoint}"  y="${bottomPoint}"  GeoY="${maxY}"  GeoX="${minX}"/>
            <ControlPoint x="${rightPoint}"  y="${bottomPoint}"  GeoY="${maxY}"  GeoX="${maxX}"/>
            <ControlPoint x="${leftPoint}"  y="${topPoint}"  GeoY="${minY}"  GeoX="${minX}"/>
            <ControlPoint x="${rightPoint}"  y="${topPoint}"  GeoY="${minY}"  GeoX="${maxX}"/>
          </Georeferencing>
          <Content>
            <PDF dataset="${uri.replace('file://', '')}">
              <Blending function="Normal" opacity="1"/>
            </PDF>
          </Content>
      </Page> 
    </PDFComposition>
    `;

      const xmlUri = uri.replace('.pdf', '.xml');
      await FileSystem.writeAsStringAsync(xmlUri, xml, { encoding: FileSystem.EncodingType.UTF8 });

      return xmlUri;
    },
    [
      getBoundingBox,
      pageMargin.millimeter,
      paperSize.heightMillimeter,
      paperSize.heightPoint,
      paperSize.widthMillimeter,
      paperSize.widthPoint,
    ]
  );

  const generatePDF = useCallback(
    async (data: { dataSet: DataType[]; layers: LayerType[] }) => {
      const tileZoom = parseInt(pdfTileMapZoomLevel, 10);
      const tileScale = getTileScale(tileZoom);
      const { shiftX, shiftY } = getTileShift(tileZoom);

      // タイル地図を作成するための HTML
      let mapContents = `<div style="position: absolute; left: ${pageMargin.pixel}; top:${pageMargin.pixel};width: ${pageSize.widthPixel}px;height: ${pageSize.heightPixel}px;overflow: hidden;">`;
      mapContents += `<div style="transform-origin: ${shiftX}px ${shiftY}px;transform: translate(-${shiftX}px, -${shiftY}px) scale(${tileScale}, ${tileScale});">`;
      mapContents += await generateTileMap(tileMaps, pdfRegion, pdfTileMapZoomLevel);
      mapContents += generateVectorMap(data);
      mapContents += '</div>';
      mapContents += '</div>';

      let html = `<html><head><style> @page { margin:0px;padding:0px;size: ${paperSize.widthMillimeter}mm ${paperSize.heightMillimeter}mm;} </style></head>`;
      html += `<body style="margin:0;width:${paperSize.widthPixel}px;height:${paperSize.heightPixel - 2}px;">`; //-2pxはiOSで次ページに行ってしまうのを防ぐため
      html += generateNorthArrow();
      html += generateScaleBar();
      html += generateCaptions();
      html += generateComment();
      html += mapContents;
      html += '</body></html>';

      //console.log(html);
      try {
        //Androidの場合はwidthとheightに+1しないとvrtのXSize,YSizeとずれてQGISでエラーになる。
        const outputWidth = Platform.OS === 'android' ? paperSize.widthPoint + 1 : paperSize.widthPoint;
        const outputHeight = Platform.OS === 'android' ? paperSize.heightPoint + 1 : paperSize.heightPoint;
        if (Platform.OS === 'web') {
          const pW = window.open('', '', `height=${paperSize.heightPixel}px, width=${paperSize.widthPixel}px`);
          pW!.document.write(html);
          pW!.document.close();
          return pW;
        } else {
          const { uri } = await Print.printToFileAsync({
            html,
            width: outputWidth,
            height: outputHeight,
          });
          //console.log(uri);
          const xmlUri = await generateCompositionXML(uri);
          const { outputFiles } = await convert(xmlUri.replace('file://', '')).catch((error) => {
            console.error(error);
            return { outputFiles: [] };
          });
          if (outputFiles.length === 0) return null;
          return 'file://' + outputFiles[0].uri;
        }
      } catch (error) {
        console.error('!!!', error);
        return null;
      }
    },
    [
      generateCaptions,
      generateComment,
      generateCompositionXML,
      generateNorthArrow,
      generateScaleBar,
      generateVectorMap,
      getTileScale,
      getTileShift,
      pageMargin.pixel,
      pageSize.heightPixel,
      pageSize.widthPixel,
      paperSize.heightMillimeter,
      paperSize.heightPixel,
      paperSize.heightPoint,
      paperSize.widthMillimeter,
      paperSize.widthPixel,
      paperSize.widthPoint,
      pdfRegion,
      pdfTileMapZoomLevel,
      tileMaps,
    ]
  );

  const generateHTMLTable = useCallback((dataSet: RecordType[], field: LayerType['field']) => {
    let html = '<table style="border: 1px solid black; border-collapse: collapse;">';
    html += '<thead>';
    html += '<tr>';
    const cellWidth = 800 / field.length;
    const fontSize = cellWidth > 80 ? 12 : 10;
    field.forEach((f) => {
      html += `<th style="border: 1px solid black; padding: 10px;background-color: #f2f2f2;font-size:${fontSize}px;"><div style="max-height:45px;max-width:${cellWidth}px;">${f.name}</div></th>`;
    });
    html += '</tr>';
    html += '</thead>';
    html += '<tbody>';
    dataSet.forEach((record) => {
      const isGroupParent = record.field._group ? record.field._group === '' : true;
      if (!isGroupParent) return;
      html += '<tr>';
      field.forEach((f) => {
        const fieldValue = record.field[f.name];
        if (isPhotoField(fieldValue)) {
          html += `<td style="overflow-wrap: break-word;word-wrap: break-word;white-space: normal;border: 1px solid black; padding: 10px;font-size:${fontSize}px;"><div style="max-height:45px;max-width:${cellWidth}px;">${fieldValue
            .map((p) => p.name)
            .join(',')}</div></td>`;
        } else {
          html += `<td style="overflow-wrap: break-word;word-wrap: break-word;white-space: normal;border: 1px solid black; padding: 10px;font-size:${fontSize}px;"><div style="max-height:45px;max-width:${cellWidth}px;">${fieldValue}</div></td>`;
        }
      });
      html += '</tr>';
    });
    html += '</tbody>';
    html += '</table>';
    return html;
  }, []);

  const generateDataPDF = useCallback(
    async (data: { dataSet: DataType[]; layers: LayerType[] }) => {
      // PDF を作成するための HTML
      let html = `<html><head><style> @page { size: 297mm 210mm;} </style></head>`;
      html += `<body style="width:1123px;height:794px;padding:30px;">`;
      for (const layer of data.layers) {
        const records = data.dataSet.map((d) => (d.layerId === layer.id ? d.data.map((v) => v) : [])).flat();
        const layerName = layer.name;
        const table = generateHTMLTable(records, layer.field);
        html += `<h1>${layerName}</h1>`;
        html += table;
        html += '<div style="page-break-after: always;"></div>'; // ページブレークを追加
      }
      html += '</body></html>';
      //console.log(html);
      if (Platform.OS === 'web') {
        const pW = window.open('', '', `height=794px, width=1123px`);
        pW!.document.write(html);
        pW!.document.close();
        return pW;
      } else {
        const { uri } = await Print.printToFileAsync({
          html,
          width: 842,
          height: 595,
          margins: {
            top: 30,
            bottom: 30,
            left: 30,
            right: 30,
          },
        });
        return uri;
      }
    },
    [generateHTMLTable]
  );

  useEffect(() => {
    //pdfScaleが変更されたらpdfTileMapZoomLevelをリセットして最後から3番目のズームレベルにする
    setPdfTileMapZoomLevel(pdfTileMapZoomLevels[pdfTileMapZoomLevels.length - 3]);
  }, [pdfTileMapZoomLevels]);

  return {
    isPDFSettingsVisible,
    pdfArea,
    pdfOrientation,
    pdfScale,
    pdfPaperSize,
    pdfPaperSizes,
    pdfScales,
    pdfOrientations,
    pdfTileMapZoomLevel,
    pdfTileMapZoomLevels,
    outputVRT,
    outputDataPDF,
    generatePDF,
    generateDataPDF,
    generateVRT,
    setPdfOrientation,
    setPdfScale,
    setPdfPaperSize,
    setIsPDFSettingsVisible,
    setPdfTileMapZoomLevel,
    setOutputVRT,
    setOutputDataPDF,
  } as const;
};
