import { DEFAULT_MAP_LIST_URL } from '../../constants/AppConstants';
import { TUTRIALS } from '../../constants/Tutrials';
import { MemberLocationType, RoleType, TileRegionType, TrackingType } from '../../types';

export const settings = {
  tutrials: TUTRIALS,
  isSettingProject: false,
  isSynced: false,
  screenState: 'closed',
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
