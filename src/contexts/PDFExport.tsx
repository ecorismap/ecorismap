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
}

export const PDFExportContext = React.createContext<PDFExportContextType>({} as PDFExportContextType);
