import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { TrackLogType } from '../types';

export const tracLogInitialState: TrackLogType = {
  distance: 0,
  track: [],
  lastTimeStamp: 0,
};

const reducers = {
  // @ts-ignore Unused state parameter
  updateTrackLogAction: (state, action: PayloadAction<TrackLogType>) => {
    return action.payload;
  },
};

const trackLogSlice = createSlice({
  name: 'trackLog',
  initialState: tracLogInitialState,
  reducers,
});

export const { updateTrackLogAction } = trackLogSlice.actions;
export default trackLogSlice.reducer;
