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
} from '../Location';
import { TrackLogType } from '../../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE } from '../../constants/AppConstants';

// AsyncStorageのモック
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
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
});
