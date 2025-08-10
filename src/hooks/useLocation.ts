import { useEffect, useMemo, useRef } from 'react';
import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl/maplibre';
import { LocationStateType, LocationType, TrackingStateType, TrackLogType } from '../types';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { checkAndStoreLocations, clearStoredLocations, getStoredLocations, storeLocations } from '../utils/Location';
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
import { appendTrackLogAction, clearTrackLogAction } from '../modules/trackLog';
import { cleanupLine } from '../utils/Coords';
import { isLocationTypeArray } from '../utils/General';
import { Linking } from 'react-native';

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
    // バックグラウンドの場合は、MMKVにログがたまる。
    // フォアグラウンドの場合は、一旦MMKVに保存するが、updateですぐにクリアされる
    const checkedLocations = checkAndStoreLocations(locations);
    //killされていなければ更新イベントが発生する
    locationEventsEmitter.emit('update', checkedLocations);
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
  toggleHeadingUp: (headingUp_: boolean) => Promise<void>;
  toggleGPS: (gpsState: LocationStateType) => Promise<void>;
  toggleTracking: (trackingState: TrackingStateType) => Promise<void>;
  checkUnsavedTrackLog: () => Promise<{ isOK: boolean; message: string }>;
  saveTrackLog: () => Promise<{
    isOK: boolean;
    message: string;
  }>;
  confirmLocationPermission: () => Promise<Location.PermissionStatus.GRANTED | undefined>;
};

export const useLocation = (mapViewRef: React.RefObject<MapView | MapRef | null>): UseLocationReturnType => {
  const dispatch = useDispatch();
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: RootState) => state.user);
  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );

  const trackLog = useSelector((state: RootState) => state.trackLog);
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
      gpsSubscriber.current = await Location.watchPositionAsync(gpsAccuracyOption, (pos) => {
        updateGpsPosition.current(pos);
      });
    }
    if (headingSubscriber.current === undefined) {
      headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
        setAzimuth(pos.trueHeading);
      });
    }
  }, [gpsAccuracyOption]);

  const stopGPS = useCallback(async () => {
    if (gpsSubscriber.current !== undefined) {
      gpsSubscriber.current.remove();
      gpsSubscriber.current = undefined;
    }
    if (headingSubscriber.current !== undefined) {
      headingSubscriber.current.remove();
      headingSubscriber.current = undefined;
    }
  }, []);

  const stopTracking = useCallback(async () => {
    try {
      if (await Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION)) {
        await Location.stopLocationUpdatesAsync(TASK.FETCH_LOCATION);

        if (headingSubscriber.current !== undefined) {
          headingSubscriber.current.remove();
          headingSubscriber.current = undefined;
        }
      }
    } catch (e) {
      // エラーハンドリング
    } finally {
      if (isLoggedIn(dataUser) && hasOpened(projectId)) {
        projectStore.deleteCurrentPosition(dataUser.uid!, projectId);
        setCurrentLocation(null);
      }
    }
  }, [projectId, dataUser]);

  const startTracking = useCallback(async () => {
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
    if (headingSubscriber.current === undefined) {
      headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
        setAzimuth(pos.trueHeading);
      });
    }
  }, [gpsAccuracyOption]);

  const moveCurrentPosition = useCallback(async () => {
    //console.log('moveCurrentPosition');
    // console.log('moveCurrentPosition2');
    const location = await Location.getLastKnownPositionAsync();
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
  }, [mapViewRef]);

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

      //console.log('!!!!wakeup', trackingState);
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

  const updateTrackLogEvent = useCallback(
    async (data: TrackLogType) => {
      if (data.track.length === 0) return;

      const currentCoords = data.track[data.track.length - 1];

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

      // Reduxストアに追加
      dispatch(appendTrackLogAction(data));

      // フォアグラウンドでも定期的にAsyncStorageにバックアップ
      // 現在のトラックログのサイズを確認
      const currentTrackLog = trackLog;
      const totalPoints = currentTrackLog.track.length + data.track.length;

      // 1000ポイントごとにMMKVにもバックアップ（クラッシュ対策）
      if (totalPoints % 1000 === 0) {
        // console.log(`Backing up ${totalPoints} track points to MMKV`);
        storeLocations({
          track: [...currentTrackLog.track, ...data.track],
          distance: currentTrackLog.distance + data.distance,
          lastTimeStamp: data.lastTimeStamp,
        });
      } else if (RNAppState.currentState === 'background') {
        // バックグラウンドの場合は常にMMKVを更新
        // （既存の動作を維持）
      } else {
        // フォアグラウンドで1000ポイント未満の場合はMMKVをクリア
        clearStoredLocations();
      }
    },
    [dispatch, gpsState, mapViewRef, trackLog]
  );

  // トラックログをトラック用のレコードに追加する
  const saveTrackLog = useCallback(async () => {
    if (!isLocationTypeArray(trackLog.track)) return { isOK: false, message: 'Invalid track log' };
    if (trackLog.track.length < 2) return { isOK: true, message: '' };
    //もしMMKVにデータが保存されていたらトラックログに追加する。killのタイミングでMMKVにデータが残る場合があるかもしれないので
    const storedLocations = getStoredLocations();
    if (
      storedLocations.track.length > 0 &&
      storedLocations.track[0].timestamp &&
      storedLocations.track[0].timestamp > trackLog.lastTimeStamp
    ) {
      trackLog.track = [...trackLog.track, ...storedLocations.track];
      trackLog.distance += storedLocations.distance;
      trackLog.lastTimeStamp = storedLocations.lastTimeStamp;
    }
    const cleanupedLine = cleanupLine(trackLog.track);

    // MMKVには2MB制限がないため、分割不要で一括保存
    const ret = addTrackRecord(cleanupedLine);
    if (!ret.isOK) {
      return { isOK: ret.isOK, message: ret.message };
    }

    // トラックログをクリアする
    dispatch(clearTrackLogAction());
    // MMKVのトラックログをクリアする
    clearStoredLocations();
    return { isOK: true, message: '' };
  }, [addTrackRecord, dispatch, trackLog]);

  const checkUnsavedTrackLog = useCallback(async () => {
    if (trackLog.track.length > 1) {
      const ans = await ConfirmAsync(t('hooks.message.saveTracking'));
      if (ans) {
        const ret = await saveTrackLog();
        if (!ret.isOK) return ret;
      } else {
        dispatch(clearTrackLogAction());
        clearStoredLocations();
      }
    }
    return { isOK: true, message: '' };
  }, [dispatch, saveTrackLog, trackLog.track.length]);

  useEffect(() => {
    // console.log('#define locationEventsEmitter update function');

    const eventSubscription = locationEventsEmitter.addListener('update', updateTrackLogEvent);
    return () => {
      // console.log('clean locationEventsEmitter');
      eventSubscription && eventSubscription.remove();
    };
  }, [updateTrackLogEvent]);

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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const subscription = RNAppState.addEventListener('change', async (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        //console.log('App has come to the foreground!');

        if (trackingState === 'on') {
          if (gpsState === 'show' || gpsState === 'follow') {
            if (headingSubscriber.current === undefined) {
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
  }, [gpsState, headingUp, toggleHeadingUp, trackingState]);

  return {
    currentLocation,
    gpsState,
    trackingState,
    headingUp,
    azimuth,
    toggleGPS,
    toggleTracking,
    toggleHeadingUp,
    checkUnsavedTrackLog,
    saveTrackLog,
    confirmLocationPermission,
  } as const;
};
