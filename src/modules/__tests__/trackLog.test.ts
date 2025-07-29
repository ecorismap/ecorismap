import trackLogReducer, {
  tracLogInitialState,
  updateTrackLogAction,
  appendTrackLogAction,
  clearTrackLogAction,
} from '../trackLog';
import { LocationType, TrackLogType } from '../../types';

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

  it('should return the initial state', () => {
    expect(trackLogReducer(undefined, { type: 'unknown' })).toEqual(tracLogInitialState);
  });

  it('should handle updateTrackLogAction', () => {
    const newTrackLog: TrackLogType = {
      distance: 10.5,
      track: [sampleLocation],
      lastTimeStamp: Date.now(),
    };

    const actual = trackLogReducer(tracLogInitialState, updateTrackLogAction(newTrackLog));
    expect(actual).toEqual(newTrackLog);
  });

  it('should handle appendTrackLogAction', () => {
    const initialState: TrackLogType = {
      distance: 5.0,
      track: [sampleLocation],
      lastTimeStamp: Date.now() - 1000,
    };

    const newLocation: LocationType = {
      ...sampleLocation,
      latitude: 35.01,
      longitude: 135.01,
      timestamp: Date.now(),
    };

    const payload: TrackLogType = {
      track: [newLocation],
      distance: 2.5,
      lastTimeStamp: newLocation.timestamp || Date.now(),
    };

    const actual = trackLogReducer(initialState, appendTrackLogAction(payload));

    expect(actual.distance).toBe(7.5);
    expect(actual.track).toHaveLength(2);
    expect(actual.track[1]).toEqual(newLocation);
    expect(actual.lastTimeStamp).toBe(payload.lastTimeStamp);
  });

  it('should handle clearTrackLogAction', () => {
    const stateWithData: TrackLogType = {
      distance: 15.5,
      track: [sampleLocation, { ...sampleLocation, latitude: 35.01 }],
      lastTimeStamp: Date.now(),
    };

    const actual = trackLogReducer(stateWithData, clearTrackLogAction());

    expect(actual.distance).toBe(0);
    expect(actual.track).toHaveLength(0);
    expect(actual.lastTimeStamp).toBe(0);
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
        track: [firstLocation],
        distance: 2.0,
        lastTimeStamp: firstLocation.timestamp || Date.now(),
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
        track: [secondLocation],
        distance: 3.0,
        lastTimeStamp: secondLocation.timestamp || Date.now() + 1000,
      })
    );

    expect(state.distance).toBe(5.0);
    expect(state.track).toHaveLength(2);
  });

  it('should handle edge cases for appendTrackLogAction', () => {
    // Empty new locations
    const actual = trackLogReducer(
      tracLogInitialState,
      appendTrackLogAction({
        track: [],
        distance: 0,
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
        track: [sampleLocation],
        distance: 5.0,
        lastTimeStamp: sampleLocation.timestamp || Date.now(),
      })
    );

    // Clear the data
    state = trackLogReducer(state, clearTrackLogAction());

    // Check that all required properties exist
    expect(state).toHaveProperty('distance');
    expect(state).toHaveProperty('track');
    expect(state).toHaveProperty('lastTimeStamp');
    expect(state.distance).toBe(0);
    expect(state.track).toHaveLength(0);
    expect(state.lastTimeStamp).toBe(0);
  });
});
