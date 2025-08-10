import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE } from '../constants/AppConstants';
import { LocationType, TrackLogType } from '../types';
import { LocationObject } from 'expo-location';
import * as turf from '@turf/turf';

// チャンクサイズ: 1MB以下に設定（安全マージンを含む）
const CHUNK_SIZE_LIMIT = 900 * 1024; // 900KB
const CHUNK_KEY_PREFIX = 'TRACKLOG_CHUNK_';
const METADATA_KEY = 'TRACKLOG_METADATA';

// チャンク分割して保存する新しい関数
export const storeLocationsChunked = async (data: TrackLogType): Promise<void> => {
  try {
    // 既存のチャンクをクリア
    await clearStoredLocationsChunked();
    
    // データをJSON文字列化
    const jsonString = JSON.stringify(data);
    const totalSize = new Blob([jsonString]).size;
    
    // チャンクサイズ以下の場合は単一保存
    if (totalSize <= CHUNK_SIZE_LIMIT) {
      await AsyncStorage.setItem(STORAGE.TRACKLOG, jsonString);
      return;
    }
    
    // チャンク分割が必要な場合
    const chunks: string[] = [];
    const trackPoints = data.track;
    const pointsPerChunk = Math.ceil(trackPoints.length * CHUNK_SIZE_LIMIT / totalSize);
    
    let chunkIndex = 0;
    for (let i = 0; i < trackPoints.length; i += pointsPerChunk) {
      const chunkData: TrackLogType = {
        track: trackPoints.slice(i, i + pointsPerChunk),
        distance: i === 0 ? data.distance : 0, // 距離は最初のチャンクにのみ保存
        lastTimeStamp: i + pointsPerChunk >= trackPoints.length ? data.lastTimeStamp : 0,
      };
      
      const chunkKey = `${CHUNK_KEY_PREFIX}${chunkIndex}`;
      await AsyncStorage.setItem(chunkKey, JSON.stringify(chunkData));
      chunks.push(chunkKey);
      chunkIndex++;
    }
    
    // メタデータを保存
    await AsyncStorage.setItem(METADATA_KEY, JSON.stringify({
      chunks,
      totalPoints: trackPoints.length,
      distance: data.distance,
      lastTimeStamp: data.lastTimeStamp,
    }));
  } catch (error) {
    console.error('Failed to store chunked locations:', error);
    throw error;
  }
};

// チャンクを結合して取得する新しい関数
export const getStoredLocationsChunked = async (): Promise<TrackLogType> => {
  try {
    // まず通常のキーをチェック
    const singleData = await AsyncStorage.getItem(STORAGE.TRACKLOG);
    if (singleData) {
      return JSON.parse(singleData) as TrackLogType;
    }
    
    // メタデータをチェック
    const metadataString = await AsyncStorage.getItem(METADATA_KEY);
    if (!metadataString) {
      return { track: [], distance: 0, lastTimeStamp: 0 };
    }
    
    const metadata = JSON.parse(metadataString);
    const allTracks: LocationType[] = [];
    
    // 各チャンクを読み込んで結合
    for (const chunkKey of metadata.chunks) {
      const chunkData = await AsyncStorage.getItem(chunkKey);
      if (chunkData) {
        const chunk = JSON.parse(chunkData) as TrackLogType;
        allTracks.push(...chunk.track);
      }
    }
    
    return {
      track: allTracks,
      distance: metadata.distance,
      lastTimeStamp: metadata.lastTimeStamp,
    };
  } catch (error) {
    console.error('Failed to get chunked locations:', error);
    return { track: [], distance: 0, lastTimeStamp: 0 };
  }
};

// チャンクを全て削除する新しい関数
export const clearStoredLocationsChunked = async (): Promise<void> => {
  try {
    // 通常のキーを削除
    await AsyncStorage.removeItem(STORAGE.TRACKLOG);
    
    // メタデータを取得
    const metadataString = await AsyncStorage.getItem(METADATA_KEY);
    if (metadataString) {
      const metadata = JSON.parse(metadataString);
      
      // 各チャンクを削除
      for (const chunkKey of metadata.chunks) {
        await AsyncStorage.removeItem(chunkKey);
      }
      
      // メタデータを削除
      await AsyncStorage.removeItem(METADATA_KEY);
    }
  } catch (error) {
    console.error('Failed to clear chunked locations:', error);
  }
};

// 既存の関数（互換性のため残す）
export const storeLocations = async (data: TrackLogType) => {
  // チャンク分割版を使用
  await storeLocationsChunked(data);
};

export const clearStoredLocations = async () => {
  // チャンク分割版を使用
  await clearStoredLocationsChunked();
};

export const getStoredLocations = async (): Promise<TrackLogType> => {
  // チャンク分割版を使用
  return getStoredLocationsChunked();
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
