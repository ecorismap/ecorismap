import { LocationType } from '../types';

// トラックログを分割するユーティリティ
export const splitTrackLog = (locations: LocationType[], maxPointsPerSegment: number = 5000): LocationType[][] => {
  const segments: LocationType[][] = [];
  
  for (let i = 0; i < locations.length; i += maxPointsPerSegment) {
    segments.push(locations.slice(i, i + maxPointsPerSegment));
  }
  
  return segments;
};

// 分割されたトラックログのサイズを推定（MB単位）
export const estimateTrackLogSize = (locations: LocationType[]): number => {
  if (locations.length === 0) return 0;
  
  const sampleSize = Math.min(100, locations.length);
  const sample = locations.slice(0, sampleSize);
  const sampleSizeBytes = new Blob([JSON.stringify(sample)]).size;
  const estimatedTotalBytes = (sampleSizeBytes / sampleSize) * locations.length;
  return estimatedTotalBytes / (1024 * 1024);
};

// 安全なサイズに分割するためのポイント数を計算
export const calculateSafeSegmentSize = (locations: LocationType[]): number => {
  if (locations.length === 0) return 0;
  
  const estimatedSizeMB = estimateTrackLogSize(locations);
  const targetSizeMB = 1.5; // 1.5MB以下を目標（安全マージン）
  
  if (estimatedSizeMB <= targetSizeMB) {
    return locations.length; // 分割不要
  }
  
  // 必要な分割数を計算
  const segmentCount = Math.ceil(estimatedSizeMB / targetSizeMB);
  return Math.ceil(locations.length / segmentCount);
};