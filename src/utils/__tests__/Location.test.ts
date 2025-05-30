import { LocationObject } from 'expo-location';
import {
  isLocationObject,
  getLineLength,
  toLocationType,
  updateTrackLog,
  getDistanceBetweenPoints,
  calculateSpeed,
  detectStationary,
  calculateTrackStatistics,
  checkLocations,
} from '../Location';
import { LocationType, TrackLogType } from '../../types';

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

describe('getDistanceBetweenPoints', () => {
  const point1: LocationType = {
    latitude: 35,
    longitude: 135,
    accuracy: 1,
    altitude: 0,
    altitudeAccuracy: 5,
    heading: 0,
    speed: 30,
    timestamp: 1000000,
  };

  const point2: LocationType = {
    latitude: 35.1,
    longitude: 135.1,
    accuracy: 1,
    altitude: 0,
    altitudeAccuracy: 5,
    heading: 0,
    speed: 30,
    timestamp: 1000000,
  };

  it('calculates distance between two points', () => {
    const distance = getDistanceBetweenPoints(point1, point2);
    expect(distance).toBeCloseTo(14.37, 2);
  });

  it('returns 0 for same points', () => {
    const distance = getDistanceBetweenPoints(point1, point1);
    expect(distance).toBe(0);
  });
});

describe('calculateSpeed', () => {
  const baseTime = Date.now();

  it('calculates speed correctly', () => {
    const locations: LocationType[] = [
      { latitude: 35, longitude: 135, timestamp: baseTime },
      { latitude: 35.01, longitude: 135.01, timestamp: baseTime + 3600000 }, // 1 hour later
    ];

    const speed = calculateSpeed(locations);
    expect(speed).toBeGreaterThan(0);
  });

  it('returns 0 for insufficient data', () => {
    const locations: LocationType[] = [{ latitude: 35, longitude: 135, timestamp: baseTime }];

    const speed = calculateSpeed(locations);
    expect(speed).toBe(0);
  });

  it('returns 0 for same time', () => {
    const locations: LocationType[] = [
      { latitude: 35, longitude: 135, timestamp: baseTime },
      { latitude: 35.01, longitude: 135.01, timestamp: baseTime },
    ];

    const speed = calculateSpeed(locations);
    expect(speed).toBe(0);
  });
});

describe('detectStationary', () => {
  const baseTime = Date.now();

  it('detects stationary when within threshold', () => {
    const locations: LocationType[] = [
      { latitude: 35, longitude: 135, timestamp: baseTime - 20000 },
      { latitude: 35.00001, longitude: 135.00001, timestamp: baseTime - 10000 },
      { latitude: 35.00002, longitude: 135.00002, timestamp: baseTime },
    ];

    const isStationary = detectStationary(locations, 0.01, 30000); // 10m, 30 seconds
    expect(isStationary).toBe(true);
  });

  it('does not detect stationary when moving too much', () => {
    const locations: LocationType[] = [
      { latitude: 35, longitude: 135, timestamp: baseTime - 20000 },
      { latitude: 35.0001, longitude: 135.0001, timestamp: baseTime },
    ];

    const isStationary = detectStationary(locations, 0.01, 30000); // 10m, 30 seconds
    expect(isStationary).toBe(false);
  });

  it('returns false for insufficient data', () => {
    const locations: LocationType[] = [{ latitude: 35, longitude: 135, timestamp: baseTime }];

    const isStationary = detectStationary(locations, 0.01, 30000);
    expect(isStationary).toBe(false);
  });
});

describe('calculateTrackStatistics', () => {
  const baseTime = Date.now();

  it('calculates statistics for empty track', () => {
    const stats = calculateTrackStatistics([], 0, baseTime);
    expect(stats).toEqual({
      duration: 0,
      movingTime: 0,
      averageSpeed: 0,
      maxSpeed: 0,
      pauseCount: 0,
    });
  });

  it('calculates statistics for track with data', () => {
    const track: LocationType[] = [
      { latitude: 35, longitude: 135, timestamp: baseTime, altitude: 100 },
      { latitude: 35.01, longitude: 135.01, timestamp: baseTime + 3600000, altitude: 200 }, // 1 hour later, 100m higher
    ];

    const stats = calculateTrackStatistics(track, 10, baseTime);
    expect(stats.duration).toBe(3600000);
    expect(stats.maxSpeed).toBeGreaterThan(0);
    expect(stats.elevationGain).toBe(100);
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

describe('updateTrackLog', () => {
  it('updates track log with new locations', () => {
    const trackLog: TrackLogType = {
      distance: 0,
      track: [],
      lastTimeStamp: 1000000,
    };

    const locations: LocationObject[] = [
      {
        coords: { latitude: 35, longitude: 135, accuracy: 10, altitude: 0, altitudeAccuracy: 5, heading: 0, speed: 0 },
        timestamp: 1001000,
      },
    ];

    const result = updateTrackLog(locations, trackLog);
    expect(result.newLocations).toHaveLength(1);
    expect(result.lastTimeStamp).toBe(1001000);
  });

  it('returns empty result for no new locations', () => {
    const trackLog: TrackLogType = {
      distance: 0,
      track: [],
      lastTimeStamp: 1000000,
    };

    const locations: LocationObject[] = [];

    const result = updateTrackLog(locations, trackLog);
    expect(result.newLocations).toHaveLength(0);
    expect(result.additionalDistance).toBe(0);
  });
});
