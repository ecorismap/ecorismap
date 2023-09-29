import { DEFAULT_MAP_LIST_URL } from '../../constants/AppConstants';
import { TUTRIALS } from '../../constants/Tutrials';
import { MemberLocationType, RoleType, SettingsType, TileRegionType, TrackingType } from '../../types';
import reducer, { editSettingsAction } from '../settings';
describe('modules/settings', () => {
  const state: SettingsType = {
    tutrials: TUTRIALS,
    isSettingProject: false,
    isSynced: false,
    isEditingRecord: false,
    isOffline: false,
    updatedAt: new Date('2000/1/1'),
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
    tracking: undefined as TrackingType | undefined,
    selectedRecord: undefined,
    plugins: {},
    photosToBeDeleted: [],
    mapListURL: DEFAULT_MAP_LIST_URL,
    mapList: [],
  };
  test('should set the rile to state', () => {
    const role = 'OWNER';
    const action = editSettingsAction({ role: role });
    expect(reducer(state, action)).toEqual({ ...state, role: role });
  });
  test('should set the mapRegion to state', () => {
    const mapRegion = {
      latitude: 37,
      longitude: 132,
      latitudeDelta: 0.00922,
      longitudeDelta: 0.00922,
      zoom: 1,
    };
    const action = editSettingsAction({ mapRegion: mapRegion });
    expect(reducer(state, action)).toEqual({ ...state, mapRegion: mapRegion });
  });
});
