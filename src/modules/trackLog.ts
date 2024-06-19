import produce, { enableES5 } from 'immer';
enableES5();
import { TrackLogType } from '../types';

export function createTrackLogInitialState(): TrackLogType {
  return {
    distance: 0,
    track: [],
    lastTimeStamp: 0,
  };
}

export const UPDATE_TRACKLOG = 'trackLog/updateTrackLog' as const;

export const updateTrackLogAction = (payload: TrackLogType) => ({
  type: UPDATE_TRACKLOG,
  value: payload,
});
export type Action = Readonly<ReturnType<typeof updateTrackLogAction>>;

const reducer = produce((draft, action: Action) => {
  switch (action.type) {
    case UPDATE_TRACKLOG: {
      return action.value;
    }
    default:
      return draft;
  }
}, createTrackLogInitialState());
export default reducer;
