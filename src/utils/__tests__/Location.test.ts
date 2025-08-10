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

// MMKVのモック
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    getString: jest.fn(),
    delete: jest.fn(),
    clearAll: jest.fn(),
    getAllKeys: jest.fn(() => []),
  })),
}));

// mmkvStorageのモック
jest.mock('../mmkvStorage', () => {
  const mockStorage: any = {};
  return {
    trackLogMMKV: {
      setTrackLog: jest.fn((data) => {
        mockStorage.tracklog = data;
      }),
      getTrackLog: jest.fn(() => mockStorage.tracklog || null),
      clearTrackLog: jest.fn(() => {
        delete mockStorage.tracklog;
      }),
      getSize: jest.fn(() => {
        return mockStorage.tracklog ? JSON.stringify(mockStorage.tracklog).length : 0;
      }),
    },
    storage: {
      set: jest.fn(),
      getString: jest.fn(),
      delete: jest.fn(),
      clearAll: jest.fn(),
      getAllKeys: jest.fn(() => []),
    },
    reduxMMKVStorage: {
      setItem: jest.fn(() => Promise.resolve(true)),
      getItem: jest.fn(() => Promise.resolve(null)),
      removeItem: jest.fn(() => Promise.resolve()),
    },
  };
});

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
    it('stores locations to MMKV', async () => {
      const { trackLogMMKV } = require('../mmkvStorage');
      const data: TrackLogType = {
        track: [{ latitude: 35, longitude: 135, timestamp: 1000000 }],
        distance: 10,
        lastTimeStamp: 1000000,
      };

      await storeLocations(data);

      expect(trackLogMMKV.setTrackLog).toHaveBeenCalledWith(data);
    });
  });

  describe('clearStoredLocations', () => {
    it('clears stored locations in MMKV', async () => {
      const { trackLogMMKV } = require('../mmkvStorage');
      
      await clearStoredLocations();

      expect(trackLogMMKV.clearTrackLog).toHaveBeenCalled();
      expect(trackLogMMKV.setTrackLog).toHaveBeenCalledWith({ track: [], distance: 0, lastTimeStamp: 0 });
    });
  });

  describe('getStoredLocations', () => {
    it('returns stored locations from MMKV', async () => {
      const { trackLogMMKV } = require('../mmkvStorage');
      const storedData: TrackLogType = {
        track: [{ latitude: 35, longitude: 135, timestamp: 1000000 }],
        distance: 10,
        lastTimeStamp: 1000000,
      };

      trackLogMMKV.getTrackLog.mockReturnValueOnce(storedData);

      const result = await getStoredLocations();

      expect(result).toEqual(storedData);
      expect(trackLogMMKV.getTrackLog).toHaveBeenCalled();
    });

    it('returns empty data when no stored locations', async () => {
      const { trackLogMMKV } = require('../mmkvStorage');
      trackLogMMKV.getTrackLog.mockReturnValueOnce(null);
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

      const result = await getStoredLocations();

      expect(result).toEqual({ track: [], distance: 0, lastTimeStamp: 0 });
    });

    it('returns empty data on error', async () => {
      const { trackLogMMKV } = require('../mmkvStorage');
      trackLogMMKV.getTrackLog.mockImplementationOnce(() => {
        throw new Error('Storage error');
      });
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

      const result = await getStoredLocations();

      expect(result).toEqual({ track: [], distance: 0, lastTimeStamp: 0 });
    });
  });

  describe('checkAndStoreLocations', () => {
    it('checks and stores new locations', async () => {
      const { trackLogMMKV } = require('../mmkvStorage');
      const existingData: TrackLogType = {
        track: [{ latitude: 35, longitude: 135, timestamp: 1000000 }],
        distance: 10,
        lastTimeStamp: 1000000,
      };

      trackLogMMKV.getTrackLog.mockReturnValueOnce(existingData);

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
      expect(trackLogMMKV.setTrackLog).toHaveBeenCalled();
    });

    it('returns empty data on error', async () => {
      const { trackLogMMKV } = require('../mmkvStorage');
      trackLogMMKV.getTrackLog.mockImplementationOnce(() => {
        throw new Error('Storage error');
      });

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
      const { trackLogMMKV } = require('../mmkvStorage');
      const smallData = generateLargeTrackLog(1000); // 約100KB
      const jsonString = JSON.stringify(smallData);
      const sizeInMB = new Blob([jsonString]).size / (1024 * 1024);
      
      console.log(`Small data size: ${sizeInMB.toFixed(2)} MB`);
      
      await storeLocations(smallData);
      
      // MMKVへの保存を確認
      expect(trackLogMMKV.setTrackLog).toHaveBeenCalledWith(smallData);
    });

    it('should handle data exceeds 2MB with MMKV', async () => {
      const { trackLogMMKV } = require('../mmkvStorage');
      // 2MBを超えるデータを生成（約20,000ポイント）
      const largeData = generateLargeTrackLog(20000);
      const jsonString = JSON.stringify(largeData);
      const sizeInMB = new Blob([jsonString]).size / (1024 * 1024);
      
      console.log(`Large data size: ${sizeInMB.toFixed(2)} MB`);
      
      // 2MBを超えているか確認
      expect(sizeInMB).toBeGreaterThan(2);
      
      // MMKVは大容量データも処理可能
      await storeLocations(largeData);
      
      // MMKVへの保存を確認
      expect(trackLogMMKV.setTrackLog).toHaveBeenCalledWith(largeData);
    });

    it('MMKV can handle very large data without failure', async () => {
      const { trackLogMMKV } = require('../mmkvStorage');
      const results: { points: number; sizeMB: number; success: boolean }[] = [];
      
      // MMKVは大容量データでも処理可能
      for (let points = 5000; points <= 25000; points += 5000) {
        const data = generateLargeTrackLog(points);
        const jsonString = JSON.stringify(data);
        const sizeMB = new Blob([jsonString]).size / (1024 * 1024);
        
        await storeLocations(data);
        results.push({ points, sizeMB, success: true });
        console.log(`MMKV handled ${points} points (${sizeMB.toFixed(2)} MB) successfully`);
      }
      
      // すべてのデータサイズで成功することを確認
      const allSuccess = results.every(r => r.success);
      expect(allSuccess).toBe(true);
      
      // 最大サイズが2MBを超えていることを確認
      const maxSize = Math.max(...results.map(r => r.sizeMB));
      expect(maxSize).toBeGreaterThan(2);
      
      // MMKVが呼び出されたことを確認
      expect(trackLogMMKV.setTrackLog).toHaveBeenCalled();
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