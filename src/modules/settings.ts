import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { DEFAULT_MAP_LIST_URL } from '../constants/AppConstants';
import { TUTRIALS } from '../constants/Tutrials';
import { TileRegionType, MemberLocationType, SettingsType, RoleType } from '../types';
import dayjs from 'dayjs';

export const settingsInitialState: SettingsType = {
  tutrials: TUTRIALS,
  isSettingProject: false,
  isSynced: false,
  isEditingRecord: false,
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
  photosToBeDeleted: [],
  mapListURL: DEFAULT_MAP_LIST_URL,
  mapList: [],
  gpsAccuracy: 'HIGH',
  agreedTermsVersion: '',
  isModalInfoToolHidden: false,
  isModalMapMemoToolHidden: false,
  currentInfoTool: 'ALL_INFO',
};

type SettingsEditType = Partial<SettingsType>;

const reducers = {
  setSettingsAction: (_state: SettingsType, action: PayloadAction<SettingsType>) => {
    return action.payload;
  },
  editSettingsAction: (state: SettingsType, action: PayloadAction<SettingsEditType>) => {
    return { ...state, ...action.payload };
  },
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState: settingsInitialState,
  reducers,
});

export const { setSettingsAction, editSettingsAction } = settingsSlice.actions;
export default settingsSlice.reducer;
