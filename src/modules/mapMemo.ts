import produce, { enableES5 } from 'immer';
enableES5();
import { MapMemoLineType, MapMemoType } from '../types';

export function createMapMemoInitialState(): MapMemoType {
  return {
    drawLine: [] as MapMemoLineType[],
  };
}

export const SET = 'mapMemo/set' as const;
export const EDIT = 'mapMemo/edit' as const;

type MapMemoEditType<T> = { [K in keyof T]?: T[K] };

export const setMapMemoAction = (payload: MapMemoType) => ({ type: SET, value: payload });
export const editMapMemoAction = (payload: MapMemoEditType<MapMemoType>) => ({
  type: EDIT,
  value: payload,
});

export type Action = Readonly<ReturnType<typeof setMapMemoAction>> | Readonly<ReturnType<typeof editMapMemoAction>>;

const reducer = produce((draft, action: Action) => {
  switch (action.type) {
    case SET: {
      return action.value;
    }
    case EDIT: {
      return { ...draft, ...action.value };
    }
    default:
      return draft;
  }
}, createMapMemoInitialState());
export default reducer;
