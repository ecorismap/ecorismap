import { useEffect, useMemo, useRef } from 'react';
import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl/maplibre';
import { LocationStateType, LocationType, TrackingStateType, TrackLogType } from '../types';
import { shallowEqual, useSelector } from 'react-redux';
import { checkAndStoreLocations, clearStoredLocations, getStoredLocations, storeLocations } from '../utils/Location';
import { trackLogMMKV } from '../utils/mmkvStorage';
import { hasOpened } from '../utils/Project';
import * as projectStore from '../lib/firebase/firestore';
import { isLoggedIn } from '../utils/Account';
import { RootState } from '../store';
import { isMapView } from '../utils/Map';
import { t } from '../i18n/config';
import { LocationSubscription } from 'expo-location';
import { TASK } from '../constants/AppConstants';
import { AppState as RNAppState, Platform } from 'react-native';
import { EventEmitter } from 'fbemitter';
import * as TaskManager from 'expo-task-manager';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import * as Notifications from 'expo-notifications';
import { useRecord } from './useRecord';
import { cleanupLine } from '../utils/Coords';
import { isLocationTypeArray } from '../utils/General';
import { Linking } from 'react-native';
import { MockGpsGenerator, MockGpsConfig, LONG_TRACK_TEST_CONFIG } from '../utils/mockGpsHelper';
import { USE_MOCK_GPS } from '../constants/AppConstants';

const openSettings = () => {
  Linking.openSettings().catch(() => {
    // 設定ページを開けなかった場合
  });
};

const locationEventsEmitter = new EventEmitter();

TaskManager.defineTask(TASK.FETCH_LOCATION, async (event) => {
  if (event.error) {
    return console.error('[tracking]', 'Something went wrong within the background location task...', event.error);
  }

  const locations = (event.data as any).locations as Location.LocationObject[];
  //console.log('[tracking]', 'Received new locations', locations);

  try {
    // MMKVに保存されているトラックログをチェックして、必要な位置情報を取得
    // バックグラウンドの場合もフォアグラウンドの場合も、MMKVにログを保持し続ける
    checkAndStoreLocations(locations);
    // データは渡さず、イベントのみ発火（受信側で直接MMKVから読み込む）
    locationEventsEmitter.emit('update');
  } catch (error) {
    //console.log('[tracking]', 'Something went wrong when saving a new location...', error);
  }
});

export type UseLocationReturnType = {
  currentLocation: LocationType | null;
  gpsState: LocationStateType;
  trackingState: TrackingStateType;
  headingUp: boolean;
  azimuth: number;
  trackLog: TrackLogType;
  toggleHeadingUp: (headingUp_: boolean) => Promise<void>;
  toggleGPS: (gpsState: LocationStateType) => Promise<void>;
  toggleTracking: (trackingState: TrackingStateType) => Promise<void>;
  checkUnsavedTrackLog: () => Promise<{ isOK: boolean; message: string }>;
  saveTrackLog: () => Promise<{
    isOK: boolean;
    message: string;
  }>;
  confirmLocationPermission: () => Promise<Location.PermissionStatus.GRANTED | undefined>;
  // 擬似GPS関連
  useMockGps: boolean;
  toggleMockGps: (enabled: boolean, config?: MockGpsConfig) => Promise<void>;
  mockGpsProgress?: { current: number; total: number; percentage: number };
};

export const useLocation = (mapViewRef: React.RefObject<MapView | MapRef | null>): UseLocationReturnType => {
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: RootState) => state.user);
  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );

  // MMKVから直接トラックログを取得して管理（Reduxは使用しない）
  const [trackLog, setTrackLog] = useState<TrackLogType>(() => getStoredLocations());
  const { addTrackRecord } = useRecord();
  const [azimuth, setAzimuth] = useState(0);
  const gpsSubscriber = useRef<{ remove(): void } | undefined>(undefined);
  const headingSubscriber = useRef<LocationSubscription | undefined>(undefined);

  const updateGpsPosition = useRef<(pos: Location.LocationObject) => void>(() => null);
  const gpsAccuracy = useSelector((state: RootState) => state.settings.gpsAccuracy);
  const appState = useRef(RNAppState.currentState);
  const [currentLocation, setCurrentLocation] = useState<LocationType | null>(null);
  const [headingUp, setHeadingUp] = useState(false);
  const [gpsState, setGpsState] = useState<LocationStateType>('off');
  const [trackingState, setTrackingState] = useState<TrackingStateType>('off');

  // 擬似GPS用の設定とインスタンス
  const [useMockGps, setUseMockGps] = useState(USE_MOCK_GPS);
  const mockGpsRef = useRef<MockGpsGenerator | null>(null);

  const gpsAccuracyOption = useMemo(() => {
    // トラック記録中は固定設定を使用
    switch (gpsAccuracy) {
      case 'HIGH':
        return { accuracy: Location.Accuracy.Highest, distanceInterval: 2 };
      case 'MEDIUM':
        return { accuracy: Location.Accuracy.High, distanceInterval: 10 };
      case 'LOW':
        return { accuracy: Location.Accuracy.Balanced };
      default:
        return { accuracy: Location.Accuracy.Highest, distanceInterval: 2 };
    }
  }, [gpsAccuracy]);

  const confirmLocationPermission = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        const { status: notificationStatus } = await Notifications.requestPermissionsAsync();
        if (notificationStatus !== 'granted') {
          await AlertAsync(t('hooks.message.permitAccessGPS'));
          openSettings();
          return;
        }
      }
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        await AlertAsync(t('hooks.message.permitAccessGPS'));
        openSettings();
        return;
      }

      return 'granted' as Location.PermissionStatus.GRANTED;
    } catch (e: any) {
      // エラーハンドリング
    }
  }, []);

  const startGPS = useCallback(async () => {
    //GPSもトラッキングもOFFの場合
    if (gpsSubscriber.current === undefined && !(await Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION))) {
      if (useMockGps) {
        // 擬似GPSを使用
        // 既存のインスタンスがあれば停止
        if (mockGpsRef.current) {
          mockGpsRef.current.stop();
          mockGpsRef.current = null;
        }
        
        // 新しいインスタンスを作成
        mockGpsRef.current = new MockGpsGenerator(LONG_TRACK_TEST_CONFIG);
        
        gpsSubscriber.current = {
          remove: () => {
            if (mockGpsRef.current) {
              mockGpsRef.current.stop();
              mockGpsRef.current = null;
            }
          }
        };
        
        mockGpsRef.current.start((pos) => {
          updateGpsPosition.current(pos);
        });
        
        console.log('Started mock GPS');
      } else {
        // 実際のGPSを使用
        gpsSubscriber.current = await Location.watchPositionAsync(gpsAccuracyOption, (pos) => {
          updateGpsPosition.current(pos);
        });
      }
    }
    if (headingSubscriber.current === undefined && !useMockGps) {
      headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
        setAzimuth(pos.trueHeading);
      });
    }
  }, [gpsAccuracyOption, useMockGps]);

  const stopGPS = useCallback(async () => {
    if (gpsSubscriber.current !== undefined) {
      gpsSubscriber.current.remove();
      gpsSubscriber.current = undefined;
    }
    if (headingSubscriber.current !== undefined) {
      headingSubscriber.current.remove();
      headingSubscriber.current = undefined;
    }
    if (mockGpsRef.current) {
      mockGpsRef.current.stop();
      mockGpsRef.current = null;
    }
  }, []);

  const stopTracking = useCallback(async () => {
    try {
      if (!useMockGps && await Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION)) {
        await Location.stopLocationUpdatesAsync(TASK.FETCH_LOCATION);

        if (headingSubscriber.current !== undefined) {
          headingSubscriber.current.remove();
          headingSubscriber.current = undefined;
        }
      } else if (useMockGps && mockGpsRef.current) {
        mockGpsRef.current.stop();
        mockGpsRef.current = null; // インスタンスも削除
        console.log('Stopped mock GPS tracking');
      }
    } catch (e) {
      // エラーハンドリング
    } finally {
      if (isLoggedIn(dataUser) && hasOpened(projectId)) {
        projectStore.deleteCurrentPosition(dataUser.uid!, projectId);
        setCurrentLocation(null);
      }
    }
  }, [projectId, dataUser, useMockGps]);

  const startTracking = useCallback(async () => {
    if (useMockGps) {
      // 擬似GPSでトラッキング
      // 既存のインスタンスがあれば停止
      if (mockGpsRef.current) {
        mockGpsRef.current.stop();
        mockGpsRef.current = null;
      }
      
      // 新しいインスタンスを作成
      mockGpsRef.current = new MockGpsGenerator(LONG_TRACK_TEST_CONFIG);
      
      mockGpsRef.current.start((pos) => {
        // トラックログに追加
        const coords = pos.coords;
        const newTrackLog = getStoredLocations();
        const newTrack = [...(newTrackLog.track || []), coords];
        
        // トラックログを更新（距離は後で計算）
        const updatedTrackLog = {
          track: newTrack,
          distance: newTrackLog.distance, // 距離計算は省略（保存時に再計算）
          lastTimeStamp: pos.timestamp
        };
        
        storeLocations(updatedTrackLog);
        setTrackLog(updatedTrackLog);
        
        // 現在位置も更新
        updateGpsPosition.current(pos);
        
        // プログレス表示
        const progress = mockGpsRef.current ? mockGpsRef.current.getProgress() : null;
        if (progress && progress.current % 100 === 0) {
          console.log(`Mock GPS Progress: ${progress.current}/${progress.total} (${progress.percentage.toFixed(1)}%)`);
        }
      });
      
      console.log('Started mock GPS tracking');
    } else {
      // 実際のGPSでトラッキング
      if (!(await Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION))) {
        await Location.startLocationUpdatesAsync(TASK.FETCH_LOCATION, {
          ...gpsAccuracyOption,
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'EcorisMap',
            notificationBody: t('hooks.notification.inTracking'),
            killServiceOnDestroy: false,
          },
        });
      }
    }
    
    if (headingSubscriber.current === undefined && !useMockGps) {
      headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
        setAzimuth(pos.trueHeading);
      });
    }
  }, [gpsAccuracyOption, useMockGps]);

  const moveCurrentPosition = useCallback(async () => {
    //console.log('moveCurrentPosition');
    // console.log('moveCurrentPosition2');
    const location = useMockGps && mockGpsRef.current ? 
      mockGpsRef.current.getCurrentLocation() : 
      await Location.getLastKnownPositionAsync();
    // console.log('moveCurrentPosition3', location);
    if (location === null) return;
    setCurrentLocation(location.coords);
    if (mapViewRef.current === null || !isMapView(mapViewRef.current)) return;
    mapViewRef.current.animateCamera(
      {
        center: location.coords,
      },
      { duration: 5 }
    );
    //console.log('moveCurrentPosition4', location.coords);
  }, [mapViewRef, useMockGps]);

  const toggleGPS = useCallback(
    async (gpsState_: LocationStateType) => {
      if (gpsState_ === 'off') {
        await stopGPS();
        if (isLoggedIn(dataUser) && hasOpened(projectId)) {
          projectStore.deleteCurrentPosition(dataUser.uid!, projectId);
          setCurrentLocation(null);
        }
      } else if (gpsState_ === 'follow') {
        await moveCurrentPosition();
        updateGpsPosition.current = (pos: Location.LocationObject) => {
          (mapViewRef.current as MapView).animateCamera(
            {
              center: {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              },
            },
            { duration: 5 }
          );
          setCurrentLocation(pos.coords);
        };
        await startGPS();
      } else if (gpsState_ === 'show') {
        updateGpsPosition.current = (pos: Location.LocationObject) => {
          setCurrentLocation(pos.coords);
        };
        await startGPS();
      }

      setGpsState(gpsState_);
    },
    [stopGPS, dataUser, projectId, moveCurrentPosition, startGPS, mapViewRef]
  );

  const toggleTracking = useCallback(
    async (trackingState_: TrackingStateType) => {
      //Tracking Stateの変更後の処理

      //console.log('!!!!wakeup', trackingState)
      if (trackingState_ === 'on') {
        await moveCurrentPosition();
        await startTracking();
      } else if (trackingState_ === 'off') {
        await stopTracking();
      }
      setTrackingState(trackingState_);
    },
    [moveCurrentPosition, startTracking, stopTracking]
  );

  const toggleHeadingUp = useCallback(
    async (headingUp_: boolean) => {
      if (mapViewRef.current === null) return;
      const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') return;
      if (headingUp_) {
        if (headingSubscriber.current !== undefined) headingSubscriber.current.remove();

        let lastHeading = 0;
        let lastUpdateTime = 0;

        headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
          const newHeading = Math.abs((-1.0 * pos.trueHeading) % 360);
          const currentTime = Date.now();

          // 角度の変化が小さい場合はアニメーションをスキップ
          const headingDiff = Math.abs(newHeading - lastHeading);
          if (headingDiff < 2 && headingDiff > 0) {
            setAzimuth(pos.trueHeading);
            return;
          }

          // 最小更新間隔を設定（ミリ秒）
          const minUpdateInterval = 100;
          if (currentTime - lastUpdateTime < minUpdateInterval) {
            setAzimuth(pos.trueHeading);
            return;
          }

          lastHeading = newHeading;
          lastUpdateTime = currentTime;

          (mapViewRef.current as MapView).animateCamera(
            {
              heading: newHeading,
            },
            { duration: 200 }
          );

          setAzimuth(pos.trueHeading);
        });
      } else {
        if (headingSubscriber.current !== undefined) headingSubscriber.current.remove();
        headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
          setAzimuth(pos.trueHeading);
        });

        (mapViewRef.current as MapView).animateCamera(
          {
            heading: 0,
          },
          { duration: 500 }
        );
      }
      setHeadingUp(headingUp_);
    },
    [mapViewRef]
  );

  const updateCurrentLocationFromTracking = useCallback(async () => {
    // トラッキング中の現在地更新とトラックログ更新
    const currentCoords = trackLogMMKV.getCurrentLocation();

    if (!currentCoords) return;

    if (gpsState === 'follow' || RNAppState.currentState === 'background') {
      (mapViewRef.current as MapView).animateCamera(
        {
          center: {
            latitude: currentCoords.latitude,
            longitude: currentCoords.longitude,
          },
        },
        { duration: 5 }
      );
    }
    setCurrentLocation(currentCoords);

    // トラックログも更新（描画のため）
    setTrackLog(getStoredLocations());
  }, [gpsState, mapViewRef]);

  // トラックログをトラック用のレコードに追加する
  const saveTrackLog = useCallback(async () => {
    // stateのtrackLogは既にMMKVと同期済み
    if (!isLocationTypeArray(trackLog.track)) return { isOK: false, message: 'Invalid track log' };
    if (trackLog.track.length < 2) return { isOK: true, message: '' };

    const cleanupedLine = cleanupLine(trackLog.track);

    // MMKVには2MB制限がないため、分割不要で一括保存
    const ret = addTrackRecord(cleanupedLine);
    if (!ret.isOK) {
      return { isOK: ret.isOK, message: ret.message };
    }

    // MMKVのトラックログをクリア
    clearStoredLocations();
    // stateも更新
    setTrackLog({ track: [], distance: 0, lastTimeStamp: 0 });
    return { isOK: true, message: '' };
  }, [addTrackRecord, trackLog]);

  const checkUnsavedTrackLog = useCallback(async () => {
    if (trackLog.track.length > 1) {
      const ans = await ConfirmAsync(t('hooks.message.saveTracking'));
      if (ans) {
        const ret = await saveTrackLog();
        if (!ret.isOK) return ret;
      } else {
        // MMKVのトラックログのみクリアする（Reduxは使用しない）
        clearStoredLocations();
        // stateも更新
        setTrackLog({ track: [], distance: 0, lastTimeStamp: 0 });
      }
    }
    return { isOK: true, message: '' };
  }, [saveTrackLog, trackLog.track.length]);

  // 擬似GPSモード切り替え関数を追加
  const toggleMockGps = useCallback(async (enabled: boolean, config?: MockGpsConfig) => {
    console.log(`toggleMockGps called: enabled=${enabled}`);
    
    // 現在のGPS/トラッキングを停止
    if (gpsState !== 'off') {
      console.log('Stopping GPS...');
      await toggleGPS('off');
    }
    if (trackingState === 'on') {
      console.log('Stopping tracking...');
      await toggleTracking('off');
    }

    // 既存のインスタンスを必ずクリーンアップ
    if (mockGpsRef.current) {
      console.log('Cleaning up existing mock GPS instance...');
      mockGpsRef.current.stop();
      mockGpsRef.current = null;
    }

    // 擬似GPSの設定を更新
    setUseMockGps(enabled);
    
    if (enabled && config) {
      // 新しい設定でMockGpsGeneratorを作成
      mockGpsRef.current = new MockGpsGenerator(config);
      console.log(`Mock GPS enabled with scenario: ${config.scenario}`);
    } else {
      console.log('Mock GPS disabled');
    }
  }, [gpsState, trackingState, toggleGPS, toggleTracking]);

  useEffect(() => {
    // console.log('#define locationEventsEmitter update function');

    const eventSubscription = locationEventsEmitter.addListener('update', updateCurrentLocationFromTracking);
    return () => {
      // console.log('clean locationEventsEmitter');
      eventSubscription && eventSubscription.remove();
    };
  }, [updateCurrentLocationFromTracking]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    (async () => {
      //kill後の起動時にログ取得中なら終了させる。なぜかエラーになるがtry catchする

      const hasStarted = await Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION);
      if (hasStarted) {
        //再起動時にトラックを止める
        await stopTracking();
      }
      const { isOK, message } = await checkUnsavedTrackLog();
      if (!isOK) {
        await AlertAsync(message);
      }
    })();

    return () => {
      Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION).then((hasStarted) => {
        if (hasStarted) {
          Location.stopLocationUpdatesAsync(TASK.FETCH_LOCATION);
        }
      });

      if (gpsSubscriber.current !== undefined) {
        gpsSubscriber.current.remove();
        gpsSubscriber.current = undefined;
      }
      if (headingSubscriber.current !== undefined) {
        headingSubscriber.current.remove();
        headingSubscriber.current = undefined;
      }
      if (mockGpsRef.current) {
        mockGpsRef.current.stop();
        mockGpsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const subscription = RNAppState.addEventListener('change', async (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        //console.log('App has come to the foreground!');

        if (trackingState === 'on') {
          if (gpsState === 'show' || gpsState === 'follow') {
            if (headingSubscriber.current === undefined && !useMockGps) {
              //console.log('add heading');
              headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
                setAzimuth(pos.trueHeading);
              });
            }
          }
        }

        if (headingUp) toggleHeadingUp(true);
      } else if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
        //console.log('App has come to the background!');
        if (headingSubscriber.current !== undefined) {
          //console.log('remove heading');
          headingSubscriber.current.remove();
          headingSubscriber.current = undefined;
        }
      }

      appState.current = nextAppState;
      //console.log('AppState', appState.current);
    });

    return () => {
      subscription && subscription.remove();
    };
  }, [gpsState, headingUp, toggleHeadingUp, trackingState, useMockGps]);

  return {
    currentLocation,
    gpsState,
    trackingState,
    headingUp,
    azimuth,
    trackLog,
    toggleGPS,
    toggleTracking,
    toggleHeadingUp,
    checkUnsavedTrackLog,
    saveTrackLog,
    confirmLocationPermission,
    // 擬似GPS関連の追加
    useMockGps,
    toggleMockGps,
    mockGpsProgress: mockGpsRef.current?.getProgress(),
  } as const;
};;
