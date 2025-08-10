import { LocationType, TrackLogType } from '../types';
import { LocationObject } from 'expo-location';
import * as turf from '@turf/turf';
import { trackLogMMKV } from './mmkvStorage';

// MMKVを使用したシンプルな実装（チャンク処理不要）
export const storeLocations = (data: TrackLogType): void => {
  // MMKVは大容量データも効率的に処理可能（2MB制限なし）
  trackLogMMKV.setTrackLog(data);
};

export const clearStoredLocations = (): void => {
  trackLogMMKV.clearTrackLog();
  // 空のデータを設定（互換性のため）
  trackLogMMKV.setTrackLog({ track: [], distance: 0, lastTimeStamp: 0 });
};

export const getStoredLocations = (): TrackLogType => {
  try {
    const data = trackLogMMKV.getTrackLog();
    if (data !== null) {
      return data;
    }
  } catch (error) {
    // エラーが発生した場合は空のトラックログを返す
    // console.error('Failed to get stored locations:', error);
  }
  // データが存在しない場合は空のトラックログを返す
  return { track: [], distance: 0, lastTimeStamp: 0 };
};

export const checkAndStoreLocations = (locations: LocationObject[]): TrackLogType => {
  try {
    //MMKVから保存されているトラックログを取得して、現在の位置情報と結合する
    const { distance, track, lastTimeStamp } = getStoredLocations();

    // 前回の位置を取得（マルチパス検出用）
    const previousLocation = track.length > 0 ? track[track.length - 1] : undefined;
    const checkedLocations = checkLocations(lastTimeStamp, locations, previousLocation);

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
    storeLocations(updatedLocations);
    return updatedLocations;
  } catch (e) {
    return { track: [], distance: 0, lastTimeStamp: 0 };
  }
};

// toLocationType関数を先に定義（checkLocationsで使用するため）
export const toLocationType = (locationObject: LocationObject): LocationType => {
  //# Todo altitude to ele by proj4js
  return { ...locationObject.coords, timestamp: locationObject.timestamp };
};

export const checkLocations = (lastTimeStamp: number, locations: LocationObject[], previousLocation?: LocationType) => {
  //console.log(savedLocation);
  if (locations.length === 0) return [];

  //同じ場所が繰り返して配信されることがあるので、最後の時間以前のデータは破棄する。
  //LocationTaskConsumer.javaで同様の対処されているが、対処が不十分(getLastLocationの処理が原因？）とiOSにはその処理が入っていない
  let newLocations = locations
    .map((location) => toLocationType(location))
    .filter((v) => v.timestamp! > lastTimeStamp!)
    // 精度が30mを超えるポイントはすべて除外
    .filter((v) => !v.accuracy || v.accuracy <= 30);
  
  // マルチパス検出: 連続する点間の異常な移動を検出
  if (previousLocation && newLocations.length > 0) {
    const filteredLocations: LocationType[] = [];
    let lastValidLocation = previousLocation;
    
    for (const location of newLocations) {
      // 時間差を計算（秒）
      const timeDiff = (location.timestamp! - lastValidLocation.timestamp!) / 1000;
      
      if (timeDiff > 0) {
        // 2点間の距離を計算（メートル）
        const distance = turf.distance(
          [lastValidLocation.longitude, lastValidLocation.latitude],
          [location.longitude, location.latitude],
          { units: 'meters' }
        );
        
        // 速度を計算（m/s）
        const speed = distance / timeDiff;
        
        // 異常な速度を検出（例: 50m/s = 180km/h以上は異常とみなす）
        // 都市部では建物による反射で瞬間的に大きく位置が飛ぶことがある
        const MAX_REASONABLE_SPEED = 50; // m/s (180 km/h)
        
        // 短時間での大きな移動も検出（GPSジャンプ）
        // 1秒以内に100m以上移動は異常とみなす
        const isGpsJump = timeDiff <= 1 && distance > 100;
        
        if (speed <= MAX_REASONABLE_SPEED && !isGpsJump) {
          // 追加の精度チェック: 精度が急激に悪化した場合も除外
          const accuracyDegraded = location.accuracy && 
                                  lastValidLocation.accuracy && 
                                  location.accuracy > lastValidLocation.accuracy * 2 &&
                                  location.accuracy > 20;
          
          if (!accuracyDegraded) {
            filteredLocations.push(location);
            lastValidLocation = location;
          }
        } else {
          // console.log(`Filtered out location: speed=${speed.toFixed(1)}m/s, distance=${distance.toFixed(1)}m, timeDiff=${timeDiff.toFixed(1)}s`);
        }
      }
    }
    
    newLocations = filteredLocations;
  }
  
  // 重複する位置の除去（同じ座標が連続する場合）
  const uniqueLocations = newLocations.filter((location, index) => {
    if (index === 0) return true;
    const prev = newLocations[index - 1];
    // 座標が完全に同じ場合は除外
    return !(location.latitude === prev.latitude && location.longitude === prev.longitude);
  });
  
  return uniqueLocations;
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
