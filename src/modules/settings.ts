import produce, { enableES5 } from 'immer';
import { DEFAULT_MAP_LIST_URL } from '../constants/AppConstants';
enableES5();
import { TUTRIALS } from '../constants/Tutrials';
import { TileRegionType, MemberLocationType, TrackingType, SettingsType, RoleType } from '../types';

export function createSettingsInitialState(): SettingsType {
  return {
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
    gpsAccuracy: 'HIGH',
  };
}

export const SET = 'settings/set' as const;
export const EDIT = 'settings/edit' as const;

type SettingsEditType<T> = { [K in keyof T]?: T[K] };

export const setSettingsAction = (payload: SettingsType) => ({ type: SET, value: payload });
export const editSettingsAction = (payload: SettingsEditType<SettingsType>) => ({
  type: EDIT,
  value: payload,
});

export type Action = Readonly<ReturnType<typeof setSettingsAction>> | Readonly<ReturnType<typeof editSettingsAction>>;

const reducer = produce((draft, action: Action) => {
  switch (action.type) {
    case SET: {
      return action.value;
    }
    case EDIT: {
      return { ...draft, ...action.value };
    }
    default:
      return draft;
  }
}, createSettingsInitialState());
export default reducer;
