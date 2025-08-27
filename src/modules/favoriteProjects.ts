import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface FavoriteProjectsState {
  projectIds: string[];
  showOnlyFavorites: boolean;
}

export const favoriteProjectsInitialState: FavoriteProjectsState = {
  projectIds: [],
  showOnlyFavorites: false,
};

const favoriteProjectsSlice = createSlice({
  name: 'favoriteProjects',
  initialState: favoriteProjectsInitialState,
  reducers: {
    toggleFavorite: (state, action: PayloadAction<string>) => {
      const projectId = action.payload;
      const index = state.projectIds.indexOf(projectId);
      if (index >= 0) {
        state.projectIds.splice(index, 1);
      } else {
        state.projectIds.push(projectId);
      }
    },
    setShowOnlyFavorites: (state, action: PayloadAction<boolean>) => {
      state.showOnlyFavorites = action.payload;
    },
    clearFavorites: (state) => {
      state.projectIds = [];
      state.showOnlyFavorites = false;
    },
  },
});

export const { toggleFavorite, setShowOnlyFavorites, clearFavorites } = favoriteProjectsSlice.actions;
export default favoriteProjectsSlice.reducer;