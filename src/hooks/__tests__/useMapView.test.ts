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
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { useMapView } from '../useMapView';
import settingsReducer, { settingsInitialState } from '../../modules/settings';
import { Platform } from 'react-native';

// Mock dependencies
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('../useWindow', () => ({
  useWindow: jest.fn(() => ({
    windowWidth: 375,
    mapRegion: {
      latitude: 35.0,
      longitude: 135.0,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
      zoom: 15,
    },
  })),
}));

jest.mock('../../utils/Map', () => ({
  isMapRef: jest.fn(),
  isMapView: jest.fn(),
  isRegion: jest.fn(),
  isRegionType: jest.fn(),
  isViewState: jest.fn(),
}));

jest.mock('../../utils/Coords', () => ({
  deltaToZoom: jest.fn().mockReturnValue({ zoom: 15 }),
  zoomToDelta: jest.fn().mockReturnValue({
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  }),
}));

// Create mock MapView and MapRef
const createMockMapView = () => ({
  animateToRegion: jest.fn(),
  setCamera: jest.fn(),
});

const createMockMapRef = () => ({
  getMap: jest.fn().mockReturnValue({
    flyTo: jest.fn(),
    getZoom: jest.fn().mockReturnValue(15),
  }),
});

// Create test store
const createTestStore = () => {
  return configureStore({
    reducer: {
      settings: settingsReducer,
    },
    preloadedState: {
      settings: {
        ...settingsInitialState,
        mapRegion: {
          latitude: 35.0,
          longitude: 135.0,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
          zoom: 15,
        },
      },
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

describe('useMapView', () => {
  let store: any;
  let wrapper: any;

  beforeEach(() => {
    store = createTestStore();
    wrapper = createWrapper(store);
    jest.clearAllMocks();
    // Reset Platform.OS to default
    (Platform as any).OS = 'ios';
  });

  describe('zoom calculations', () => {
    it('should calculate zoom decimal for mobile platform', () => {
      const { result } = renderHook(() => useMapView(null), { wrapper });

      // Actual calculation: Math.log2(360 * (375 / 256 / 0.01)) ≈ 15.686
      expect(result.current.zoomDecimal).toBeCloseTo(15.68, 1);
      expect(result.current.zoom).toBe(15);
    });

    it('should calculate zoom decimal for web platform', () => {
      (Platform as any).OS = 'web';

      const { result } = renderHook(() => useMapView(null), { wrapper });

      expect(result.current.zoomDecimal).toBe(15);
      expect(result.current.zoom).toBe(15);
    });

    it('should return default zoom when mapRegion is undefined', () => {
      // Mock useWindow to return null mapRegion
      const { useWindow } = require('../useWindow');
      useWindow.mockReturnValueOnce({
        windowWidth: 375,
        mapRegion: null,
      });

      const { result } = renderHook(() => useMapView(null), { wrapper });

      expect(result.current.zoomDecimal).toBe(5);
      expect(result.current.zoom).toBe(5);
    });

    it('should handle negative longitudeDelta on mobile', () => {
      // Mock useWindow to return negative longitudeDelta
      const { useWindow } = require('../useWindow');
      useWindow.mockReturnValueOnce({
        windowWidth: 375,
        mapRegion: {
          latitude: 35.0,
          longitude: 135.0,
          latitudeDelta: 0.01,
          longitudeDelta: -0.01, // negative value
          zoom: 15,
        },
      });

      const { result } = renderHook(() => useMapView(null), { wrapper });

      // Should handle the negative case properly
      expect(result.current.zoomDecimal).toBeGreaterThan(0);
    });
  });

  describe('zoom functions', () => {
    it('should zoom in with MapView', () => {
      const mockMapView = createMockMapView();
      const { isMapView } = require('../../utils/Map');
      isMapView.mockReturnValue(true);

      const { result } = renderHook(() => useMapView(mockMapView as any), { wrapper });

      act(() => {
        result.current.zoomIn();
      });

      expect(mockMapView.animateToRegion).toHaveBeenCalledWith(
        {
          latitude: 35.0,
          longitude: 135.0,
          latitudeDelta: 0.005, // halved
          longitudeDelta: 0.005, // halved
        },
        200
      );
    });

    it('should zoom out with MapView', () => {
      const mockMapView = createMockMapView();
      const { isMapView } = require('../../utils/Map');
      isMapView.mockReturnValue(true);

      const { result } = renderHook(() => useMapView(mockMapView as any), { wrapper });

      act(() => {
        result.current.zoomOut();
      });

      expect(mockMapView.animateToRegion).toHaveBeenCalledWith(
        {
          latitude: 35.0,
          longitude: 135.0,
          latitudeDelta: 0.02, // doubled
          longitudeDelta: 0.02, // doubled
        },
        200
      );
    });

    it('should zoom in with MapRef', () => {
      const mockMapRef = createMockMapRef();
      const { isMapView, isMapRef } = require('../../utils/Map');
      isMapView.mockReturnValue(false);
      isMapRef.mockReturnValue(true);

      const { result } = renderHook(() => useMapView(mockMapRef as any), { wrapper });

      act(() => {
        result.current.zoomIn();
      });

      expect(mockMapRef.getMap().flyTo).toHaveBeenCalledWith({
        center: [135.0, 35.0],
        zoom: 16, // current zoom + 1
        essential: true,
      });
    });

    it('should zoom out with MapRef', () => {
      const mockMapRef = createMockMapRef();
      const { isMapView, isMapRef } = require('../../utils/Map');
      isMapView.mockReturnValue(false);
      isMapRef.mockReturnValue(true);

      const { result } = renderHook(() => useMapView(mockMapRef as any), { wrapper });

      act(() => {
        result.current.zoomOut();
      });

      expect(mockMapRef.getMap().flyTo).toHaveBeenCalledWith({
        center: [135.0, 35.0],
        zoom: 14, // current zoom - 1
        essential: true,
      });
    });

    it('should handle zoom out when zoom is 0', () => {
      const mockMapRef = createMockMapRef();
      mockMapRef.getMap().getZoom.mockReturnValue(0);
      const { isMapView, isMapRef } = require('../../utils/Map');
      isMapView.mockReturnValue(false);
      isMapRef.mockReturnValue(true);

      const { result } = renderHook(() => useMapView(mockMapRef as any), { wrapper });

      act(() => {
        result.current.zoomOut();
      });

      expect(mockMapRef.getMap().flyTo).toHaveBeenCalledWith({
        center: [135.0, 35.0],
        zoom: 0, // stays at 0
        essential: true,
      });
    });
  });

  describe('changeMapRegion', () => {
    it('should return early when region is undefined', () => {
      const { result } = renderHook(() => useMapView(null), { wrapper });

      act(() => {
        result.current.changeMapRegion(undefined);
      });

      // Should not dispatch any actions
      const state = store.getState();
      expect(state.settings.mapRegion).toEqual({
        latitude: 35.0,
        longitude: 135.0,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
        zoom: 15,
      });
    });

    it('should handle RegionType on web platform', () => {
      (Platform as any).OS = 'web';
      const { isRegionType } = require('../../utils/Map');
      isRegionType.mockReturnValue(true);

      const { result } = renderHook(() => useMapView(null), { wrapper });

      const newRegion = {
        latitude: 36.0,
        longitude: 136.0,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
        zoom: 16,
      };

      act(() => {
        result.current.changeMapRegion(newRegion);
      });

      const state = store.getState();
      expect(state.settings.mapRegion).toEqual(newRegion);
    });

    it('should handle ViewState on web platform with null mapViewRef', () => {
      (Platform as any).OS = 'web';
      const { isRegionType, isViewState } = require('../../utils/Map');
      isRegionType.mockReturnValue(false);
      isViewState.mockReturnValue(true);

      const { result } = renderHook(() => useMapView(null), { wrapper });

      const viewState = {
        latitude: 36.0,
        longitude: 136.0,
        zoom: 16,
        bearing: 0,
        pitch: 0,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
      };

      act(() => {
        result.current.changeMapRegion(viewState);
      });

      const state = store.getState();
      expect(state.settings.mapRegion).toMatchObject({
        latitude: 36.0,
        longitude: 136.0,
        zoom: 16,
        latitudeDelta: 0.001,
        longitudeDelta: 0.001,
      });
    });

    it('should handle ViewState on web platform with MapRef', () => {
      (Platform as any).OS = 'web';
      const mockMapRef = createMockMapRef();
      const { isRegionType, isViewState, isMapRef } = require('../../utils/Map');
      isRegionType.mockReturnValue(false);
      isViewState.mockReturnValue(true);
      isMapRef.mockReturnValue(true);

      const { result } = renderHook(() => useMapView(mockMapRef as any), { wrapper });

      const viewState = {
        latitude: 36.0,
        longitude: 136.0,
        zoom: 16,
        bearing: 0,
        pitch: 0,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
      };

      act(() => {
        result.current.changeMapRegion(viewState);
      });

      const state = store.getState();
      expect(state.settings.mapRegion).toMatchObject({
        latitude: 36.0,
        longitude: 136.0,
        zoom: 16,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    });

    it('should handle Region on mobile platform', () => {
      const { isRegion, isRegionType } = require('../../utils/Map');
      isRegion.mockReturnValue(true);
      isRegionType.mockReturnValue(false);

      const { result } = renderHook(() => useMapView(null), { wrapper });

      const region = {
        latitude: 36.0,
        longitude: 136.0,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };

      act(() => {
        result.current.changeMapRegion(region);
      });

      const state = store.getState();
      expect(state.settings.mapRegion).toEqual({
        ...region,
        zoom: 15, // from deltaToZoom mock
      });
    });

    it('should handle jumpTo with RegionType and MapView on mobile', () => {
      const mockMapView = createMockMapView();
      const { isRegionType, isMapView } = require('../../utils/Map');
      isRegionType.mockReturnValue(true);
      isMapView.mockReturnValue(true);

      const { result } = renderHook(() => useMapView(mockMapView as any), { wrapper });

      const region = {
        latitude: 36.0,
        longitude: 136.0,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
        zoom: 16,
      };

      act(() => {
        result.current.changeMapRegion(region, true); // jumpTo = true
      });

      expect(mockMapView.setCamera).toHaveBeenCalledWith({
        center: {
          latitude: 36.0,
          longitude: 136.0,
        },
        zoom: 16,
      });
    });
  });
});
