import React, { RefObject, createContext } from 'react';
import { PanResponderInstance } from 'react-native';
import MapView, { MapPressEvent, MarkerDragStartEndEvent, Region } from 'react-native-maps';
import {
  RecordType,
  LocationType,
  MapType,
  MemberLocationType,
  TileMapType,
  TileRegionType,
  FeatureButtonType,
  TrackingStateType,
  PointDataType,
  LineDataType,
  PolygonDataType,
  DrawToolType,
  PointToolType,
  LineToolType,
  PolygonToolType,
  DrawLineType,
  PenWidthType,
  MapMemoToolType,
  LayerType,
  ScaleType,
  PaperOrientationType,
  PaperSizeType,
  InfoToolType,
} from '../types';
import { MapLayerMouseEvent, MapRef, ViewState } from 'react-map-gl/maplibre';

import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { Position } from 'geojson';

export interface HomeContextType {
  pointDataSet: PointDataType[];
  lineDataSet: LineDataType[];
  polygonDataSet: PolygonDataType[];
  memberLocations: MemberLocationType[];
  mapType: MapType;
  tileMaps: TileMapType[];
  isOffline: boolean;
  downloadMode: boolean;
  exportPDFMode: boolean;
  downloadProgress: string;
  savedTileSize: string;
  restored: boolean;
  mapViewRef: React.MutableRefObject<MapView | MapRef | null>;
  gpsState: string;
  isEditingLine: boolean;
  editingLineId: string | undefined;
  trackingState: TrackingStateType;
  currentLocation: LocationType | null;
  azimuth: number;
  headingUp: boolean;
  zoom: number;
  zoomDecimal: number;
  isEditingDraw: boolean;
  isEditingObject: boolean;
  isSelectedDraw: boolean;
  drawLine: DrawLineType[];
  editingLine: Position[];
  selectLine: Position[];
  isDownloading: boolean;
  downloadArea: TileRegionType;
  pdfArea: TileRegionType;
  pdfOrientation: PaperOrientationType;
  pdfPaperSize: PaperSizeType;
  pdfScale: ScaleType;
  pdfTileMapZoomLevel: string;
  savedArea: TileRegionType[];
  attribution: string;
  featureButton: FeatureButtonType;
  currentDrawTool: DrawToolType;
  currentPointTool: PointToolType;
  currentLineTool: LineToolType;
  currentPolygonTool: PolygonToolType;
  selectedRecord:
    | {
        layerId: string;
        record: RecordType;
      }
    | undefined;
  isLoading: boolean;
  currentMapMemoTool: MapMemoToolType;
  visibleMapMemoColor: boolean;
  currentPenWidth: PenWidthType;
  penColor: string;
  penWidth: number;
  mapMemoEditingLine: Position[];
  vectorTileInfo:
    | {
        position: Position;
        properties: string;
      }
    | undefined;
  isPencilModeActive: boolean;
  isPencilTouch: boolean | undefined;
  isUndoable: boolean;
  isRedoable: boolean;
  mapMemoLines: {
    id?: string;
    xy: Position[];
    latlon: Position[];
    strokeColor: string;
    strokeWidth: number;
    strokeStyle?: string;
    stamp?: string;
  }[];
  isModalInfoToolHidden: boolean;
  editPositionMode: boolean;
  editPositionLayer: LayerType | undefined;
  editPositionRecord: RecordType | undefined;
  isEditingRecord: boolean;
  isTerrainActive: boolean;
  isModalMapMemoToolHidden: boolean;
  onRegionChangeMapView: (region: Region | ViewState) => void;
  onPressMapView: (e: MapPressEvent | MapLayerMouseEvent) => void;
  onDragMapView: () => void;
  onDragEndPoint: (e: MarkerDragStartEndEvent, layer: LayerType, feature: RecordType) => void;
  onDrop?: (<T extends File>(acceptedFiles: T[], fileRejections: any[], event: any) => void) | undefined;
  pressZoomIn: () => void;
  pressZoomOut: () => void;
  pressCompass: () => void;
  pressDeleteTiles: () => Promise<void>;
  pressGPS: () => Promise<void>;
  pressTracking: () => void;
  pressDownloadTiles: () => Promise<void>;
  pressExportPDF: () => Promise<void>;
  pressStopDownloadTiles: () => void;
  pressUndoDraw: () => void;
  pressSaveDraw: () => void;
  pressDeleteDraw: () => void;
  pressDeletePosition: () => void;
  gotoMaps: () => void;
  gotoSettings: () => void;
  gotoLayers: () => void;
  gotoHome: () => void;
  selectFeatureButton: (value: FeatureButtonType) => void;
  selectDrawTool: (value: DrawToolType) => void;
  setPointTool: React.Dispatch<React.SetStateAction<PointToolType>>;
  setLineTool: React.Dispatch<React.SetStateAction<LineToolType>>;
  setPolygonTool: React.Dispatch<React.SetStateAction<PolygonToolType>>;
  selectMapMemoTool: (value: MapMemoToolType | undefined) => void;
  selectInfoTool: (value: InfoToolType | undefined) => void;
  currentInfoTool: InfoToolType;
  setInfoToolActive: React.Dispatch<React.SetStateAction<boolean>>;
  isInfoToolActive: boolean;
  setPenWidth: React.Dispatch<React.SetStateAction<PenWidthType>>;
  setVisibleMapMemoColor: React.Dispatch<React.SetStateAction<boolean>>;
  setVisibleMapMemoPen: React.Dispatch<React.SetStateAction<boolean>>;
  setVisibleMapMemoStamp: React.Dispatch<React.SetStateAction<boolean>>;
  setVisibleMapMemoBrush: React.Dispatch<React.SetStateAction<boolean>>;
  setVisibleMapMemoEraser: React.Dispatch<React.SetStateAction<boolean>>;
  setVisibleInfoPicker: React.Dispatch<React.SetStateAction<boolean>>;
  selectPenColor: (hue: number, sat: number, val: number, alpha: number) => void;
  pressUndoMapMemo: () => void;
  pressRedoMapMemo: () => void;
  panResponder: PanResponderInstance;
  isPinch: boolean;
  isDrawLineVisible: boolean;
  closeVectorTileInfo: () => void;
  bottomSheetRef: RefObject<BottomSheetMethods>;
  onCloseBottomSheet: () => void;
  togglePencilMode: () => void;
  pressPDFSettingsOpen: () => void;
  finishEditPosition: () => void;
  updatePmtilesURL: () => Promise<void>;
  toggleTerrain: (activate?: boolean) => void;
}

export const HomeContext = createContext({} as HomeContextType);
