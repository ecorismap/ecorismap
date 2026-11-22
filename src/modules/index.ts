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
import { combineReducers, UnknownAction } from '@reduxjs/toolkit';
import { resolveRecordOwnershipActions } from './recordOwnership';

const combinedReducer = combineReducers({
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

type CombinedState = ReturnType<typeof combinedReducer>;

/**
 * 他のメンバー・テンプレートの記録の変更と削除を、所有権の規則（modules/recordOwnership）に沿って置き換えてから
 * 各スライスへ渡す。規則は記録・レイヤ・利用者・設定の複数のスライスにまたがるので、ルートで扱う
 */
const rootReducer = (state: CombinedState | undefined, action: UnknownAction): CombinedState => {
  if (state === undefined) return combinedReducer(state, action);
  const actions = resolveRecordOwnershipActions(state, action);
  if (actions.length === 1 && actions[0] === action) return combinedReducer(state, action);
  return actions.reduce<CombinedState>((current, next) => combinedReducer(current, next), state);
};

export default rootReducer;
