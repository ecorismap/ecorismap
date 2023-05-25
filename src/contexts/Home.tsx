import React, { createContext } from 'react';
import { GestureResponderEvent, PanResponderGestureState, PanResponderInstance } from 'react-native';
import MapView, { MarkerDragStartEndEvent, Region } from 'react-native-maps';
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
  PenType,
  MapMemoToolType,
  EraserType,
  LayerType,
} from '../types';
import { MapRef, ViewState } from 'react-map-gl';

import { Position } from '@turf/turf';
import * as Location from 'expo-location';

export interface HomeContextType {
  pointDataSet: PointDataType[];
  lineDataSet: LineDataType[];
  polygonDataSet: PolygonDataType[];
  memberLocations: MemberLocationType[];
  mapType: MapType;
  tileMaps: TileMapType[];
  isOffline: boolean;
  isDownloadPage: boolean;
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
  screenState: 'opened' | 'closed' | 'expanded';
  isLoading: boolean;
  isTermsOfUseOpen: boolean;
  currentMapMemoTool: MapMemoToolType;
  visibleMapMemo: boolean;
  visibleMapMemoColor: boolean;
  currentPen: PenType;
  currentEraser: EraserType;
  refreshMapMemo: boolean;
  penColor: string;
  penWidth: number;
  mapMemoEditingLine: Position[];
  onRegionChangeMapView: (region: Region | ViewState) => void;
  onPressMapView: (event: GestureResponderEvent) => void;
  onDragMapView: () => void;
  onDragEndPoint: (e: MarkerDragStartEndEvent, layer: LayerType, feature: RecordType) => void;
  onDrop?: (<T extends File>(acceptedFiles: T[], fileRejections: any[], event: any) => void) | undefined;
  onPressSvgView: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => void;
  onMoveSvgView: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => void;
  onReleaseSvgView: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => void;
  pressZoomIn: () => void;
  pressZoomOut: () => void;
  pressCompass: () => void;
  pressDeleteTiles: () => Promise<void>;
  pressGPS: () => Promise<void>;
  pressTracking: () => void;
  pressDownloadTiles: () => Promise<void>;
  pressStopDownloadTiles: () => void;
  pressUndoDraw: () => void;
  pressSaveDraw: () => void;
  pressDeleteDraw: () => void;
  pressClearMapMemo: () => void;
  gotoMaps: () => void;
  gotoSettings: () => void;
  gotoLayers: () => void;
  gotoBack: () => void;
  selectFeatureButton: (value: FeatureButtonType) => void;
  selectDrawTool: (value: DrawToolType) => void;
  setPointTool: React.Dispatch<React.SetStateAction<PointToolType>>;
  setLineTool: React.Dispatch<React.SetStateAction<LineToolType>>;
  setPolygonTool: React.Dispatch<React.SetStateAction<PolygonToolType>>;
  termsOfUseOK: () => void;
  termsOfUseCancel: () => void;
  selectMapMemoTool: (value: MapMemoToolType) => void;
  setVisibleMapMemo: React.Dispatch<React.SetStateAction<boolean>>;
  setPen: React.Dispatch<React.SetStateAction<PenType>>;
  setEraser: React.Dispatch<React.SetStateAction<EraserType>>;
  setRefreshMapMemo: React.Dispatch<React.SetStateAction<boolean>>;
  setVisibleMapMemoColor: React.Dispatch<React.SetStateAction<boolean>>;
  selectPenColor: (hue: number, sat: number, val: number, alpha: number) => void;
  pressUndoMapMemo: () => void;
  pressRedoMapMemo: () => void;
  pressExportMapMemo: () => void;
  panResponder: PanResponderInstance;
}

export const HomeContext = createContext({} as HomeContextType);
