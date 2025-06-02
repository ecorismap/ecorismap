import trackLogReducer, {
  tracLogInitialState,
  updateTrackLogAction,
  appendTrackLogAction,
  clearTrackLogAction,
} from '../trackLog';
import { LocationType, TrackLogType, TrackStatisticsType } from '../../types';

describe('trackLog reducer', () => {
  const sampleLocation: LocationType = {
    latitude: 35.0,
    longitude: 135.0,
    accuracy: 10,
    altitude: 100,
    altitudeAccuracy: 5,
    heading: 0,
    speed: 20,
    timestamp: Date.now(),
  };

  const sampleStatistics: TrackStatisticsType = {
    duration: 3600000, // 1 hour
    movingTime: 3000000, // 50 minutes
    averageSpeed: 25,
    maxSpeed: 40,
    pauseCount: 2,
    elevationGain: 150,
  };

  it('should return the initial state', () => {
    expect(trackLogReducer(undefined, { type: 'unknown' })).toEqual(tracLogInitialState);
  });

  it('should handle updateTrackLogAction', () => {
    const newTrackLog: TrackLogType = {
      distance: 10.5,
      track: [sampleLocation],
      lastTimeStamp: Date.now(),
      segments: [],
      statistics: sampleStatistics,
    };

    const actual = trackLogReducer(tracLogInitialState, updateTrackLogAction(newTrackLog));
    expect(actual).toEqual(newTrackLog);
  });

  it('should handle appendTrackLogAction', () => {
    const initialState: TrackLogType = {
      distance: 5.0,
      track: [sampleLocation],
      lastTimeStamp: Date.now() - 1000,
      segments: [],
      statistics: tracLogInitialState.statistics,
    };

    const newLocation: LocationType = {
      ...sampleLocation,
      latitude: 35.01,
      longitude: 135.01,
      timestamp: Date.now(),
    };

    const payload = {
      newLocations: [newLocation],
      additionalDistance: 2.5,
      lastTimeStamp: Date.now(),
      statistics: sampleStatistics,
    };

    const actual = trackLogReducer(initialState, appendTrackLogAction(payload));

    expect(actual.distance).toBe(7.5);
    expect(actual.track).toHaveLength(2);
    expect(actual.track[1]).toEqual(newLocation);
    expect(actual.lastTimeStamp).toBe(payload.lastTimeStamp);
    expect(actual.statistics).toEqual(sampleStatistics);
  });

  it('should handle appendTrackLogAction without statistics', () => {
    const initialState: TrackLogType = {
      distance: 5.0,
      track: [sampleLocation],
      lastTimeStamp: Date.now() - 1000,
      segments: [],
      statistics: sampleStatistics,
    };

    const newLocation: LocationType = {
      ...sampleLocation,
      latitude: 35.01,
      longitude: 135.01,
      timestamp: Date.now(),
    };

    const payload = {
      newLocations: [newLocation],
      additionalDistance: 2.5,
      lastTimeStamp: Date.now(),
    };

    const actual = trackLogReducer(initialState, appendTrackLogAction(payload));

    expect(actual.distance).toBe(7.5);
    expect(actual.track).toHaveLength(2);
    expect(actual.statistics).toEqual(sampleStatistics); // Should keep existing statistics
  });

  it('should handle clearTrackLogAction', () => {
    const stateWithData: TrackLogType = {
      distance: 15.5,
      track: [sampleLocation, { ...sampleLocation, latitude: 35.01 }],
      lastTimeStamp: Date.now(),
      segments: [
        {
          id: 'segment-1',
          startTime: Date.now() - 3600000,
          endTime: Date.now(),
          distance: 10.0,
          pointCount: 100,
        },
      ],
      statistics: sampleStatistics,
    };

    const actual = trackLogReducer(stateWithData, clearTrackLogAction());

    expect(actual.distance).toBe(0);
    expect(actual.track).toHaveLength(0);
    expect(actual.lastTimeStamp).toBe(0);
    expect(actual.segments).toHaveLength(0);
    expect(actual.statistics).toEqual({
      duration: 0,
      movingTime: 0,
      averageSpeed: 0,
      maxSpeed: 0,
      pauseCount: 0,
    });
  });

  it('should handle multiple appendTrackLogAction calls', () => {
    let state = tracLogInitialState;

    // First append
    const firstLocation: LocationType = {
      ...sampleLocation,
      timestamp: Date.now(),
    };

    state = trackLogReducer(
      state,
      appendTrackLogAction({
        newLocations: [firstLocation],
        additionalDistance: 2.0,
        lastTimeStamp: Date.now(),
      })
    );

    expect(state.distance).toBe(2.0);
    expect(state.track).toHaveLength(1);

    // Second append
    const secondLocation: LocationType = {
      ...sampleLocation,
      latitude: 35.01,
      longitude: 135.01,
      timestamp: Date.now() + 1000,
    };

    state = trackLogReducer(
      state,
      appendTrackLogAction({
        newLocations: [secondLocation],
        additionalDistance: 3.0,
        lastTimeStamp: Date.now() + 1000,
        statistics: sampleStatistics,
      })
    );

    expect(state.distance).toBe(5.0);
    expect(state.track).toHaveLength(2);
    expect(state.statistics).toEqual(sampleStatistics);
  });

  it('should handle edge cases for appendTrackLogAction', () => {
    // Empty new locations
    const actual = trackLogReducer(
      tracLogInitialState,
      appendTrackLogAction({
        newLocations: [],
        additionalDistance: 0,
        lastTimeStamp: Date.now(),
      })
    );

    expect(actual.distance).toBe(0);
    expect(actual.track).toHaveLength(0);
    expect(actual.lastTimeStamp).toBeGreaterThan(0);
  });

  it('should preserve state structure after all operations', () => {
    let state = tracLogInitialState;

    // Add some data
    state = trackLogReducer(
      state,
      appendTrackLogAction({
        newLocations: [sampleLocation],
        additionalDistance: 5.0,
        lastTimeStamp: Date.now(),
        statistics: sampleStatistics,
      })
    );

    // Clear the data
    state = trackLogReducer(state, clearTrackLogAction());

    // Check that all required properties exist
    expect(state).toHaveProperty('distance');
    expect(state).toHaveProperty('track');
    expect(state).toHaveProperty('lastTimeStamp');
    expect(state).toHaveProperty('segments');
    expect(state).toHaveProperty('statistics');
    expect(state.statistics).toHaveProperty('duration');
    expect(state.statistics).toHaveProperty('movingTime');
    expect(state.statistics).toHaveProperty('averageSpeed');
    expect(state.statistics).toHaveProperty('maxSpeed');
    expect(state.statistics).toHaveProperty('pauseCount');
  });
});
