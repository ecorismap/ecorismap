import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { useData } from '../useData';
import { RecordType, LayerType, DataType } from '../../types';
import dataSetReducer from '../../modules/dataSet';
import layersReducer from '../../modules/layers';
import userReducer from '../../modules/user';
import settingsReducer from '../../modules/settings';
import projectsReducer from '../../modules/projects';
import tileMapsReducer from '../../modules/tileMaps';
import trackLogReducer from '../../modules/trackLog';
import { settingsInitialState } from '../../modules/settings';

// Mock dependencies
jest.mock('ulid', () => ({ ulid: () => 'test-ulid-1234' }));

// Mock Firebase modules
jest.mock('@react-native-firebase/app', () => ({
  getApp: jest.fn(),
}));

jest.mock('@react-native-firebase/firestore', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    collection: jest.fn(),
  })),
}));

jest.mock('../../lib/firebase/firestore', () => ({
  deleteCurrentPosition: jest.fn(),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  NativeEventEmitter: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ name: 'Data' }),
}));

jest.mock('../useProject', () => ({
  useProject: () => ({ isSettingProject: false }),
}));

jest.mock('../../utils/Photo', () => ({
  deleteRecordPhotos: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'ja' },
  }),
}));

jest.mock('../../i18n/config', () => ({
  __esModule: true,
  default: { language: 'ja' },
  t: (key: string) => key,
}));

// Create test data
const sampleLayer: LayerType = {
  id: 'test-layer',
  name: 'Test Layer',
  type: 'POINT',
  permission: 'PRIVATE',
  colorStyle: {
    colorType: 'SINGLE',
    transparency: 0.8,
    color: '#FF0000',
    fieldName: 'name',
    customFieldValue: '',
    colorRamp: 'RANDOM',
    colorList: [],
  },
  label: 'name',
  visible: true,
  active: true,
  field: [
    { id: '0-0', name: 'name', format: 'SERIAL' },
    { id: '0-1', name: 'time', format: 'DATETIME' },
    { id: '0-2', name: 'cmt', format: 'STRING' },
  ],
};

const sampleRecord: RecordType = {
  id: 'test-record',
  userId: 'test-user',
  displayName: 'Test User',
  visible: true,
  redraw: false,
  coords: [{ latitude: 35.0, longitude: 135.0 }],
  field: {
    name: 'Test Point',
    time: new Date().toISOString(),
    cmt: 'Test comment',
  },
};

const sampleRecord2: RecordType = {
  id: 'test-record-2',
  userId: 'test-user',
  displayName: 'Test User',
  visible: true,
  redraw: false,
  coords: [{ latitude: 35.1, longitude: 135.1 }],
  field: {
    name: 'Test Point 2',
    time: new Date().toISOString(),
    cmt: 'Test comment 2',
  },
};

const sampleDataSet: DataType = {
  layerId: 'test-layer',
  userId: 'test-user',
  data: [sampleRecord, sampleRecord2],
};

// Create test store
const createTestStore = () => {
  return configureStore({
    reducer: {
      dataSet: dataSetReducer,
      layers: layersReducer,
      user: userReducer,
      settings: settingsReducer,
      projects: projectsReducer,
      tileMaps: tileMapsReducer,
      trackLog: trackLogReducer,
    },
    preloadedState: {
      dataSet: [sampleDataSet],
      layers: [sampleLayer],
      user: {
        uid: 'test-user',
        displayName: 'Test User',
        email: 'test@example.com',
        photoURL: null,
      },
      settings: {
        ...settingsInitialState,
        projectId: 'test-project',
        gpsAccuracy: 'HIGH' as const,
      },
      projects: [],
      tileMaps: [],
      trackLog: {
        distance: 0,
        track: [],
        lastTimeStamp: 0,
        segments: [],
        statistics: {
          duration: 0,
          movingTime: 0,
          averageSpeed: 0,
          maxSpeed: 0,
          pauseCount: 0,
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

describe('useData', () => {
  let store: any;
  let wrapper: any;

  beforeEach(() => {
    store = createTestStore();
    wrapper = createWrapper(store);
    jest.clearAllMocks();
  });

  it('should return initial data', () => {
    const { result } = renderHook(() => useData('test-layer'), { wrapper });

    expect(result.current.sortedRecordSet).toBeDefined();
    expect(result.current.checkList).toBeDefined();
    expect(result.current.isChecked).toBe(false);
    expect(result.current.isEditable).toBe(true);
  });

  it('should return sorted record set', () => {
    const { result } = renderHook(() => useData('test-layer'), { wrapper });

    // Should include our sample records
    expect(result.current.sortedRecordSet).toHaveLength(2);
    expect(result.current.sortedRecordSet[0]).toEqual(sampleRecord);
    expect(result.current.sortedRecordSet[1]).toEqual(sampleRecord2);
  });

  it('should provide checkList functionality', () => {
    const { result } = renderHook(() => useData('test-layer'), { wrapper });

    expect(result.current.checkList).toHaveLength(2);
    expect(result.current.checkList[0].checked).toBe(false);
    expect(result.current.checkList[1].checked).toBe(false);
  });

  it('should handle empty data', () => {
    // Create store with empty data
    const emptyStore = configureStore({
      reducer: {
        dataSet: dataSetReducer,
        layers: layersReducer,
        user: userReducer,
        settings: settingsReducer,
        projects: projectsReducer,
        tileMaps: tileMapsReducer,
        trackLog: trackLogReducer,
      },
      preloadedState: {
        dataSet: [],
        layers: [sampleLayer], // Keep layer for valid hook call
        user: { uid: 'test-user', displayName: 'Test User', email: 'test@example.com', photoURL: null },
        settings: {
          ...settingsInitialState,
          projectId: 'test-project',
          gpsAccuracy: 'HIGH' as const,
        },
        projects: [],
        tileMaps: [],
        trackLog: {
          distance: 0,
          track: [],
          lastTimeStamp: 0,
          segments: [],
          statistics: {
            duration: 0,
            movingTime: 0,
            averageSpeed: 0,
            maxSpeed: 0,
            pauseCount: 0,
          },
        },
      },
    });

    const emptyWrapper = createWrapper(emptyStore);
    const { result } = renderHook(() => useData('test-layer'), { wrapper: emptyWrapper });

    expect(result.current.sortedRecordSet).toHaveLength(0);
    expect(result.current.checkList).toHaveLength(0);
    expect(result.current.isChecked).toBe(false);
  });

  it('should handle checked state changes', () => {
    const { result } = renderHook(() => useData('test-layer'), { wrapper });

    // Initially not checked
    expect(result.current.isChecked).toBe(false);

    // Check an item
    act(() => {
      result.current.changeChecked(0, true);
    });

    expect(result.current.checkList[0].checked).toBe(true);
    expect(result.current.isChecked).toBe(true);
    expect(result.current.checkedRecords).toHaveLength(1);
  });

  it('should properly update state when toggling checked multiple times', () => {
    const { result, rerender } = renderHook(() => useData('test-layer'), { wrapper });

    // Initially not checked
    expect(result.current.checkList[0].checked).toBe(false);

    // Check the item
    act(() => {
      result.current.changeChecked(0, true);
    });

    expect(result.current.checkList[0].checked).toBe(true);

    // Force re-render to ensure state persists
    rerender();
    expect(result.current.checkList[0].checked).toBe(true);

    // Uncheck the item
    act(() => {
      result.current.changeChecked(0, false);
    });

    expect(result.current.checkList[0].checked).toBe(false);

    // Force re-render again
    rerender();
    expect(result.current.checkList[0].checked).toBe(false);
  });

  it('should handle rapid consecutive checked state changes', () => {
    const { result } = renderHook(() => useData('test-layer'), { wrapper });

    // Perform multiple rapid state changes
    act(() => {
      result.current.changeChecked(0, true);
      result.current.changeChecked(0, false);
      result.current.changeChecked(0, true);
    });

    // Final state should be true
    expect(result.current.checkList[0].checked).toBe(true);
    expect(result.current.isChecked).toBe(true);
  });

  it('should maintain individual item states when checking multiple items', () => {
    const { result } = renderHook(() => useData('test-layer'), { wrapper });

    // Check multiple items
    act(() => {
      result.current.changeChecked(0, true);
      result.current.changeChecked(1, true);
    });

    expect(result.current.checkList[0].checked).toBe(true);
    expect(result.current.checkList[1].checked).toBe(true);
    expect(result.current.checkedRecords).toHaveLength(2);

    // Uncheck only the first item
    act(() => {
      result.current.changeChecked(0, false);
    });

    expect(result.current.checkList[0].checked).toBe(false);
    expect(result.current.checkList[1].checked).toBe(true);
    expect(result.current.checkedRecords).toHaveLength(1);
  });

  it('should handle out-of-bounds index gracefully', () => {
    const { result } = renderHook(() => useData('test-layer'), { wrapper });

    // Try to check an item that doesn't exist
    act(() => {
      result.current.changeChecked(999, true);
    });

    // Should not throw error and state should remain unchanged
    expect(result.current.isChecked).toBe(false);
  });

  it('should trigger re-render when checkList changes', () => {
    const { result } = renderHook(() => useData('test-layer'), { wrapper });

    // Track original references
    const originalCheckList = result.current.checkList;
    const originalItem0 = result.current.checkList[0];
    const originalItem1 = result.current.checkList[1];

    // Change checked state
    act(() => {
      result.current.changeChecked(0, true);
    });

    // checkList should be a new object reference (not the same array)
    expect(result.current.checkList).not.toBe(originalCheckList);

    // The specific item should be a new object reference
    expect(result.current.checkList[0]).not.toBe(originalItem0);

    // But unchanged items should remain the same reference (for performance)
    expect(result.current.checkList[1]).toBe(originalItem1);
  });

  it('should handle sorting', () => {
    const { result } = renderHook(() => useData('test-layer'), { wrapper });

    // Test sorting by name
    act(() => {
      result.current.changeOrder('name', 'ASCENDING');
    });

    expect(result.current.sortedOrder).toBe('ASCENDING');
    expect(result.current.sortedName).toBe('name');
  });

  it('should handle visibility changes', () => {
    const { result } = renderHook(() => useData('test-layer'), { wrapper });

    // Test changing visibility of a record
    act(() => {
      result.current.changeVisible(sampleRecord);
    });

    // Verify the action was dispatched
    expect(result.current.sortedRecordSet).toHaveLength(2);
  });

  it('should add default record', () => {
    const { result } = renderHook(() => useData('test-layer'), { wrapper });

    act(() => {
      const newRecord = result.current.addDefaultRecord({ name: 'New Record' });
      expect(newRecord.field.name).toBe('New Record');
      expect(newRecord.userId).toBe('test-user');
    });
  });

  it('should handle map memo layer detection', () => {
    const mapMemoRecord: RecordType = {
      ...sampleRecord,
      field: {
        ...sampleRecord.field,
        _strokeColor: '#FF0000',
      },
    };

    const mapMemoDataSet: DataType = {
      layerId: 'test-layer',
      userId: 'test-user',
      data: [mapMemoRecord],
    };

    const mapMemoStore = configureStore({
      reducer: {
        dataSet: dataSetReducer,
        layers: layersReducer,
        user: userReducer,
        settings: settingsReducer,
        projects: projectsReducer,
        tileMaps: tileMapsReducer,
        trackLog: trackLogReducer,
      },
      preloadedState: {
        dataSet: [mapMemoDataSet],
        layers: [sampleLayer],
        user: {
          uid: 'test-user',
          displayName: 'Test User',
          email: 'test@example.com',
          photoURL: null,
        },
        settings: {
          ...settingsInitialState,
          projectId: 'test-project',
          gpsAccuracy: 'HIGH' as const,
        },
        projects: [],
        tileMaps: [],
        trackLog: {
          distance: 0,
          track: [],
          lastTimeStamp: 0,
          segments: [],
          statistics: {
            duration: 0,
            movingTime: 0,
            averageSpeed: 0,
            maxSpeed: 0,
            pauseCount: 0,
          },
        },
      },
    });

    const mapMemoWrapper = createWrapper(mapMemoStore);
    const { result } = renderHook(() => useData('test-layer'), { wrapper: mapMemoWrapper });

    expect(result.current.isMapMemoLayer).toBe(true);
  });
});
