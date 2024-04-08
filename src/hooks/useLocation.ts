import { useEffect, useMemo, useRef } from 'react';
import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl';
import { LocationStateType, LocationType, TrackingStateType } from '../types';
import { DEGREE_INTERVAL } from '../constants/AppConstants';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { editSettingsAction } from '../modules/settings';
import { addLocations, clearSavedLocations, getLineLength, getSavedLocations } from '../utils/Location';
import { AppState } from '../modules';
import { deleteRecordsAction, updateTrackFieldAction } from '../modules/dataSet';
import { hasOpened } from '../utils/Project';
import * as projectStore from '../lib/firebase/firestore';
import { isLoggedIn } from '../utils/Account';
import { isMapView } from '../utils/Map';
import { nearDegree } from '../utils/General';
import { t } from '../i18n/config';
import { useRecord } from './useRecord';
import { LocationHeadingObject, LocationSubscription } from 'expo-location';
import { TASK } from '../constants/AppConstants';
import { Platform } from 'react-native';
import { EventEmitter } from 'fbemitter';
import * as TaskManager from 'expo-task-manager';
import { AlertAsync } from '../components/molecules/AlertAsync';

const locationEventsEmitter = new EventEmitter();

TaskManager.defineTask(TASK.FETCH_LOCATION, async (event) => {
  if (event.error) {
    return console.error('[tracking]', 'Something went wrong within the background location task...', event.error);
  }

  const locations = (event.data as any).locations as Location.LocationObject[];
  //console.log('[tracking]', 'Received new locations', locations);

  try {
    // have to add it sequentially, parses/serializes existing JSON

    const updatedLocations = await addLocations(locations);
    locationEventsEmitter.emit('update', updatedLocations);
  } catch (error) {
    console.log('[tracking]', 'Something went wrong when saving a new location...', error);
  }
});

// TaskManager.defineTask(TASK.FETCH_LOCATION, async ({ data }: TaskManager.TaskManagerTaskBody<object>) => {
//   //console.log('saveAndEmitLocation');
//   if (isLocationObject(data) && data.locations.length > 0) {
//     const savedLocations = await getSavedLocations();
//     const updatedLocations = updateLocations(savedLocations, data.locations);
//     const updatedLocationsString = JSON.stringify(updatedLocations);
//     //const dataSizeInMB = Buffer.byteLength(updatedLocationsString) / (1024 * 1024);

//     await AsyncStorage.setItem(STORAGE.TRACKLOG, updatedLocationsString);
//     //console.log('update', updatedLocations);
//     locationEventsEmitter.emit('update', updatedLocations);
//     //console.log(dataSizeInMB);
//     //if (dataSizeInMB > 2) {
//     //console.warn('データサイズが2MBを超えています。保存されません。');
//     //AlertAsync(t('hooks.alert.dataSizeOver'));
//     //}
//   }
// });

export type UseLocationReturnType = {
  currentLocation: LocationType | null;
  gpsState: LocationStateType;
  trackingState: TrackingStateType;
  headingUp: boolean;
  magnetometer: Location.LocationHeadingObject | null;
  toggleHeadingUp: (headingUp_: boolean) => void;
  toggleGPS: (gpsState: LocationStateType) => Promise<void>;
  toggleTracking: (trackingState: TrackingStateType) => Promise<void>;
};

export const useLocation = (mapViewRef: MapView | MapRef | null): UseLocationReturnType => {
  const dispatch = useDispatch();
  const [magnetometer, setMagnetometer] = useState<LocationHeadingObject | null>(null);

  const gpsSubscriber = useRef<{ remove(): void } | undefined>(undefined);
  const headingSubscriber = useRef<LocationSubscription | undefined>(undefined);
  const updateHeading = useRef<(pos: Location.LocationHeadingObject) => void>((pos) => setMagnetometer(pos));
  const updateGpsPosition = useRef<(pos: Location.LocationObject) => void>(() => null);
  const gpsAccuracy = useSelector((state: AppState) => state.settings.gpsAccuracy);
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
  const [currentLocation, setCurrentLocation] = useState<LocationType | null>(null);
  const [headingUp, setHeadingUp] = useState(false);
  const [gpsState, setGpsState] = useState<LocationStateType>('off');
  const [trackingState, setTrackingState] = useState<TrackingStateType>('off');
  const { findRecord } = useRecord();

  const confirmLocationPermittion = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        await AlertAsync(t('hooks.message.permitAccessGPS'));
      }
      if (Platform.OS === 'ios') await Location.requestBackgroundPermissionsAsync();

      return status;
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.log(e.message);
    }
  }, []);

  const startGPS = useCallback(async () => {
    if ((await confirmLocationPermittion()) !== 'granted') return;
    //GPSもトラッキングもOFFの場合
    if (gpsSubscriber.current === undefined && !(await Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION))) {
      gpsSubscriber.current = await Location.watchPositionAsync(gpsAccuracyOption, (pos) =>
        updateGpsPosition.current(pos)
      );
    }
    if (headingSubscriber.current === undefined) {
      headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
        updateHeading.current(pos);
      });
    }
  }, [confirmLocationPermittion, gpsAccuracyOption]);

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
    if ((await confirmLocationPermittion()) !== 'granted') return;
    if (!(await Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION))) {
      await Location.startLocationUpdatesAsync(TASK.FETCH_LOCATION, {
        ...trackingAccuracyOption,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'EcorisMap',
          notificationBody: t('hooks.notification.inTracking'),
        },
      });
    }
    if (headingSubscriber.current === undefined) {
      headingSubscriber.current = await Location.watchHeadingAsync((pos) => updateHeading.current(pos));
    }
  }, [confirmLocationPermittion, trackingAccuracyOption]);

  const moveCurrentPosition = useCallback(async () => {
    //console.log('moveCurrentPosition');
    if ((await confirmLocationPermittion()) !== 'granted') return;
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
  }, [confirmLocationPermittion, mapViewRef]);

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
        await clearSavedLocations();
        await startTracking();
      } else if (trackingState_ === 'off') {
        await stopTracking();
        await clearSavedLocations();
        //記録のないトラックは削除
        if (tracking !== undefined) {
          const trackingRecord = findRecord(tracking.layerId, dataUser.uid, tracking.dataId, 'LINE');
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
    [dataUser.uid, dispatch, findRecord, moveCurrentPosition, startTracking, stopTracking, tracking]
  );

  const toggleHeadingUp = useCallback(
    (headingUp_: boolean) => {
      if (mapViewRef === null) return;
      if (headingUp_) {
        updateHeading.current = (pos: Location.LocationHeadingObject) => {
          //console.log(pos)
          (mapViewRef as MapView).animateCamera(
            {
              heading: Math.abs((-1.0 * nearDegree(pos.trueHeading, DEGREE_INTERVAL)) % 360),
            },
            { duration: 300 }
          );
          setMagnetometer(pos);
        };
      } else {
        updateHeading.current = (pos: Location.LocationHeadingObject) => setMagnetometer(pos);
        (mapViewRef as MapView).animateCamera({
          heading: 0,
        });
      }
      setHeadingUp(headingUp_);
    },
    [mapViewRef, setMagnetometer]
  );

  const updateTrackLog = useCallback(
    (locations: LocationType[]) => {
      if (tracking === undefined) return;
      if (locations.length === 0) return;
      const coords = locations[locations.length - 1];
      if (gpsState === 'follow') {
        (mapViewRef as MapView).animateCamera(
          {
            center: {
              latitude: coords.latitude,
              longitude: coords.longitude,
            },
          },
          { duration: 5 }
        );
      }
      setCurrentLocation(coords);

      const distance = getLineLength(locations);
      dispatch(
        updateTrackFieldAction({
          layerId: tracking.layerId,
          userId: dataUser.uid,
          dataId: tracking.dataId,
          field: { cmt: `${t('common.distance')} ${distance.toFixed(2)}km` },
          coords: locations,
        })
      );
    },
    [dataUser.uid, dispatch, gpsState, mapViewRef, tracking]
  );

  useEffect(() => {
    //console.log('#define locationEventsEmitter update function');

    const eventSubscription = locationEventsEmitter.addListener('update', updateTrackLog);
    return () => {
      //console.log('clean locationEventsEmitter');
      eventSubscription && eventSubscription.remove();
    };
  }, [updateTrackLog]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    (async () => {
      //kill後の起動時にログ取得中なら終了させる。なぜかエラーになるがtry catchする

      const hasStarted = await Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION);
      if (hasStarted) {
        //再起動時にトラックを止めるならこちら
        //await stopTracking();

        //console.log('### start tracking ');
        setTrackingState('on');
        await toggleGPS('follow');
        //アプリがkillされている間にストレージに保存されているトラックを更新する
        const savedLocations = await getSavedLocations();
        updateTrackLog(savedLocations);
      }
    })();

    return () => {
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
