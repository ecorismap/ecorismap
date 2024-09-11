import { cloneDeep } from 'lodash';
import { COLOR } from '../constants/AppConstants';
import { t } from '../i18n/config';
import { RecordType, LayerType } from '../types';
import { ulid } from 'ulid';
import { hex2rgba } from './Color';
import dayjs from '../i18n/dayjs';

export const getColor = (layer: LayerType, feature: RecordType) => {
  //colorは以前はhexで保存していたが、rgbaで保存するように変更したため、hexの場合はrgbaに変換する。
  //rgbaになっている場合は、hex2rgbaの中でレイヤの透過率を反映する。
  const colorStyle = layer.colorStyle;

  let color = COLOR.WHITE;
  if (colorStyle.colorType === 'SINGLE') {
    color = hex2rgba(colorStyle.color);
  } else if (colorStyle.colorType === 'CATEGORIZED') {
    if (colorStyle.fieldName === '__CUSTOM') {
      const fieldNames = colorStyle.customFieldValue.split('|');
      const customValue = fieldNames.map((name) => feature.field[name]).join('|');
      const colorObj = colorStyle.colorList.find(({ value }) => value === customValue);
      color = colorObj ? hex2rgba(colorObj.color) : 'rgba(0,0,0,0)';
    } else {
      const colorObj = colorStyle.colorList.find(({ value }) => value === feature.field[colorStyle.fieldName]);
      color = colorObj ? hex2rgba(colorObj.color) : 'rgba(0,0,0,0)';
    }
  } else if (colorStyle.colorType === 'INDIVIDUAL') {
    const individualColorField =
      layer.colorStyle.fieldName === '__CUSTOM' ? layer.colorStyle.customFieldValue : layer.colorStyle.fieldName;
    color = (feature.field[individualColorField] as string) ?? 'rgba(0,0,0,1)';
  } else if (colorStyle.colorType === 'USER') {
    const colorObj = colorStyle.colorList.find(({ value }) => value === feature.displayName);
    color = colorObj ? hex2rgba(colorObj.color) : 'rgba(0,0,0,0)';
  }
  return color;
};

export function getColorRule(layer_: LayerType, displayName?: string) {
  let colorRule: any;
  //const colorStyle = layer_.colorStyle;
  const colorType = layer_.colorStyle.colorType;
  const fieldName = layer_.colorStyle.fieldName;
  const colorList = layer_.colorStyle.colorList;
  const customFieldValue = layer_.colorStyle.customFieldValue;
  const color = layer_.colorStyle.color;
  if (colorType === 'SINGLE') {
    colorRule = hex2rgba(color) ?? 'rgba(255,0,0,0)';
  } else if (colorType === 'CATEGORIZED') {
    if (fieldName === '__CUSTOM') {
      const fieldNames = customFieldValue.split('|');
      const defaultColor = 'rgba(0,0,0,0)';
      const conditionalColors = colorList
        .map(({ value, color: c }) => {
          const colorValue = hex2rgba(c) ?? defaultColor;
          return [value + '|', colorValue];
        })
        .flat();
      const field = fieldNames.map((f) => [['get', f], '|']).flat();
      colorRule = ['match', ['concat', ...field], ...conditionalColors, defaultColor];
    } else {
      const defaultColor = 'rgba(0,0,0,0)';

      const conditionalColors = colorList
        .map(({ value, color: c }) => {
          const colorValue = hex2rgba(c) ?? defaultColor;
          return [value, colorValue];
        })
        .flat();
      colorRule = ['match', ['get', fieldName], ...conditionalColors, defaultColor];
    }
  } else if (colorType === 'INDIVIDUAL') {
    const individualColorField =
      layer_.colorStyle.fieldName === '__CUSTOM' ? layer_.colorStyle.customFieldValue : layer_.colorStyle.fieldName;
    colorRule = [
      'coalesce',
      layer_.colorStyle.colorType === 'INDIVIDUAL' ? ['get', individualColorField] : 'rgba(0,0,0,1)',
      'rgba(0,0,0,1)',
    ];
  } else if (colorType === 'USER') {
    const defaultColor = 'rgba(0,0,0,0)';
    const colorObj = colorList.find(({ value }) => value === displayName);
    colorRule = colorObj !== undefined ? hex2rgba(colorObj.color) ?? defaultColor : defaultColor;
  }
  return colorRule;
}

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
  if (
    layer.field.find(
      (f) =>
        f.format === 'LIST' &&
        f.list !== undefined &&
        f.list.find((l) => l.isOther) &&
        f.list.find((l) => !l.isOther && l.value === '')
    )
  ) {
    return { isOK: false, message: t('utils.Layer.message.listItemsWarning') };
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

  return { isOK: true, message: '' };
};

export const getTargetLayers = (
  layers: LayerType[],
  uploadType: 'All' | 'PublicAndPrivate' | 'Common' | 'Template'
) => {
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
    case 'Template':
      withPublicData = true;
      withPrivateData = true;
      break;
  }

  const targetLayers = layers.filter((layer) => {
    const result =
      (withCommonData && layer.permission === 'COMMON') ||
      (withPublicData && layer.permission === 'PUBLIC') ||
      (withPrivateData && layer.permission === 'PRIVATE');
    //console.log(result, layer.name, layer.permission);
    return result;
  });
  return targetLayers;
};

export function changeLayerId(layer: LayerType) {
  const newLayer = cloneDeep(layer);
  newLayer.active = false;
  newLayer.id = ulid();

  const fieldIdMap: { [key: string]: string } = {};
  newLayer.field.forEach((f) => {
    const newId = ulid();
    fieldIdMap[f.id] = newId;
    f.id = newId;
    f.useDictionaryAdd = false; //辞書追加を無効にする.すでに他のレイヤで有効になっている場合があるため
  });
  //新旧のレイヤーIDの対応と、新旧のフィールドIDの対応を保存する
  return {
    layer: newLayer,
    layerIdMap: { [layer.id]: newLayer.id },
    fieldIdMap: fieldIdMap,
  };
}

export const isLayerType = (object: any): object is LayerType => {
  return (
    object !== null &&
    typeof object === 'object' &&
    typeof object.id === 'string' &&
    typeof object.name === 'string' &&
    typeof object.type === 'string' &&
    typeof object.permission === 'string' &&
    typeof object.colorStyle === 'object' && // You may want to perform a deeper check here
    typeof object.label === 'string' &&
    (object.customLabel === undefined || typeof object.customLabel === 'string') &&
    typeof object.visible === 'boolean' &&
    typeof object.active === 'boolean' &&
    Array.isArray(object.field)
  ); // You may want to perform a deeper check here
};

export function generateLabel(layer: LayerType, feature: RecordType) {
  return layer.label === t('common.custom')
    ? layer.customLabel
        ?.split('|')
        .map((f) => {
          const fieldName = f.trim(); // Remove leading and trailing whitespaces
          if (fieldName.startsWith('"') || fieldName.startsWith("'")) {
            return fieldName.substring(1, fieldName.length - 1); // Remove quotes
          } else {
            return feature.field[fieldName];
          }
        })
        .join('') || '' // Remove space between joined items
    : layer.label === ''
    ? ''
    : feature.field[layer.label]
    ? layer.field.find((f) => f.name === layer.label)?.format === 'DATETIME'
      ? dayjs(feature.field[layer.label].toString()).format('L HH:mm')
      : feature.field[layer.label].toString()
    : '';
}
