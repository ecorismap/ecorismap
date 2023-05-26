import { combineReducers } from 'redux';

import * as dataSet from './dataSet';
import * as settings from './settings';
import * as layers from './layers';
import * as user from './user';
import * as projects from './projects';
import * as tileMaps from './tileMaps';
import * as mapMemo from './mapMemo';

export function createInitialState() {
  return {
    dataSet: dataSet.createDataSetInitialState(),
    layers: layers.createLayersInitialState(),
    settings: settings.createSettingsInitialState(),
    user: user.createUserInitialState(),
    projects: projects.createProjectsInitialState(),
    tileMaps: tileMaps.createTileMapsInitialState(),
    mapMemo: mapMemo.createMapMemoInitialState(),
  };
}

export type AppState = Readonly<ReturnType<typeof createInitialState>>;

export default combineReducers<AppState>({
  dataSet: dataSet.default,
  layers: layers.default,
  settings: settings.default,
  user: user.default,
  projects: projects.default,
  tileMaps: tileMaps.default,
  mapMemo: mapMemo.default,
});
