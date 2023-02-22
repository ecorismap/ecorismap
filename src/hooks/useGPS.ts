import React, { useEffect, useRef } from 'react';
import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import { LocationHeadingObject, LocationSubscription } from 'expo-location';
import { STORAGE, TASK } from '../constants/AppConstants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getSavedLocations, isLocationObject, updateLocations } from '../utils/Location';

import { EventEmitter } from 'fbemitter';
import * as TaskManager from 'expo-task-manager';
import { t } from '../i18n/config';
import { AlertAsync } from '../components/molecules/AlertAsync';

const locationEventsEmitter = new EventEmitter();
const saveAndEmitLocation = async ({ data }: TaskManager.TaskManagerTaskBody<object>) => {
  if (isLocationObject(data) && data.locations.length > 0) {
    const savedLocations = await getSavedLocations();
    const updatedLocations = updateLocations(savedLocations, data.locations);
    await AsyncStorage.setItem(STORAGE.TRACKLOG, JSON.stringify(updatedLocations));
    locationEventsEmitter.emit('update', updatedLocations);
  }
};
TaskManager.defineTask(TASK.FETCH_LOCATION, saveAndEmitLocation);

export type UseGPSReturnType = {
  locationEventsEmitter: EventEmitter;
  magnetometer: Location.LocationHeadingObject | null;

  setMagnetometer: React.Dispatch<React.SetStateAction<Location.LocationHeadingObject | null>>;
  setHeadingUpFunction: (headingFunc: any) => Promise<void>;
  setFollowMapFunction: (followFunc: any) => Promise<void>;
  confirmLocationPermittion: () => Promise<Location.PermissionStatus | undefined>;
  startGPS: () => Promise<void>;
  stopGPS: () => Promise<void>;
  startTracking: () => Promise<void>;
  stopTracking: () => Promise<void>;
};

export const useGPS = (): UseGPSReturnType => {
  const [magnetometer, setMagnetometer] = useState<LocationHeadingObject | null>(null);

  const gpsSubscriber = useRef<{ remove(): void } | undefined>(undefined);
  const headingSubscriber = useRef<LocationSubscription | undefined>(undefined);
  const updateHeading = useRef<(pos: Location.LocationHeadingObject) => void>((pos) => setMagnetometer(pos));
  const updateGpsPosition = useRef<(pos: Location.LocationObject) => void>(() => null);

  const confirmLocationPermittion = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        await AlertAsync(t('hooks.message.permitAccessGPS'));
      }
      return status;
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.log(e.message);
    }
  }, []);

  const setHeadingUpFunction = useCallback(async (headingFunc: (pos: Location.LocationHeadingObject) => void) => {
    updateHeading.current = headingFunc;
  }, []);

  const setFollowMapFunction = useCallback(async (followFunc: (pos: Location.LocationObject) => void) => {
    updateGpsPosition.current = followFunc;
  }, []);

  const startGPS = useCallback(async () => {
    //GPSもトラッキングもOFFの場合
    if (gpsSubscriber.current === undefined && !(await Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION))) {
      gpsSubscriber.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          distanceInterval: 1,
        },
        (pos) => updateGpsPosition.current(pos)
      );
    }
    if (headingSubscriber.current === undefined) {
      headingSubscriber.current = await Location.watchHeadingAsync((pos) => {
        updateHeading.current(pos);
      });
    }
  }, []);

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
    }
  }, []);

  const startTracking = useCallback(async () => {
    if (!(await Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION))) {
      await Location.startLocationUpdatesAsync(TASK.FETCH_LOCATION, {
        //accuracy: Location.Accuracy.BestForNavigation,
        accuracy: Location.Accuracy.High,
        distanceInterval: 2,
        timeInterval: 2000,
        pausesUpdatesAutomatically: false,
        deferredUpdatesDistance: 2,
        deferredUpdatesInterval: 2000,
        //deferredUpdatesDistance: 100,
        //deferredUpdatesInterval: 1000 * 60,
        ////activityType: 3,
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
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    (async () => {
      //kill後の起動時にログ取得中なら終了させる。なぜかエラーになるがtry catchする

      const hasStarted = await Location.hasStartedLocationUpdatesAsync(TASK.FETCH_LOCATION);
      if (hasStarted) {
        //console.log('### stop tracking ');
        await stopTracking();
      }
    })();

    return () => {
      if (gpsSubscriber.current !== undefined) {
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
    magnetometer,
    locationEventsEmitter,
    setFollowMapFunction,
    setHeadingUpFunction,
    setMagnetometer,
    confirmLocationPermittion,
    startGPS,
    stopGPS,
    startTracking,
    stopTracking,
  } as const;
};
