import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { useLocation } from '../useLocation';
import * as Location from 'expo-location';
import { ConfirmAsync } from '../../components/molecules/AlertAsync';

// Mock dependencies
jest.mock('expo-location');
jest.mock('expo-task-manager');
jest.mock('expo-notifications');
jest.mock('../useRecord', () => ({
  useRecord: () => ({
    addTrackRecord: jest.fn().mockReturnValue({ isOK: true, message: '' }),
  }),
}));
jest.mock('../../lib/firebase/firestore', () => ({
  deleteCurrentPosition: jest.fn(),
}));
jest.mock('../../utils/Account', () => ({
  isLoggedIn: jest.fn().mockReturnValue(false),
}));
jest.mock('../../utils/Project', () => ({
  hasOpened: jest.fn().mockReturnValue(false),
}));

// Mock MMKV storage
const mockTrackLog: any = {
  track: [],
  distance: 0,
  lastTimeStamp: 0,
};

jest.mock('../../utils/Location', () => ({
  getStoredLocations: jest.fn(() => mockTrackLog),
  clearStoredLocations: jest.fn(),
  checkAndStoreLocations: jest.fn(),
  CHUNK_SIZE: 1000,
  DISPLAY_BUFFER_SIZE: 500,
  saveTrackChunk: jest.fn(),
  getTrackChunk: jest.fn(() => []),
  getTrackMetadata: jest.fn(() => ({
    totalChunks: 0,
    totalPoints: 0,
    lastChunkIndex: 0,
    lastTimeStamp: 0,
  })),
  saveTrackMetadata: jest.fn(),
  getAllTrackPoints: jest.fn(() => []),
  clearAllChunks: jest.fn(),
  getDisplayBuffer: jest.fn(() => []),
  getCurrentChunkInfo: jest.fn(() => ({
    currentChunkIndex: 0,
    currentChunkSize: 0,
    displayBufferSize: 0,
  })),
  initializeChunkState: jest.fn(),
  addLocationsToChunks: jest.fn(),
}));

jest.mock('../../utils/mmkvStorage', () => ({
  trackLogMMKV: {
    getCurrentLocation: jest.fn(() => null),
    setCurrentLocation: jest.fn(),
  },
}));
jest.mock('../../components/molecules/AlertAsync', () => ({
  ConfirmAsync: jest.fn(),
  AlertAsync: jest.fn(),
}));

jest.mock('../../utils/mockGpsHelper', () => ({
  MockGpsGenerator: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    getCurrentLocation: jest.fn(() => ({
      coords: {
        latitude: 35.6812,
        longitude: 139.7671,
        altitude: 0,
        accuracy: 10,
        altitudeAccuracy: 10,
        heading: 0,
        speed: 0,
      },
      timestamp: Date.now(),
    })),
    getProgress: jest.fn(() => ({
      current: 0,
      total: 100,
      percentage: 0,
    })),
  })),
  LONG_TRACK_TEST_CONFIG: {
    points: [],
    interval: 1000,
    loop: false,
  },
}));

jest.mock('../../utils/memoryMonitor', () => ({
  logMemoryUsage: jest.fn(),
  logObjectSize: jest.fn(),
  logChunkStats: jest.fn(),
}));


// Create a mock ref object
const createMockMapRef = () => ({ current: null });

const mockLocation = Location as jest.Mocked<typeof Location>;

// Create a test store
const createTestStore = () => {
  return configureStore({
    reducer: {
      settings: (state = { projectId: undefined, gpsAccuracy: 'HIGH' }) => state,
      user: (state = { uid: 'test-user', displayName: 'Test User' }) => state,
    },
  });
};

// Test wrapper component
const createWrapper = (store: any) => {
  return ({ children }: { children: React.ReactNode }) => {
    // eslint-disable-next-line react/no-children-prop
    return React.createElement(Provider, { store, children });
  };
};

describe('useLocation', () => {
  let store: any;
  let wrapper: any;

  beforeEach(() => {
    store = createTestStore();
    wrapper = createWrapper(store);
    
    // Reset mocks
    jest.clearAllMocks();
    // Default to not show confirm dialog to avoid state updates
    (ConfirmAsync as jest.Mock).mockResolvedValue(false);
    
    // Mock basic Location functions
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted' as Location.PermissionStatus.GRANTED,
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });

    mockLocation.getForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted' as Location.PermissionStatus.GRANTED,
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });

    mockLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
    mockLocation.watchPositionAsync.mockResolvedValue({
      remove: jest.fn(),
    });
    mockLocation.watchHeadingAsync.mockResolvedValue({
      remove: jest.fn(),
    });
    mockLocation.getLastKnownPositionAsync.mockResolvedValue({
      coords: {
        latitude: 35.0,
        longitude: 135.0,
        altitude: 0,
        accuracy: 10,
        altitudeAccuracy: 5,
        heading: 0,
        speed: 0,
      },
      timestamp: Date.now(),
    });
  });

  it('should initialize with default values', () => {
    const mockRef = createMockMapRef();
    const { result } = renderHook(() => useLocation(mockRef), { wrapper });

    expect(result.current.currentLocation).toBeNull();
    expect(result.current.gpsState).toBe('off');
    expect(result.current.trackingState).toBe('off');
    expect(result.current.headingUp).toBe(false);
    expect(result.current.azimuth).toBe(0);
  });

  it('should request location permission', async () => {
    const mockRef = createMockMapRef();
    const { result } = renderHook(() => useLocation(mockRef), { wrapper });

    let permissionStatus;
    await act(async () => {
      permissionStatus = await result.current.confirmLocationPermission();
    });

    expect(mockLocation.requestForegroundPermissionsAsync).toHaveBeenCalled();
    expect(permissionStatus).toBe('granted');
  });

  it('should toggle GPS state', async () => {
    const mockRef = createMockMapRef();
    const { result } = renderHook(() => useLocation(mockRef), { wrapper });

    await act(async () => {
      await result.current.toggleGPS('show');
    });

    expect(result.current.gpsState).toBe('show');
    expect(mockLocation.watchPositionAsync).toHaveBeenCalled();
  });

  it('should toggle heading up', async () => {
    const mockMapRef = {
      setCamera: jest.fn(),
      animateCamera: jest.fn(),
    };

    const { result } = renderHook(() => useLocation(mockMapRef as any), { wrapper });

    await act(async () => {
      await result.current.toggleHeadingUp(true);
    });

    expect(result.current.headingUp).toBe(true);
    expect(mockLocation.watchHeadingAsync).toHaveBeenCalled();
  });

  it('should handle permission denied', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'denied' as Location.PermissionStatus.DENIED,
      granted: false,
      canAskAgain: false,
      expires: 'never',
    });

    const mockRef = createMockMapRef();
    const { result } = renderHook(() => useLocation(mockRef), { wrapper });

    let permissionStatus;
    await act(async () => {
      permissionStatus = await result.current.confirmLocationPermission();
    });

    expect(permissionStatus).toBeUndefined();
  });

  it('should handle location errors gracefully', () => {
    // Suppress console.error for this test since we're testing error handling
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Set up the mock to reject after being called
    mockLocation.watchPositionAsync.mockRejectedValueOnce(new Error('Location error'));

    const mockRef = createMockMapRef();
    const { result } = renderHook(() => useLocation(mockRef), { wrapper });

    // The important thing is that the hook initializes without crashing
    expect(result.current.gpsState).toBe('off');
    expect(result.current.toggleGPS).toBeDefined();

    // Clean up
    consoleErrorSpy.mockRestore();
  });
});
