import dataSetReducer from './dataSet';
import settingsReducer from './settings';
import layersReducer from './layers';
import userReducer from './user';
import projectsReducer from './projects';
import tileMapsReducer from './tileMaps';
import tileSignaturesReducer from './tileSignatures';
import favoriteProjectsReducer from './favoriteProjects';
import projectsUIReducer from './projectsUI';
import dataSyncReducer from './dataSync';
import googleDriveReducer from './googleDrive';
import { combineReducers } from '@reduxjs/toolkit';

export default combineReducers({
  dataSet: dataSetReducer,
  layers: layersReducer,
  settings: settingsReducer,
  user: userReducer,
  projects: projectsReducer,
  tileMaps: tileMapsReducer,
  tileSignatures: tileSignaturesReducer,
  favoriteProjects: favoriteProjectsReducer,
  projectsUI: projectsUIReducer,
  dataSync: dataSyncReducer,
  googleDrive: googleDriveReducer,
});
