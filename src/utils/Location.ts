import { LocationType, TrackLogType } from '../types';
import { LocationObject } from 'expo-location';
import * as turf from '@turf/turf';
export const updateTrackLog = (locations: LocationObject[], trackLog: TrackLogType) => {
  //バックグラウンドの場合は、保存する
  const { track, lastTimeStamp } = trackLog;
  const checkedLocations = checkLocations(lastTimeStamp, locations);

  if (checkedLocations.length === 0) {
    return { newLocations: [], additionalDistance: 0, lastTimeStamp };
  }

  // 増分距離のみ計算
  let additionalDistance = 0;
  if (track.length > 0 && checkedLocations.length > 0) {
    // 最後の点と新しい最初の点の距離
    additionalDistance = getDistanceBetweenPoints(track[track.length - 1], checkedLocations[0]);
  }

  // 新しい点同士の距離を追加
  if (checkedLocations.length > 1) {
    additionalDistance += getLineLength(checkedLocations);
  }

  const updatedLastTimeStamp = checkedLocations[checkedLocations.length - 1].timestamp ?? 0;

  return {
    newLocations: checkedLocations,
    additionalDistance,
    lastTimeStamp: updatedLastTimeStamp,
  };
};

export const getDistanceBetweenPoints = (point1: LocationType, point2: LocationType): number => {
  const from = turf.point([point1.longitude, point1.latitude]);
  const to = turf.point([point2.longitude, point2.latitude]);
  return turf.distance(from, to, { units: 'kilometers' });
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
