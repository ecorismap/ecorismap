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
import { useRecord } from '../useRecord';
import dataSetReducer from '../../modules/dataSet';
import layersReducer from '../../modules/layers';
import userReducer from '../../modules/user';
import settingsReducer, { settingsInitialState } from '../../modules/settings';
import projectsReducer from '../../modules/projects';
import tileMapsReducer from '../../modules/tileMaps';
import { LayerType, RecordType, LocationType } from '../../types';

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage', () => ({
  getAllKeys: jest.fn().mockResolvedValue(['key1', 'key2']),
  multiGet: jest.fn().mockResolvedValue([
    ['key1', 'value1'],
    ['key2', 'value2'],
  ]),
}));

// Mock MMKV storage
jest.mock('../../utils/mmkvStorage', () => ({
  storage: {
    getAllKeys: jest.fn(() => ['key1', 'key2']),
    getString: jest.fn((key) => {
      if (key === 'key1') return 'value1';
      if (key === 'key2') return 'value2';
      return null;
    }),
  },
  trackLogStorage: {
    getAllKeys: jest.fn(() => ['trackKey1']),
    getString: jest.fn((key) => {
      if (key === 'trackKey1') return 'trackValue1';
      return null;
    }),
  },
}));

jest.mock('../usePermission', () => ({
  usePermission: () => ({
    isRunningProject: false,
  }),
}));

jest.mock('../../utils/Data', () => ({
  getDefaultField: jest.fn().mockReturnValue({
    testField: 'defaultValue',
  }),
}));

jest.mock('../../utils/Coords', () => ({
  calcCentroid: jest.fn().mockReturnValue({
    latitude: 35.0,
    longitude: 135.0,
  }),
  calcLineMidPoint: jest.fn().mockReturnValue({
    latitude: 35.001,
    longitude: 135.001,
  }),
}));

jest.mock('ulid', () => ({
  ulid: jest.fn().mockReturnValue('test-ulid-123'),
}));

// Create test store
const createTestStore = () => {
  const mockLayers: LayerType[] = [
    {
      id: 'layer1',
      name: 'Test Point Layer',
      type: 'POINT' as const,
      active: true,
      visible: true,
      permission: 'PRIVATE' as const,
      colorStyle: {
        colorType: 'SINGLE' as const,
        transparency: 0.8,
        color: '#FF0000',
        fieldName: '',
        customFieldValue: '',
        colorRamp: 'RANDOM' as const,
        colorList: [],
      },
      label: '',
      field: [],
    },
    {
      id: 'layer2',
      name: 'Test Line Layer',
      type: 'LINE' as const,
      active: true,
      visible: true,
      permission: 'PRIVATE' as const,
      colorStyle: {
        colorType: 'SINGLE' as const,
        transparency: 0.8,
        color: '#00FF00',
        fieldName: '',
        customFieldValue: '',
        colorRamp: 'RANDOM' as const,
        colorList: [],
      },
      label: '',
      field: [],
    },
    {
      id: 'layer3',
      name: 'Test Polygon Layer',
      type: 'POLYGON' as const,
      active: true,
      visible: true,
      permission: 'PRIVATE' as const,
      colorStyle: {
        colorType: 'SINGLE' as const,
        transparency: 0.8,
        color: '#0000FF',
        fieldName: '',
        customFieldValue: '',
        colorRamp: 'RANDOM' as const,
        colorList: [],
      },
      label: '',
      field: [],
    },
  ];

  const mockDataSet = [
    {
      layerId: 'layer1',
      userId: 'user1',
      data: [
        {
          id: 'record1',
          userId: 'user1',
          displayName: 'Test User',
          visible: true,
          redraw: false,
          coords: { latitude: 35.0, longitude: 135.0 },
          field: { testField: 'testValue' },
        },
      ],
    },
    {
      layerId: 'layer2',
      userId: 'user1',
      data: [
        {
          id: 'record2',
          userId: 'user1',
          displayName: 'Test User',
          visible: true,
          redraw: false,
          coords: [
            { latitude: 35.0, longitude: 135.0 },
            { latitude: 35.001, longitude: 135.001 },
          ],
          field: { testField: 'testValue' },
        },
      ],
    },
  ];

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
      dataSet: mockDataSet,
      layers: mockLayers,
      user: {
        uid: 'user1',
        displayName: 'Test User',
        email: 'test@example.com',
        photoURL: null,
      },
      settings: {
        ...settingsInitialState,
        projectId: 'test-project',
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

describe('useRecord', () => {
  let store: any;
  let wrapper: any;

  beforeEach(() => {
    store = createTestStore();
    wrapper = createWrapper(store);
    jest.clearAllMocks();
  });

  it('should return initial state correctly', () => {
    const { result } = renderHook(() => useRecord(), { wrapper });

    expect(result.current.dataUser.uid).toBe('user1');
    expect(result.current.projectId).toBe('test-project');
    expect(result.current.pointDataSet).toHaveLength(1);
    expect(result.current.lineDataSet).toHaveLength(1);
    expect(result.current.polygonDataSet).toHaveLength(0);
    expect(result.current.activePointLayer?.id).toBe('layer1');
    expect(result.current.activeLineLayer?.id).toBe('layer2');
    expect(result.current.activePolygonLayer?.id).toBe('layer3');
  });

  it('should find layer by id', () => {
    const { result } = renderHook(() => useRecord(), { wrapper });

    const layer = result.current.findLayer('layer1');
    expect(layer?.id).toBe('layer1');
    expect(layer?.name).toBe('Test Point Layer');

    const nonExistentLayer = result.current.findLayer('nonexistent');
    expect(nonExistentLayer).toBeUndefined();
  });

  it('should find record by layerId, userId, and recordId', () => {
    const { result } = renderHook(() => useRecord(), { wrapper });

    const pointRecord = result.current.findRecord('layer1', 'user1', 'record1', 'POINT');
    expect(pointRecord?.id).toBe('record1');

    const lineRecord = result.current.findRecord('layer2', 'user1', 'record2', 'LINE');
    expect(lineRecord?.id).toBe('record2');

    const nonExistentRecord = result.current.findRecord('layer1', 'user1', 'nonexistent', 'POINT');
    expect(nonExistentRecord).toBeUndefined();
  });

  it('should select and unselect records', () => {
    const { result } = renderHook(() => useRecord(), { wrapper });

    const mockRecord: RecordType = {
      id: 'test-record',
      userId: 'user1',
      displayName: 'Test User',
      visible: true,
      redraw: false,
      coords: { latitude: 35.0, longitude: 135.0 },
      field: {},
    };

    act(() => {
      result.current.selectRecord('layer1', mockRecord);
    });

    const state = store.getState();
    expect(state.settings.selectedRecord).toEqual({
      layerId: 'layer1',
      record: mockRecord,
    });

    act(() => {
      result.current.unselectRecord();
    });

    const newState = store.getState();
    expect(newState.settings.selectedRecord).toBeUndefined();
  });

  it('should get editable layer and record set', () => {
    const { result } = renderHook(() => useRecord(), { wrapper });

    const { editingLayer, editingRecordSet } = result.current.getEditableLayerAndRecordSet('POINT');
    expect(editingLayer?.id).toBe('layer1');
    expect(editingRecordSet).toHaveLength(1);

    const { editingLayer: lineLayer, editingRecordSet: lineRecordSet } =
      result.current.getEditableLayerAndRecordSet('LINE');
    expect(lineLayer?.id).toBe('layer2');
    expect(lineRecordSet).toHaveLength(1);
  });

  it('should check if layer is editable', () => {
    const { result } = renderHook(() => useRecord(), { wrapper });

    const pointLayer = result.current.findLayer('layer1')!;
    const lineLayer = result.current.findLayer('layer2')!;

    expect(result.current.isLayerEditable('POINT', pointLayer)).toBe(true);
    expect(result.current.isLayerEditable('LINE', pointLayer)).toBe(false);
    expect(result.current.isLayerEditable('LINE', lineLayer)).toBe(true);
  });

  it('should check record editable status', () => {
    const { result } = renderHook(() => useRecord(), { wrapper });

    const activeLayer = result.current.findLayer('layer1')!;
    const { isOK, message } = result.current.checkRecordEditable(activeLayer);
    expect(isOK).toBe(true);
    expect(message).toBe('');

    // Test inactive layer
    const inactiveLayer = { ...activeLayer, active: false };
    const { isOK: isOKInactive, message: messageInactive } = result.current.checkRecordEditable(inactiveLayer);
    expect(isOKInactive).toBe(false);
    expect(messageInactive).toBe('hooks.message.noEditMode');
  });

  it('should generate record correctly', () => {
    const { result } = renderHook(() => useRecord(), { wrapper });

    const layer = result.current.findLayer('layer1')!;
    const coords: LocationType = { latitude: 35.0, longitude: 135.0 };

    const record = result.current.generateRecord('POINT', layer, [], coords);

    expect(record.id).toBe('test-ulid-123');
    expect(record.userId).toBe('user1');
    expect(record.displayName).toBe('Test User');
    expect(record.coords).toEqual(coords);
    expect(record.field).toEqual({ testField: 'defaultValue' });
  });

  it('should add record with check successfully', () => {
    const { result } = renderHook(() => useRecord(), { wrapper });

    const coords: LocationType = { latitude: 35.0, longitude: 135.0 };

    act(() => {
      const { isOK, message, layer, record } = result.current.addRecordWithCheck('POINT', coords);
      expect(isOK).toBe(true);
      expect(message).toBe('');
      expect(layer?.id).toBe('layer1');
      expect(record?.id).toBe('test-ulid-123');
    });
  });

  it('should add track record', () => {
    const { result } = renderHook(() => useRecord(), { wrapper });

    const locations: LocationType[] = [
      { latitude: 35.0, longitude: 135.0 },
      { latitude: 35.001, longitude: 135.001 },
    ];

    act(() => {
      const { isOK, message, layer, record } = result.current.addTrackRecord(locations);
      expect(isOK).toBe(true);
      expect(message).toBe('');
      expect(layer?.id).toBe('track');
      expect(record?.coords).toEqual(locations);
    });
  });

  it('should calculate storage size', async () => {
    const { result } = renderHook(() => useRecord(), { wrapper });

    let storageSize;
    await act(async () => {
      storageSize = await result.current.calculateStorageSize();
    });

    // 'key1value1' + 'key2value2' = 18 bytes / 1024 / 1024
    expect(storageSize).toBeGreaterThan(0);
    expect(storageSize).toBeLessThan(1); // Should be in MB range
  });

  it('should set editing record state', () => {
    const { result } = renderHook(() => useRecord(), { wrapper });

    act(() => {
      result.current.setIsEditingRecord(true);
    });

    const state = store.getState();
    expect(state.settings.isEditingRecord).toBe(true);

    act(() => {
      result.current.setIsEditingRecord(false);
    });

    const newState = store.getState();
    expect(newState.settings.isEditingRecord).toBe(false);
  });

  it('should handle no editable layer scenario', () => {
    // Create store with no active layers
    const storeWithInactiveLayers = configureStore({
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
        layers: [
          {
            id: 'layer1',
            name: 'Inactive Layer',
            type: 'POINT' as const,
            active: false, // inactive
            visible: true,
            permission: 'PRIVATE' as const,
            colorStyle: {
              colorType: 'SINGLE' as const,
              transparency: 0.8,
              color: '#FF0000',
              fieldName: '',
              customFieldValue: '',
              colorRamp: 'RANDOM' as const,
              colorList: [],
            },
            label: '',
            field: [],
          },
        ],
        user: {
          uid: 'user1',
          displayName: 'Test User',
          email: 'test@example.com',
          photoURL: null,
        },
        settings: settingsInitialState,
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

    const wrapperInactive = createWrapper(storeWithInactiveLayers);
    const { result } = renderHook(() => useRecord(), { wrapper: wrapperInactive });

    const coords: LocationType = { latitude: 35.0, longitude: 135.0 };

    act(() => {
      const { isOK, message, layer, record } = result.current.addRecordWithCheck('POINT', coords);
      expect(isOK).toBe(false);
      expect(message).toBe('hooks.message.noLayerToEdit');
      expect(layer).toBeUndefined();
      expect(record).toBeUndefined();
    });
  });
});
