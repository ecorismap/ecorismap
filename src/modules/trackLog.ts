import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { LocationType, TrackLogType } from '../types';

export const tracLogInitialState: TrackLogType = {
  distance: 0,
  track: [],
  lastTimeStamp: 0,
};

interface AppendTrackLogPayload {
  newLocations: LocationType[];
  additionalDistance: number;
  lastTimeStamp: number;
}

const reducers = {
  updateTrackLogAction: (_state: TrackLogType, action: PayloadAction<TrackLogType>) => {
    return action.payload;
  },
  appendTrackLogAction: (state: TrackLogType, action: PayloadAction<AppendTrackLogPayload>) => {
    const { newLocations, additionalDistance, lastTimeStamp } = action.payload;
    state.track.push(...newLocations);
    state.distance += additionalDistance;
    state.lastTimeStamp = lastTimeStamp;
  },
  clearTrackLogAction: (state: TrackLogType) => {
    state.distance = 0;
    state.track = [];
    state.lastTimeStamp = 0;
  },
};

const trackLogSlice = createSlice({
  name: 'trackLog',
  initialState: tracLogInitialState,
  reducers,
});

export const { updateTrackLogAction, appendTrackLogAction, clearTrackLogAction } = trackLogSlice.actions;
export default trackLogSlice.reducer;
