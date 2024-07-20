import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ProjectType } from '../types';

export const projectsInitialState: ProjectType[] = [];

const reducers = {
  setProjectsAction: (_state: ProjectType[], action: PayloadAction<ProjectType[]>) => {
    return action.payload;
  },
  addProjectAction: (state: ProjectType[], action: PayloadAction<ProjectType>) => {
    state.push(action.payload);
  },
  updateProjectAction: (state: ProjectType[], action: PayloadAction<ProjectType>) => {
    const index = state.findIndex((project) => project.id === action.payload.id);
    if (index !== -1) {
      state[index] = action.payload;
    }
  },
  deleteProjectAction: (state: ProjectType[], action: PayloadAction<ProjectType>) => {
    return state.filter((project) => project.id !== action.payload.id);
  },
};

const projectsSlice = createSlice({
  name: 'projects',
  initialState: projectsInitialState,
  reducers,
});

export const { setProjectsAction, addProjectAction, updateProjectAction, deleteProjectAction } = projectsSlice.actions;
export default projectsSlice.reducer;
