import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { TrackLogType } from '../types';

export const tracLogInitialState: TrackLogType = {
  distance: 0,
  track: [],
  lastTimeStamp: 0,
};

const reducers = {
  updateTrackLogAction: (_state: TrackLogType, action: PayloadAction<TrackLogType>) => {
    return action.payload;
  },
  appendTrackLogAction: (state: TrackLogType, action: PayloadAction<TrackLogType>) => {
    state.track.push(...action.payload.track);
    state.distance += action.payload.distance;
    state.lastTimeStamp = action.payload.lastTimeStamp;
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
