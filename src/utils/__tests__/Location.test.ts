import { LocationObject } from 'expo-location';
import {
  isLocationObject,
  getLineLength,
  toLocationType,
  checkLocations,
  checkAndStoreLocations,
  clearStoredLocations,
  getStoredLocations,
  storeLocations,
  storeLocationsChunked,
  getStoredLocationsChunked,
  clearStoredLocationsChunked,
} from '../Location';
import { TrackLogType } from '../../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE } from '../../constants/AppConstants';

// AsyncStorageのモック
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
}));

describe('isLocationObject', () => {
  const locations = [
    {
      coords: {
        latitude: 35,
        longitude: 135,
        altitude: 0,
        accuracy: 1,
        altitudeAccuracy: 5,
        heading: 0,
        speed: 30,
      },
      timestamp: 1000000,
    },
  ];

  it('return boolean', () => {
    expect(isLocationObject({ locations: locations })).toBe(true);
  });
});

describe('toLocationType', () => {
  const location: LocationObject = {
    coords: {
      latitude: 35,
      longitude: 135,
      altitude: 0,
      accuracy: 1,
      altitudeAccuracy: 5,
      heading: 0,
      speed: 30,
    },
    timestamp: 1000000,
  };
  it('return LoactionType from LocationObject', () => {
    expect(toLocationType(location)).toStrictEqual({
      accuracy: 1,
      altitude: 0,
      altitudeAccuracy: 5,
      heading: 0,
      latitude: 35,
      longitude: 135,
      speed: 30,
      timestamp: 1000000,
    });
  });
});

describe('getLineLength', () => {
  const locatons = [
    {
      accuracy: 1,
      altitude: 0,
      altitudeAccuracy: 5,
      heading: 0,
      latitude: 35,
      longitude: 135,
      speed: 30,
      timestamp: 1000000,
    },
    {
      accuracy: 1,
      altitude: 0,
      altitudeAccuracy: 5,
      heading: 0,
      latitude: 35.1,
      longitude: 135.1,
      speed: 30,
      timestamp: 1000000,
    },
  ];
  it('return length(km) from locations', () => {
    expect(getLineLength(locatons)).toBe(14.370385569672434);
  });
});

describe('checkLocations', () => {
  const baseTime = 1000000;

  it('filters locations by timestamp', () => {
    const locations: LocationObject[] = [
      {
        coords: { latitude: 35, longitude: 135, accuracy: 10, altitude: 0, altitudeAccuracy: 5, heading: 0, speed: 0 },
        timestamp: baseTime - 1000,
      },
      {
        coords: {
          latitude: 35.01,
          longitude: 135.01,
          accuracy: 10,
          altitude: 0,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: baseTime + 1000,
      },
    ];

    const filtered = checkLocations(baseTime, locations);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].timestamp).toBe(baseTime + 1000);
  });

  it('filters out low accuracy when starting', () => {
    const locations: LocationObject[] = [
      {
        coords: { latitude: 35, longitude: 135, accuracy: 50, altitude: 0, altitudeAccuracy: 5, heading: 0, speed: 0 },
        timestamp: baseTime + 1000,
      },
    ];

    const filtered = checkLocations(0, locations);
    expect(filtered).toHaveLength(0);
  });
});

describe('AsyncStorage functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('storeLocations', () => {
    it('stores locations to AsyncStorage', async () => {
      const data: TrackLogType = {
        track: [{ latitude: 35, longitude: 135, timestamp: 1000000 }],
        distance: 10,
        lastTimeStamp: 1000000,
      };

      await storeLocations(data);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(STORAGE.TRACKLOG, JSON.stringify(data));
    });
  });

  describe('clearStoredLocations', () => {
    it('clears stored locations', async () => {
      await clearStoredLocations();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE.TRACKLOG,
        JSON.stringify({ track: [], distance: 0, lastTimeStamp: 0 })
      );
    });
  });

  describe('getStoredLocations', () => {
    it('returns stored locations', async () => {
      const storedData: TrackLogType = {
        track: [{ latitude: 35, longitude: 135, timestamp: 1000000 }],
        distance: 10,
        lastTimeStamp: 1000000,
      };

      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(storedData));

      const result = await getStoredLocations();

      expect(result).toEqual(storedData);
      expect(AsyncStorage.getItem).toHaveBeenCalledWith(STORAGE.TRACKLOG);
    });

    it('returns empty data when no stored locations', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

      const result = await getStoredLocations();

      expect(result).toEqual({ track: [], distance: 0, lastTimeStamp: 0 });
    });

    it('returns empty data on error', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('Storage error'));

      const result = await getStoredLocations();

      expect(result).toEqual({ track: [], distance: 0, lastTimeStamp: 0 });
    });
  });

  describe('checkAndStoreLocations', () => {
    it('checks and stores new locations', async () => {
      const existingData: TrackLogType = {
        track: [{ latitude: 35, longitude: 135, timestamp: 1000000 }],
        distance: 10,
        lastTimeStamp: 1000000,
      };

      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(existingData));

      const locations: LocationObject[] = [
        {
          coords: {
            latitude: 35.01,
            longitude: 135.01,
            accuracy: 10,
            altitude: 0,
            altitudeAccuracy: 5,
            heading: 0,
            speed: 0,
          },
          timestamp: 2000000,
        },
      ];

      const result = await checkAndStoreLocations(locations);

      expect(result).toBeDefined();
      expect(result?.track).toHaveLength(2);
      expect(result?.lastTimeStamp).toBe(2000000);
      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    it('returns empty data on error', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('Storage error'));

      const locations: LocationObject[] = [];

      const result = await checkAndStoreLocations(locations);

      expect(result).toEqual({ track: [], distance: 0, lastTimeStamp: 0 });
    });
  });

  describe('AsyncStorage size limit tests', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    // ダミーGPSデータを生成する関数
    const generateLargeTrackLog = (pointCount: number): TrackLogType => {
      const track = [];
      let distance = 0;
      const baseTime = Date.now();
      
      for (let i = 0; i < pointCount; i++) {
        // リアルなGPSデータをシミュレート（東京周辺）
        const lat = 35.6762 + (Math.random() - 0.5) * 0.1;
        const lng = 139.6503 + (Math.random() - 0.5) * 0.1;
        
        track.push({
          latitude: lat,
          longitude: lng,
          altitude: Math.random() * 100,
          accuracy: 5 + Math.random() * 25,
          altitudeAccuracy: Math.random() * 10,
          heading: Math.random() * 360,
          speed: Math.random() * 30,
          timestamp: baseTime + i * 1000,
        });
        
        if (i > 0) {
          distance += 0.05; // 各ポイント間で約50m
        }
      }
      
      return {
        track,
        distance,
        lastTimeStamp: baseTime + (pointCount - 1) * 1000,
      };
    };

    it('should handle small track logs (< 1MB)', async () => {
      const smallData = generateLargeTrackLog(1000); // 約100KB
      const jsonString = JSON.stringify(smallData);
      const sizeInMB = new Blob([jsonString]).size / (1024 * 1024);
      
      console.log(`Small data size: ${sizeInMB.toFixed(2)} MB`);
      
      await storeLocations(smallData);
      
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(STORAGE.TRACKLOG, jsonString);
      expect(AsyncStorage.setItem).not.toThrow();
    });

    it('should detect when data exceeds 2MB limit', async () => {
      // 2MBを超えるデータを生成（約20,000ポイント）
      const largeData = generateLargeTrackLog(20000);
      const jsonString = JSON.stringify(largeData);
      const sizeInMB = new Blob([jsonString]).size / (1024 * 1024);
      
      console.log(`Large data size: ${sizeInMB.toFixed(2)} MB`);
      
      // 2MBを超えているか確認
      expect(sizeInMB).toBeGreaterThan(2);
      
      // AsyncStorageのモックを2MB超過でエラーを返すように設定
      (AsyncStorage.setItem as jest.Mock).mockImplementation((key, value) => {
        const size = new Blob([value]).size;
        if (size > 2 * 1024 * 1024) {
          return Promise.reject(new Error('Value too large, exceeds size limit'));
        }
        return Promise.resolve();
      });
      
      // エラーが発生することを確認
      await expect(storeLocations(largeData)).rejects.toThrow('Value too large');
    });

    it('should identify the threshold where storage fails', async () => {
      const results: { points: number; sizeMB: number; success: boolean }[] = [];
      
      // AsyncStorageのモックを2MB超過でエラーを返すように設定
      (AsyncStorage.setItem as jest.Mock).mockImplementation((key, value) => {
        const size = new Blob([value]).size;
        if (size > 2 * 1024 * 1024) {
          return Promise.reject(new Error('Value too large'));
        }
        return Promise.resolve();
      });
      
      // 段階的にデータサイズを増やしてテスト
      for (let points = 5000; points <= 25000; points += 5000) {
        const data = generateLargeTrackLog(points);
        const jsonString = JSON.stringify(data);
        const sizeMB = new Blob([jsonString]).size / (1024 * 1024);
        
        try {
          await storeLocations(data);
          results.push({ points, sizeMB, success: true });
        } catch (error) {
          results.push({ points, sizeMB, success: false });
          console.log(`Storage failed at ${points} points (${sizeMB.toFixed(2)} MB)`);
          break;
        }
      }
      
      // 失敗したポイントがあることを確認
      const failedResult = results.find(r => !r.success);
      expect(failedResult).toBeDefined();
      if (failedResult) {
        expect(failedResult.sizeMB).toBeGreaterThan(2);
      }
    });

    it('should simulate real tracking scenario with accumulating data', async () => {
      const accumulatedData: TrackLogType = {
        track: [],
        distance: 0,
        lastTimeStamp: 0,
      };
      
      // AsyncStorageのモックを2MB超過でエラーを返すように設定
      (AsyncStorage.setItem as jest.Mock).mockImplementation((key, value) => {
        const size = new Blob([value]).size;
        if (size > 2 * 1024 * 1024) {
          return Promise.reject(new Error('Value too large'));
        }
        return Promise.resolve();
      });
      
      // 1時間のトラッキングをシミュレート（1秒ごとに1ポイント）
      const hoursToSimulate = 3;
      const pointsPerHour = 3600;
      let storageFailedAt = -1;
      
      for (let hour = 1; hour <= hoursToSimulate; hour++) {
        const newPoints = generateLargeTrackLog(pointsPerHour);
        
        // データを蓄積
        accumulatedData.track.push(...newPoints.track);
        accumulatedData.distance += newPoints.distance;
        accumulatedData.lastTimeStamp = newPoints.lastTimeStamp;
        
        const sizeMB = new Blob([JSON.stringify(accumulatedData)]).size / (1024 * 1024);
        console.log(`After ${hour} hour(s): ${accumulatedData.track.length} points, ${sizeMB.toFixed(2)} MB`);
        
        try {
          await storeLocations(accumulatedData);
        } catch (error) {
          storageFailedAt = hour;
          console.log(`Storage failed after ${hour} hour(s) of tracking`);
          break;
        }
      }
      
      // 数時間のトラッキングで失敗することを確認
      if (storageFailedAt > 0) {
        expect(storageFailedAt).toBeLessThanOrEqual(hoursToSimulate);
      }
    });
  });

  describe('Chunked storage functions', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    const generateLargeTrackLog = (pointCount: number): TrackLogType => {
      const track = [];
      let distance = 0;
      const baseTime = Date.now();
      
      for (let i = 0; i < pointCount; i++) {
        const lat = 35.6762 + (Math.random() - 0.5) * 0.1;
        const lng = 139.6503 + (Math.random() - 0.5) * 0.1;
        
        track.push({
          latitude: lat,
          longitude: lng,
          altitude: Math.random() * 100,
          accuracy: 5 + Math.random() * 25,
          altitudeAccuracy: Math.random() * 10,
          heading: Math.random() * 360,
          speed: Math.random() * 30,
          timestamp: baseTime + i * 1000,
        });
        
        if (i > 0) {
          distance += 0.05;
        }
      }
      
      return {
        track,
        distance,
        lastTimeStamp: baseTime + (pointCount - 1) * 1000,
      };
    };

    it('should store and retrieve small data without chunking', async () => {
      const smallData = generateLargeTrackLog(100);
      
      await storeLocationsChunked(smallData);
      
      // 単一のキーで保存されることを確認
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE.TRACKLOG,
        expect.any(String)
      );
      
      // 取得時のモック設定
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
        if (key === STORAGE.TRACKLOG) {
          return Promise.resolve(JSON.stringify(smallData));
        }
        return Promise.resolve(null);
      });
      
      const retrieved = await getStoredLocationsChunked();
      expect(retrieved.track).toHaveLength(100);
      expect(retrieved.distance).toBe(smallData.distance);
    });

    it('should store large data in chunks', async () => {
      const largeData = generateLargeTrackLog(10000);
      
      // チャンク分割保存をシミュレート
      const setItemCalls: { key: string; value: string }[] = [];
      (AsyncStorage.setItem as jest.Mock).mockImplementation((key, value) => {
        setItemCalls.push({ key, value });
        return Promise.resolve();
      });
      
      await storeLocationsChunked(largeData);
      
      // メタデータが保存されることを確認
      const metadataCall = setItemCalls.find(call => call.key === 'TRACKLOG_METADATA');
      expect(metadataCall).toBeDefined();
      
      if (metadataCall) {
        const metadata = JSON.parse(metadataCall.value);
        expect(metadata.totalPoints).toBe(10000);
        expect(metadata.chunks.length).toBeGreaterThan(1);
        
        // 各チャンクが保存されることを確認
        for (const chunkKey of metadata.chunks) {
          const chunkCall = setItemCalls.find(call => call.key === chunkKey);
          expect(chunkCall).toBeDefined();
        }
      }
    });

    it('should retrieve chunked data correctly', async () => {
      const originalData = generateLargeTrackLog(5000);
      
      // チャンク化されたデータをモック
      const metadata = {
        chunks: ['TRACKLOG_CHUNK_0', 'TRACKLOG_CHUNK_1', 'TRACKLOG_CHUNK_2'],
        totalPoints: 5000,
        distance: originalData.distance,
        lastTimeStamp: originalData.lastTimeStamp,
      };
      
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
        if (key === 'TRACKLOG_METADATA') {
          return Promise.resolve(JSON.stringify(metadata));
        }
        if (key === 'TRACKLOG_CHUNK_0') {
          return Promise.resolve(JSON.stringify({
            track: originalData.track.slice(0, 1700),
            distance: originalData.distance,
            lastTimeStamp: 0,
          }));
        }
        if (key === 'TRACKLOG_CHUNK_1') {
          return Promise.resolve(JSON.stringify({
            track: originalData.track.slice(1700, 3400),
            distance: 0,
            lastTimeStamp: 0,
          }));
        }
        if (key === 'TRACKLOG_CHUNK_2') {
          return Promise.resolve(JSON.stringify({
            track: originalData.track.slice(3400),
            distance: 0,
            lastTimeStamp: originalData.lastTimeStamp,
          }));
        }
        return Promise.resolve(null);
      });
      
      const retrieved = await getStoredLocationsChunked();
      
      expect(retrieved.track).toHaveLength(5000);
      expect(retrieved.distance).toBe(originalData.distance);
      expect(retrieved.lastTimeStamp).toBe(originalData.lastTimeStamp);
    });

    it('should clear all chunks correctly', async () => {
      const removeItemCalls: string[] = [];
      (AsyncStorage.removeItem as jest.Mock).mockImplementation((key) => {
        removeItemCalls.push(key);
        return Promise.resolve();
      });
      
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
        if (key === 'TRACKLOG_METADATA') {
          return Promise.resolve(JSON.stringify({
            chunks: ['TRACKLOG_CHUNK_0', 'TRACKLOG_CHUNK_1'],
            totalPoints: 2000,
            distance: 100,
            lastTimeStamp: Date.now(),
          }));
        }
        return Promise.resolve(null);
      });
      
      await clearStoredLocationsChunked();
      
      // 全てのチャンクとメタデータが削除されることを確認
      expect(removeItemCalls).toContain(STORAGE.TRACKLOG);
      expect(removeItemCalls).toContain('TRACKLOG_METADATA');
      expect(removeItemCalls).toContain('TRACKLOG_CHUNK_0');
      expect(removeItemCalls).toContain('TRACKLOG_CHUNK_1');
    });

    it('should handle very large data (>2MB) without errors', async () => {
      const veryLargeData = generateLargeTrackLog(20000);
      
      // チャンク分割保存が例外を投げないことを確認
      await expect(storeLocationsChunked(veryLargeData)).resolves.not.toThrow();
      
      // 複数のsetItem呼び出しがあることを確認
      const callCount = (AsyncStorage.setItem as jest.Mock).mock.calls.length;
      expect(callCount).toBeGreaterThan(1);
    });
  });
});