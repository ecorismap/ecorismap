import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE } from '../constants/AppConstants';
import { LocationType } from '../types';
import lineDistance from '@turf/line-distance';
import { LocationObject } from 'expo-location';
import * as turf from '@turf/helpers';

export const clearSavedLocations = async () => {
  await AsyncStorage.setItem(STORAGE.TRACKLOG, JSON.stringify([]));
};

export const getSavedLocations = async (): Promise<LocationType[]> => {
  try {
    const item = await AsyncStorage.getItem(STORAGE.TRACKLOG);
    return item ? JSON.parse(item) : [];
  } catch (e) {
    return [];
  }
};

export const addLocations = async (locations: LocationObject[]) => {
  const savedLocations = await getSavedLocations();
  const updatedLocations = updateLocations(savedLocations, locations);
  const updatedLocationsString = JSON.stringify(updatedLocations);
  //const dataSizeInMB = Buffer.byteLength(updatedLocationsString) / (1024 * 1024);

  await AsyncStorage.setItem(STORAGE.TRACKLOG, updatedLocationsString);
  return updatedLocations;
};

export const updateLocations = (savedLocations: LocationType[], locations: LocationObject[]) => {
  //console.log(savedLocation);
  if (locations.length === 0) return savedLocations;
  const lastTimeStamp = savedLocations.length !== 0 ? savedLocations[savedLocations.length - 1].timestamp : 0;
  //同じ場所が繰り返して配信されることがあるので、最後の時間以前のデータは破棄する。
  //LocationTaskConsumer.javaで同様の対処されているが、対処が不十分(getLastLocationの処理が原因？）とiOSにはその処理が入っていない
  const newLocations = locations
    .map((location) => toLocationType(location))
    .filter((v) => v.timestamp! > lastTimeStamp!);
  //ログの取り始めは、精度が悪いので、精度が30m以下になるまでは破棄する
  //console.log('newLocations', newLocations);
  if (savedLocations.length === 0 && newLocations[0].accuracy && newLocations[0].accuracy > 30) return [];
  const updatedLocations = [...savedLocations, ...newLocations];
  return updatedLocations;
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
