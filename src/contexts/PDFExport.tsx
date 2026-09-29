import React from 'react';
import { TileRegionType } from '../types';

export interface PDFExportContextType {
  exportPDFMode: boolean;
  pdfArea: TileRegionType;
  pdfOrientation: string;
  pdfPaperSize: string;
  pdfScale: string;
  pdfTileMapZoomLevel: string;
  pressExportPDF: () => Promise<void>;
  pressPDFSettingsOpen: () => void;
  //PDF作成中の進捗表示（作成中でなければundefined）と中止。cancelableがfalseのときは中止ボタンを出さない
  pdfProgress: { text: string; cancelable: boolean } | undefined;
  cancelExportPDF: () => void;
}

export const PDFExportContext = React.createContext<PDFExportContextType>({} as PDFExportContextType);
