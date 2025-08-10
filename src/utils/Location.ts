import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE } from '../constants/AppConstants';
import { LocationType, TrackLogType } from '../types';
import { LocationObject } from 'expo-location';
import * as turf from '@turf/turf';

export const storeLocations = async (data: TrackLogType) => {
  await AsyncStorage.setItem(STORAGE.TRACKLOG, JSON.stringify(data));
};

export const clearStoredLocations = async () => {
  await AsyncStorage.setItem(STORAGE.TRACKLOG, JSON.stringify({ track: [], distance: 0, lastTimeStamp: 0 }));
};

export const getStoredLocations = async (): Promise<TrackLogType> => {
  try {
    const item = await AsyncStorage.getItem(STORAGE.TRACKLOG);
    if (!item) {
      return { track: [], distance: 0, lastTimeStamp: 0 } as TrackLogType;
    }
    return JSON.parse(item) as TrackLogType;
  } catch (e) {
    return { track: [], distance: 0, lastTimeStamp: 0 } as TrackLogType;
  }
};

export const checkAndStoreLocations = async (locations: LocationObject[]): Promise<TrackLogType> => {
  try {
    //AsyncStorageから保存されているトラックログを取得して、現在の位置情報と結合する
    const { distance, track, lastTimeStamp } = await getStoredLocations();
    const checkedLocations = checkLocations(lastTimeStamp, locations);

    const updatedTrackLog = [...track, ...checkedLocations];
    const updatedDistance =
      distance +
      (track.length === 0
        ? getLineLength(checkedLocations)
        : getLineLength([track[track.length - 1], ...checkedLocations]));
    const updatedLastTimeStamp =
      updatedTrackLog.length === 0 ? 0 : updatedTrackLog[updatedTrackLog.length - 1].timestamp ?? 0;

    const updatedLocations = {
      lastTimeStamp: updatedLastTimeStamp,
      distance: updatedDistance,
      track: updatedTrackLog,
    };
    await storeLocations(updatedLocations);
    return updatedLocations;
  } catch (e) {
    return { track: [], distance: 0, lastTimeStamp: 0 };
  }
};

export const checkLocations = (lastTimeStamp: number, locations: LocationObject[]) => {
  //console.log(savedLocation);
  if (locations.length === 0) return [];

  //同じ場所が繰り返して配信されることがあるので、最後の時間以前のデータは破棄する。
  //LocationTaskConsumer.javaで同様の対処されているが、対処が不十分(getLastLocationの処理が原因？）とiOSにはその処理が入っていない
  const newLocations = locations
    .map((location) => toLocationType(location))
    .filter((v) => v.timestamp! > lastTimeStamp!)
    // 精度が30mを超えるポイントはすべて除外（最初のポイントだけでなく全ポイントに適用）
    .filter((v) => !v.accuracy || v.accuracy <= 30);
  
  return newLocations;
};;

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
    const length = turf.length(lineString, { units: 'kilometers' });
    return length;
  } else {
    return 0;
  }
};

export const toLocationType = (locationObject: LocationObject): LocationType => {
  //# Todo altitude to ele by proj4js
  return { ...locationObject.coords, timestamp: locationObject.timestamp };
};
