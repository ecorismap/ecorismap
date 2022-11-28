import { useEffect, useMemo } from 'react';
import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import MapView, { Region } from 'react-native-maps';
import { MapRef, ViewState } from 'react-map-gl';
import { LocationStateType, LocationType, RegionType, TrackingStateType } from '../types';
import { DEGREE_INTERVAL, STORAGE } from '../constants/AppConstants';
import { Platform, useWindowDimensions } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { editSettingsAction } from '../modules/settings';
import { getLineLength } from '../utils/Location';
import { AppState } from '../modules';
import { deleteRecordsAction, updateTrackFieldAction } from '../modules/dataSet';
import { deltaToZoom, zoomToDelta } from '../utils/Coords';
import { useGPS } from './useGPS';
import { hasOpened } from '../utils/Project';
import * as projectStore from '../lib/firebase/firestore';
import { hasLoggedIn } from '../utils/Account';
import { isMapRef, isMapView, isRegion, isRegionType, isViewState } from '../utils/Map';
import { nearDegree } from '../utils/General';
import { t } from '../i18n/config';
import { useFeature } from './useFeature';

export type UseLocationReturnType = {
  currentLocation: LocationType | null;
  gpsState: LocationStateType;
  trackingState: TrackingStateType;
  headingUp: boolean;
  magnetometer: Location.LocationHeadingObject | null;
  toggleHeadingUp: (headingUp: boolean) => void;
  toggleGPS: (gpsState: LocationStateType) => Promise<void>;
  toggleTracking: (trackingState: TrackingStateType) => Promise<void>;
  changeMapRegion: (region: Region | ViewState, jumpTo?: boolean) => void;
};

export const useLocation = (mapViewRef: MapView | MapRef | null): UseLocationReturnType => {
  const dispatch = useDispatch();
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const user = useSelector((state: AppState) => state.user);
  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );
  const tracking = useSelector((state: AppState) => state.settings.tracking);
  const [currentLocation, setCurrentLocation] = useState<LocationType | null>(null);
  const [headingUp, setHeadingUp] = useState(false);
  const [gpsState, setGpsState] = useState<LocationStateType>('off');
  const [trackingState, setTrackingState] = useState<TrackingStateType>('off');
  const { findRecord } = useFeature();
  const screenData = useWindowDimensions();

  const {
    locationEventsEmitter,
    magnetometer,
    setMagnetometer,
    setHeadingUpFunction,
    setFollowMapFunction,
    confirmLocationPermittion,
    startGPS,
    stopGPS,
    startTracking,
    stopTracking,
  } = useGPS();

  const changeMapRegion = useCallback(
    (region: Region | ViewState | RegionType, jumpTo = false) => {
      //console.log('region change');
      // console.log(region);

      if (Platform.OS === 'web') {
        if (isRegionType(region)) {
          dispatch(editSettingsAction({ mapRegion: region }));
        } else if (isViewState(region)) {
          if (mapViewRef === null) {
            dispatch(editSettingsAction({ mapRegion: { ...region, latitudeDelta: 0.001, longitudeDelta: 0.001 } }));
          } else if (isMapRef(mapViewRef)) {
            const { latitudeDelta, longitudeDelta } = zoomToDelta(mapViewRef);
            dispatch(editSettingsAction({ mapRegion: { ...region, latitudeDelta, longitudeDelta } }));
          }
        }
      } else {
        if (isRegion(region) && !isRegionType(region)) {
          console.log('newRegion', region);
          const delta = { longitudeDelta: region.longitudeDelta, latitudeDelta: region.latitudeDelta };
          const newRegion = { ...region, zoom: deltaToZoom(screenData, delta).zoom };
          dispatch(editSettingsAction({ mapRegion: newRegion }));
        } else if (jumpTo && isRegionType(region)) {
          const jumpRegion = {
            latitude: region.latitude,
            longitude: region.longitude,
            latitudeDelta: region.latitudeDelta,
            longitudeDelta: region.longitudeDelta,
          };
          (mapViewRef as MapView).animateToRegion(jumpRegion, 5);
        }
      }
    },
    [dispatch, mapViewRef, screenData]
  );

  const moveCurrentPosition = useCallback(async () => {
    if (mapViewRef === null || !isMapView(mapViewRef)) return;
    const location = await Location.getLastKnownPositionAsync();
    if (location !== null) {
      mapViewRef.animateCamera(
        {
          center: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          },
        },
        { duration: 5 }
      );
    }
  }, [mapViewRef]);

  const toggleFollowMap = useCallback(
    (gpsState_: LocationStateType) => {
      if (gpsState_ === 'follow') {
        const followMapFunc = (pos: Location.LocationObject) => {
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
        setFollowMapFunction(followMapFunc);
      } else if (gpsState_ === 'show') {
        const followMapFunc = (pos: Location.LocationObject) => {
          setCurrentLocation(pos.coords);
        };
        setFollowMapFunction(followMapFunc);
      }
    },
    [mapViewRef, setFollowMapFunction]
  );

  const toggleGPS = useCallback(
    async (gpsState_: LocationStateType) => {
      if (gpsState_ === 'off') {
        stopGPS();
        if (hasLoggedIn(user) && hasOpened(projectId)) {
          projectStore.deleteCurrentPosition(user.uid, projectId);
          setCurrentLocation(null);
        }
      } else {
        if ((await confirmLocationPermittion()) !== 'granted') return;
        startGPS();
        if (gpsState_ === 'follow') {
          moveCurrentPosition();
        }
      }
      toggleFollowMap(gpsState_);
      setGpsState(gpsState_);
    },
    [confirmLocationPermittion, moveCurrentPosition, projectId, startGPS, stopGPS, toggleFollowMap, user]
  );

  const toggleTracking = useCallback(
    async (trackingState_: TrackingStateType) => {
      //Tracking Stateの変更後の処理

      //console.log('!!!!wakeup', trackingState);
      if (trackingState_ === 'on') {
        if ((await confirmLocationPermittion()) === 'granted') {
          moveCurrentPosition();
          startTracking();
        }
      } else if (trackingState_ === 'off') {
        await stopTracking();
        await AsyncStorage.setItem(STORAGE.TRACKLOG, JSON.stringify([]));
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

        dispatch(editSettingsAction({ tracking: undefined }));
        if (hasLoggedIn(user) && hasOpened(projectId)) {
          projectStore.deleteCurrentPosition(user.uid, projectId);
          setCurrentLocation(null);
        }
      }
      setTrackingState(trackingState_);
    },
    [
      confirmLocationPermittion,
      dataUser.uid,
      dispatch,
      findRecord,
      moveCurrentPosition,
      projectId,
      startTracking,
      stopTracking,
      tracking,
      user,
    ]
  );

  const toggleHeadingUp = useCallback(
    (headingUp_: boolean) => {
      if (headingUp_) {
        const headingFunc = (pos: Location.LocationHeadingObject) => {
          //console.log(pos)
          (mapViewRef as MapView).animateCamera(
            {
              heading: Math.abs((-1.0 * nearDegree(pos.trueHeading, DEGREE_INTERVAL)) % 360),
            },
            { duration: 1 }
          );
          setMagnetometer(pos);
        };
        setHeadingUpFunction(headingFunc);
      } else {
        const headingFunc = (pos: Location.LocationHeadingObject) => setMagnetometer(pos);
        setHeadingUpFunction(headingFunc);
        (mapViewRef as MapView).animateCamera({
          heading: 0,
        });
      }
      setHeadingUp(headingUp_);
    },
    [mapViewRef, setHeadingUpFunction, setMagnetometer]
  );

  const updateTrackLog = useCallback(
    (locations: LocationType[]) => {
      if (tracking === undefined) return;
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
  }, [locationEventsEmitter, updateTrackLog]);

  return {
    currentLocation,
    gpsState,
    trackingState,
    headingUp,
    magnetometer,
    toggleGPS,
    toggleTracking,
    toggleHeadingUp,
    changeMapRegion,
  } as const;
};
