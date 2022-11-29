import { LocationObject } from 'expo-location';
import { updateLocations, isLocationObject, getLineLength, toLocationType } from '../../utils/Location';

describe('updateLocations', () => {
  const savedLocations = [
    {
      latitude: 35,
      longitude: 135,
      altitude: 0,
      accuracy: 1,
      altitudeAccuracy: 5,
      heading: 0,
      speed: 30,
      timestamp: 100,
    },
  ];
  const locations = [
    {
      coords: {
        latitude: 35.5,
        longitude: 135.5,
        altitude: 0,
        accuracy: 1,
        altitudeAccuracy: 5,
        heading: 0,
        speed: 30,
      },
      timestamp: 101,
    },
  ];
  const locations2 = [
    {
      coords: {
        latitude: 35.5,
        longitude: 135.5,
        altitude: 0,
        accuracy: 1,
        altitudeAccuracy: 5,
        heading: 0,
        speed: 30,
      },
      timestamp: 99,
    },
  ];
  it('return updated location', () => {
    expect(updateLocations(savedLocations, locations)).toStrictEqual([
      {
        accuracy: 1,
        altitude: 0,
        altitudeAccuracy: 5,
        heading: 0,
        latitude: 35,
        longitude: 135,
        speed: 30,
        timestamp: 100,
      },
      {
        accuracy: 1,
        altitude: 0,
        altitudeAccuracy: 5,
        heading: 0,
        latitude: 35.5,
        longitude: 135.5,
        speed: 30,
        timestamp: 101,
      },
    ]);
  });
  it('return no change, because timestamp is old', () => {
    expect(updateLocations(savedLocations, locations2)).toStrictEqual([
      {
        accuracy: 1,
        altitude: 0,
        altitudeAccuracy: 5,
        heading: 0,
        latitude: 35,
        longitude: 135,
        speed: 30,
        timestamp: 100,
      },
    ]);
  });
});

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
    expect(getLineLength(locatons)).toBe(14.374876901052536);
  });
});
