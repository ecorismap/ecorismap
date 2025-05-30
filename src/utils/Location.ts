import { LocationType, TrackLogType, TrackStatisticsType } from '../types';
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

export const calculateSpeed = (locations: LocationType[]): number => {
  if (locations.length < 2) return 0;

  const recentLocations = locations.slice(-5); // 最後の5点を使用
  if (recentLocations.length < 2) return 0;

  const firstLoc = recentLocations[0];
  const lastLoc = recentLocations[recentLocations.length - 1];

  const distance = getDistanceBetweenPoints(firstLoc, lastLoc);
  const timeDiff = (lastLoc.timestamp! - firstLoc.timestamp!) / 1000 / 3600; // 時間に変換

  return timeDiff > 0 ? distance / timeDiff : 0; // km/h
};

export const detectStationary = (
  locations: LocationType[],
  thresholdDistance: number,
  thresholdTime: number
): boolean => {
  if (locations.length < 2) return false;

  const now = Date.now();
  const recentLocations = locations.filter((loc) => now - loc.timestamp! < thresholdTime);

  if (recentLocations.length < 2) return false;

  const firstLoc = recentLocations[0];
  const distances = recentLocations.map((loc) => getDistanceBetweenPoints(firstLoc, loc));

  return Math.max(...distances) < thresholdDistance;
};

export const calculateTrackStatistics = (
  track: LocationType[],
  distance: number,
  startTime: number
): TrackStatisticsType => {
  if (track.length === 0) {
    return {
      duration: 0,
      movingTime: 0,
      averageSpeed: 0,
      maxSpeed: 0,
      pauseCount: 0,
    };
  }

  const endTime = track[track.length - 1].timestamp || Date.now();
  const duration = endTime - startTime;

  // 移動時間の計算（速度が1km/h以上の時間）
  let movingTime = 0;
  let maxSpeed = 0;
  let pauseCount = 0;
  let wasMoving = false;

  for (let i = 1; i < track.length; i++) {
    const timeDiff = (track[i].timestamp! - track[i - 1].timestamp!) / 1000; // 秒
    const distanceKm = getDistanceBetweenPoints(track[i - 1], track[i]);
    const speed = timeDiff > 0 ? (distanceKm / timeDiff) * 3600 : 0; // km/h

    if (speed > 1) {
      movingTime += timeDiff * 1000; // ミリ秒に変換
      if (!wasMoving) {
        wasMoving = true;
      }
    } else {
      if (wasMoving) {
        pauseCount++;
        wasMoving = false;
      }
    }

    if (speed > maxSpeed) {
      maxSpeed = speed;
    }
  }

  const averageSpeed = movingTime > 0 ? distance / (movingTime / 1000 / 3600) : 0;

  // 高度情報があれば累積上昇高度を計算
  let elevationGain = 0;
  if (track.some((loc) => loc.altitude !== undefined && loc.altitude !== null)) {
    for (let i = 1; i < track.length; i++) {
      const prevAlt = track[i - 1].altitude;
      const currAlt = track[i].altitude;
      if (prevAlt !== undefined && prevAlt !== null && currAlt !== undefined && currAlt !== null && currAlt > prevAlt) {
        elevationGain += currAlt - prevAlt;
      }
    }
  }

  return {
    duration,
    movingTime,
    averageSpeed,
    maxSpeed,
    pauseCount,
    elevationGain: elevationGain > 0 ? elevationGain : undefined,
  };
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
