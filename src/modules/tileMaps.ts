import produce, { enableES5 } from 'immer';
enableES5();
import { TileMapType } from '../types';
import { JP, BASE } from '../constants/Maps';
import i18n from '../i18n/config';

export function createTileMapsInitialState(): TileMapType[] {
  if (i18n.language.includes('ja')) {
    return [...JP, ...BASE];
  } else {
    return BASE;
  }
}

export const SET = 'tileMaps/set' as const;
export const ADD = 'tileMaps/add' as const;
export const DELETE = 'tileMaps/delete' as const;

export const setTileMapsAction = (payload: TileMapType[]) => ({ type: SET, value: payload });
export const addTileMapAction = (payload: TileMapType) => ({ type: ADD, value: payload });
export const deleteTileMapAction = (payload: TileMapType) => ({ type: DELETE, value: payload });

export type Action =
  | Readonly<ReturnType<typeof setTileMapsAction>>
  | Readonly<ReturnType<typeof addTileMapAction>>
  | Readonly<ReturnType<typeof deleteTileMapAction>>;

const reducer = produce((draft, action: Action) => {
  switch (action.type) {
    case SET:
      return action.value;
    case ADD:
      draft.push(action.value);
      break;
    case DELETE: {
      return draft.filter((n) => n.id !== action.value.id);
    }
    default:
      return draft;
  }
}, createTileMapsInitialState());
export default reducer;
