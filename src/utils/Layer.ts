import { cloneDeep } from 'lodash';
import { COLOR } from '../constants/AppConstants';
import { t } from '../i18n/config';
import { RecordType, LayerType } from '../types';
import { v4 as uuidv4 } from 'uuid';

export const getColor = (layer: LayerType, feature: RecordType) => {
  const colorStyle = layer.colorStyle;
  let color = COLOR.WHITE;
  if (colorStyle.colorType === 'SINGLE') {
    color = colorStyle.color;
  } else if (colorStyle.colorType === 'CATEGORIZED') {
    const colorObj = colorStyle.colorList.find(({ value }) => value === feature.field[colorStyle.fieldName]);
    color = colorObj ? colorObj.color : colorStyle.color;
  } else if (colorStyle.colorType === 'USER') {
    const colorObj = colorStyle.colorList.find(({ value }) => value === feature.displayName);
    color = colorObj ? colorObj.color : colorStyle.color;
  }
  return color;
};

export const getPhotoFields = (layer: LayerType) => {
  return layer.field.filter((f) => f.format === 'PHOTO');
};

export const checkLayerInputs = (layer: LayerType) => {
  if (layer.name === '') {
    return { isOK: false, message: t('utils.Layer.message.inputLayerName') };
  }
  if (layer.field.find(({ name }) => name === '')) {
    return { isOK: false, message: t('utils.Layer.message.inputFieldName') };
  }
  if (layer.field.find(({ name }) => name === '_id')) {
    return { isOK: false, message: t('utils.Layer.message._id') };
  }
  if (layer.field.find((f) => f.format === 'LIST' && f.list === undefined)) {
    //console.log(layer);
    return { isOK: false, message: t('utils.Layer.message.inputListItem') };
  }
  if (layer.field.find((f) => f.format === 'RADIO' && f.list === undefined)) {
    return { isOK: false, message: t('utils.Layer.message.inputRadioItem') };
  }
  if (layer.field.find((f) => f.format === 'CHECK' && f.list === undefined)) {
    return { isOK: false, message: t('utils.Layer.message.inputCheckItem') };
  }
  if (layer.field.find((f) => f.format === 'TABLE' && f.list === undefined)) {
    return { isOK: false, message: t('utils.Layer.message.inputTableItem') };
  }
  if (layer.field.find((f) => f.format === 'LISTTABLE' && f.list === undefined)) {
    return { isOK: false, message: t('utils.Layer.message.inputListTableItem') };
  }
  //重複チェック
  const duplicateCleanedField = Array.from(new Set(layer.field.map(({ name }) => name)));
  if (layer.field.length !== duplicateCleanedField.length) {
    return { isOK: false, message: t('utils.Layer.message.duplicateFieldName') };
  }
  //SERIAL複数チェック
  const serialField = layer.field.filter(({ format }) => format === 'SERIAL');
  if (serialField.length > 1) {
    return { isOK: false, message: t('utils.Layer.message.duplicateSerial') };
  }
  return { isOK: true, message: '' };
};

export const getTargetLayers = (layers: LayerType[], uploadType: 'All' | 'PublicAndPrivate' | 'Common') => {
  let withCommonData = false;
  let withPublicData = false;
  let withPrivateData = false;
  switch (uploadType) {
    case 'All':
      withCommonData = true;
      withPublicData = true;
      withPrivateData = true;
      break;
    case 'PublicAndPrivate':
      withPublicData = true;
      withPrivateData = true;
      break;
    case 'Common':
      withCommonData = true;
      break;
  }

  const targetLayers = layers.filter(
    async (layer) =>
      (withCommonData && layer.permission === 'COMMON') ||
      (withPublicData && layer.permission === 'PUBLIC') ||
      (withPrivateData && layer.permission === 'PRIVATE')
  );
  return targetLayers;
};

export function updateLayerIds(layer: LayerType) {
  const newLayer = cloneDeep(layer);
  newLayer.id = uuidv4();
  newLayer.field.forEach((f) => {
    f.id = uuidv4();
  });
  return newLayer;
}
