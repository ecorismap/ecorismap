import React, { createRef } from 'react';
import { PanResponder } from 'react-native';
import { HomeContext, HomeContextType } from '../../../contexts/Home';
import { MapViewContext, MapViewContextType } from '../../../contexts/MapView';
import { DrawingToolsContext, DrawingToolsContextType } from '../../../contexts/DrawingTools';
import { PDFExportContext, PDFExportContextType } from '../../../contexts/PDFExport';
import { LocationTrackingContext, LocationTrackingContextType } from '../../../contexts/LocationTracking';
import { ProjectContext, ProjectContextType } from '../../../contexts/Project';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';

// Mock implementation of HomeContext for testing (simplified after context split)
export const mockHomeContextValue: HomeContextType = {
  // Data sets
  pointDataSet: [],
  lineDataSet: [],
  polygonDataSet: [],

  // Tile download and maps
  downloadMode: false,
  tileMaps: [],
  savedTileSize: '0',
  isDownloading: false,
  downloadArea: {
    id: '',
    tileMapId: '',
    coords: [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0 },
    ],
    centroid: { latitude: 0, longitude: 0 },
  },
  savedArea: [],
  downloadProgress: '',
  pressDownloadTiles: jest.fn().mockResolvedValue(undefined),
  pressStopDownloadTiles: jest.fn(),
  pressDeleteTiles: jest.fn().mockResolvedValue(undefined),

  // General states
  isOffline: false,
  restored: true,
  attribution: '',
  selectedRecord: undefined,
  isLoading: false,
  user: {
    uid: undefined,
    email: null,
    displayName: null,
    photoURL: null,
  },
  isEditingRecord: false,

  // Navigation
  gotoMaps: jest.fn(),
  gotoSettings: jest.fn(),
  gotoLayers: jest.fn(),
  gotoHome: jest.fn(),

  // Map memo
  currentMapMemoTool: 'NONE',
  visibleMapMemoColor: false,
  currentPenWidth: 'PEN_THIN',
  penColor: '#000000',
  penWidth: 1,
  mapMemoEditingLine: [],
  isPencilModeActive: false,
  isPencilTouch: undefined,
  isUndoable: false,
  isRedoable: false,
  mapMemoLines: [],
  isModalMapMemoToolHidden: true,
  selectMapMemoTool: jest.fn(),
  setPenWidth: jest.fn(),
  setVisibleMapMemoColor: jest.fn(),
  setVisibleMapMemoPen: jest.fn(),
  setVisibleMapMemoStamp: jest.fn(),
  setVisibleMapMemoBrush: jest.fn(),
  setVisibleMapMemoEraser: jest.fn(),
  selectPenColor: jest.fn(),
  pressUndoMapMemo: jest.fn(),
  pressRedoMapMemo: jest.fn(),
  togglePencilMode: jest.fn(),

  // Info tool
  currentInfoTool: 'ALL_INFO',
  isModalInfoToolHidden: true,
  isInfoToolActive: false,
  selectInfoTool: jest.fn(),
  setVisibleInfoPicker: jest.fn(),
  setInfoToolActive: jest.fn(),
  vectorTileInfo: undefined,
  closeVectorTileInfo: jest.fn(),

  // Other
  bottomSheetRef: createRef<BottomSheetMethods>(),
  onCloseBottomSheet: jest.fn(),
  updatePmtilesURL: jest.fn().mockResolvedValue(undefined),
};

// Mock implementation for MapViewContext
export const mockMapViewContextValue: MapViewContextType = {
  mapViewRef: { current: null },
  mapType: 'standard',
  zoom: 10,
  zoomDecimal: 10.0,
  onRegionChangeMapView: jest.fn(),
  onPressMapView: jest.fn(),
  onDragMapView: jest.fn(),
  onDrop: jest.fn(),
  pressZoomIn: jest.fn(),
  pressZoomOut: jest.fn(),
  pressCompass: jest.fn(),
  headingUp: false,
  azimuth: 0,
  currentLocation: null,
  gpsState: 'off',
  pressGPS: jest.fn().mockResolvedValue(undefined),
  isPinch: false,
  panResponder: PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: () => false,
    onPanResponderMove: () => {},
    onPanResponderRelease: () => {},
  }),
  isDrawLineVisible: false,
  isTerrainActive: false,
  toggleTerrain: jest.fn(),
};

// Mock implementation for DrawingToolsContext
export const mockDrawingToolsContextValue: DrawingToolsContextType = {
  isEditingDraw: false,
  isEditingObject: false,
  isSelectedDraw: false,
  isEditingLine: false,
  editingLineId: undefined,
  drawLine: [],
  editingLine: [],
  selectLine: [],
  featureButton: 'NONE',
  currentDrawTool: 'NONE',
  currentPointTool: 'PLOT_POINT',
  currentLineTool: 'PLOT_LINE',
  currentPolygonTool: 'PLOT_POLYGON',
  selectFeatureButton: jest.fn(),
  selectDrawTool: jest.fn(),
  setPointTool: jest.fn(),
  setLineTool: jest.fn(),
  setPolygonTool: jest.fn(),
  onDragEndPoint: jest.fn().mockResolvedValue(undefined),
  pressUndoDraw: jest.fn().mockResolvedValue(undefined),
  pressSaveDraw: jest.fn().mockResolvedValue(undefined),
  pressDeleteDraw: jest.fn().mockResolvedValue(undefined),
};

// Mock implementation for LocationTrackingContext
export const mockLocationTrackingContextValue: LocationTrackingContextType = {
  trackingState: 'off',
  memberLocations: [],
  pressTracking: jest.fn(),
  pressSyncPosition: jest.fn(),
  pressDeletePosition: jest.fn(),
  editPositionMode: false,
  editPositionLayer: undefined,
  editPositionRecord: undefined,
  finishEditPosition: jest.fn(),
};

// Mock implementation for ProjectContext
export const mockProjectContextValue: ProjectContextType = {
  projectName: undefined,
  isSynced: true,
  isShowingProjectButtons: false,
  isSettingProject: false,
  pressJumpProject: jest.fn(),
  pressUploadData: jest.fn(),
  pressDownloadData: jest.fn(),
  pressCloseProject: jest.fn(),
  pressProjectLabel: jest.fn(),
  pressSaveProjectSetting: jest.fn(),
  pressDiscardProjectSetting: jest.fn(),
  gotoLogin: jest.fn(),
  gotoProjects: jest.fn().mockResolvedValue(undefined),
  gotoAccount: jest.fn().mockResolvedValue(undefined),
  pressLogout: jest.fn().mockResolvedValue(undefined),
};

// Mock implementation for PDFExportContext
export const mockPDFExportContextValue: PDFExportContextType = {
  exportPDFMode: false,
  pdfArea: {
    id: '',
    tileMapId: '',
    coords: [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0 },
    ],
    centroid: { latitude: 0, longitude: 0 },
  },
  pdfOrientation: 'PORTRAIT',
  pdfPaperSize: 'A4',
  pdfScale: '10000',
  pdfTileMapZoomLevel: '16',
  pressExportPDF: jest.fn().mockResolvedValue(undefined),
  pressPDFSettingsOpen: jest.fn(),
};

interface TestHomeProviderProps {
  children: React.ReactNode;
  homeValue?: Partial<HomeContextType>;
  mapViewValue?: Partial<MapViewContextType>;
  drawingToolsValue?: Partial<DrawingToolsContextType>;
  locationTrackingValue?: Partial<LocationTrackingContextType>;
  projectValue?: Partial<ProjectContextType>;
  pdfExportValue?: Partial<PDFExportContextType>;
}

export const TestHomeProvider: React.FC<TestHomeProviderProps> = ({
  children,
  homeValue,
  mapViewValue,
  drawingToolsValue,
  locationTrackingValue,
  projectValue,
  pdfExportValue,
}) => {
  const homeContextValue = {
    ...mockHomeContextValue,
    ...homeValue,
  };

  const mapViewContextValue = {
    ...mockMapViewContextValue,
    ...mapViewValue,
  };

  const drawingToolsContextValue = {
    ...mockDrawingToolsContextValue,
    ...drawingToolsValue,
  };

  const locationTrackingContextValue = {
    ...mockLocationTrackingContextValue,
    ...locationTrackingValue,
  };

  const projectContextValue = {
    ...mockProjectContextValue,
    ...projectValue,
  };

  const pdfExportContextValue = {
    ...mockPDFExportContextValue,
    ...pdfExportValue,
  };

  return (
    <MapViewContext.Provider value={mapViewContextValue}>
      <DrawingToolsContext.Provider value={drawingToolsContextValue}>
        <PDFExportContext.Provider value={pdfExportContextValue}>
          <LocationTrackingContext.Provider value={locationTrackingContextValue}>
            <ProjectContext.Provider value={projectContextValue}>
              <HomeContext.Provider value={homeContextValue}>{children}</HomeContext.Provider>
            </ProjectContext.Provider>
          </LocationTrackingContext.Provider>
        </PDFExportContext.Provider>
      </DrawingToolsContext.Provider>
    </MapViewContext.Provider>
  );
};

// テストファイルなので、少なくとも1つのテストが必要
describe('Mock Home Context', () => {
  it('should provide default values', () => {
    expect(mockHomeContextValue).toBeDefined();
    expect(mockHomeContextValue.pointDataSet).toEqual([]);
  });
});
