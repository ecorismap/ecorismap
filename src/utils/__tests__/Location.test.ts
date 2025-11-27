import {
  LocationObjectInput,
  isLocationObject,
  toLocationType,
  getLineLength,
  checkLocations,
} from '../Location';
import { LocationType } from '../../types';

// モジュールのモック
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    getString: jest.fn(() => null),
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
      setCurrentLocation: jest.fn((location) => {
        mockStorage.currentLocation = location;
      }),
      getCurrentLocation: jest.fn(() => mockStorage.currentLocation || null),
      setChunk: jest.fn((key, data) => {
        mockStorage[key] = data;
      }),
      getChunk: jest.fn((key) => mockStorage[key] || null),
      removeChunk: jest.fn((key) => {
        delete mockStorage[key];
      }),
      setMetadata: jest.fn((metadata) => {
        mockStorage.metadata = metadata;
      }),
      getMetadata: jest.fn(() => mockStorage.metadata || null),
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

// turfのモック
jest.mock('@turf/turf', () => ({
  lineString: jest.fn((coords) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
  })),
  length: jest.fn(() => 0.1), // 100mを返す
}));

describe('isLocationObject', () => {
  describe('return boolean', () => {
    it('return boolean', () => {
      let test = isLocationObject({ locations: [] });
      expect(test).toBe(true);
      test = isLocationObject({ location: [] });
      expect(test).toBe(false);
      test = isLocationObject(undefined);
      expect(test).toBe(false);
    });
  });
});

describe('toLocationType', () => {
  it('return LoactionType from LocationObject', () => {
    const locationObject: LocationObjectInput = {
      coords: {
        latitude: 35.6812,
        longitude: 139.7671,
        altitude: 10,
        accuracy: 5,
        altitudeAccuracy: 3,
        heading: 45,
        speed: 10,
      },
      timestamp: 1609459200000,
    };

    const result = toLocationType(locationObject);

    expect(result).toEqual({
      latitude: 35.6812,
      longitude: 139.7671,
      altitude: 10,
      accuracy: 5,
      altitudeAccuracy: 3,
      heading: 45,
      speed: 10,
      timestamp: 1609459200000,
    });
  });
});

describe('getLineLength', () => {
  it('return length(km) from locations', () => {
    const locations: LocationType[] = [
      { latitude: 35, longitude: 135, timestamp: 1000000 },
      { latitude: 35.001, longitude: 135.001, timestamp: 1001000 },
    ];

    const result = getLineLength(locations);
    expect(result).toBe(0.1); // モックが返す値
  });
});

describe('checkLocations', () => {
  const baseTime = Date.now();

  it('filters locations by timestamp', () => {
    const locations: LocationObjectInput[] = [
      {
        coords: {
          latitude: 35,
          longitude: 135,
          accuracy: 10,
          altitude: 0,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: baseTime - 1000, // 古いタイムスタンプ
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
        timestamp: baseTime + 1000, // 新しいタイムスタンプ
      },
    ];

    const result = checkLocations(baseTime, locations);
    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe(baseTime + 1000);
  });

  it('filters out low accuracy when starting', () => {
    const locations: LocationObjectInput[] = [
      {
        coords: {
          latitude: 35,
          longitude: 135,
          accuracy: 50, // 精度が悪い
          altitude: 0,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: baseTime + 1000,
      },
      {
        coords: {
          latitude: 35.01,
          longitude: 135.01,
          accuracy: 10, // 精度が良い
          altitude: 0,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: baseTime + 2000,
      },
    ];

    const result = checkLocations(0, locations); // lastTimeStamp = 0（開始時）
    expect(result).toHaveLength(1);
    expect(result[0].accuracy).toBe(10);
  });

  it('rejects all data when timestamp reversal detected', () => {
    const locations: LocationObjectInput[] = [
      {
        coords: {
          latitude: 35,
          longitude: 135,
          accuracy: 10,
          altitude: 0,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: baseTime + 2000,
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
        timestamp: baseTime + 1000, // タイムスタンプが逆転
      },
    ];

    const result = checkLocations(baseTime, locations);
    expect(result).toHaveLength(0);
  });

  it('accepts all valid locations when no issues', () => {
    const locations: LocationObjectInput[] = [
      {
        coords: {
          latitude: 35,
          longitude: 135,
          accuracy: 10,
          altitude: 0,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: baseTime + 1000,
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
        timestamp: baseTime + 2000,
      },
      {
        coords: {
          latitude: 35.02,
          longitude: 135.02,
          accuracy: 10,
          altitude: 0,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: baseTime + 3000,
      },
    ];

    const filtered = checkLocations(baseTime, locations);
    expect(filtered).toHaveLength(3);
    expect(filtered[0].timestamp).toBe(baseTime + 1000);
    expect(filtered[1].timestamp).toBe(baseTime + 2000);
    expect(filtered[2].timestamp).toBe(baseTime + 3000);
  });
});
