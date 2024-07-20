import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { TileMapType } from '../types';
import { JP, BASE } from '../constants/Maps';
import i18n from '../i18n/config';

const createTileMapsInitialState = (): TileMapType[] => {
  if (i18n.language.includes('ja')) {
    return [...JP, ...BASE];
  } else {
    return BASE;
  }
};

export const tileMapsInitialState = createTileMapsInitialState();

const reducers = {
  setTileMapsAction: (_state: TileMapType[], action: PayloadAction<TileMapType[]>) => {
    return action.payload;
  },
  addTileMapAction: (state: TileMapType[], action: PayloadAction<TileMapType>) => {
    state.push(action.payload);
  },
  deleteTileMapAction: (state: TileMapType[], action: PayloadAction<TileMapType>) => {
    return state.filter((n) => n.id !== action.payload.id);
  },
};

const tileMapsSlice = createSlice({
  name: 'tileMaps',
  initialState: tileMapsInitialState,
  reducers,
});

export const { setTileMapsAction, addTileMapAction, deleteTileMapAction } = tileMapsSlice.actions;
export default tileMapsSlice.reducer;
