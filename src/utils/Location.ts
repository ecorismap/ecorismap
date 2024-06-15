import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE } from '../constants/AppConstants';
import { LocationType } from '../types';
import lineDistance from '@turf/line-distance';
import { LocationObject } from 'expo-location';
import * as turf from '@turf/helpers';

export const storeLocations = async (data: { distance: number; trackLog: LocationType[]; lastTimeStamp: number }) => {
  await AsyncStorage.setItem(STORAGE.TRACKLOG, JSON.stringify(data));
};

export const clearStoredLocations = async () => {
  await AsyncStorage.setItem(STORAGE.TRACKLOG, JSON.stringify({ distance: 0, trackLog: [], lastTimeStamp: 0 }));
};

export const getStoredLocations = async (): Promise<{
  distance: number;
  trackLog: LocationType[];
  lastTimeStamp: number;
}> => {
  try {
    const item = await AsyncStorage.getItem(STORAGE.TRACKLOG);
    return item ? JSON.parse(item) : { distance: 0, trackLog: [], lastTimeStamp: 0 };
  } catch (e) {
    return { distance: 0, trackLog: [], lastTimeStamp: 0 };
  }
};

export const checkAndStoreLocations = async (locations: LocationObject[]) => {
  try {
    //バックグラウンドの場合は、保存する
    const { distance, trackLog, lastTimeStamp } = await getStoredLocations();
    const checkedLocations = checkLocations(lastTimeStamp, locations);

    const updatedTrackLog = [...trackLog, ...checkedLocations];
    const updatedDistance =
      distance +
      (trackLog.length === 0
        ? getLineLength(checkedLocations)
        : getLineLength([trackLog[trackLog.length - 1], ...checkedLocations]));
    const updatedLastTimeStamp =
      updatedTrackLog.length === 0 ? 0 : updatedTrackLog[updatedTrackLog.length - 1].timestamp ?? 0;

    const updatedLocations = {
      lastTimeStamp: updatedLastTimeStamp,
      distance: updatedDistance,
      trackLog: updatedTrackLog,
    };
    const updatedLocationsString = JSON.stringify(updatedLocations);
    //const dataSizeInMB = Buffer.byteLength(updatedLocationsString) / (1024 * 1024);
    await AsyncStorage.setItem(STORAGE.TRACKLOG, updatedLocationsString);
    return updatedLocations;
  } catch (e) {
    console.log(e);
  }
};

export const checkLocations = (lastTimeStamp: number, locations: LocationObject[]) => {
  //console.log(savedLocation);
  if (locations.length === 0) return [];

  //同じ場所が繰り返して配信されることがあるので、最後の時間以前のデータは破棄する。
  //LocationTaskConsumer.javaで同様の対処されているが、対処が不十分(getLastLocationの処理が原因？）とiOSにはその処理が入っていない
  const newLocations = locations
    .map((location) => toLocationType(location))
    .filter((v) => v.timestamp! > lastTimeStamp!);
  //ログの取り始めは、精度が悪いので、精度が30m以下になるまでは破棄する
  //console.log('newLocations', newLocations);
  if (lastTimeStamp === 0 && newLocations[0].accuracy && newLocations[0].accuracy > 30) return [];
  return newLocations;
};

export const isLocationObject = (d: any): d is { locations: LocationObject[] } => {
  if (!d) return false;
  if ('locations' in d) {
    return true;
  } else {
    return false;
  }
};

export const getLineLength = (locations: LocationType[]) => {
  if (locations.length >= 2) {
    const line = locations.map((item) => [item.longitude, item.latitude]);
    const lineString = turf.lineString(line);
    const length = lineDistance(lineString, 'kilometers');
    return length;
  } else {
    return 0;
  }
};

export const toLocationType = (locationObject: LocationObject): LocationType => {
  //# Todo altitude to ele by proj4js
  return { ...locationObject.coords, timestamp: locationObject.timestamp };
};
