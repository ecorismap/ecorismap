import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { LocationType, TrackLogType, TrackStatisticsType } from '../types';
import { TRACK } from '../constants/AppConstants';

export const tracLogInitialState: TrackLogType = {
  distance: 0,
  track: [],
  lastTimeStamp: 0,
  segments: [],
  statistics: {
    duration: 0,
    movingTime: 0,
    averageSpeed: 0,
    maxSpeed: 0,
    pauseCount: 0,
  },
};

interface AppendTrackLogPayload {
  newLocations: LocationType[];
  additionalDistance: number;
  lastTimeStamp: number;
  statistics?: TrackStatisticsType;
}

const reducers = {
  updateTrackLogAction: (_state: TrackLogType, action: PayloadAction<TrackLogType>) => {
    return action.payload;
  },
  appendTrackLogAction: (state: TrackLogType, action: PayloadAction<AppendTrackLogPayload>) => {
    const { newLocations, additionalDistance, lastTimeStamp, statistics } = action.payload;

    // メモリ管理：最大ポイント数を超えたら古いポイントを削除
    const totalPoints = state.track.length + newLocations.length;
    if (totalPoints > TRACK.MAX_POINTS) {
      const removeCount = totalPoints - TRACK.MAX_POINTS;
      state.track.splice(0, removeCount);
    }

    state.track.push(...newLocations);
    state.distance += additionalDistance;
    state.lastTimeStamp = lastTimeStamp;

    // 統計情報の更新
    if (statistics) {
      state.statistics = statistics;
    }
  },
  clearTrackLogAction: (state: TrackLogType) => {
    state.distance = 0;
    state.track = [];
    state.lastTimeStamp = 0;
    state.segments = [];
    state.statistics = {
      duration: 0,
      movingTime: 0,
      averageSpeed: 0,
      maxSpeed: 0,
      pauseCount: 0,
    };
  },
};

const trackLogSlice = createSlice({
  name: 'trackLog',
  initialState: tracLogInitialState,
  reducers,
});

export const { updateTrackLogAction, appendTrackLogAction, clearTrackLogAction } = trackLogSlice.actions;
export default trackLogSlice.reducer;
