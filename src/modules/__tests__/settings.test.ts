import { DEFAULT_MAP_LIST_URL } from '../../constants/AppConstants';
import { TUTRIALS } from '../../constants/Tutrials';
import { MemberLocationType, RoleType, SettingsType, TileRegionType } from '../../types';
import reducer, { editSettingsAction, setSettingsAction, settingsInitialState } from '../settings';
describe('modules/settings', () => {
  const state: SettingsType = {
    tutrials: TUTRIALS,
    isSettingProject: false,
    isSynced: false,
    isEditingRecord: false,
    isOffline: false,
    updatedAt: new Date('2000/1/1').toISOString(),
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
    isModalMapMemoToolHidden: false,
    currentInfoTool: 'ALL_INFO',
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

  test('should return initial state', () => {
    expect(reducer(undefined, { type: 'unknown' })).toEqual(settingsInitialState);
  });

  test('should handle setSettingsAction', () => {
    const newSettings: SettingsType = {
      ...settingsInitialState,
      isOffline: true,
      mapType: 'satellite',
      projectId: 'test-project-id',
    };
    const action = setSettingsAction(newSettings);
    expect(reducer(state, action)).toEqual(newSettings);
  });

  test('should handle editSettingsAction with multiple properties', () => {
    const updates = {
      isOffline: true,
      mapType: 'satellite' as const,
      projectId: 'new-project-id',
    };
    const action = editSettingsAction(updates);
    const result = reducer(state, action);

    expect(result.isOffline).toBe(true);
    expect(result.mapType).toBe('satellite');
    expect(result.projectId).toBe('new-project-id');
    expect(result.isSettingProject).toBe(state.isSettingProject);
  });

  test('should handle editSettingsAction with empty object', () => {
    const action = editSettingsAction({});
    expect(reducer(state, action)).toEqual(state);
  });

  test('should handle editSettingsAction with memberLocation', () => {
    const memberLocation: MemberLocationType[] = [
      {
        uid: 'user1',
        icon: { photoURL: 'photo1.jpg', initial: 'U' },
        coords: { latitude: 35.5, longitude: 139.5 },
      },
    ];
    const action = editSettingsAction({ memberLocation });
    const result = reducer(state, action);

    expect(result.memberLocation).toEqual(memberLocation);
    expect(result.memberLocation).toHaveLength(1);
  });
});
