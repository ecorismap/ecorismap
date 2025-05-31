import React, { createRef } from 'react';
import { PanResponder } from 'react-native';
import { MapViewContext, MapViewContextType } from '../../../contexts/MapView';
import { DrawingToolsContext, DrawingToolsContextType } from '../../../contexts/DrawingTools';
import { PDFExportContext, PDFExportContextType } from '../../../contexts/PDFExport';
import { LocationTrackingContext, LocationTrackingContextType } from '../../../contexts/LocationTracking';
import { ProjectContext, ProjectContextType } from '../../../contexts/Project';
import { SVGDrawingContext, SVGDrawingContextType } from '../../../contexts/SVGDrawing';
import { TileManagementContext, TileManagementContextType } from '../../../contexts/TileManagement';
import { MapMemoContext, MapMemoContextType } from '../../../contexts/MapMemo';
import { DataSelectionContext, DataSelectionContextType } from '../../../contexts/DataSelection';
import { InfoToolContext, InfoToolContextType } from '../../../contexts/InfoTool';
import { AppStateContext, AppStateContextType } from '../../../contexts/AppState';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';

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
  // Drawing states (grouped)
  drawingState: {
    isEditingDraw: false,
    isEditingObject: false,
    isSelectedDraw: false,
    isEditingLine: false,
    editingLineId: undefined,
  },
  // Current tools (grouped)
  currentTools: {
    featureButton: 'NONE',
    currentDrawTool: 'NONE',
    currentPointTool: 'PLOT_POINT',
    currentLineTool: 'PLOT_LINE',
    currentPolygonTool: 'PLOT_POLYGON',
  },

  // Tool actions
  selectFeatureButton: jest.fn(),
  selectDrawTool: jest.fn(),
  setPointTool: jest.fn() as React.Dispatch<React.SetStateAction<any>>,
  setLineTool: jest.fn() as React.Dispatch<React.SetStateAction<any>>,
  setPolygonTool: jest.fn() as React.Dispatch<React.SetStateAction<any>>,

  // Drawing actions
  onDragEndPoint: jest.fn().mockResolvedValue(undefined),
  pressUndoDraw: jest.fn().mockResolvedValue(undefined),
  pressSaveDraw: jest.fn().mockResolvedValue(undefined),
  pressDeleteDraw: jest.fn().mockResolvedValue(undefined),

  // Backward compatibility
  isEditingDraw: false,
  isEditingObject: false,
  isSelectedDraw: false,
  isEditingLine: false,
  editingLineId: undefined,
  featureButton: 'NONE',
  currentDrawTool: 'NONE',
  currentPointTool: 'PLOT_POINT',
  currentLineTool: 'PLOT_LINE',
  currentPolygonTool: 'PLOT_POLYGON',
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

// Mock implementation for SVGDrawingContext
export const mockSVGDrawingContextValue: SVGDrawingContextType = {
  // Drawing tools SVG data
  drawLine: { current: [] },
  editingLine: { current: [] },
  selectLine: { current: [] },

  // MapMemo SVG data
  mapMemoEditingLine: [],
  isPencilTouch: undefined,
};

// Mock implementation for TileManagementContext
export const mockTileManagementContextValue: TileManagementContextType = {
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
};

// Mock implementation for MapMemoContext
export const mockMapMemoContextValue: MapMemoContextType = {
  currentMapMemoTool: 'NONE',
  visibleMapMemoColor: false,
  currentPenWidth: 'PEN_THIN',
  penColor: '#000000',
  penWidth: 1,
  isPencilModeActive: false,
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
};

// Mock implementation for DataSelectionContext
export const mockDataSelectionContextValue: DataSelectionContextType = {
  pointDataSet: [],
  lineDataSet: [],
  polygonDataSet: [],
  selectedRecord: undefined,
  isEditingRecord: false,
};

// Mock implementation for InfoToolContext
export const mockInfoToolContextValue: InfoToolContextType = {
  currentInfoTool: 'ALL_INFO',
  isModalInfoToolHidden: true,
  isInfoToolActive: false,
  vectorTileInfo: undefined,
  selectInfoTool: jest.fn(),
  setVisibleInfoPicker: jest.fn(),
  setInfoToolActive: jest.fn(),
  closeVectorTileInfo: jest.fn(),
};

// Mock implementation for AppStateContext
export const mockAppStateContextValue: AppStateContextType = {
  isOffline: false,
  restored: true,
  attribution: '',
  isLoading: false,
  user: {
    uid: undefined,
    email: null,
    displayName: null,
    photoURL: null,
  },
  gotoMaps: jest.fn(),
  gotoSettings: jest.fn(),
  gotoLayers: jest.fn(),
  gotoHome: jest.fn(),
  bottomSheetRef: createRef<BottomSheetMethods>(),
  onCloseBottomSheet: jest.fn().mockResolvedValue(undefined),
  updatePmtilesURL: jest.fn().mockResolvedValue(undefined),
};

interface TestHomeProviderProps {
  children: React.ReactNode;
  mapViewValue?: Partial<MapViewContextType>;
  drawingToolsValue?: Partial<DrawingToolsContextType>;
  locationTrackingValue?: Partial<LocationTrackingContextType>;
  projectValue?: Partial<ProjectContextType>;
  pdfExportValue?: Partial<PDFExportContextType>;
  svgDrawingValue?: Partial<SVGDrawingContextType>;
  tileManagementValue?: Partial<TileManagementContextType>;
  mapMemoValue?: Partial<MapMemoContextType>;
  dataSelectionValue?: Partial<DataSelectionContextType>;
  infoToolValue?: Partial<InfoToolContextType>;
  appStateValue?: Partial<AppStateContextType>;
}

export const TestHomeProvider: React.FC<TestHomeProviderProps> = ({
  children,
  mapViewValue,
  drawingToolsValue,
  locationTrackingValue,
  projectValue,
  pdfExportValue,
  svgDrawingValue,
  tileManagementValue,
  mapMemoValue,
  dataSelectionValue,
  infoToolValue,
  appStateValue,
}) => {
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

  const svgDrawingContextValue = {
    ...mockSVGDrawingContextValue,
    ...svgDrawingValue,
  };

  const tileManagementContextValue = {
    ...mockTileManagementContextValue,
    ...tileManagementValue,
  };

  const mapMemoContextValue = {
    ...mockMapMemoContextValue,
    ...mapMemoValue,
  };

  const dataSelectionContextValue = {
    ...mockDataSelectionContextValue,
    ...dataSelectionValue,
  };

  const infoToolContextValue = {
    ...mockInfoToolContextValue,
    ...infoToolValue,
  };

  const appStateContextValue = {
    ...mockAppStateContextValue,
    ...appStateValue,
  };

  return (
    <MapViewContext.Provider value={mapViewContextValue}>
      <DrawingToolsContext.Provider value={drawingToolsContextValue}>
        <PDFExportContext.Provider value={pdfExportContextValue}>
          <LocationTrackingContext.Provider value={locationTrackingContextValue}>
            <ProjectContext.Provider value={projectContextValue}>
              <SVGDrawingContext.Provider value={svgDrawingContextValue}>
                <TileManagementContext.Provider value={tileManagementContextValue}>
                  <MapMemoContext.Provider value={mapMemoContextValue}>
                    <DataSelectionContext.Provider value={dataSelectionContextValue}>
                      <InfoToolContext.Provider value={infoToolContextValue}>
                        <AppStateContext.Provider value={appStateContextValue}>{children}</AppStateContext.Provider>
                      </InfoToolContext.Provider>
                    </DataSelectionContext.Provider>
                  </MapMemoContext.Provider>
                </TileManagementContext.Provider>
              </SVGDrawingContext.Provider>
            </ProjectContext.Provider>
          </LocationTrackingContext.Provider>
        </PDFExportContext.Provider>
      </DrawingToolsContext.Provider>
    </MapViewContext.Provider>
  );
};

// テストファイルなので、少なくとも1つのテストが必要
describe('Mock Contexts', () => {
  it('should provide default values', () => {
    expect(mockMapViewContextValue).toBeDefined();
    expect(mockDataSelectionContextValue.pointDataSet).toEqual([]);
  });
});
