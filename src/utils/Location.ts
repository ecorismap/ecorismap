import { LocationType, TrackLogType } from '../types';
import { LocationObject, LocationObjectCoords } from 'expo-location';
import * as turf from '@turf/turf';
import { trackLogMMKV } from './mmkvStorage';

// チャンク管理用の定数
export const CHUNK_SIZE = 500;
export const DISPLAY_BUFFER_SIZE = 500;

// チャンク管理用のタイプ
export interface TrackChunkMetadata {
  totalChunks: number;
  totalPoints: number;
  lastChunkIndex: number;
  lastTimeStamp: number;
}

// MMKVを使用したシンプルな実装（チャンク処理不要）
export const storeLocations = (data: TrackLogType): void => {
  // MMKVは大容量データも効率的に処理可能（2MB制限なし）
  trackLogMMKV.setTrackLog(data);
};

export const clearStoredLocations = (): void => {
  trackLogMMKV.clearTrackLog();
  // 空のデータを設定（互換性のため）
  trackLogMMKV.setTrackLog({ track: [], distance: 0, lastTimeStamp: 0 });
  // 現在地もクリア
  trackLogMMKV.setCurrentLocation(null);
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

export const checkAndStoreLocations = (locations: LocationObject[]): void => {
  //MMKVから保存されているトラックログを取得して、現在の位置情報と結合する
  const { distance, track, lastTimeStamp } = getStoredLocations();

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
  storeLocations(updatedLocations);
  
  // 現在地を別途保存（最新の位置情報のみ）
  if (updatedTrackLog.length > 0) {
    trackLogMMKV.setCurrentLocation(updatedTrackLog[updatedTrackLog.length - 1]);
  }
};

// toLocationType関数を先に定義（checkLocationsで使用するため）
export const toLocationType = (locationObject: LocationObject): LocationType => {
  // coordsには既にaltitude, altitudeAccuracyが含まれているので、そのまま使用
  return { ...locationObject.coords, timestamp: locationObject.timestamp };
};

export const checkLocations = (lastTimeStamp: number, locations: LocationObject[]) => {
  if (locations.length === 0) return [];

  // 1. まず変換
  const convertedLocations = locations.map((location) => toLocationType(location));

  // 2. タイムスタンプ逆転チェック - 逆転があれば全データを破棄
  for (let i = 1; i < convertedLocations.length; i++) {
    if (convertedLocations[i].timestamp! <= convertedLocations[i - 1].timestamp!) {
      return [];
    }
  }

  // 3. 最初のデータがlastTimeStampより古ければ全て破棄（逆転チェック済みなので最初だけ確認すればOK）
  if (convertedLocations[0].timestamp! <= lastTimeStamp) {
    return [];
  }

  // 4. ログの取り始め（lastTimeStampが0）の場合のみ精度フィルタリング
  if (lastTimeStamp === 0) {
    return convertedLocations.filter((v) => !v.accuracy || v.accuracy <= 30);
  }

  return convertedLocations;
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

// チャンク保存関数
export const saveTrackChunk = (chunkIndex: number, points: LocationObjectCoords[]): void => {
  trackLogMMKV.setChunk(`track_chunk_${chunkIndex}`, points);
};

// チャンク読み込み関数
export const getTrackChunk = (chunkIndex: number): LocationObjectCoords[] => {
  return trackLogMMKV.getChunk(`track_chunk_${chunkIndex}`) || [];
};

// メタデータ管理
export const getTrackMetadata = (): TrackChunkMetadata => {
  return trackLogMMKV.getMetadata() || {
    totalChunks: 0,
    totalPoints: 0,
    lastChunkIndex: 0,
    lastTimeStamp: 0
  };
};

export const saveTrackMetadata = (metadata: TrackChunkMetadata): void => {
  trackLogMMKV.setMetadata(metadata);
};

// 全チャンクを結合して取得（エクスポート用）
export const getAllTrackPoints = (): LocationObjectCoords[] => {
  const metadata = getTrackMetadata();
  const allPoints: LocationObjectCoords[] = [];
  
  for (let i = 0; i <= metadata.lastChunkIndex; i++) {
    const chunk = getTrackChunk(i);
    allPoints.push(...chunk);
  }
  
  return allPoints;
};

// チャンクデータをクリア
export const clearAllChunks = (): void => {
  const metadata = getTrackMetadata();
  
  for (let i = 0; i <= metadata.lastChunkIndex; i++) {
    trackLogMMKV.removeChunk(`track_chunk_${i}`);
  }
  
  saveTrackMetadata({
    totalChunks: 0,
    totalPoints: 0,
    lastChunkIndex: 0,
    lastTimeStamp: 0
  });
};
