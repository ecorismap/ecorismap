import React, { createContext } from 'react';
import { GestureResponderEvent, PanResponderGestureState } from 'react-native';
import MapView, { MapPressEvent, Region } from 'react-native-maps';
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
} from '../types';
import { MapRef, ViewState } from 'react-map-gl';

import { Position } from '@turf/turf';
import * as Location from 'expo-location';

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
  screenState: 'opened' | 'closed' | 'expanded';
  isShowingProjectButtons: boolean;
  isLoading: boolean;
  isTermsOfUseOpen: boolean;
  isSettingProject: boolean;
  onRegionChangeMapView: (region: Region | ViewState) => void;
  onPressMapView: (event: MapPressEvent) => void;
  onDragMapView: () => void;
  onDrop?: (<T extends File>(acceptedFiles: T[], fileRejections: any[], event: any) => void) | undefined;
  onPressSvgView: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => void;
  onMoveSvgView: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => void;
  onReleaseSvgView: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => void;
  pressZoomIn: () => void;
  pressZoomOut: () => void;
  pressCompass: () => void;
  pressLogout: () => Promise<void>;
  pressDeleteTiles: () => Promise<void>;
  pressGPS: () => Promise<void>;
  pressTracking: () => void;
  pressDownloadTiles: () => Promise<void>;
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
  gotoBack: () => void;
  selectFeatureButton: (value: FeatureButtonType) => void;
  selectDrawTool: (value: DrawToolType) => void;
  setPointTool: React.Dispatch<React.SetStateAction<PointToolType>>;
  setLineTool: React.Dispatch<React.SetStateAction<LineToolType>>;
  setPolygonTool: React.Dispatch<React.SetStateAction<PolygonToolType>>;
  termsOfUseOK: () => void;
  termsOfUseCancel: () => void;
}

export const HomeContext = createContext({} as HomeContextType);
