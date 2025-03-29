import { Position } from '@turf/turf';
//@ts-ignore
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
  SELECTIONTOOL,
  HOME_FEATURE_BTN,
  HOME_ACCOUNT_BTN,
  HOME_BTN,
  LAYERS_BTN,
  POLYGONTOOL,
  DRAWTOOL,
  INFOTOOL,
  PEN_WIDTH,
  STAMP,
  MAPMEMOTOOL,
  ORIENTATIONTYPE,
  GPS_ACCURACY,
  BRUSH,
  PEN_WIDTH,
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

export interface TrackLogType {
  distance: number;
  track: LocationType[];
  lastTimeStamp: number;
}
export interface ProjectDataType extends DataType {
  userId: string;
  permission: PermissionType;
}

export interface PointDataType {
  layerId: string;
  userId: string | undefined;
  data: PointRecordType[];
}
export interface LineDataType {
  layerId: string;
  userId: string | undefined;
  data: LineRecordType[];
}
export interface PolygonDataType {
  layerId: string;
  userId: string | undefined;
  data: PolygonRecordType[];
}

export interface RecordType {
  id: string;
  userId: string | undefined;
  displayName: string | null;
  visible: boolean;
  redraw: boolean;
  coords: LocationType | Array<LocationType> | undefined;
  holes?: { [key: string]: Array<LocationType> };
  centroid?: LocationType;
  field: { [key: string]: string | number | PhotoType[] };
  updatedAt?: number;
}

export interface PointRecordType {
  id: string;
  userId: string | undefined;
  displayName: string | null;
  visible: boolean;
  redraw: boolean;
  coords: LocationType | undefined;
  field: { [key: string]: string | number | PhotoType[] };
  updatedAt?: number;
}
export interface LineRecordType {
  id: string;
  userId: string | undefined;
  displayName: string | null;
  visible: boolean;
  redraw: boolean;
  coords: Array<LocationType> | undefined;
  centroid?: LocationType;
  field: { [key: string]: string | number | PhotoType[] };
  updatedAt?: number;
}

export interface PolygonRecordType {
  id: string;
  userId: string | undefined;
  displayName: string | null;
  visible: boolean;
  redraw: boolean;
  coords: Array<LocationType> | undefined;
  holes?: { [key: string]: Array<LocationType> };
  centroid?: LocationType;
  field: { [key: string]: string | number | PhotoType[] };
  updatedAt?: number;
}

export interface ColorStyle {
  colorType: ColorTypesType;
  transparency: number | boolean; //互換性のためnumberを残す
  color: string;
  fieldName: string;
  customFieldValue: string;
  colorRamp: ColorRampType;
  colorList: {
    value: string | number | undefined;
    color: string;
  }[];
  lineWidth?: number;
}

export interface FieldType {
  id: string;
  name: string;
  format: FormatType;
  list?: { value: string; isOther: boolean; customFieldValue: string }[];
  defaultValue?: string | number;
  useLastValue?: boolean;
  useDictionaryAdd?: boolean;
}

export interface LayerType {
  id: string;
  name: string;
  type: FeatureType;
  permission: PermissionType;
  colorStyle: ColorStyle;
  label: string;
  customLabel?: string;
  visible: boolean;
  active: boolean;
  field: FieldType[];
  groupId?: string;
  expanded?: boolean;
  dictionaryFieldId?: string;
  sortedOrder?: SortedOrderType;
  sortedName?: string;
}
export type CheckListItem = { id: number; checked: boolean };
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

export interface boundaryType {
  center: {
    latitude: number;
    longitude: number;
  };
  zoom: number;
  bounds: {
    north: number;
    south: number;
    west: number;
    east: number;
  };
}
export interface TileMapItemType {
  name: string;
  url: string;
  styleURL?: string;
  isVector?: boolean;
  attribution: string;
  transparency: number;
  overzoomThreshold: number;
  highResolutionEnabled: boolean;
  minimumZ: number;
  maximumZ: number;
  flipY: boolean;
  tileSize?: number;
  isGroup?: boolean;
  groupId?: string;
  expanded?: boolean;
}

export interface TileMapType extends TileMapItemType {
  id: string;
  maptype: MapType;
  visible: boolean;
  boundary?: boundaryType;
  encryptKey?: string;
  redraw?: boolean;
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
  updatedAt: string;
  mapType: MapType;
  mapRegion: RegionType;
  layers: LayerType[];
  tileMaps: TileMapType[];
}

export interface SettingsType {
  tutrials: Tutrials;
  updatedAt: string;
  role: RoleType | undefined;
  mapType: MapType;
  mapRegion: RegionType;
  isSettingProject: boolean;
  isSynced: boolean;
  isOffline: boolean;
  tileRegions: TileRegionType[];
  projectId: string | undefined;
  projectName: string | undefined;
  projectRegion: RegionType;
  memberLocation: MemberLocationType[];
  isEditingRecord: boolean;
  selectedRecord:
    | {
        layerId: string;
        record: RecordType;
      }
    | undefined;
  plugins: any;
  photosToBeDeleted: {
    projectId: string;
    layerId: string;
    userId: string;
    photoId: string;
  }[];
  mapListURL: string;
  mapList: TileMapItemType[];
  gpsAccuracy: GpsAccuracyType;
  agreedTermsVersion: string;
  isModalInfoToolHidden: boolean;
  isModalMapMemoToolHidden: boolean;
  currentInfoTool: InfoToolType;
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

export type DrawLineType = {
  id: string;
  layerId: string | undefined;
  record: RecordType | undefined;
  xy: Position[];
  latlon: Position[];
  properties: string[];
};
export type UndoLineType = { index: number; latlon: Position[]; action: UndoActionType };

export type PointToolType = keyof typeof POINTTOOL;
export type LineToolType = keyof typeof LINETOOL;
export type PolygonToolType = keyof typeof POLYGONTOOL;
export type DrawToolType = keyof typeof DRAWTOOL;
export type InfoToolType = keyof typeof INFOTOOL;
export type SelectionToolType = keyof typeof SELECTIONTOOL;
export type InfoToolType = keyof typeof INFOTOOL;
export type MapMemoToolType = keyof typeof MAPMEMOTOOL;
export type PenWidthType = keyof typeof PEN_WIDTH;
export type StampType = keyof typeof STAMP;
export type BrushType = keyof typeof BRUSH;
export type UndoActionType = 'NEW' | 'EDIT' | 'FINISH' | 'SELECT' | 'DELETE';

export type HomeButtonType = keyof typeof HOME_BTN;
export type LayersButtonType = keyof typeof LAYERS_BTN;
export type FeatureButtonType = keyof typeof HOME_FEATURE_BTN;
export type AccountButtonType = keyof typeof HOME_ACCOUNT_BTN;

export type Tutrials = typeof TUTRIALS;

export type VerifiedType = 'OK' | 'HOLD' | 'NO_ACCOUNT';

export type RoleType = keyof typeof ROLETYPE;

export type FeatureType = keyof typeof FEATURETYPE;

export type ReturnFeatureRecordType<T> = T extends 'POINT'
  ? { editingLayer: LayerType | undefined; editingRecordSet: PointRecordType[] }
  : T extends 'LINE'
  ? { editingLayer: LayerType | undefined; editingRecordSet: LineRecordType[] }
  : T extends 'POLYGON'
  ? { editingLayer: LayerType | undefined; editingRecordSet: PolygonRecordType[] }
  : { editingLayer: undefined; editingRecordSet: undefined };

export type GeoJsonFeatureType =
  | 'POINT'
  | 'LINE'
  | 'POLYGON'
  | 'NONE'
  | 'MULTIPOINT'
  | 'MULTILINE'
  | 'MULTIPOLYGON'
  | 'CENTROID'
  | 'LINEEND';

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

export interface EcorisMapFileType {
  dataSet: DataType[];
  layers: LayerType[];
  settings: SettingsType;
  maps: TileMapType[];
}

export type PaperSizeType = 'A4' | 'A3' | 'A2' | 'A1' | 'A0';
export type ScaleType = '500' | '1000' | '1500' | '2500' | '5000' | '10000' | '25000' | '50000' | '100000';
export type PaperOrientationType = keyof typeof ORIENTATIONTYPE;
export type GpsAccuracyType = keyof typeof GPS_ACCURACY;

export type ArrowStyleType = 'NONE' | 'ARROW_END' | 'ARROW_BOTH';
