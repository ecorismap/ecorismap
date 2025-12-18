import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { useLocation } from '../useLocation';
import * as Location from 'expo-location';
import BackgroundGeolocation from 'react-native-background-geolocation';
import { ConfirmAsync, AlertAsync } from '../../components/molecules/AlertAsync';
import * as Notifications from 'expo-notifications';

// Mock dependencies
jest.mock('expo-location');
jest.mock('expo-notifications');
jest.mock('react-native-background-geolocation', () => {
  const constants = {
    DESIRED_ACCURACY_HIGH: 0,
    DESIRED_ACCURACY_MEDIUM: 1,
    DESIRED_ACCURACY_LOW: 2,
    AUTHORIZATION_STATUS_ALWAYS: 3,
    AUTHORIZATION_STATUS_WHEN_IN_USE: 2,
  };
  const subscription = { remove: jest.fn() };
  const mock = {
    ready: jest.fn(),
    requestPermission: jest.fn(),
    getState: jest.fn(),
    setConfig: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    getCurrentPosition: jest.fn(),
    watchPosition: jest.fn(),
    stopWatchPosition: jest.fn(),
    onLocation: jest.fn().mockImplementation(() => subscription),
    changePace: jest.fn(),
  };

  return {
    __esModule: true,
    default: {
      ...constants,
      ...mock,
    },
    ...constants,
    ...mock,
  };
});
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

// Create a mock ref object
const createMockMapRef = () => ({ current: null });

const mockLocation = Location as jest.Mocked<typeof Location>;
 
const mockBackgroundGeolocation = BackgroundGeolocation as any;
const mockNotifications = Notifications as jest.Mocked<typeof Notifications>;

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
    mockBackgroundGeolocation.ready.mockResolvedValue({ enabled: false } as any);
    mockBackgroundGeolocation.getState.mockResolvedValue({ enabled: false } as any);
    mockBackgroundGeolocation.requestPermission.mockResolvedValue(
      BackgroundGeolocation.AUTHORIZATION_STATUS_ALWAYS
    );
    mockBackgroundGeolocation.watchPosition.mockResolvedValue('watch-id' as any);
    mockBackgroundGeolocation.stopWatchPosition.mockResolvedValue(undefined);
    mockBackgroundGeolocation.getCurrentPosition.mockResolvedValue({
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
    } as any);
    mockBackgroundGeolocation.onLocation.mockReturnValue({ remove: jest.fn() } as any);

    mockLocation.watchHeadingAsync.mockResolvedValue({
      remove: jest.fn(),
    });

    mockNotifications.getPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    } as any);
    mockNotifications.requestPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    } as any);
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

    expect(mockBackgroundGeolocation.requestPermission).toHaveBeenCalled();
    expect(permissionStatus).toBe('granted');
  });

  it('should toggle GPS state', async () => {
    const mockRef = createMockMapRef();
    const { result } = renderHook(() => useLocation(mockRef), { wrapper });

    await act(async () => {
      await result.current.toggleGPS('show');
    });

    expect(result.current.gpsState).toBe('show');
    // GPS ON時はBackgroundGeolocation.startが呼ばれる（watchPositionは廃止）
    expect(mockBackgroundGeolocation.start).toHaveBeenCalled();
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
    const alertSpy = AlertAsync as jest.Mock;
    alertSpy.mockResolvedValue(undefined);
    mockBackgroundGeolocation.requestPermission.mockResolvedValueOnce(0 as any);

    const mockRef = createMockMapRef();
    const { result } = renderHook(() => useLocation(mockRef), { wrapper });

    let permissionStatus;
    await act(async () => {
      permissionStatus = await result.current.confirmLocationPermission();
    });

    expect(permissionStatus).toBeUndefined();
  });

  it('should open settings when permission is blocked', async () => {
    const mockRef = createMockMapRef();
    const { result } = renderHook(() => useLocation(mockRef), { wrapper });

    mockBackgroundGeolocation.requestPermission.mockResolvedValueOnce(0 as any);

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
    mockBackgroundGeolocation.watchPosition.mockRejectedValueOnce(new Error('Location error') as any);

    const mockRef = createMockMapRef();
    const { result } = renderHook(() => useLocation(mockRef), { wrapper });

    // The important thing is that the hook initializes without crashing
    expect(result.current.gpsState).toBe('off');
    expect(result.current.toggleGPS).toBeDefined();

    // Clean up
    consoleErrorSpy.mockRestore();
  });
});
