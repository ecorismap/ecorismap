import { MemberLocationType, SettingsType, TileRegionType, TrackingType } from '../../types';
import reducer, { editSettingsAction } from '../../modules/settings';
describe('modules/settings', () => {
  const state: SettingsType = {
    role: undefined,
    isSettingProject: false,
    isSynced: false,
    mapType: 'none',
    isOffline: false,
    tileRegions: [] as TileRegionType[],
    mapRegion: {
      latitude: 35,
      longitude: 135,
      latitudeDelta: 0.00922,
      longitudeDelta: 0.00922,
      zoom: 15,
    },
    projectRegion: {
      latitude: 35,
      longitude: 135,
      latitudeDelta: 0.00922,
      longitudeDelta: 0.00922,
      zoom: 15,
    },
    projectId: undefined as string | undefined,
    memberLocation: [] as MemberLocationType[],
    tracking: undefined as TrackingType | undefined,
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
