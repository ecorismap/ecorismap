import dataSetReducer from './dataSet';
import settingsReducer from './settings';
import layersReducer from './layers';
import userReducer from './user';
import projectsReducer from './projects';
import tileMapsReducer from './tileMaps';
import favoriteProjectsReducer from './favoriteProjects';
import { combineReducers } from '@reduxjs/toolkit';

export default combineReducers({
  dataSet: dataSetReducer,
  layers: layersReducer,
  settings: settingsReducer,
  user: userReducer,
  projects: projectsReducer,
  tileMaps: tileMapsReducer,
  favoriteProjects: favoriteProjectsReducer,
});
