import { splitTrackLog, estimateTrackLogSize, calculateSafeSegmentSize } from '../TrackLogSplitter';
import { LocationType } from '../../types';

describe('TrackLogSplitter', () => {
  // ダミーのトラックログデータを生成
  const generateTrackPoints = (count: number): LocationType[] => {
    const points: LocationType[] = [];
    const baseTime = Date.now();
    
    for (let i = 0; i < count; i++) {
      points.push({
        latitude: 35.6762 + (Math.random() - 0.5) * 0.1,
        longitude: 139.6503 + (Math.random() - 0.5) * 0.1,
        altitude: Math.random() * 100,
        accuracy: 5 + Math.random() * 25,
        altitudeAccuracy: Math.random() * 10,
        heading: Math.random() * 360,
        speed: Math.random() * 30,
        timestamp: baseTime + i * 1000,
      });
    }
    
    return points;
  };

  describe('splitTrackLog', () => {
    it('should split track log into segments', () => {
      const points = generateTrackPoints(10000);
      const segments = splitTrackLog(points, 3000);
      
      expect(segments.length).toBe(4); // 10000 / 3000 = 3.33... → 4 segments
      expect(segments[0].length).toBe(3000);
      expect(segments[1].length).toBe(3000);
      expect(segments[2].length).toBe(3000);
      expect(segments[3].length).toBe(1000);
    });

    it('should return single segment for small data', () => {
      const points = generateTrackPoints(1000);
      const segments = splitTrackLog(points, 3000);
      
      expect(segments.length).toBe(1);
      expect(segments[0].length).toBe(1000);
    });

    it('should handle empty array', () => {
      const segments = splitTrackLog([], 3000);
      expect(segments.length).toBe(0);
    });

    it('should preserve data integrity', () => {
      const points = generateTrackPoints(5000);
      const segments = splitTrackLog(points, 2000);
      
      // 全セグメントを結合すると元のデータと一致することを確認
      const reconstructed = segments.flat();
      expect(reconstructed).toEqual(points);
      expect(reconstructed.length).toBe(points.length);
    });
  });

  describe('estimateTrackLogSize', () => {
    it('should estimate size correctly for small data', () => {
      const points = generateTrackPoints(100);
      const sizeMB = estimateTrackLogSize(points);
      
      // 100ポイントは約20KB（0.02MB）程度
      expect(sizeMB).toBeGreaterThan(0);
      expect(sizeMB).toBeLessThan(0.1);
    });

    it('should estimate size correctly for large data', () => {
      const points = generateTrackPoints(10000);
      const sizeMB = estimateTrackLogSize(points);
      
      // 10000ポイントは約2MB程度
      expect(sizeMB).toBeGreaterThan(1);
      expect(sizeMB).toBeLessThan(3);
    });

    it('should handle empty array', () => {
      const sizeMB = estimateTrackLogSize([]);
      expect(sizeMB).toBe(0);
    });

    it('should scale linearly with data size', () => {
      const points1000 = generateTrackPoints(1000);
      const points2000 = generateTrackPoints(2000);
      
      const size1000 = estimateTrackLogSize(points1000);
      const size2000 = estimateTrackLogSize(points2000);
      
      // 2倍のデータは約2倍のサイズ（誤差20%以内）
      const ratio = size2000 / size1000;
      expect(ratio).toBeGreaterThan(1.8);
      expect(ratio).toBeLessThan(2.2);
    });
  });

  describe('calculateSafeSegmentSize', () => {
    it('should not split small data', () => {
      const points = generateTrackPoints(1000);
      const segmentSize = calculateSafeSegmentSize(points);
      
      // 小さなデータは分割不要
      expect(segmentSize).toBe(points.length);
    });

    it('should calculate appropriate segment size for large data', () => {
      const points = generateTrackPoints(20000); // 約4MB
      const segmentSize = calculateSafeSegmentSize(points);
      
      // 1.5MB以下になるように分割
      expect(segmentSize).toBeLessThan(10000);
      expect(segmentSize).toBeGreaterThanOrEqual(5000);
    });

    it('should ensure segments are under target size', () => {
      const points = generateTrackPoints(15000);
      const segmentSize = calculateSafeSegmentSize(points);
      
      // 計算されたサイズで分割した場合のサイズを確認
      const segments = splitTrackLog(points, segmentSize);
      
      for (const segment of segments) {
        const segmentSizeMB = estimateTrackLogSize(segment);
        expect(segmentSizeMB).toBeLessThanOrEqual(1.6); // 目標の1.5MB + 誤差マージン
      }
    });

    it('should handle edge cases', () => {
      // 空配列
      expect(calculateSafeSegmentSize([])).toBe(0);
      
      // 1ポイントのみ
      const singlePoint = generateTrackPoints(1);
      expect(calculateSafeSegmentSize(singlePoint)).toBe(1);
    });
  });

  describe('Integration test', () => {
    it('should handle real-world scenario', () => {
      // 3時間のトラッキング（1秒に1ポイント）
      const points = generateTrackPoints(10800);
      
      // サイズを推定
      const totalSizeMB = estimateTrackLogSize(points);
      console.log(`3 hours tracking: ${points.length} points, ${totalSizeMB.toFixed(2)} MB`);
      
      // 安全なセグメントサイズを計算
      const segmentSize = calculateSafeSegmentSize(points);
      console.log(`Recommended segment size: ${segmentSize} points`);
      
      // 分割
      const segments = splitTrackLog(points, segmentSize);
      console.log(`Split into ${segments.length} segments`);
      
      // 各セグメントのサイズを確認
      let maxSegmentSizeMB = 0;
      for (let i = 0; i < segments.length; i++) {
        const segmentSizeMB = estimateTrackLogSize(segments[i]);
        maxSegmentSizeMB = Math.max(maxSegmentSizeMB, segmentSizeMB);
        console.log(`Segment ${i + 1}: ${segments[i].length} points, ${segmentSizeMB.toFixed(2)} MB`);
      }
      
      // 全セグメントが1.5MB以下であることを確認
      expect(maxSegmentSizeMB).toBeLessThanOrEqual(1.6);
      
      // データの整合性を確認
      const reconstructed = segments.flat();
      expect(reconstructed.length).toBe(points.length);
    });
  });
});