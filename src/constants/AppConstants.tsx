import * as FileSystem from 'expo-file-system';
import { t } from '../i18n/config';
import { HISYOUTOOL } from '../plugins/hisyoutool/Constants';

export const AppID = 'jp.co.ecoris.ecorismap';
export const VERSION = 'Version 0.2.0';

export const PLUGIN = {
  HISYOUTOOL: false,
};
export const COLOR = {
  MAIN: '#f2f2f2',
  GRAY0: '#f9f9f9',
  GRAY1: '#ddd',
  GRAY2: '#ccc',
  GRAY3: '#777',
  GRAY4: '#555',
  ALFAGRAY: '#55555555',
  BLUE: '#007AFF',
  LIGHTBLUE: '#b0c4de',
  LIGHTBLUE2: '#4285F4',
  ALFABLUE: '#007AFF55',
  ALFABLUE2: '#007AFF44',
  YELLOW: '#FFF100',
  ALFAYELLOW: '#FFF10055',
  RED: '#ff0000',
  ALFARED: '#ff000055',
  DARKRED: 'darkred',
  LIGHTRED: '#ffcccb',
  PALERED: '#ff7d7d',
  ORANGE: '#ff8300',
  GREEN: '#00ff00',
  DARKGREEN: '#008000',
  ALFAORANGE: '#ff830055',
  WHITE: '#FFF',
  ALFAWHITE: '#FFFFFF55',
  BLACK: '#000',
  CAROUSEL_BACKGROUND: 'rgba(1, 1, 1, 0.1)',
};

export const TILE_FOLDER = `${FileSystem.documentDirectory}tiles`;
export const PHOTO_FOLDER = `${FileSystem.documentDirectory}projects`;

export const DEGREE_INTERVAL = 2;

export const TASK = {
  FETCH_LOCATION: 'FETCH_LOCATION',
};

export const STORAGE = {
  TRACKLOG: 'TRACKLOG',
} as const;

export const ROLETYPE = {
  MEMBER: t('constants.roletype.member'),
  ADMIN: t('constants.roletype.admin'),
  OWNER: t('constants.roletype.owner'),
} as const;

export const DATAFORMAT = {
  STRING: t('constants.dataformat.string'),
  SERIAL: t('constants.dataformat.serial'),
  DATETIME: t('constants.dataformat.datetime'),
  DATESTRING: t('constants.dataformat.datestring'),
  TIMESTRING: t('constants.dataformat.timestring'),
  TIMERANGE: t('constants.dataformat.timerange'),
  INTEGER: t('constants.dataformat.integer'),
  DECIMAL: t('constants.dataformat.decimal'),
  NUMBERRANGE: t('constants.dataformat.numberrange'),
  LIST: t('constants.dataformat.list'),
  RADIO: t('constants.dataformat.radio'),
  CHECK: t('constants.dataformat.check'),
  PHOTO: t('constants.dataformat.photo'),
  TABLE: t('constants.dataformat.table'),
  LISTTABLE: t('constants.dataformat.listtable'),
  REFERENCE: t('constants.dataformat.reference'),
} as const;

export const FEATURETYPE = {
  POINT: t('constants.featuretype.point'),
  LINE: t('constants.featuretype.line'),
  POLYGON: t('constants.featuretype.polygon'),
  NONE: t('constants.featuretype.none'),
} as const;

export const COLORTYPE = {
  SINGLE: t('constants.colortype.single'),
  CATEGORIZED: t('constants.colortype.categorized'),
  INDIVISUAL: t('constants.colortype.indivisual'),
} as const;

export const COLORRAMP = {
  RANDOM: t('constants.colorramp.random'),
  // Spectral: 'スペクトラル',
  // WhiteToRed: '赤から白',
} as const;

export const CREATEPROJECTTYPE = {
  DEFAULT: t('constants.createproject.default'),
  SAVE: t('constants.createproject.save'),
  COPY: t('constants.createproject.copy'),
} as const;

export const PERMISSIONTYPE = {
  PRIVATE: t('constants.permission.private'),
  PUBLIC: t('constants.permission.public'),
  COMMON: t('constants.permission.common'),
} as const;

export const EXPORTTYPE = {
  CSV: 'csv',
  GeoJSON: 'geojson',
  GPX: 'gpx',
  JSON: 'json',
} as const;

export const LatLonDMSTemplate = {
  latitude: {
    decimal: '0',
    deg: '0',
    min: '0',
    sec: '0',
  },
  longitude: {
    decimal: '0',
    deg: '0',
    min: '0',
    sec: '0',
  },
};
export const SelectedPhotoTemplate = {
  id: '',
  name: '',
  uri: null,
  url: null,
  width: 0,
  height: 0,
  thumbnail: null,
  key: null,
  index: 0,
  fieldName: '',
  hasLocal: false,
};

export const POINTTOOL = {
  PLOT_POINT: 'map-marker-plus',
  ADD_LOCATION_POINT: 'map-marker-radius',
} as const;

export const LINETOOL = {
  PLOT_LINE: 'vector-line',
  FREEHAND_LINE: 'draw',
} as const;

export const POLYGONTOOL = {
  PLOT_POLYGON: 'vector-rectangle',
  FREEHAND_POLYGON: 'draw',
} as const;

export const INFOTOOL = {
  ALL_INFO: 'cursor-default-click',
  FEATURETYPE_INFO: 'cursor-default-click-outline',
} as const;

export const DRAWTOOL = {
  ...POINTTOOL,
  ...LINETOOL,
  ...POLYGONTOOL,
  ...INFOTOOL,
  SELECT: 'select',
  MOVE_POINT: 'map-marker-right',
  DELETE_POINT: 'map-marker-remove',
  MOVE: 'cursor-move',
  UNDO: 'undo-variant',
  SAVE: 'content-save',
  DELETE: 'delete',
  NONE: 'none',
  ...HISYOUTOOL,
} as const;

export const PEN = {
  PEN_THICK: 'circle',
  PEN_MEDIUM: 'circle-medium',
  PEN_THIN: 'circle-small',
} as const;

export const ERASER = {
  ERASER: 'eraser',
} as const;

export const MAPMEMOTOOL = {
  ...PEN,
  ...ERASER,
  COLOR: 'palette-outline',
  UNDO: 'undo-variant',
  REDO: 'redo-variant',
  NONE: 'none',
} as const;

export const HOME_FEATURE_BTN = {
  POINT: 'scatter-plot',
  LINE: 'chart-timeline-variant',
  POLYGON: 'pentagon-outline',
  MEMO: 'image-edit',
  NONE: 'flower-tulip',
} as const;

export const HOME_ACCOUNT_BTN = {
  ACCOUNT: 'account',
  PROJECTS: 'apps',
  SETTING: 'account-cog',
  LOGOUT: 'logout-variant',
} as const;

export const HOME_BTN = {
  GPS: 'crosshairs-gps',
  TRACK: 'walk',
  COMPASS: 'arrow-up-bold',
  ZOOM_PLUS: 'plus',
  ZOOM_MINUS: 'minus',
  MAPS: 'layers',
  LAYERS: 'table-edit',
  SETTINGS: 'cog',
} as const;

export const MAPS_BTN = {
  MAP_LIST: 'layers-search',
  MAP_ADD: 'plus',
  ONLINE: 'wifi',
  OFFLINE: 'wifi-off',
} as const;

export const MAPLIST_BTN = {
  RELOAD: 'reload',
} as const;

export const DATAEDIT_BTN = {
  JUMP: 'airplane',
  GOOGLE: 'google',
  DELETE: 'delete',
  SAVE: 'content-save',
} as const;

export const DATA_BTN = {
  ADD: 'plus',
  DELETE: 'delete',
  EXPORT: 'briefcase-download',
} as const;

export const LAYERS_BTN = {
  IMPORT: 'database-import',
  ADD: 'plus',
} as const;

export const LAYEREDIT_BTN = {
  DELETE: 'delete',
  SAVE: 'content-save',
  EXPORT: 'briefcase-download',
} as const;

export const PROJECTS_BTN = {
  RELOAD: 'reload',
  ADD: 'plus',
} as const;

export const PROJECTEDIT_BTN = {
  OPEN: 'folder-open',
  SETTING: 'folder-cog',
  EXPORT: 'database-export',
  DELETE: 'delete',
  SAVE: 'content-save',
} as const;

export const SETTINGS_BTN = {
  MAP_LIST_URL: 'link-variant',
  FILE_NEW: 'file',
  FILE_SAVE: 'content-save',
  FILE_OPEN: 'folder-open',
  MAP_CACHE_DELETE: 'delete-variant',
  PHOTO_CACHE_DELETE: 'delete-circle',
  APRI_CLEAR: 'restore',
  MANUAL: 'help',
  TERMSOFUSE: 'book-open-variant',
  OSSLICENSE: 'star',
  VERSION: 'clock-time-four-outline',
} as const;

export const ACCOUNT_SETTINGS_BTN = {
  ACCOUNT_EDIT: 'account-edit',
  PASSWORD_CHANGE: 'account-key',
  ENCRYPTION_PASSWORD_CHANGE: 'file-key',
  ENCRYPTION_KEY_RESET: 'cellphone-key',
  ACCOUNT_DELETE: 'account-off',
  UPGRADE: 'account-star',
  PROJECT_IMPORT: 'folder-open',
  PROJECT_DELETE_ALL: 'database-remove',
} as const;

export const NAV_BTN = {
  CLOSE: 'close',
  EXPAND: 'arrow-expand',
  COLLAPSE: 'arrow-collapse',
} as const;

export const DEFAULT_MAP_LIST_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRMrdVYRXwBY48wvorb8X7mBG8lx2cdFeRVMzxLqlkGbep2GzR0D22Ti4k0XbXeE_9T8TYlidR5fRDt/pub?gid=0&single=true&output=csv';
