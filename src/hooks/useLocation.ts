import { useEffect, useMemo, useRef } from 'react';
import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl/maplibre';
import { LocationStateType, LocationType, TrackingStateType } from '../types';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { updateTrackLog, calculateTrackStatistics } from '../utils/Location';
import { hasOpened } from '../utils/Project';
import * as projectStore from '../lib/firebase/firestore';
import { isLoggedIn } from '../utils/Account';
import { RootState } from '../store';
import { isMapView } from '../utils/Map';
import { t } from '../i18n/config';
import { LocationObject, LocationSubscription } from 'expo-location';
import { TASK } from '../constants/AppConstants';
import { AppState as RNAppState, Platform } from 'react-native';
import { EventEmitter } from 'fbemitter';
import * as TaskManager from 'expo-task-manager';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import * as Notifications from 'expo-notifications';
import { useRecord } from './useRecord';
import { appendTrackLogAction, clearTrackLogAction } from '../modules/trackLog';
import { cleanupLine } from '../utils/Coords';
import { TRACK } from '../constants/AppConstants';
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
    return; // バックグラウンドタスクエラー
  }

  const locations = (event.data as any).locations as Location.LocationObject[];
  //console.log('[tracking]', 'Received new locations', locations);

  try {
    // have to add it sequentially, parses/serializes existing JSON
    //const checkedLocations = await checkAndStoreLocations(locations);
    //killされていなければ更新イベントが発生する
    locationEventsEmitter.emit('update', locations);
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
  saveTrackSegment: () => Promise<void>; // 自動保存用
  confirmLocationPermission: () => Promise<Location.PermissionStatus.GRANTED | undefined>;
};

export const useLocation = (mapViewRef: MapView | MapRef | null): UseLocationReturnType => {
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
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedPointCountRef = useRef<number>(0);
  const trackStartTimeRef = useRef<number>(0);

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
    if (mapViewRef === null || !isMapView(mapViewRef)) return;
    mapViewRef.animateCamera(
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
          (mapViewRef as MapView).animateCamera(
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
    [mapViewRef, moveCurrentPosition, projectId, startGPS, stopGPS, dataUser]
  );

  const saveTrackSegmentRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const toggleTracking = useCallback(
    async (trackingState_: TrackingStateType) => {
      //Tracking Stateの変更後の処理

      //console.log('!!!!wakeup', trackingState);
      if (trackingState_ === 'on') {
        await moveCurrentPosition();
        dispatch(clearTrackLogAction());
        trackStartTimeRef.current = Date.now();
        lastSavedPointCountRef.current = 0;
        await startTracking();

        // 自動保存タイマーの停止（ポイント数ベースに移行）
        if (autoSaveTimerRef.current) {
          clearInterval(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
      } else if (trackingState_ === 'off') {
        await stopTracking();

        // 自動保存タイマーの停止
        if (autoSaveTimerRef.current) {
          clearInterval(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
      }
      setTrackingState(trackingState_);
    },
    [dispatch, moveCurrentPosition, startTracking, stopTracking]
  );

  const toggleHeadingUp = useCallback(
    async (headingUp_: boolean) => {
      if (mapViewRef === null) return;
      const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') return;
      if (headingUp_) {
        if (headingSubscriber.current !== undefined) headingSubscriber.current.remove();
        headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
          Platform.OS === 'ios'
            ? (mapViewRef as MapView).setCamera({
                heading: Math.abs((-1.0 * pos.trueHeading) % 360),
              })
            : (mapViewRef as MapView).animateCamera(
                {
                  heading: Math.abs((-1.0 * pos.trueHeading) % 360),
                },
                { duration: 300 }
              );
          setAzimuth(pos.trueHeading);
        });
      } else {
        if (headingSubscriber.current !== undefined) headingSubscriber.current.remove();
        headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
          setAzimuth(pos.trueHeading);
        });

        (mapViewRef as MapView).animateCamera({
          heading: 0,
        });
      }
      setHeadingUp(headingUp_);
    },
    [mapViewRef]
  );

  const updateTrackLogEvent = useCallback(
    (locations: LocationObject[]) => {
      const result = updateTrackLog(locations, trackLog);
      if (result.newLocations.length === 0) return;

      // 統計情報を計算
      const statistics = calculateTrackStatistics(
        [...trackLog.track, ...result.newLocations],
        trackLog.distance + result.additionalDistance,
        trackStartTimeRef.current
      );

      dispatch(appendTrackLogAction({ ...result, statistics }));

      const currentCoords = result.newLocations[result.newLocations.length - 1];
      setCurrentLocation(currentCoords);

      // ポイント数ベースの自動保存チェック
      const totalPoints = trackLog.track.length + result.newLocations.length;
      if (totalPoints - lastSavedPointCountRef.current >= TRACK.AUTO_SAVE_POINTS) {
        saveTrackSegmentRef.current();
        lastSavedPointCountRef.current = totalPoints;
      }

      if (gpsState === 'follow' || RNAppState.currentState === 'background') {
        (mapViewRef as MapView).animateCamera(
          {
            center: {
              latitude: currentCoords.latitude,
              longitude: currentCoords.longitude,
            },
          },
          { duration: 5 }
        );
      }
    },
    [dispatch, gpsState, mapViewRef, trackLog]
  );

  const saveTrackLog = useCallback(async () => {
    if (!isLocationTypeArray(trackLog.track)) return { isOK: false, message: 'Invalid track log' };
    if (trackLog.track.length < 2) return { isOK: true, message: '' };

    const cleanupedLine = cleanupLine(trackLog.track);
    const ret = addTrackRecord(cleanupedLine);
    if (!ret.isOK) {
      return { isOK: ret.isOK, message: ret.message };
    }

    dispatch(clearTrackLogAction());
    return { isOK: true, message: '' };
  }, [addTrackRecord, dispatch, trackLog.track]);

  const saveTrackSegment = useCallback(async () => {
    try {
      // セグメントをtrackレイヤーに保存
      const cleanupedLine = cleanupLine(trackLog.track);
      const ret = addTrackRecord(cleanupedLine);

      if (ret.isOK) {
        // cleanupedLineの最後の点を取得
        const lastCleanupedPoint = cleanupedLine[cleanupedLine.length - 1];

        // 保存成功後、最後の点を残して新しいトラックを開始
        dispatch(clearTrackLogAction());

        // cleanupedLineの最後の点を新しいトラックの開始点として追加
        if (lastCleanupedPoint) {
          const startPoint: LocationType = lastCleanupedPoint;

          dispatch(
            appendTrackLogAction({
              newLocations: [startPoint],
              additionalDistance: 0,
              lastTimeStamp: startPoint.timestamp || Date.now(),
            })
          );
        }

        trackStartTimeRef.current = Date.now();
        lastSavedPointCountRef.current = 1; // 新しいトラックの開始点
      }
    } catch (error) {
      // エラーハンドリング
    }
  }, [addTrackRecord, dispatch, trackLog.track]);

  // saveTrackSegmentRefに関数を設定
  useEffect(() => {
    saveTrackSegmentRef.current = saveTrackSegment;
  }, [saveTrackSegment]);

  const checkUnsavedTrackLog = useCallback(async () => {
    if (trackLog.track.length > 1) {
      const ans = await ConfirmAsync(t('hooks.message.saveTracking'));
      if (ans) {
        const ret = await saveTrackLog();
        if (!ret.isOK) return ret;
      } else {
        dispatch(clearTrackLogAction());
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
        if (gpsState === 'show' || gpsState === 'follow') {
          if (headingSubscriber.current === undefined) {
            //console.log('add heading');
            headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
              setAzimuth(pos.trueHeading);
            });
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
  }, [gpsState, headingUp, toggleHeadingUp]);

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
    saveTrackSegment,
    confirmLocationPermission,
  } as const;
};
