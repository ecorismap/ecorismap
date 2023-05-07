import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE } from '../constants/AppConstants';
import { LocationType } from '../types';
import lineDistance from '@turf/line-distance';
import { LocationObject } from 'expo-location';
import * as turf from '@turf/helpers';

export const clearSavedLocations = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const trackLogKeys = keys.filter((key) => key.includes(STORAGE.TRACKLOG));
    await AsyncStorage.multiRemove(trackLogKeys);
    await AsyncStorage.setItem(`${STORAGE.TRACKLOG}_0000`, JSON.stringify([]));
  } catch (e) {
    console.warn(e);
  }
};

export const getSavedLocations = async (): Promise<LocationType[][]> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const trackLogKeys = keys.filter((key) => key.includes(STORAGE.TRACKLOG));
    const items = await AsyncStorage.multiGet(trackLogKeys);
    //console.log('keys', trackLogKeys);
    //const names = items.map((item) => item[0]);
    //console.log(names);
    const locations = items.map((item) => JSON.parse(item[1] as string) as LocationType[]);
    return locations;
  } catch (e) {
    return [];
  }
};

export const updateLocations = (savedLocations: LocationType[], locations: LocationObject[]) => {
  //console.log(savedLocation);
  const lastTimeStamp = savedLocations.length !== 0 ? savedLocations[savedLocations.length - 1].timestamp : 0;
  //同じ場所が繰り返して配信されることがあるので、最後の時間以前のデータは破棄する。
  //LocationTaskConsumer.javaで同様の対処されているが、対処が不十分(getLastLocationの処理が原因？）とiOSにはその処理が入っていない
  const newLocations = locations
    .map((location) => toLocationType(location))
    .filter((v) => v.timestamp! > lastTimeStamp!);
  if (newLocations.length > 0) {
    //精度10m以上の場合は、ログを記録しない
    //if (newLocations[0].accuracy && newLocations[0].accuracy < 10) {
    const updatedLocations = [...savedLocations, ...newLocations];
    return updatedLocations;
  } else {
    return savedLocations;
  }
  //ログの取り始めは、昔のログが残っていることがあるので、3分以上前はスキップ
  // if (savedLocations.length === 0 && dayjs().diff(newLocations[0]!.timestamp!) / (60 * 1000) > 3) return;
  //

  //if (savedLocation.length !== 0) {
  //console.log([savedLocation[0], newLocations[0]]);
  //const distance = getLineLength([savedLocation[0], newLocations[0]]);
  //if (distance < 0.1) locationEventsEmitter.emit('update', newLocations);
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
