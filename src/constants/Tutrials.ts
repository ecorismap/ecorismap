import { t } from '../i18n/config';

export const TUTRIALS = {
  TERMS_OF_USE: true,
  POINTTOOL_ADD_POINT: true,
  POINTTOOL_ADD_LOCATION_POINT: true,
  POINTTOOL_MOVE_POINT: true,
  LAYERS_BTN_IMPORT: true,
  HOME_BTN_GPS: true,
  HOME_BTN_TRACK: true,
  MAPS_BTN_ONLINE: true,
  MAPS_BTN_OFFLINE: true,
};

export const TUTRIALS_MESSAGE = {
  TERMS_OF_USE: t('tutrials.termsOfUse'),
  POINTTOOL_ADD_POINT: t('tutrials.pointtool.add'),
  POINTTOOL_ADD_LOCATION_POINT: t('tutrials.pointtool.add_location'),
  POINTTOOL_MOVE_POINT: t('tutrials.pointtool.move'),
  LAYERS_BTN_IMPORT: t('tutrials.layers_btn.import'),
  HOME_BTN_GPS: t('tutrials.home_btn.gps'),
  HOME_BTN_TRACK: t('tutrials.home_btn.track'),
  MAPS_BTN_ONLINE: t('tutrials.maps_btn.online'),
  MAPS_BTN_OFFLINE: t('tutrials.maps_btn.offline'),
} as const;
