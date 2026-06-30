import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { AppState } from 'react-native';
import { useLocation, shouldEmitAzimuth, angularDeltaDeg, shouldRotateCompassCamera } from '../useLocation';
import * as Location from 'expo-location';
import BackgroundGeolocation from 'react-native-background-geolocation';
import { ConfirmAsync, AlertAsync } from '../../components/molecules/AlertAsync';
import * as Notifications from 'expo-notifications';

// Mock dependencies
jest.mock('expo-location');
jest.mock('expo-notifications');
jest.mock('react-native-background-geolocation', () => {
  // v5のenum名前空間に合わせる（値は実ライブラリのDesiredAccuracy/AuthorizationStatusと一致）
  const constants = {
    DesiredAccuracy: { Navigation: -2, High: -1, Medium: 10, Low: 100, VeryLow: 1000, Lowest: 3000 },
    AuthorizationStatus: { NotDetermined: 0, Restricted: 1, Denied: 2, Always: 3, WhenInUse: 4 },
  };
  const subscription = { remove: jest.fn() };
  const mock = {
    ready: jest.fn(),
    requestPermission: jest.fn(),
    getState: jest.fn(),
    removeListeners: jest.fn(),
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
  flushTrackLog: jest.fn(),
  getLineLength: jest.fn(() => 0),
  toLocationObject: jest.fn((location: any) => ({
    coords: { ...location.coords },
    timestamp: location.timestamp,
  })),
}));

jest.mock('../../utils/mmkvStorage', () => ({
  trackLogMMKV: {
    getCurrentLocation: jest.fn(() => null),
    setCurrentLocation: jest.fn(),
    getTrackingState: jest.fn(() => 'off'),
    setTrackingState: jest.fn(),
    getGpsState: jest.fn(() => 'off'),
    setGpsState: jest.fn(),
    getTrackLog: jest.fn(() => null),
    setTrackLog: jest.fn(),
    clearTrackLog: jest.fn(),
    getSize: jest.fn(() => 0),
    setChunk: jest.fn(),
    getChunk: jest.fn(() => null),
    removeChunk: jest.fn(),
    setMetadata: jest.fn(),
    getMetadata: jest.fn(() => null),
    setProximityAlertEnabled: jest.fn(),
    getProximityAlertEnabled: jest.fn(() => false),
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
    mockBackgroundGeolocation.removeListeners.mockResolvedValue(undefined);
    mockBackgroundGeolocation.requestPermission.mockResolvedValue(
      BackgroundGeolocation.AuthorizationStatus.Always
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

describe('shouldEmitAzimuth', () => {
  const THROTTLE = 200;
  const MIN_DELTA = 1;

  it('初回(prev=null)は十分時間が経っていれば更新する', () => {
    expect(shouldEmitAzimuth(null, 90, 1000, THROTTLE, MIN_DELTA)).toBe(true);
  });

  it('初回でもthrottle未満の間隔ではスキップする', () => {
    expect(shouldEmitAzimuth(null, 90, 50, THROTTLE, MIN_DELTA)).toBe(false);
  });

  it('throttle間隔未満ではスキップする（頻度制限）', () => {
    expect(shouldEmitAzimuth(10, 90, 50, THROTTLE, MIN_DELTA)).toBe(false);
  });

  it('角度差がしきい値未満ならスキップする', () => {
    expect(shouldEmitAzimuth(10, 10.5, 300, THROTTLE, MIN_DELTA)).toBe(false);
  });

  it('角度差がしきい値以上なら更新する', () => {
    expect(shouldEmitAzimuth(10, 12, 300, THROTTLE, MIN_DELTA)).toBe(true);
  });

  it('0/360のラップを考慮して角度差を計算する', () => {
    // 359→1 は +2°
    expect(shouldEmitAzimuth(359, 1, 300, THROTTLE, MIN_DELTA)).toBe(true);
    // 359→359.5 は +0.5°（スキップ）
    expect(shouldEmitAzimuth(359, 359.5, 300, THROTTLE, MIN_DELTA)).toBe(false);
    // 0→359 は -1°（更新）
    expect(shouldEmitAzimuth(0, 359, 300, THROTTLE, MIN_DELTA)).toBe(true);
  });
});

describe('angularDeltaDeg', () => {
  it('通常の角度差を返す', () => {
    expect(angularDeltaDeg(10, 30)).toBe(20);
    expect(angularDeltaDeg(30, 10)).toBe(20);
    expect(angularDeltaDeg(90, 90)).toBe(0);
  });

  it('0/360のラップを考慮する', () => {
    expect(angularDeltaDeg(350, 10)).toBe(20);
    expect(angularDeltaDeg(10, 350)).toBe(20);
    expect(angularDeltaDeg(0, 180)).toBe(180);
  });
});

describe('shouldRotateCompassCamera', () => {
  const MIN_INTERVAL = 100;
  const MIN_DELTA = 2;

  it('初回(prev=null)は間隔・角度差に関わらず回転する', () => {
    expect(shouldRotateCompassCamera(null, 90, 0, MIN_INTERVAL, MIN_DELTA)).toBe(true);
  });

  it('最小間隔未満ではスキップする', () => {
    expect(shouldRotateCompassCamera(0, 90, 50, MIN_INTERVAL, MIN_DELTA)).toBe(false);
  });

  it('角度差がしきい値未満ならスキップする', () => {
    expect(shouldRotateCompassCamera(10, 11, 300, MIN_INTERVAL, MIN_DELTA)).toBe(false);
  });

  it('同じ角度（差0）はスキップする', () => {
    // 旧実装の headingDiff > 0 条件では差0が回転扱いになるバグがあった（回帰テスト）
    expect(shouldRotateCompassCamera(90, 90, 300, MIN_INTERVAL, MIN_DELTA)).toBe(false);
  });

  it('0/360のラップを考慮して角度差を計算する', () => {
    // 359→1 は +2°（回転）
    expect(shouldRotateCompassCamera(359, 1, 300, MIN_INTERVAL, MIN_DELTA)).toBe(true);
    // 359→0.5 は +1.5°（スキップ）
    expect(shouldRotateCompassCamera(359, 0.5, 300, MIN_INTERVAL, MIN_DELTA)).toBe(false);
  });
});

describe('バックグラウンド中のUI更新スキップ', () => {
  let store: any;
  let wrapper: any;

  const fireLocation = (callback: (location: any) => void, latitude: number, longitude: number) => {
    callback({
      coords: { latitude, longitude, altitude: 0, accuracy: 5, heading: 0, speed: 1 },
      timestamp: Date.now(),
    });
  };

  beforeEach(() => {
    store = createTestStore();
    wrapper = createWrapper(store);
    jest.clearAllMocks();
    (ConfirmAsync as jest.Mock).mockResolvedValue(false);
    mockBackgroundGeolocation.ready.mockResolvedValue({ enabled: false } as any);
    mockBackgroundGeolocation.getState.mockResolvedValue({ enabled: false } as any);
    mockBackgroundGeolocation.removeListeners.mockResolvedValue(undefined);
    mockBackgroundGeolocation.requestPermission.mockResolvedValue(BackgroundGeolocation.AuthorizationStatus.Always);
    mockBackgroundGeolocation.getCurrentPosition.mockResolvedValue({
      coords: { latitude: 35.0, longitude: 135.0, altitude: 0, accuracy: 10, altitudeAccuracy: 5, heading: 0, speed: 0 },
      timestamp: Date.now(),
    } as any);
    mockBackgroundGeolocation.onLocation.mockReturnValue({ remove: jest.fn() } as any);
    mockLocation.watchHeadingAsync.mockResolvedValue({ remove: jest.fn() });
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    (AppState as any).currentState = 'active';
  });

  afterEach(() => {
    (AppState as any).currentState = 'active';
  });

  it('background中はcurrentLocation更新とカメラ移動をスキップする（MMKV保存は継続）', async () => {
    const { trackLogMMKV } = require('../../utils/mmkvStorage');
    const mockMapRef = { current: { animateCamera: jest.fn() } };
    const { result } = renderHook(() => useLocation(mockMapRef as any), { wrapper });

    await act(async () => {
      await result.current.toggleGPS('follow');
    });

    const onLocationCallback = mockBackgroundGeolocation.onLocation.mock.calls[0][0];
    const locationBefore = result.current.currentLocation;
    mockMapRef.current.animateCamera.mockClear();
    (trackLogMMKV.setCurrentLocation as jest.Mock).mockClear();

    (AppState as any).currentState = 'background';
    act(() => {
      fireLocation(onLocationCallback, 36.5, 136.5);
    });

    // React stateとカメラは更新されない
    expect(result.current.currentLocation).toEqual(locationBefore);
    expect(mockMapRef.current.animateCamera).not.toHaveBeenCalled();
    // MMKVへの現在地保存は継続される（復帰時の同期用）
    expect(trackLogMMKV.setCurrentLocation).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 36.5, longitude: 136.5 })
    );
  });

  it('active中は従来どおりcurrentLocation更新とfollowカメラ移動を行う', async () => {
    const mockMapRef = { current: { animateCamera: jest.fn() } };
    const { result } = renderHook(() => useLocation(mockMapRef as any), { wrapper });

    await act(async () => {
      await result.current.toggleGPS('follow');
    });

    const onLocationCallback = mockBackgroundGeolocation.onLocation.mock.calls[0][0];
    mockMapRef.current.animateCamera.mockClear();

    act(() => {
      fireLocation(onLocationCallback, 36.5, 136.5);
    });

    expect(result.current.currentLocation).toEqual(expect.objectContaining({ latitude: 36.5, longitude: 136.5 }));
    expect(mockMapRef.current.animateCamera).toHaveBeenCalledWith(
      { center: { latitude: 36.5, longitude: 136.5 } },
      { duration: 5 }
    );
  });

  it('age が大きい古いキャッシュ位置は現在地マーカー・カメラ・MMKV保存に使わない（iOSキャッシュ対策）', async () => {
    const { trackLogMMKV } = require('../../utils/mmkvStorage');
    const mockMapRef = { current: { animateCamera: jest.fn() } };
    const { result } = renderHook(() => useLocation(mockMapRef as any), { wrapper });

    await act(async () => {
      await result.current.toggleGPS('follow');
    });

    const onLocationCallback = mockBackgroundGeolocation.onLocation.mock.calls[0][0];
    const locationBefore = result.current.currentLocation;
    mockMapRef.current.animateCamera.mockClear();
    (trackLogMMKV.setCurrentLocation as jest.Mock).mockClear();

    // age=120000ms（2分前）= STALE_LOCATION_AGE_MS(30s) 超過の古いキャッシュ位置
    act(() => {
      onLocationCallback({
        coords: { latitude: 1.0, longitude: 1.0, altitude: 0, accuracy: 5, heading: 0, speed: 0 },
        timestamp: Date.now() - 120000,
        age: 120000,
      });
    });

    // 現在地・カメラ・MMKVのいずれも古い位置で更新されない
    expect(result.current.currentLocation).toEqual(locationBefore);
    expect(mockMapRef.current.animateCamera).not.toHaveBeenCalled();
    expect(trackLogMMKV.setCurrentLocation).not.toHaveBeenCalled();
  });
});

describe('heading購読のライフサイクル', () => {
  let store: any;
  let wrapper: any;

  beforeEach(() => {
    store = createTestStore();
    wrapper = createWrapper(store);
    jest.clearAllMocks();
    (ConfirmAsync as jest.Mock).mockResolvedValue(false);
    mockBackgroundGeolocation.ready.mockResolvedValue({ enabled: false } as any);
    mockBackgroundGeolocation.getState.mockResolvedValue({ enabled: false } as any);
    mockBackgroundGeolocation.removeListeners.mockResolvedValue(undefined);
    mockBackgroundGeolocation.requestPermission.mockResolvedValue(BackgroundGeolocation.AuthorizationStatus.Always);
    mockBackgroundGeolocation.getCurrentPosition.mockResolvedValue({
      coords: { latitude: 35.0, longitude: 135.0, altitude: 0, accuracy: 10, altitudeAccuracy: 5, heading: 0, speed: 0 },
      timestamp: Date.now(),
    } as any);
    mockBackgroundGeolocation.onLocation.mockReturnValue({ remove: jest.fn() } as any);
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    (AppState as any).currentState = 'active';
  });

  it('コンパスOFF後もGPS ON中は通常のheading購読を復元する', async () => {
    mockLocation.watchHeadingAsync.mockResolvedValue({ remove: jest.fn() });
    const mockMapRef = { current: { animateCamera: jest.fn() } };
    const { result } = renderHook(() => useLocation(mockMapRef as any), { wrapper });

    await act(async () => {
      await result.current.toggleGPS('show');
    });
    const callsAfterGpsOn = mockLocation.watchHeadingAsync.mock.calls.length;
    expect(callsAfterGpsOn).toBeGreaterThanOrEqual(1);

    await act(async () => {
      await result.current.toggleHeadingUp(true);
    });
    expect(mockLocation.watchHeadingAsync.mock.calls.length).toBe(callsAfterGpsOn + 1);

    await act(async () => {
      await result.current.toggleHeadingUp(false);
    });
    // コンパスOFF後に通常購読が復元される（修正前は購読が消えてマーカーの向きが凍結していた）
    expect(mockLocation.watchHeadingAsync.mock.calls.length).toBe(callsAfterGpsOn + 2);
  });

  it('トラッキング停止時にheading購読を解除する', async () => {
    const removeMock = jest.fn();
    mockLocation.watchHeadingAsync.mockResolvedValue({ remove: removeMock });
    const mockMapRef = { current: { animateCamera: jest.fn() } };
    const { result } = renderHook(() => useLocation(mockMapRef as any), { wrapper });

    await act(async () => {
      await result.current.toggleTracking('on');
    });
    removeMock.mockClear();

    await act(async () => {
      await result.current.toggleTracking('off');
    });
    expect(removeMock).toHaveBeenCalled();
  });

  it('トラッキング開始後の状態変化でonLocation/heading購読が破棄されない（初期化effect再実行の回帰）', async () => {
    // 旧実装では初期化effectの依存配列にtrackingState等が含まれており、
    // 依存変化時のクリーンアップで購読が破棄され、再購読されないまま位置・方位の更新が止まることがあった
    const headingRemove = jest.fn();
    mockLocation.watchHeadingAsync.mockResolvedValue({ remove: headingRemove });
    const locationRemove = jest.fn();
    mockBackgroundGeolocation.onLocation.mockReturnValue({ remove: locationRemove });
    const mockMapRef = { current: { animateCamera: jest.fn() } };
    const { result } = renderHook(() => useLocation(mockMapRef as any), { wrapper });

    await act(async () => {
      await result.current.toggleGPS('follow');
    });
    await act(async () => {
      await result.current.toggleTracking('on');
    });

    // trackingStateの変化（再レンダリング）後も購読は維持される
    expect(locationRemove).not.toHaveBeenCalled();
    expect(headingRemove).not.toHaveBeenCalled();

    // 位置イベントが引き続き反映される
    const onLocationCallback = mockBackgroundGeolocation.onLocation.mock.calls[0][0];
    act(() => {
      onLocationCallback({
        coords: { latitude: 36.1, longitude: 136.1, altitude: 0, accuracy: 5, heading: 0, speed: 1 },
        timestamp: Date.now(),
      });
    });
    expect(result.current.currentLocation).toEqual(expect.objectContaining({ latitude: 36.1, longitude: 136.1 }));
  });
});
