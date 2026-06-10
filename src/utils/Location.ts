import { LocationType, TrackLogType, TrackSegmentType } from '../types';
import * as turf from '@turf/turf';
import { trackLogMMKV } from './mmkvStorage';
import { cleanupLine } from './Coords';
import { TRACK_ACCURACY } from '../constants/AppConstants';

// チャンク管理用の定数
export const CHUNK_SIZE = 500;
export const DISPLAY_BUFFER_SIZE = 500;

// チャンク管理用のタイプ
export interface TrackChunkMetadata {
  totalChunks: number;
  totalPoints: number;
  lastChunkIndex: number;
  lastTimeStamp: number;
  // 累積総距離(km)。記録開始からの合計（チャンクを跨いで増分加算する）。
  currentDistance: number;
}

// ---------------------------------------------------------------------------
// 書き込みスルー型メモリ内キャッシュ
// GPS 1点ごとのMMKV往復(getString/JSON.parse)とturf距離計算を排除するため、
// 現在のチャンクとメタデータをメモリに保持する。MMKVへの書き込みはスロットルし、
// rollover時とflush時、フォアグラウンド/停止/保存時には必ず書き込む。
//
// 重要: headlessタスク(アプリkill時)はメインとは別のJSコンテキストで動くため、
// このキャッシュは共有されない。MMKVが唯一のコンテキスト間共有・永続の真実の源。
// headless側ではタスク先頭でresetTrackLogCache()・末尾でflushTrackLog()を呼び、
// 毎回MMKVから読み・書きすることでキャッシュのドリフトを避ける。
// ---------------------------------------------------------------------------
const WRITE_EVERY_N = 10; // 未完成チャンクの書き込みは最大Nポイントに1回
const WRITE_INTERVAL_MS = 3000; // または数秒ごと

interface TrackLogCache {
  currentChunk: LocationType[]; // index>0 のときはつなぎ目を element0 に含む（getCurrentChunkと同形）
  metadata: TrackChunkMetadata;
  lastAppendedPoint: LocationType | null; // 増分距離計算用に最後に追加した点
}

let cache: TrackLogCache | null = null;
let pendingWrites = 0;
let lastFlushTs = 0;

// turf非依存の軽量な大圏距離(km)。turf.length(getLineLength)と同じ地球半径6371kmを使用し、
// ライブ表示の累積距離が保存時の最終距離とほぼ一致するようにする。
export const haversineKm = (a: LocationType, b: LocationType): number => {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

// キャッシュを破棄する。次回アクセス時にMMKVから再ハイドレートされる。
export const resetTrackLogCache = (): void => {
  cache = null;
  pendingWrites = 0;
  lastFlushTs = 0;
};

// キャッシュが無ければMMKVから読み込んで構築する。
const ensureCache = (): TrackLogCache => {
  if (cache) return cache;
  const metadata = getTrackMetadata();
  const { chunk } = getCurrentChunk();
  cache = {
    currentChunk: chunk,
    metadata,
    lastAppendedPoint: chunk.length > 0 ? chunk[chunk.length - 1] : null,
  };
  return cache;
};

// キャッシュの現在チャンク+メタデータをMMKVへ書き込む。
const persistCache = (): void => {
  if (!cache) return;
  const { currentChunk, metadata } = cache;
  const currentChunkIndex = metadata.lastChunkIndex;
  saveTrackMetadata(metadata);
  if (currentChunk.length > 0) {
    // つなぎ目を除いて保存（2番目以降のチャンクは最初の点を除外）
    const chunkToSave = currentChunkIndex > 0 && currentChunk.length > 1 ? currentChunk.slice(1) : currentChunk;
    saveTrackChunk(currentChunkIndex, chunkToSave);
  } else {
    saveTrackChunk(currentChunkIndex, []);
  }
  pendingWrites = 0;
  lastFlushTs = Date.now();
};

// 未書き込みのキャッシュ内容を強制的にMMKVへ書き込む（バックグラウンド移行/停止/保存前に呼ぶ）。
export const flushTrackLog = (): void => {
  persistCache();
};

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

export type LocationObjectInput = {
  coords: {
    latitude: number;
    longitude: number;
    altitude?: number | null;
    accuracy?: number | null;
    altitudeAccuracy?: number | null;
    heading?: number | null;
    speed?: number | null;
  };
  timestamp: number;
};


/**
 * BackgroundGeolocationからの位置情報を統一されたLocationObjectInput形式に変換する
 */
export const toLocationObject = (location: any): LocationObjectInput => {
  const timestamp =
    typeof location?.timestamp === 'string' ? new Date(location.timestamp).getTime() : (location?.timestamp ?? Date.now());

  return {
    coords: {
      latitude: location?.coords?.latitude ?? 0,
      longitude: location?.coords?.longitude ?? 0,
      altitude: location?.coords?.altitude ?? null,
      accuracy: location?.coords?.accuracy ?? null,
      altitudeAccuracy: location?.coords?.altitude_accuracy ?? null,
      heading: location?.coords?.heading ?? null,
      speed: location?.coords?.speed ?? null,
    },
    timestamp,
  };
};

export const checkAndStoreLocations = (
  locations: LocationObjectInput[]
): { metadata: TrackChunkMetadata; chunk: LocationType[] } | null => {
  // トラッキングがOFFの場合は軌跡を保存しない（GPSのみONでの記録を防止）
  if (trackLogMMKV.getTrackingState() !== 'on') return null;

  // キャッシュ（無ければMMKVからハイドレート）から最終タイムスタンプを取得
  const c = ensureCache();

  // 位置情報の検証とフィルタリング
  const checkedLocations = checkLocations(c.metadata.lastTimeStamp, locations);

  if (checkedLocations.length === 0) return null;

  // チャンクシステムに追加（これが唯一のデータ保存）
  const result = addLocationsToChunks(checkedLocations);

  // 現在地を別途保存（互換性のため）
  const lastPoint = result.chunk[result.chunk.length - 1];
  if (lastPoint) {
    trackLogMMKV.setCurrentLocation(lastPoint);
  }

  return result;
};

// toLocationType関数を先に定義（checkLocationsで使用するため）
export const toLocationType = (locationObject: LocationObjectInput): LocationType => {
  // coordsには既にaltitude, altitudeAccuracyが含まれているので、そのまま使用
  return { ...locationObject.coords, timestamp: locationObject.timestamp };
};

export const checkLocations = (lastTimeStamp: number, locations: LocationObjectInput[]) => {
  if (locations.length === 0) return [];

  // 1. まず変換
  const convertedLocations = locations.map((location) => toLocationType(location));

  // 2. タイムスタンプ逆転チェック - 逆転があれば全データを破棄
  for (let i = 1; i < convertedLocations.length; i++) {
    if (convertedLocations[i].timestamp! <= convertedLocations[i - 1].timestamp!) {
      return [];
    }
  }

  // 3. lastTimeStampより新しいデータのみをフィルタリング
  let filteredLocations = convertedLocations.filter((location) => location.timestamp! > lastTimeStamp);

  // 4. 精度フィルタリング（常時適用）
  // GPS精度が100m超の場合はその点をスキップ（極端に悪いデータを除外）
  // 30m〜100mの低精度データは記録し、表示時に破線で区別する
  filteredLocations = filteredLocations.filter((v) => !v.accuracy || v.accuracy <= TRACK_ACCURACY.RECORD);

  return filteredLocations;
};

export const isLocationObject = (d: any): d is { locations: LocationObjectInput[] } => {
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
const getCurrentChunk = (): { chunk: LocationType[]; index: number } => {
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

// toLocationObjectCoordsは不要になったので削除
// LocationTypeをそのまま使用する

// チャンクシステムに位置情報を追加
// メモリ内キャッシュを更新し、戻り値で最新のmetadata/現在チャンクを返す。
// MMKVへの書き込みは rollover時は必ず、未完成チャンクはスロットルして行う。
export const addLocationsToChunks = (
  locations: LocationType[]
): { metadata: TrackChunkMetadata; chunk: LocationType[] } => {
  const c = ensureCache();
  const metadata = c.metadata;
  let currentChunk = c.currentChunk;
  let currentChunkIndex = metadata.lastChunkIndex;
  let lastAppended = c.lastAppendedPoint;

  let totalPointsAdded = 0;
  let distanceAdded = 0;
  let rolledOver = false;

  for (const location of locations) {
    // 増分距離（最後に追加した点からの大圏距離を加算）。チャンクを跨いでも連続して加算する。
    if (lastAppended) {
      distanceAdded += haversineKm(lastAppended, location);
    }
    lastAppended = location;

    // 現在のチャンクに追加（保存と表示を兼ねる）
    currentChunk.push(location);
    totalPointsAdded++;

    // チャンクが満杯（500点＋つなぎ目1点）になったら保存して新しいチャンクへ
    // 注意: currentChunkIndex > 0 の場合、最初の点はつなぎ目なので501点で満杯
    const chunkSizeThreshold = currentChunkIndex > 0 ? CHUNK_SIZE + 1 : CHUNK_SIZE;

    if (currentChunk.length >= chunkSizeThreshold) {
      // 現在のチャンクの最後の点を保持（次のチャンクのつなぎ目用）
      const lastPointOfCurrentChunk = currentChunk[currentChunk.length - 1];

      // つなぎ目を除いてチャンクを保存（2番目以降のチャンクは最初の点を除外）
      const chunkToSave = currentChunkIndex > 0 ? currentChunk.slice(1) : currentChunk;

      // 完成チャンクは即保存（cleanupはトラック保存時に実行）
      saveTrackChunk(currentChunkIndex, chunkToSave);

      // メタデータを更新
      currentChunkIndex++;
      metadata.lastChunkIndex = currentChunkIndex;
      metadata.totalChunks++;

      // 新しいチャンクを開始（前のチャンクの最後の点を含める）
      currentChunk = [lastPointOfCurrentChunk];
      rolledOver = true;
    }
  }

  // メタデータを更新
  metadata.totalPoints += totalPointsAdded;
  // 実際に追加された最後の点のタイムスタンプを使用（フィルタリング後のデータ）
  if (locations.length > 0) {
    metadata.lastTimeStamp = locations[locations.length - 1]?.timestamp || Date.now();
  }
  metadata.currentDistance += distanceAdded; // 累積総距離に加算
  metadata.lastChunkIndex = currentChunkIndex;

  // キャッシュを更新
  c.currentChunk = currentChunk;
  c.lastAppendedPoint = lastAppended;

  // 書き込み: rollover時は必ず（metadata.lastChunkIndexとMMKV上のチャンクの整合のため）。
  // それ以外はスロットル（Nポイントごと、または数秒ごと）。
  pendingWrites += totalPointsAdded;
  const now = Date.now();
  if (rolledOver || pendingWrites >= WRITE_EVERY_N || now - lastFlushTs >= WRITE_INTERVAL_MS) {
    persistCache();
  }

  return { metadata, chunk: currentChunk };
};

// 表示用バッファを取得（現在のチャンクを取得）
// 注意: パフォーマンスのため配列の参照を直接返す（コピーしない）
// キャッシュがあればメモリから返す（MMKVのparseを回避）。無ければMMKVから読む。
export const getDisplayBuffer = (): LocationType[] => {
  if (cache) return cache.currentChunk;
  const { chunk } = getCurrentChunk();
  return chunk; // 配列のコピーを作らず直接返す
};

// 現在のチャンク情報を取得（デバッグ用）
export const getCurrentChunkInfo = () => {
  if (cache) {
    return {
      currentChunkIndex: cache.metadata.lastChunkIndex,
      currentChunkSize: cache.currentChunk.length,
      displayBufferSize: cache.currentChunk.length,
    };
  }
  const { chunk, index } = getCurrentChunk();
  return {
    currentChunkIndex: index,
    currentChunkSize: chunk.length,
    displayBufferSize: chunk.length, // 統一されたので同じ値
  };
};

// チャンク保存関数
export const saveTrackChunk = (chunkIndex: number, points: LocationType[]): void => {
  trackLogMMKV.setChunk(`track_chunk_${chunkIndex}`, points);
};

// チャンク読み込み関数
export const getTrackChunk = (chunkIndex: number): LocationType[] => {
  return trackLogMMKV.getChunk(`track_chunk_${chunkIndex}`) || [];
};

export const simplifyLocations = (points: LocationType[] = [], maxPoints = 250): LocationType[] => {
  if (!points || points.length === 0) {
    return [];
  }

  if (points.length <= maxPoints) {
    return points.slice();
  }

  const step = Math.ceil(points.length / maxPoints);
  const simplified: LocationType[] = [];

  for (let i = 0; i < points.length; i += step) {
    simplified.push(points[i]);
  }

  const lastPoint = points[points.length - 1];
  const lastSimplified = simplified[simplified.length - 1];

  if (
    !lastSimplified ||
    lastSimplified.timestamp !== lastPoint.timestamp ||
    lastSimplified.latitude !== lastPoint.latitude ||
    lastSimplified.longitude !== lastPoint.longitude
  ) {
    simplified.push(lastPoint);
  }

  return simplified;
};

export const getTrackChunkForDisplay = (chunkIndex: number, maxPoints = 250): LocationType[] => {
  const chunk = getTrackChunk(chunkIndex);
  return simplifyLocations(chunk, maxPoints);
};

export const getDisplayBufferSimplified = (maxPoints = DISPLAY_BUFFER_SIZE): LocationType[] => {
  return simplifyLocations(getDisplayBuffer(), maxPoints);
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
export const getAllTrackPoints = (): LocationType[] => {
  // メモリ内の未書き込みポイントもMMKVへ反映してから読み出す（保存の取りこぼし防止）
  flushTrackLog();
  const metadata = getTrackMetadata();
  const allPoints: LocationType[] = [];

  for (let i = 0; i <= metadata.lastChunkIndex; i++) {
    const chunk = getTrackChunk(i);
    allPoints.push(...chunk);
  }

  // 全体に対してcleanupLineを適用（トラック保存時に一括処理）
  if (allPoints.length > 0) {
    return cleanupLine(allPoints);
  }

  return allPoints;
};

// チャンクデータをクリア
export const clearAllChunks = (): void => {
  const metadata = getTrackMetadata();
  // 未flushのキャッシュがMMKVより進んでいる可能性があるため、両者の大きい方まで削除する
  const maxChunkIndex = Math.max(metadata.lastChunkIndex, cache?.metadata.lastChunkIndex ?? 0);

  for (let i = 0; i <= maxChunkIndex; i++) {
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

  // メモリ内キャッシュも破棄（次回アクセス時にクリア済みのMMKVから再構築）
  resetTrackLogCache();
};

/**
 * 位置が低精度かどうかを判定
 * @param location 位置情報
 * @returns accuracy > 30m の場合は true
 */
export const isLowAccuracy = (location: LocationType): boolean => {
  return location.accuracy != null && location.accuracy > TRACK_ACCURACY.HIGH;
};

/**
 * トラックログを精度に基づいてセグメントに分割する
 * - accuracy <= 30m: 高精度（実線表示）
 * - 30m < accuracy <= 100m: 低精度（破線表示）
 * セグメント境界では最後の点を次のセグメント先頭にも含める（連続性確保）
 */
export const splitTrackByAccuracy = (locations: LocationType[]): TrackSegmentType[] => {
  if (locations.length === 0) return [];

  const segments: TrackSegmentType[] = [];
  let currentSegment: LocationType[] = [];
  let currentIsLowAccuracy = isLowAccuracy(locations[0]);

  for (let i = 0; i < locations.length; i++) {
    const location = locations[i];
    const locationIsLowAccuracy = isLowAccuracy(location);

    if (locationIsLowAccuracy !== currentIsLowAccuracy && currentSegment.length > 0) {
      // セグメントの切り替わり - 最後の点を次のセグメントの先頭にも含める（連続性確保）
      segments.push({
        coordinates: currentSegment,
        isLowAccuracy: currentIsLowAccuracy,
      });
      currentSegment = [currentSegment[currentSegment.length - 1]];
      currentIsLowAccuracy = locationIsLowAccuracy;
    }

    currentSegment.push(location);
  }

  // 最後のセグメントを追加
  if (currentSegment.length > 0) {
    segments.push({
      coordinates: currentSegment,
      isLowAccuracy: currentIsLowAccuracy,
    });
  }

  return segments;
};
