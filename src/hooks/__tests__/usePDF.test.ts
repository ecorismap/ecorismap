// i18nモックを最初に設定
jest.mock('../../i18n/config', () => ({
  __esModule: true,
  default: {
    language: 'en',
    t: jest.fn((key) => key),
  },
  i18n: {
    language: 'en',
    t: jest.fn((key) => key),
  },
  t: jest.fn((key) => key),
}));

import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import React from 'react';
import { usePDF } from '../usePDF';
import dataSetReducer from '../../modules/dataSet';
import layersReducer from '../../modules/layers';
import userReducer from '../../modules/user';
import settingsReducer, { settingsInitialState } from '../../modules/settings';
import projectsReducer from '../../modules/projects';
import tileMapsReducer from '../../modules/tileMaps';

// Mock dependencies
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn().mockResolvedValue({ uri: 'mock://print.pdf' }),
}));
jest.mock('expo-file-system/legacy', () => ({
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { UTF8: 'UTF8' },
}));
jest.mock('react-native-gdalwarp', () => ({
  convert: jest.fn().mockResolvedValue({ outputFiles: [{ uri: 'mock://output.pdf' }] }),
}));
jest.mock('../../utils/PDF', () => ({
  generateTileMap: jest.fn().mockResolvedValue('mock://tilemap.pdf'),
}));
jest.mock('../useWindow', () => ({
  useWindow: () => ({
    width: 800,
    height: 600,
    isLandscape: false,
    mapSize: { width: 800, height: 600 },
    mapRegion: {
      latitude: 35.0,
      longitude: 135.0,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
      zoom: 15,
    },
  }),
}));
jest.mock('../../utils/Tile', () => ({
  getTileRegion: jest.fn().mockReturnValue({
    tileMapZoomLevel: 15,
    minX: 0,
    maxX: 10,
    minY: 0,
    maxY: 10,
  }),
  tileToWebMercator: jest.fn().mockReturnValue({ x: 0, y: 0 }),
}));

// Create test store
const createTestStore = () => {
  return configureStore({
    reducer: combineReducers({
      dataSet: dataSetReducer,
      layers: layersReducer,
      user: userReducer,
      settings: settingsReducer,
      projects: projectsReducer,
      tileMaps: tileMapsReducer,
    }),
    preloadedState: {
      dataSet: [],
      layers: [],
      user: {
        uid: 'test-user',
        displayName: 'Test User',
        email: 'test@example.com',
        photoURL: null,
      },
      settings: {
        ...settingsInitialState,
        projectId: 'test-project',
        pdfArea: {
          latitude: 35.0,
          longitude: 135.0,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
          zoom: 15,
        },
        pdfScale: 14,
      },
      projects: [],
      tileMaps: [],
    },
  });
};

// Test wrapper
const createWrapper = (store: any) => {
  return ({ children }: { children: React.ReactNode }) => {
    // eslint-disable-next-line react/no-children-prop
    return React.createElement(Provider, { store, children });
  };
};

describe('usePDF', () => {
  let store: any;
  let wrapper: any;

  beforeEach(() => {
    store = createTestStore();
    wrapper = createWrapper(store);
    jest.clearAllMocks();
  });

  it('should return initial PDF settings', () => {
    const { result } = renderHook(() => usePDF(), { wrapper });

    expect(result.current.isPDFSettingsVisible).toBe(false);
    expect(result.current.pdfArea).toBeDefined();
    expect(result.current.pdfScale).toBe('10000');
    expect(result.current.pdfPaperSize).toBe('A4');
    expect(result.current.pdfOrientation).toBe('PORTRAIT');
    expect(result.current.outputVRT).toBe(false);
    expect(result.current.outputDataPDF).toBe(false);
  });

  it('should provide available options', () => {
    const { result } = renderHook(() => usePDF(), { wrapper });

    expect(result.current.pdfPaperSizes).toEqual(['A4', 'A3', 'A2', 'A1', 'A0']);
    expect(result.current.pdfScales).toEqual([
      '500',
      '1000',
      '1500',
      '2500',
      '5000',
      '10000',
      '25000',
      '50000',
      '100000',
    ]);
    expect(result.current.pdfOrientations).toEqual(['PORTRAIT', 'LANDSCAPE']);
  });

  it('should toggle PDF settings visibility', () => {
    const { result } = renderHook(() => usePDF(), { wrapper });

    expect(result.current.isPDFSettingsVisible).toBe(false);

    act(() => {
      result.current.setIsPDFSettingsVisible(true);
    });

    expect(result.current.isPDFSettingsVisible).toBe(true);

    act(() => {
      result.current.setIsPDFSettingsVisible(false);
    });

    expect(result.current.isPDFSettingsVisible).toBe(false);
  });

  it('should have PDF area computed from mapRegion', () => {
    const { result } = renderHook(() => usePDF(), { wrapper });

    // pdfArea is computed from mapRegion, not settable directly
    expect(result.current.pdfArea).toBeDefined();
    expect(result.current.pdfArea.centroid).toEqual({
      latitude: 35.0,
      longitude: 135.0,
    });
  });

  it('should update PDF settings', () => {
    const { result } = renderHook(() => usePDF(), { wrapper });

    act(() => {
      result.current.setPdfPaperSize('A3');
    });
    expect(result.current.pdfPaperSize).toBe('A3');

    act(() => {
      result.current.setPdfScale('2500');
    });
    expect(result.current.pdfScale).toBe('2500');

    act(() => {
      result.current.setPdfOrientation('LANDSCAPE');
    });
    expect(result.current.pdfOrientation).toBe('LANDSCAPE');

    act(() => {
      result.current.setOutputVRT(true);
    });
    expect(result.current.outputVRT).toBe(true);

    act(() => {
      result.current.setOutputDataPDF(true);
    });
    expect(result.current.outputDataPDF).toBe(true);
  });

  it('should handle PDF tile map zoom level', () => {
    const { result } = renderHook(() => usePDF(), { wrapper });

    act(() => {
      result.current.setPdfTileMapZoomLevel('16');
    });

    expect(result.current.pdfTileMapZoomLevel).toBe('16');
  });

  it('should generate PDF when called', async () => {
    // Mock the convert function to return expected result
    const { convert } = require('react-native-gdalwarp');
    convert.mockResolvedValue({ outputFiles: [{ uri: 'mock://output.pdf' }] });

    const { result } = renderHook(() => usePDF(), { wrapper });

    let generateResult;
    await act(async () => {
      generateResult = await result.current.generatePDF({ dataSet: [], layers: [] });
    });

    expect(generateResult).toBe('file://mock://output.pdf');
  });

  it('should handle PDF generation error', async () => {
    const { convert } = require('react-native-gdalwarp');
    convert.mockResolvedValue({ outputFiles: [] }); // Empty output files array

    const { result } = renderHook(() => usePDF(), { wrapper });

    let generateResult;
    await act(async () => {
      generateResult = await result.current.generatePDF({ dataSet: [], layers: [] });
    });

    expect(generateResult).toBe(null);
  });
});
