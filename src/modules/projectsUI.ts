import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type ProjectSortField = 'name' | 'abstract' | 'storage' | 'encryptedAt' | 'owner' | 'archived';
export type ProjectSortOrder = 'ASCENDING' | 'DESCENDING' | 'UNSORTED';

export interface ProjectsUIState {
  isShowArchive: boolean;
  sortField: ProjectSortField;
  sortOrder: ProjectSortOrder;
}

export const projectsUIInitialState: ProjectsUIState = {
  isShowArchive: false,
  sortField: 'encryptedAt',
  sortOrder: 'DESCENDING',
};

const projectsUISlice = createSlice({
  name: 'projectsUI',
  initialState: projectsUIInitialState,
  reducers: {
    setShowArchive: (state, action: PayloadAction<boolean>) => {
      state.isShowArchive = action.payload;
    },
    // 同じ列なら 降順→昇順→未ソート を循環、別の列なら降順から開始
    changeProjectSort: (state, action: PayloadAction<ProjectSortField>) => {
      const field = action.payload;
      if (field === state.sortField) {
        state.sortOrder =
          state.sortOrder === 'UNSORTED' ? 'DESCENDING' : state.sortOrder === 'DESCENDING' ? 'ASCENDING' : 'UNSORTED';
      } else {
        state.sortField = field;
        state.sortOrder = 'DESCENDING';
      }
    },
  },
});

export const { setShowArchive, changeProjectSort } = projectsUISlice.actions;
export default projectsUISlice.reducer;
