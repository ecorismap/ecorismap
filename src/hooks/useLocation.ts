import { useEffect, useMemo, useRef } from 'react';
import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl';
import { LocationStateType, LocationType, TrackingStateType } from '../types';
import { DEGREE_INTERVAL } from '../constants/AppConstants';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { editSettingsAction } from '../modules/settings';
import { checkAndStoreLocations, clearStoredLocations, getStoredLocations, storeLocations } from '../utils/Location';
import { AppState } from '../modules';
import { deleteRecordsAction, updateTrackFieldAction } from '../modules/dataSet';
import { hasOpened } from '../utils/Project';
import * as projectStore from '../lib/firebase/firestore';
import { isLoggedIn } from '../utils/Account';
import { isMapView } from '../utils/Map';
import { nearDegree } from '../utils/General';
import { t } from '../i18n/config';
import { LocationSubscription } from 'expo-location';
import { TASK } from '../constants/AppConstants';
import { AppState as RNAppState, Platform } from 'react-native';
import { EventEmitter } from 'fbemitter';
import * as TaskManager from 'expo-task-manager';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import * as Notifications from 'expo-notifications';
import { useRecord } from './useRecord';

const locationEventsEmitter = new EventEmitter();

TaskManager.defineTask(TASK.FETCH_LOCATION, async (event) => {
  if (event.error) {
    return console.error('[tracking]', 'Something went wrong within the background location task...', event.error);
  }

  const locations = (event.data as any).locations as Location.LocationObject[];
  //console.log('[tracking]', 'Received new locations', locations);

  try {
    // have to add it sequentially, parses/serializes existing JSON
    const checkedLocations = await checkAndStoreLocations(locations);
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
  magnetometer: number;
  toggleHeadingUp: (headingUp_: boolean) => void;
  toggleGPS: (gpsState: LocationStateType) => Promise<void>;
  toggleTracking: (trackingState: TrackingStateType) => Promise<void>;
};

export const useLocation = (mapViewRef: MapView | MapRef | null): UseLocationReturnType => {
  const dispatch = useDispatch();
  const { addRecord, generateRecord } = useRecord();
  const [magnetometer, setMagnetometer] = useState(0);
  const [dividedTrackLogCount, setDividedTrackLogCount] = useState<number>(0);
  const gpsSubscriber = useRef<{ remove(): void } | undefined>(undefined);
  const headingSubscriber = useRef<LocationSubscription | undefined>(undefined);

  const updateGpsPosition = useRef<(pos: Location.LocationObject) => void>(() => null);
  const gpsAccuracy = useSelector((state: AppState) => state.settings.gpsAccuracy);
  const appState = useRef(RNAppState.currentState);

  const gpsAccuracyOption = useMemo(() => {
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

  const trackingAccuracyOption = useMemo(() => {
    switch (gpsAccuracy) {
      case 'HIGH':
        return {
          accuracy: Location.Accuracy.Highest,
          distanceInterval: 2,
          //timeInterval: 2000,
          //activityType: Location.ActivityType.Other,
        };
      case 'MEDIUM':
        return {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10,
        };
      case 'LOW':
        return {
          accuracy: Location.Accuracy.Balanced,
        };
      default:
        return {
          accuracy: Location.Accuracy.High,
          distanceInterval: 2,
        };
    }
  }, [gpsAccuracy]);

  const projectId = useSelector((state: AppState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: AppState) => state.user);
  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );
  const tracking = useSelector((state: AppState) => state.settings.tracking, shallowEqual);
  const trackingLayer = useSelector((state: AppState) => state.layers.find((l) => l.id === tracking?.layerId));
  const dataSet = useSelector((state: AppState) => state.dataSet);
  const trackingRecord = useMemo(
    () => dataSet.find((d) => d.layerId === tracking?.layerId)?.data.find((d) => d.id === tracking?.dataId),
    [dataSet, tracking?.dataId, tracking?.layerId]
  );
  const [currentLocation, setCurrentLocation] = useState<LocationType | null>(null);
  const [headingUp, setHeadingUp] = useState(false);
  const [gpsState, setGpsState] = useState<LocationStateType>('off');
  const [trackingState, setTrackingState] = useState<TrackingStateType>('off');

  const confirmLocationPermission = useCallback(async () => {
    try {
      const { status: notificationStatus } = await Notifications.requestPermissionsAsync();
      if (notificationStatus !== 'granted') {
        await AlertAsync(t('hooks.message.permitAccessGPS'));
        return;
      }

      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        await AlertAsync(t('hooks.message.permitAccessGPS'));
        return;
      }

      if (Platform.OS === 'ios') {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
          await AlertAsync(t('hooks.message.permitAccessGPS'));
          return;
        }
      }

      return foregroundStatus;
    } catch (e: any) {
      console.log(e.message); // エラーメッセージをコンソールに出力
    }
  }, []);

  const startGPS = useCallback(async () => {
    if ((await confirmLocationPermission()) !== 'granted') return;
    //GPSもトラッキングもOFFの場合
    if (gpsSubscriber.current === undefined && !(await Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION))) {
      gpsSubscriber.current = await Location.watchPositionAsync(gpsAccuracyOption, (pos) =>
        updateGpsPosition.current(pos)
      );
    }
    if (headingSubscriber.current === undefined) {
      headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
        setMagnetometer(nearDegree(pos.trueHeading, DEGREE_INTERVAL));
      });
    }
  }, [confirmLocationPermission, gpsAccuracyOption]);

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
      console.log(e);
    } finally {
      dispatch(editSettingsAction({ tracking: undefined }));
      if (isLoggedIn(user) && hasOpened(projectId)) {
        projectStore.deleteCurrentPosition(user.uid, projectId);
        setCurrentLocation(null);
      }
    }
  }, [dispatch, projectId, user]);

  const startTracking = useCallback(async () => {
    if ((await confirmLocationPermission()) !== 'granted') return;
    if (!(await Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION))) {
      await Location.startLocationUpdatesAsync(TASK.FETCH_LOCATION, {
        ...trackingAccuracyOption,
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
        setMagnetometer(nearDegree(pos.trueHeading, DEGREE_INTERVAL));
      });
    }
  }, [confirmLocationPermission, trackingAccuracyOption]);

  const moveCurrentPosition = useCallback(async () => {
    //console.log('moveCurrentPosition');
    if ((await confirmLocationPermission()) !== 'granted') return;
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
  }, [confirmLocationPermission, mapViewRef]);

  const toggleGPS = useCallback(
    async (gpsState_: LocationStateType) => {
      setGpsState(gpsState_);
      if (gpsState_ === 'off') {
        await stopGPS();
        if (isLoggedIn(user) && hasOpened(projectId)) {
          projectStore.deleteCurrentPosition(user.uid, projectId);
          setCurrentLocation(null);
        }
        return;
      }
      if (gpsState_ === 'follow') {
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
      } else if (gpsState_ === 'show') {
        updateGpsPosition.current = (pos: Location.LocationObject) => {
          setCurrentLocation(pos.coords);
        };
      }
      await startGPS();
    },
    [mapViewRef, moveCurrentPosition, projectId, startGPS, stopGPS, user]
  );

  const toggleTracking = useCallback(
    async (trackingState_: TrackingStateType) => {
      //Tracking Stateの変更後の処理

      //console.log('!!!!wakeup', trackingState);
      if (trackingState_ === 'on') {
        await moveCurrentPosition();
        await clearStoredLocations();
        await startTracking();
      } else if (trackingState_ === 'off') {
        await stopTracking();
        await clearStoredLocations();
        //記録のないトラックは削除
        if (tracking !== undefined) {
          //const trackingRecord = findRecord(tracking.layerId, dataUser.uid, tracking.dataId, 'LINE');
          if (
            trackingRecord !== undefined &&
            Array.isArray(trackingRecord.coords) &&
            trackingRecord.coords.length === 0
          ) {
            dispatch(
              deleteRecordsAction({
                layerId: tracking.layerId,
                userId: dataUser.uid,
                data: [trackingRecord],
              })
            );
          }
        }
      }
      setTrackingState(trackingState_);
    },
    [dataUser.uid, dispatch, moveCurrentPosition, startTracking, stopTracking, tracking, trackingRecord]
  );

  const toggleHeadingUp = useCallback(
    async (headingUp_: boolean) => {
      if (mapViewRef === null) return;
      if (headingUp_) {
        if (headingSubscriber.current !== undefined) headingSubscriber.current.remove();
        headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
          const angle = Math.abs((-1.0 * nearDegree(pos.trueHeading, DEGREE_INTERVAL)) % 360);
          (mapViewRef as MapView).animateCamera(
            {
              heading: angle,
            },
            { duration: 300 }
          );
        });
        setMagnetometer(0);
      } else {
        if (headingSubscriber.current !== undefined) headingSubscriber.current.remove();
        headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
          setMagnetometer(nearDegree(pos.trueHeading, DEGREE_INTERVAL));
        });

        (mapViewRef as MapView).animateCamera({
          heading: 0,
        });
      }
      setHeadingUp(headingUp_);
    },
    [mapViewRef]
  );

  const updateTrackLog = useCallback(
    async (data: { distance: number; trackLog: LocationType[]; lastTimeStamp: number }) => {
      const { trackLog, distance, lastTimeStamp } = data;
      if (tracking === undefined) return;
      if (trackLog.length === 0) return;

      const currentCoords = trackLog[trackLog.length - 1];

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
      setCurrentLocation(currentCoords);

      dispatch(
        updateTrackFieldAction({
          layerId: tracking.layerId,
          userId: dataUser.uid,
          dataId: tracking.dataId,
          field: { cmt: `${t('common.distance')} ${distance.toFixed(2)}km` },
          coords: trackLog,
        })
      );

      if (trackLog.length > 3000) {
        //3000点を超えたら新しいデータを作成
        setDividedTrackLogCount((prev) => prev + 1);
        if (trackingLayer === undefined) return;
        const trackingRecordSet = dataSet.find((d) => d.layerId === tracking.layerId)!.data;
        //最後の位置情報で新しいデータを作成
        const record = generateRecord('LINE', trackingLayer, trackingRecordSet, trackLog.slice(-1));
        addRecord(trackingLayer, record, { isTrack: true });

        await storeLocations({
          distance: 0,
          trackLog: trackLog.slice(-1),
          lastTimeStamp: lastTimeStamp,
        });
      }
    },
    // dataSetは更新されると再レンダリングされるのでdividedTrackLogCountを依存に入れる
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      addRecord,
      dividedTrackLogCount,
      dataUser.uid,
      dispatch,
      generateRecord,
      gpsState,
      mapViewRef,
      tracking,
      trackingLayer,
    ]
  );

  useEffect(() => {
    // console.log('#define locationEventsEmitter update function');

    const eventSubscription = locationEventsEmitter.addListener('update', updateTrackLog);
    return () => {
      // console.log('clean locationEventsEmitter');
      eventSubscription && eventSubscription.remove();
    };
  }, [updateTrackLog]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    (async () => {
      //kill後の起動時にログ取得中なら終了させる。なぜかエラーになるがtry catchする

      const hasStarted = await Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION);
      if (hasStarted) {
        //アプリがkillされている間にストレージに保存されているトラックを更新する
        //console.log('### app killed and restart tracking');

        //再起動時にトラックを止めるならこちら

        await stopTracking();
      }
      const savedLocations = await getStoredLocations();
      if (savedLocations.trackLog.length > 1) {
        const ret = await ConfirmAsync(t('hooks.message.saveTracking'));
        if (ret) updateTrackLog(savedLocations);
      }
      clearStoredLocations();
    })();

    return () => {
      Location.stopLocationUpdatesAsync(TASK.FETCH_LOCATION);

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
          if (headingSubscriber.current === undefined) {
            //console.log('add heading');
            headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
              setMagnetometer(nearDegree(pos.trueHeading, DEGREE_INTERVAL));
            });
          }
        }
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
      subscription.remove();
    };
  }, [trackingState]);

  return {
    currentLocation,
    gpsState,
    trackingState,
    headingUp,
    magnetometer,
    toggleGPS,
    toggleTracking,
    toggleHeadingUp,
  } as const;
};
