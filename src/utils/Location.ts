import { LocationType, TrackLogType } from '../types';
import { LocationObject, LocationObjectCoords } from 'expo-location';
import * as turf from '@turf/turf';
import { trackLogMMKV, debugLogMMKV } from './mmkvStorage';
import { AppState } from 'react-native';

// チャンク管理用の定数
export const CHUNK_SIZE = 500;
export const DISPLAY_BUFFER_SIZE = 500;

// チャンク管理用のタイプ
export interface TrackChunkMetadata {
  totalChunks: number;
  totalPoints: number;
  lastChunkIndex: number;
  lastTimeStamp: number;
  currentDistance: number;
}

export const clearStoredLocations = (): void => {
  // すべてのチャンクデータをクリア
  clearAllChunks();
  // 現在地もクリア
  trackLogMMKV.setCurrentLocation(null);
};

export const getStoredLocations = (): TrackLogType => {
  // チャンクシステムから直接表示データを取得
  const metadata = getTrackMetadata();
  
  // 表示用バッファから最新の500点を取得
  const track = getDisplayBuffer();

  return {
    track,
    distance: metadata.currentDistance, // メタデータから距離を取得
    lastTimeStamp: metadata.lastTimeStamp,
  };
};

export const checkAndStoreLocations = (locations: LocationObject[]): void => {
  // メタデータから最終タイムスタンプを取得
  const metadata = getTrackMetadata();
  const beforeCheck = locations.length;
  const appState = AppState.currentState;

  // デバッグログ: 受信した位置情報
  debugLogMMKV.addLog({
    timestamp: Date.now(),
    type: 'location-received',
    appState,
    data: {
      locationsCount: beforeCheck,
      lastTimeStamp: metadata.lastTimeStamp,
      currentChunkIndex: metadata.lastChunkIndex,
      totalPoints: metadata.totalPoints,
    }
  });

  // 位置情報の検証とフィルタリング
  const checkedLocations = checkLocations(metadata.lastTimeStamp, locations);

  // デバッグログ: チェック後の結果
  debugLogMMKV.addLog({
    timestamp: Date.now(),
    type: 'check-locations',
    appState,
    data: {
      input: beforeCheck,
      output: checkedLocations.length,
      rejected: beforeCheck - checkedLocations.length,
      lastTimeStamp: metadata.lastTimeStamp,
    }
  });

  if (checkedLocations.length > 0) {
    // チャンクシステムに追加（これが唯一のデータ保存）
    addLocationsToChunks(checkedLocations);

    // デバッグログ: チャンク更新後
    const updatedMetadata = getTrackMetadata();
    const currentChunkInfo = getCurrentChunkInfo();
    debugLogMMKV.addLog({
      timestamp: Date.now(),
      type: 'chunk-updated',
      appState,
      data: {
        chunkIndex: updatedMetadata.lastChunkIndex,
        chunkSize: currentChunkInfo.currentChunkSize,
        totalPoints: updatedMetadata.totalPoints,
        distance: updatedMetadata.currentDistance,
      }
    });

    // 現在地を別途保存（互換性のため）
    const displayData = getDisplayBuffer();
    if (displayData.length > 0) {
      trackLogMMKV.setCurrentLocation(displayData[displayData.length - 1]);
    }
  }
};

// toLocationType関数を先に定義（checkLocationsで使用するため）
export const toLocationType = (locationObject: LocationObject): LocationType => {
  // coordsには既にaltitude, altitudeAccuracyが含まれているので、そのまま使用
  return { ...locationObject.coords, timestamp: locationObject.timestamp };
};

export const checkLocations = (lastTimeStamp: number, locations: LocationObject[]) => {
  if (locations.length === 0) return [];

  const currentTime = Date.now();
  const MAX_TIME_DIFF = 5 * 60 * 1000; // 5分以上古いデータは破棄
  const rejectionReasons: string[] = [];

  // 1. まず変換
  const convertedLocations = locations.map((location) => toLocationType(location));

  // 2. タイムスタンプ逆転チェック - 逆転があれば全データを破棄
  for (let i = 1; i < convertedLocations.length; i++) {
    if (convertedLocations[i].timestamp! <= convertedLocations[i - 1].timestamp!) {
      debugLogMMKV.addLog({
        timestamp: Date.now(),
        type: 'error',
        appState: AppState.currentState,
        error: 'Timestamp reversal detected',
        data: {
          current: convertedLocations[i].timestamp,
          previous: convertedLocations[i - 1].timestamp,
          index: i,
          totalLocations: convertedLocations.length,
        }
      });
      return [];
    }
  }

  // 3. lastTimeStampより新しいデータのみをフィルタリング
  const beforeLastTimestampFilter = convertedLocations.length;
  let filteredLocations = convertedLocations.filter((location) => location.timestamp! > lastTimeStamp);
  
  if (beforeLastTimestampFilter !== filteredLocations.length) {
    rejectionReasons.push(`Rejected ${beforeLastTimestampFilter - filteredLocations.length} old timestamps (before ${lastTimeStamp})`);
  }

  // 4. 現在時刻から大きく離れた古いデータを除外
  const beforeTimeFilter = filteredLocations.length;
  filteredLocations = filteredLocations.filter((location) => {
    const timeDiff = currentTime - location.timestamp!;
    if (timeDiff > MAX_TIME_DIFF) {
      return false;
    }
    return true;
  });
  
  if (beforeTimeFilter !== filteredLocations.length) {
    rejectionReasons.push(`Rejected ${beforeTimeFilter - filteredLocations.length} locations older than 5 minutes`);
  }

  // 5. ログの取り始め（lastTimeStampが0）の場合のみ精度フィルタリング
  if (lastTimeStamp === 0) {
    const beforeAccuracyFilter = filteredLocations.length;
    filteredLocations = filteredLocations.filter((v) => !v.accuracy || v.accuracy <= 30);
    
    if (beforeAccuracyFilter !== filteredLocations.length) {
      rejectionReasons.push(`Rejected ${beforeAccuracyFilter - filteredLocations.length} locations with poor accuracy`);
    }
  }

  // デバッグログ: フィルタリング理由を記録
  if (rejectionReasons.length > 0) {
    debugLogMMKV.addLog({
      timestamp: Date.now(),
      type: 'check-locations',
      appState: AppState.currentState,
      data: {
        rejectionReasons,
        originalCount: locations.length,
        filteredCount: filteredLocations.length,
      }
    });
  }

  return filteredLocations;
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

// 現在のチャンク状態をMMKVから取得（つなぎ目付き）
const getCurrentChunk = (): { chunk: LocationObjectCoords[]; index: number } => {
  const metadata = getTrackMetadata();
  const index = metadata.lastChunkIndex;
  let chunk = getTrackChunk(index) || [];
  
  // 2番目以降のチャンクの場合、つなぎ目を復元
  // 注意：チャンクが空でもつなぎ目は必要
  if (index > 0) {
    const prevChunk = getTrackChunk(index - 1);
    if (prevChunk && prevChunk.length > 0) {
      chunk = [prevChunk[prevChunk.length - 1], ...chunk];
    }
  }
  
  return { chunk, index };
};

// LocationTypeをLocationObjectCoordsに変換
const toLocationObjectCoords = (location: LocationType): LocationObjectCoords => {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    altitude: location.altitude ?? null,
    accuracy: location.accuracy ?? null,
    altitudeAccuracy: location.altitudeAccuracy ?? null,
    heading: location.heading ?? null,
    speed: location.speed ?? null,
  };
};

// チャンクシステムに位置情報を追加
export const addLocationsToChunks = (locations: LocationType[]): void => {
  const metadata = getTrackMetadata();
  
  // MMKVから現在のチャンク状態を取得（つなぎ目付き）
  let { chunk: currentChunk, index: currentChunkIndex } = getCurrentChunk();
  
  let totalPointsAdded = 0;

  for (const location of locations) {
    const coords = toLocationObjectCoords(location);

    // 現在のチャンクに追加（保存と表示を兼ねる）
    currentChunk.push(coords);
    totalPointsAdded++;

    // チャンクが満杯（500点＋つなぎ目1点）になったら保存して新しいチャンクへ
    // 注意: currentChunkIndex > 0 の場合、最初の点はつなぎ目なので501点で満杯
    const chunkSizeThreshold = currentChunkIndex > 0 ? CHUNK_SIZE + 1 : CHUNK_SIZE;
    
    if (currentChunk.length >= chunkSizeThreshold) {
      // 現在のチャンクの最後の点を保持（次のチャンクのつなぎ目用）
      const lastPointOfCurrentChunk = currentChunk[currentChunk.length - 1];
      
      // つなぎ目を除いてチャンクを保存（2番目以降のチャンクは最初の点を除外）
      const chunkToSave = currentChunkIndex > 0 ? currentChunk.slice(1) : currentChunk;
      saveTrackChunk(currentChunkIndex, chunkToSave);
      
      // デバッグログ: チャンク保存
      debugLogMMKV.addLog({
        timestamp: Date.now(),
        type: 'chunk-saved',
        appState: AppState.currentState,
        data: {
          chunkIndex: currentChunkIndex,
          chunkSize: chunkToSave.length,
          totalChunks: metadata.totalChunks + 1,
        }
      });

      // メタデータを更新
      currentChunkIndex++;
      metadata.lastChunkIndex = currentChunkIndex;
      metadata.totalChunks++;

      // 新しいチャンクを開始（前のチャンクの最後の点を含める）
      currentChunk = [lastPointOfCurrentChunk];
    }
  }

  // 距離を計算（現在のチャンクの距離）
  const currentDistance = currentChunk.length >= 2 ? getLineLength(currentChunk) : 0;

  // メタデータを更新
  metadata.totalPoints += totalPointsAdded;
  metadata.lastTimeStamp = locations[locations.length - 1]?.timestamp || Date.now();
  metadata.currentDistance = currentDistance; // 距離を保存
  metadata.lastChunkIndex = currentChunkIndex; // 現在のチャンクインデックスも保存
  saveTrackMetadata(metadata);

  // 現在のチャンクを常に保存（表示用データとして使用される）
  // 注意: 表示時はつなぎ目を含むが、保存時は除外する
  if (currentChunk.length > 0) {
    // つなぎ目を除いて保存（2番目以降のチャンクは最初の点を除外）
    const chunkToSave = currentChunkIndex > 0 && currentChunk.length > 1 
      ? currentChunk.slice(1) 
      : currentChunk;
    saveTrackChunk(currentChunkIndex, chunkToSave);
  } else {
    // 空のチャンクも保存（新しいチャンクが作成されたが、まだポイントがない場合）
    saveTrackChunk(currentChunkIndex, []);
  }
};

// 表示用バッファを取得（現在のチャンクを取得）
export const getDisplayBuffer = (): LocationObjectCoords[] => {
  const { chunk } = getCurrentChunk();
  return [...chunk];
};

// 現在のチャンク情報を取得（デバッグ用）
export const getCurrentChunkInfo = () => {
  const { chunk, index } = getCurrentChunk();
  return {
    currentChunkIndex: index,
    currentChunkSize: chunk.length,
    displayBufferSize: chunk.length, // 統一されたので同じ値
  };
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
  return (
    trackLogMMKV.getMetadata() || {
      totalChunks: 0,
      totalPoints: 0,
      lastChunkIndex: 0,
      lastTimeStamp: 0,
      currentDistance: 0,
    }
  );
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
    lastTimeStamp: 0,
    currentDistance: 0,
  });

  // MMKVに空のチャンクを保存して初期化
  saveTrackChunk(0, []);
};
