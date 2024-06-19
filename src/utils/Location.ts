import { LocationType, TrackLogType } from '../types';
import lineDistance from '@turf/line-distance';
import { LocationObject } from 'expo-location';
import * as turf from '@turf/helpers';

export const updateTrackLog = (locations: LocationObject[], trackLog: TrackLogType): TrackLogType => {
  //バックグラウンドの場合は、保存する
  const { distance, track, lastTimeStamp } = trackLog;
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

  return updatedLocations;
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
