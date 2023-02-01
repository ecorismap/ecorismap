import { t } from '../i18n/config';

export const TUTRIALS = {
  TERMS_OF_USE: true,
  POINTTOOL_PLOT_POINT: true,
  POINTTOOL_ADD_LOCATION_POINT: true,
  LINETOOL_PLOT_LINE: true,
  LINETOOL_FREEHAND_LINE: true,
  POLYGONTOOL_PLOT_POLYGON: true,
  POLYGONTOOL_FREEHAND_POLYGON: true,
  SELECTIONTOOL: true,
  INFOTOOL: true,
  LAYERS_BTN_IMPORT: true,
  HOME_BTN_GPS: true,
  HOME_BTN_TRACK: true,
  MAPS_BTN_ONLINE: true,
  MAPS_BTN_OFFLINE: true,
};

export const TUTRIALS_MESSAGE = {
  TERMS_OF_USE: t('tutrials.termsOfUse'),
  POINTTOOL_PLOT_POINT: t('tutrials.pointtool.add'),
  POINTTOOL_ADD_LOCATION_POINT: t('tutrials.pointtool.add_location'),
  LINETOOL_PLOT_LINE: t('tutrials.linetool.plot'),
  LINETOOL_FREEHAND_LINE: t('tutrials.linetool.freehand'),
  POLYGONTOOL_PLOT_POLYGON: t('tutrials.polygontool.plot'),
  POLYGONTOOL_FREEHAND_POLYGON: t('tutrials.polygontool.freehand'),
  INFOTOOL: t('tutrials.infotool'),
  SELECTIONTOOL: t('tutrials.selectiontool'),
  LAYERS_BTN_IMPORT: t('tutrials.layers_btn.import'),
  HOME_BTN_GPS: t('tutrials.home_btn.gps'),
  HOME_BTN_TRACK: t('tutrials.home_btn.track'),
  MAPS_BTN_ONLINE: t('tutrials.maps_btn.online'),
  MAPS_BTN_OFFLINE: t('tutrials.maps_btn.offline'),
} as const;
