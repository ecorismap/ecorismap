import firebase from 'firebase/compat/app';
import {
  COLORRAMP,
  COLORTYPE,
  CREATEPROJECTTYPE,
  DATAFORMAT,
  EXPORTTYPE,
  FEATURETYPE,
  PERMISSIONTYPE,
  ROLETYPE,
  POINTTOOL,
  LINETOOL,
  DRAWLINETOOL,
  HOME_FEATURE_BTN,
  HOME_ACCOUNT_BTN,
  HOME_BTN,
  LAYERS_BTN,
} from '../constants/AppConstants';
import { TUTRIALS } from '../constants/Tutrials';

export interface LocationType {
  latitude: number;
  longitude: number;
  latitudeDelta?: number;
  longitudeDelta?: number;
  altitude?: number | null;
  accuracy?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp?: number;
  ele?: number;
  zoom?: number;
}

export interface MemberLocationType {
  uid: string;
  icon: { photoURL: string | null; initial: string };
  coords: LocationType;
}

export interface UserType {
  uid: string | undefined;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface LogginUserType {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
}

export interface DataType {
  layerId: string;
  userId: string | undefined;
  data: RecordType[];
}
export interface ProjectDataType extends DataType {
  userId: string;
  permission: PermissionType;
}

export interface RecordType {
  id: string;
  userId: string | undefined;
  displayName: string | null;
  //checked: boolean;
  visible: boolean;
  redraw: boolean;
  coords: LocationType | Array<LocationType>;
  holes?: { [key: string]: Array<LocationType> };
  centroid?: LocationType;
  field: { [key: string]: string | number | PhotoType[] };
  //[key: string]: unknown;
}

export interface TrackingType {
  layerId: string;
  dataId: string;
}

export interface ColorStyle {
  colorType: ColorTypesType;
  transparency: number;
  color: string;
  fieldName: string;
  colorRamp: ColorRampType;
  colorList: {
    value: string | number | undefined;
    color: string;
  }[];
}

export interface LayerType {
  id: string;
  name: string;
  type: FeatureType;
  permission: PermissionType;
  colorStyle: ColorStyle;
  label: string;
  visible: boolean;
  active: boolean;
  field: {
    id: string;
    name: string;
    format: FormatType;
    list?: { value: string; isOther: boolean }[];
    defaultValue?: string | number;
  }[];
}

export type LatLonDMSKey = 'latitude' | 'longitude';
export type DMSKey = 'decimal' | 'deg' | 'min' | 'sec';

export interface DMSType {
  decimal: string;
  deg: string;
  min: string;
  sec: string;
  [key: DMSKey]: string;
}

export interface LatLonDMSType {
  latitude: DMSType;
  longitude: DMSType;
  [key: LatLonDMSKey]: DMSType;
}

export type LocationStateType = 'follow' | 'show' | 'off';
export type TrackingStateType = 'on' | 'off';

export interface TileMapItemType {
  name: string;
  url: string;
  attribution: string;
  transparency: number;
  overzoomThreshold: number;
  highResolutionEnabled: boolean;
  minimumZ: number;
  maximumZ: number;
  flipY: boolean;
}

export interface TileMapType extends TileMapItemType {
  id: string;
  maptype: MapType;
  visible: boolean;
}

export interface TileRegionType {
  id: string;
  tileMapId: string;
  coords: [
    { latitude: number; longitude: number },
    { latitude: number; longitude: number },
    { latitude: number; longitude: number },
    { latitude: number; longitude: number }
  ];
  centroid: {
    latitude: number;
    longitude: number;
  };
}

export interface PhotoType {
  id: string;
  name: string;
  uri: string | null | undefined;
  url: string | null;
  key: string | null;
  width: number;
  height: number;
  thumbnail: string | null;
}

export interface SelectedPhotoType extends PhotoType {
  index: number;
  fieldName: string;
  hasLocal: boolean;
}

export interface ProjectType {
  id: string;
  name: string;
  members: { uid: string | null; email: string; verified: VerifiedType; role: RoleType }[];
  ownerUid: string;
  adminsUid: string[];
  membersUid: string[];
  abstract: string;
  storage: { count: number };
  license: License;
}

export interface ProjectSettingsType {
  updatedAt: Date;
  mapType: MapType;
  mapRegion: RegionType;
  layers: LayerType[];
  tileMaps: TileMapType[];
  drawTools: { hisyouzuTool: { active: boolean; layerId: string | undefined } };
}

export interface SettingsType {
  tutrials: Tutrials;
  updatedAt: Date;
  role: RoleType | undefined;
  mapType: MapType;
  mapRegion: RegionType;
  isSettingProject: boolean;
  isSynced: boolean;
  isOffline: boolean;
  isDataOpened: 'opened' | 'closed' | 'expanded';
  tileRegions: TileRegionType[];
  projectId: string | undefined;
  projectName: string | undefined;
  projectRegion: RegionType;
  memberLocation: MemberLocationType[];
  tracking: TrackingType | undefined;
  isEditingRecord: boolean;
  selectedRecord: {
    layerId: string;
    record: RecordType | undefined;
  };
  drawTools: { hisyouzuTool: { active: boolean; layerId: string | undefined } };
  photosToBeDeleted: {
    projectId: string;
    layerId: string;
    userId: string;
    photoId: string;
  }[];
  mapListURL: string;
  mapList: TileMapItemType[];
}

export interface RegionType {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
  zoom: number;
  bearing?: number;
  pitch?: number;
  altitude?: number;
}

export interface ActionType {
  type: string;
  value: any;
}

export interface ProjectFS {
  ownerUid: string;
  adminsUid: string[];
  membersUid: string[];
  encdata: string[];
  encryptedAt: firebase.firestore.Timestamp;
  storage?: { count: number };
  license?: License;
}
export type UpdateProjectFS = Omit<ProjectFS, 'ownerUid'>;

export interface ProjectSettingsFS {
  editorUid: string;
  encdata: string[];
  encryptedAt: firebase.firestore.Timestamp;
}

export interface DataFS {
  userId: string;
  layerId: string;
  permission: PermissionType;
  encdata: string[];
  encryptedAt: firebase.firestore.Timestamp;
}

export interface PositionFS {
  encdata: string[];
  encryptedAt: firebase.firestore.Timestamp;
}

export type PointToolType = keyof typeof POINTTOOL;
export type LineToolType = keyof typeof LINETOOL;
export type DrawLineToolType = keyof typeof DRAWLINETOOL;
export type PolygonToolType = 'NONE';

export type HomeButtonType = keyof typeof HOME_BTN;
export type LayersButtonType = keyof typeof LAYERS_BTN;
export type FeatureButtonType = keyof typeof HOME_FEATURE_BTN;
export type AccountButtonType = keyof typeof HOME_ACCOUNT_BTN;

export type Tutrials = typeof TUTRIALS;

export type VerifiedType = 'OK' | 'HOLD' | 'NO_ACCOUNT';

export type RoleType = keyof typeof ROLETYPE;

export type FeatureType = keyof typeof FEATURETYPE;

export type GeoJsonFeatureType =
  | 'POINT'
  | 'LINE'
  | 'POLYGON'
  | 'NONE'
  | 'MULTIPOINT'
  | 'MULTILINE'
  | 'MULTIPOLYGON'
  | 'CENTROID';

export type CreateProjectType = keyof typeof CREATEPROJECTTYPE;
export type FormatType = keyof typeof DATAFORMAT;
export type ColorTypesType = keyof typeof COLORTYPE;
export type ColorRampType = keyof typeof COLORRAMP;
export type PermissionType = keyof typeof PERMISSIONTYPE;
export type ExportType = keyof typeof EXPORTTYPE;
export type MapType = 'standard' | 'satellite' | 'hybrid' | 'terrain' | 'none';
export type AccountFormStateType =
  | 'loginUserAccount'
  | 'signupUserAccount'
  | 'deleteUserAccount'
  | 'updateUserProfile'
  | 'resetUserPassword'
  | 'changeUserPassword'
  | 'registEncryptPassword'
  | 'backupEncryptPassword'
  | 'changeEncryptPassword'
  | 'restoreEncryptKey'
  | 'resetEncryptKey'
  | 'deleteAllProjects';

export interface Product {
  active: boolean;
  name: string;
  description: string | null;
  images: Array<string>;
  [propName: string]: any;
}

export interface Price {
  active: boolean;
  currency: string;
  unit_amount: number;
  description: string | null;
  type: 'one_time' | 'recurring';
  interval: 'day' | 'month' | 'week' | 'year' | null;
  interval_count: number | null;
  trial_period_days: number | null;
  [propName: string]: any;
}

export interface Checkout_sessions {
  error: any;
  url: string;
  [propName: string]: any;
}

export type License = 'Free' | 'Basic' | 'Pro' | 'BusinessA' | 'BusinessB' | 'Unkown';
