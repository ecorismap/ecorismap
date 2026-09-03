import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { DEFAULT_MAP_LIST_URL } from '../constants/AppConstants';
import { TUTRIALS } from '../constants/Tutrials';
import { TileRegionType, MemberLocationType, SettingsType, RoleType, ProximityAlertSettingsType } from '../types';
import dayjs from 'dayjs';

export const settingsInitialState: SettingsType = {
  tutrials: TUTRIALS,
  isSettingProject: false,
  isSynced: false,
  isEditingRecord: false,
  isEditingLayer: false,
  isEditingMap: false,
  isOffline: false,
  updatedAt: dayjs('2000-01-01').toISOString(),
  role: undefined as RoleType | undefined,
  mapType: 'standard',
  tileRegions: [] as TileRegionType[],
  mapRegion: {
    latitude: 35,
    longitude: 135,
    latitudeDelta: 0.00922,
    longitudeDelta: 0.00922,
    zoom: 15,
  },
  projectId: undefined as string | undefined,
  projectName: undefined as string | undefined,
  projectRegion: {
    latitude: 35,
    longitude: 135,
    latitudeDelta: 0.00922,
    longitudeDelta: 0.00922,
    zoom: 15,
  },
  memberLocation: [] as MemberLocationType[],
  selectedRecord: undefined,
  plugins: {},
  mapListURL: DEFAULT_MAP_LIST_URL,
  mapList: [],
  gpsAccuracy: 'HIGH',
  agreedTermsVersion: '',
  lastSeenVersion: '',
  isModalInfoToolHidden: false,
  currentInfoTool: 'ALL_INFO',
  proximityAlert: {
    enabled: false,
    targetLayerIds: [],
    distanceThreshold: 10,
  } as ProximityAlertSettingsType,
  addLocationPerLayer: {},
  lockLocationPerLayer: {},
  dataFilterPerLayer: {},
  isTrackPhotoVisible: true,
};

type SettingsEditType = Partial<SettingsType>;

const reducers = {
  setSettingsAction: (_state: SettingsType, action: PayloadAction<SettingsType>) => {
    return action.payload;
  },
  editSettingsAction: (state: SettingsType, action: PayloadAction<SettingsEditType>) => {
    return { ...state, ...action.payload };
  },
  setAddLocationForLayerAction: (state: SettingsType, action: PayloadAction<{ layerId: string; enabled: boolean }>) => {
    return {
      ...state,
      addLocationPerLayer: { ...state.addLocationPerLayer, [action.payload.layerId]: action.payload.enabled },
    };
  },
  setDataFilterForLayerAction: (
    state: SettingsType,
    action: PayloadAction<{ layerId: string; text: string; fieldName: string }>
  ) => {
    const { layerId, text, fieldName } = action.payload;
    return {
      ...state,
      dataFilterPerLayer: { ...state.dataFilterPerLayer, [layerId]: { text, fieldName } },
    };
  },
  //位置トグルのロック（記録後の自動OFFを止める）。ロック時は位置トグル自体もONにそろえる
  setLockLocationForLayerAction: (state: SettingsType, action: PayloadAction<{ layerId: string; locked: boolean }>) => {
    return {
      ...state,
      lockLocationPerLayer: { ...state.lockLocationPerLayer, [action.payload.layerId]: action.payload.locked },
      addLocationPerLayer: action.payload.locked
        ? { ...state.addLocationPerLayer, [action.payload.layerId]: true }
        : state.addLocationPerLayer,
    };
  },
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState: settingsInitialState,
  reducers,
});

export const {
  setSettingsAction,
  editSettingsAction,
  setAddLocationForLayerAction,
  setLockLocationForLayerAction,
  setDataFilterForLayerAction,
} = settingsSlice.actions;
export default settingsSlice.reducer;
