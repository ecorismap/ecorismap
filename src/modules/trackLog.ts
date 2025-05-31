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

    // フィルタリング：最小距離未満の新しいポイントを除外
    const filteredLocations = newLocations.filter((location, index) => {
      if (index === 0 && state.track.length > 0) {
        const lastPoint = state.track[state.track.length - 1];
        const distance = Math.sqrt(
          Math.pow(location.latitude - lastPoint.latitude, 2) + Math.pow(location.longitude - lastPoint.longitude, 2)
        );
        return distance >= TRACK.MIN_DISTANCE_FILTER;
      }
      return true;
    });

    // メモリ管理：最大ポイント数を超えたら古いポイントを削除
    const totalPoints = state.track.length + filteredLocations.length;
    if (totalPoints > TRACK.MAX_POINTS) {
      const removeCount = totalPoints - TRACK.MAX_POINTS;

      // メモリ使用率が高い場合は間引きも実行
      if (totalPoints > TRACK.MAX_POINTS * TRACK.MEMORY_CLEANUP_THRESHOLD) {
        // 古いポイントの間引き（時系列を保持しつつ密度を減らす）
        const decimatedTrack = state.track.filter(
          (_, index) => index === 0 || index === state.track.length - 1 || index % TRACK.POINT_DECIMATION_FACTOR === 0
        );
        state.track = decimatedTrack;
      } else {
        // 通常の先頭削除
        state.track.splice(0, removeCount);
      }
    }

    state.track.push(...filteredLocations);
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
