import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { DataType, LayerType, ScaleType, TileRegionType, PaperOrientationType, PaperSizeType } from '../types';

import { RootState } from '../store';
import * as Print from 'expo-print';
import { useWindow } from './useWindow';
import { Platform } from 'react-native';
import { t } from '../i18n/config';
import { convert } from 'react-native-gdalwarp';
import * as FileSystem from 'expo-file-system/legacy';
import { generateTileMap } from '../utils/PDF';
import {
  computePageLayout,
  getEquivalentZoom,
  getTileFrame,
  getTileScale,
  getTileShift,
} from '../utils/pdfExport/geometry';
import { generateVectorMapSvg } from '../utils/pdfExport/svg';
import {
  generateCaptions,
  generateComment,
  generateDataHTML,
  generateNorthArrow,
  generateScaleBar,
} from '../utils/pdfExport/html';
import { generateCompositionXML, generateVRT as buildVRT } from '../utils/pdfExport/georef';
import {
  buildAttributionText,
  getPdfMapNotices,
  getPrintableTileMaps,
  UnprintableReason,
} from '../utils/pdfExport/tiles';

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
  //表示中だがPDFに載らない地図（出力前の通知用）
  pdfMapNotices: { name: string; reason: UnprintableReason }[];
  //Webは印刷用ウィンドウを渡すとそこへ書き込む（ポップアップブロックを避けるため、クリック直後に開いたものを渡す）
  generatePDF: (
    data: { dataSet: DataType[]; layers: LayerType[] },
    targetWindow?: Window
  ) => Promise<string | Window | null>;
  generateDataPDF: (
    data: { dataSet: DataType[]; layers: LayerType[] },
    targetWindow?: Window
  ) => Promise<string | Window | null>;
  generateVRT: (fileName: string) => string;
  setPdfOrientation: React.Dispatch<React.SetStateAction<PaperOrientationType>>;
  setPdfScale: React.Dispatch<React.SetStateAction<ScaleType>>;
  setPdfPaperSize: React.Dispatch<React.SetStateAction<PaperSizeType>>;
  setIsPDFSettingsVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setPdfTileMapZoomLevel: React.Dispatch<React.SetStateAction<string>>;
  setOutputVRT: React.Dispatch<React.SetStateAction<boolean>>;
  setOutputDataPDF: React.Dispatch<React.SetStateAction<boolean>>;
};

const writeToWindow = (html: string, targetWindow: Window | undefined, width: number, height: number) => {
  const pW = targetWindow ?? window.open('', '', `height=${height}px, width=${width}px`);
  if (pW) {
    pW.document.open();
    pW.document.write(html);
    pW.document.close();
  }
  return pW;
};

export const usePDF = (): UseEcorisMapFileReturnType => {
  const tileMaps = useSelector((state: RootState) => state.tileMaps);
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
  const isWeb = Platform.OS === 'web';

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

  const layout = useMemo(
    () =>
      computePageLayout({
        paperSize: pdfPaperSize,
        orientation: pdfOrientation,
        scale: pdfScale,
        center: { latitude: mapRegion.latitude, longitude: mapRegion.longitude },
      }),
    [mapRegion.latitude, mapRegion.longitude, pdfOrientation, pdfPaperSize, pdfScale]
  );

  const pdfArea: TileRegionType = useMemo(() => {
    const { minLon, minLat, maxLon, maxLat } = layout.region;
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
  }, [layout.region, mapRegion.latitude, mapRegion.longitude]);

  const pdfMapNotices = useMemo(() => getPdfMapNotices(tileMaps, isWeb), [isWeb, tileMaps]);

  const generateVRT = useCallback((fileName: string) => buildVRT(layout, fileName), [layout]);

  const generatePDF = useCallback(
    async (data: { dataSet: DataType[]; layers: LayerType[] }, targetWindow?: Window) => {
      try {
        const tileZoom = parseInt(pdfTileMapZoomLevel, 10);
        const tileScale = getTileScale(layout, tileZoom);
        const { shiftX, shiftY } = getTileShift(layout, tileZoom);
        const svgContext = {
          frame: getTileFrame(layout.region, tileZoom),
          tileScale,
          zoom: getEquivalentZoom(tileZoom, tileScale),
        };
        const { paper, margin, page } = layout;

        // タイル地図を作成するための HTML
        let mapContents = `<div style="position: absolute; left: ${margin.pixel}px; top:${margin.pixel}px;width: ${page.widthPixel}px;height: ${page.heightPixel}px;overflow: hidden;">`;
        mapContents += `<div style="transform-origin: ${shiftX}px ${shiftY}px;transform: translate(-${shiftX}px, -${shiftY}px) scale(${tileScale}, ${tileScale});">`;
        mapContents += await generateTileMap(tileMaps, layout.region, pdfTileMapZoomLevel);
        mapContents += generateVectorMapSvg(data.dataSet, data.layers, svgContext);
        mapContents += '</div>';
        mapContents += '</div>';

        let html = `<html><head><style> @page { margin:0px;padding:0px;size: ${paper.widthMillimeter}mm ${paper.heightMillimeter}mm;} </style></head>`;
        html += `<body style="margin:0;width:${paper.widthPixel}px;height:${paper.heightPixel - 2}px;">`; //-2pxはiOSで次ページに行ってしまうのを防ぐため
        html += generateNorthArrow(layout);
        html += generateScaleBar(layout);
        html += generateCaptions(layout, buildAttributionText(getPrintableTileMaps(tileMaps, isWeb)));
        html += generateComment(layout, t('hooks.pdf.comment'));
        html += mapContents;
        html += '</body></html>';

        if (isWeb) return writeToWindow(html, targetWindow, paper.widthPixel, paper.heightPixel);

        //Androidの場合はwidthとheightに+1しないとvrtのXSize,YSizeとずれてQGISでエラーになる。
        const outputWidth = Platform.OS === 'android' ? paper.widthPoint + 1 : paper.widthPoint;
        const outputHeight = Platform.OS === 'android' ? paper.heightPoint + 1 : paper.heightPoint;
        const { uri } = await Print.printToFileAsync({ html, width: outputWidth, height: outputHeight });
        const xmlUri = uri.replace('.pdf', '.xml');
        await FileSystem.writeAsStringAsync(xmlUri, generateCompositionXML(layout, uri.replace('file://', '')), {
          encoding: FileSystem.EncodingType.UTF8,
        });
        const { outputFiles } = await convert(xmlUri.replace('file://', '')).catch((error) => {
          console.error(error);
          return { outputFiles: [] };
        });
        if (outputFiles.length === 0) return null;
        return 'file://' + outputFiles[0].uri;
      } catch (error) {
        console.error('generatePDF', error);
        return null;
      }
    },
    [isWeb, layout, pdfTileMapZoomLevel, tileMaps]
  );

  const generateDataPDF = useCallback(
    async (data: { dataSet: DataType[]; layers: LayerType[] }, targetWindow?: Window) => {
      try {
        const html = generateDataHTML(data.dataSet, data.layers);
        if (isWeb) return writeToWindow(html, targetWindow, 1123, 794);
        const { uri } = await Print.printToFileAsync({
          html,
          width: 842,
          height: 595,
          margins: { top: 30, bottom: 30, left: 30, right: 30 },
        });
        return uri;
      } catch (error) {
        console.error('generateDataPDF', error);
        return null;
      }
    },
    [isWeb]
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
    pdfMapNotices,
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
