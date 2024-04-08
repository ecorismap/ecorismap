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
  UserType,
  PenType,
  MapMemoToolType,
  LayerType,
  ScaleType,
  PaperOrientationType,
  PaperSizeType,
} from '../types';
import { MapLayerMouseEvent, MapRef, ViewState } from 'react-map-gl';

import { Position } from '@turf/turf';
import * as Location from 'expo-location';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';

export interface HomeContextType {
  pointDataSet: PointDataType[];
  lineDataSet: LineDataType[];
  polygonDataSet: PolygonDataType[];
  isSynced: boolean;
  memberLocations: MemberLocationType[];
  mapType: MapType;
  tileMaps: TileMapType[];
  isOffline: boolean;
  isDownloadPage: boolean;
  isExportPDFPage: boolean;
  downloadProgress: string;
  savedTileSize: string;
  restored: boolean;
  mapViewRef: React.MutableRefObject<MapView | MapRef | null>;
  gpsState: string;
  trackingState: TrackingStateType;
  currentLocation: LocationType | null;
  magnetometer: Location.LocationHeadingObject | null;
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
  projectName: string | undefined;
  user: UserType;
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
  isShowingProjectButtons: boolean;
  isLoading: boolean;
  isTermsOfUseOpen: boolean;
  isSettingProject: boolean;
  currentMapMemoTool: MapMemoToolType;
  visibleMapMemoColor: boolean;
  currentPen: PenType;
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
    xy: Position[];
    latlon: Position[];
    strokeColor: string;
    strokeWidth: number;
  }[];
  onRegionChangeMapView: (region: Region | ViewState) => void;
  onPressMapView: (e: MapPressEvent | MapLayerMouseEvent) => void;
  onDragMapView: () => void;
  onDragEndPoint: (e: MarkerDragStartEndEvent, layer: LayerType, feature: RecordType) => void;
  onDrop?: (<T extends File>(acceptedFiles: T[], fileRejections: any[], event: any) => void) | undefined;
  pressZoomIn: () => void;
  pressZoomOut: () => void;
  pressCompass: () => void;
  pressLogout: () => Promise<void>;
  pressDeleteTiles: () => Promise<void>;
  pressGPS: () => Promise<void>;
  pressTracking: () => void;
  pressDownloadTiles: () => Promise<void>;
  pressExportPDF: () => Promise<void>;
  pressStopDownloadTiles: () => void;
  pressSyncPosition: () => void;
  pressJumpProject: () => void;
  pressUploadData: () => void;
  pressDownloadData: () => void;
  pressCloseProject: () => void;
  pressProjectLabel: () => void;
  pressSaveProjectSetting: () => void;
  pressDiscardProjectSetting: () => void;
  gotoLogin: () => void;
  gotoProjects: () => Promise<void>;
  gotoAccount: () => Promise<void>;
  pressUndoDraw: () => void;
  pressSaveDraw: () => void;
  pressDeleteDraw: () => void;
  gotoMaps: () => void;
  gotoSettings: () => void;
  gotoLayers: () => void;
  gotoHome: () => void;
  selectFeatureButton: (value: FeatureButtonType) => void;
  selectDrawTool: (value: DrawToolType) => void;
  setPointTool: React.Dispatch<React.SetStateAction<PointToolType>>;
  setLineTool: React.Dispatch<React.SetStateAction<LineToolType>>;
  setPolygonTool: React.Dispatch<React.SetStateAction<PolygonToolType>>;
  termsOfUseOK: () => void;
  termsOfUseCancel: () => void;
  selectMapMemoTool: (value: MapMemoToolType | undefined) => void;
  setPen: React.Dispatch<React.SetStateAction<PenType>>;
  setVisibleMapMemoColor: React.Dispatch<React.SetStateAction<boolean>>;
  setVisibleMapMemoPen: React.Dispatch<React.SetStateAction<boolean>>;
  setVisibleMapMemoStamp: React.Dispatch<React.SetStateAction<boolean>>;
  setVisibleMapMemoBrush: React.Dispatch<React.SetStateAction<boolean>>;
  setVisibleMapMemoEraser: React.Dispatch<React.SetStateAction<boolean>>;
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
}

export const HomeContext = createContext({} as HomeContextType);
