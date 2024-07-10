import * as FileSystem from 'expo-file-system';
import { t } from '../i18n/config';

export const AppID = 'jp.co.ecoris.ecorismap';
export const VERSION = 'Version 0.4.0beta';

export const PLUGIN = {
  HISYOUTOOL: true,
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
  ALFABLUE: '#007AFF99',
  ALFABLUE2: '#007AFF77',
  YELLOW: '#FFF100',
  ALFAYELLOW: '#FFF10099',
  RED: '#ff0000',
  ALFARED: '#ff000099',
  DARKRED: 'darkred',
  LIGHTRED: '#ffcccb',
  PALERED: '#ff7d7d',
  ORANGE: '#ff8300',
  GREEN: '#00ff00',
  DARKGREEN: '#008000',
  ALFAORANGE: '#ff830099',
  WHITE: '#FFF',
  ALFAWHITE: '#FFFFFF99',
  BLACK: '#000',
  CAROUSEL_BACKGROUND: 'rgba(1, 1, 1, 0.1)',
  TRACK: '#0000FFee',
};

export const TILE_FOLDER = `${FileSystem.documentDirectory}tiles`;
export const PHOTO_FOLDER = `${FileSystem.documentDirectory}projects`;

export const DEGREE_INTERVAL = 2;

export const TASK = {
  FETCH_LOCATION: 'FETCH_LOCATION',
};

export const ROLETYPE = {
  MEMBER: t('constants.roletype.member'),
  ADMIN: t('constants.roletype.admin'),
  OWNER: t('constants.roletype.owner'),
} as const;

export const DATAFORMAT = {
  STRING: t('constants.dataformat.string'),
  STRING_MULTI: t('constants.dataformat.string_multi'),
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
  LAYERGROUP: t('constants.featuretype.layergroup'),
} as const;

export const COLORTYPE = {
  SINGLE: t('constants.colortype.single'),
  CATEGORIZED: t('constants.colortype.categorized'),
  INDIVIDUAL: t('constants.colortype.individual'),
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
  SPLIT_LINE: 'content-cut',
} as const;

export const POLYGONTOOL = {
  PLOT_POLYGON: 'vector-rectangle',
  FREEHAND_POLYGON: 'draw',
} as const;

export const INFOTOOL = {
  ALL_INFO: 'cursor-default-click',
  POINT_INFO: 'scatter-plot',
  LINE_INFO: 'chart-timeline-variant',
  POLYGON_INFO: 'pentagon-outline',
  NONE: 'none',
} as const;

export const DRAWTOOL = {
  ...POINTTOOL,
  ...LINETOOL,
  ...POLYGONTOOL,
  SELECT: 'cursor-default-click-outline',
  MOVE_POINT: 'map-marker-right',
  DELETE_POINT: 'map-marker-remove',
  DELETE_POSITION: 'map-marker-remove-outline',
  MOVE: 'cursor-move',
  FINISH_EDIT_POSITION: 'undo-variant',
  UNDO: 'undo-variant',
  SAVE: 'content-save',
  DELETE: 'delete',
  NONE: 'none',
} as const;

export const PEN = {
  PEN: 'lead-pencil',
  PEN_OFF: 'pencil-off',
  PEN_THICK: 'circle',
  PEN_MEDIUM: 'circle-medium',
  PEN_THIN: 'circle-small',
} as const;

export const PEN_STYLE = {
  STRAIGHT: 'chart-line-variant',
  FREEHAND: 'gesture',
  NONE: 'ray-start-end',
  ARROW_END: 'arrow-right',
  ARROW_BOTH: 'arrow-left-right',
} as const;

export const STAMP_HISYOU = {
  TOMARI: 'circle-medium',
  KARI: 'close-thick',
  HOVERING: 'alpha-h-circle-outline',
} as const;

export const STAMP = {
  STAMP: 'stamper',
  NUMBERS: 'numeric',
  ALPHABETS: 'alphabetical-variant',
  TEXT: 'format-text',
  IMAGE: 'image',
  SQUARE: 'square',
  CIRCLE: 'circle',
  TRIANGLE: 'triangle',
  ...STAMP_HISYOU,
} as const;

export const ARROW = {
  ARROW: 'arrow-top-right',
} as const;

export const BRUSH_HISYOU = {
  SENKAI: 'circle-outline',
  SENJYOU: 'circle-double',
  KOUGEKI: 'flag-triangle',
  DISPLAY: 'stairs',
  KYUKOKA: 'chevron-triple-down',
} as const;

export const BRUSH = {
  BRUSH: 'brush',
  PLUS: 'plus',
  CROSS: 'sign-pole',
  ...BRUSH_HISYOU,
} as const;

export const ERASER = {
  ERASER: 'eraser',
  PEN_ERASER: 'eraser',
  BRUSH_ERASER: 'brush',
  STAMP_ERASER: 'stamper',
} as const;
export const MAPMEMOTOOL = {
  ...PEN,
  ...STAMP,
  ...BRUSH,
  ...ERASER,
  COLOR: 'palette-outline',
  UNDO: 'undo-variant',
  REDO: 'redo-variant',
  PENCIL_LOCK: 'pencil-lock',
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
  EXPORT: 'briefcase-download',
  IMPORT: 'database-import',
} as const;

export const MAPLIST_BTN = {
  RELOAD: 'reload',
} as const;

export const DATAEDIT_BTN = {
  JUMP: 'airplane',
  GOOGLE: 'google',
  DELETE: 'delete',
  COPY: 'content-copy',
  SAVE: 'content-save',
  EDIT: 'pencil',
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
  PDF_SAVE: 'file-image-marker',
  MAP_CACHE_DELETE: 'delete-variant',
  PHOTO_CACHE_DELETE: 'delete-circle',
  APRI_CLEAR: 'restore',
  GPS_SETTINGS: 'crosshairs-gps',
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

export const ORIENTATIONTYPE = {
  PORTRAIT: t('constants.orientation.portrait'),
  LANDSCAPE: t('constants.orientation.landscape'),
} as const;

export const GPS_ACCURACY = {
  HIGH: t('constants.gpsaccuracy.high'),
  MEDIUM: t('constants.gpsaccuracy.medium'),
  LOW: t('constants.gpsaccuracy.low'),
} as const;
