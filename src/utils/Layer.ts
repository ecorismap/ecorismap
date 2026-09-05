import { cloneDeep } from 'lodash';
import { COLOR } from '../constants/AppConstants';
import { t } from '../i18n/config';
import { RecordType, LayerType, ColorStyle } from '../types';
import { ulid } from 'ulid';
import { getUserColor, hex2rgba } from './Color';
import dayjs from '../i18n/dayjs';

/**
 * 編集したcolorStyleをレイヤに反映する。
 * マップメモのペン使用時にINDIVIDUALへ切り替えた際、ラベル設定はcolorStyleへ退避してある。
 * カラータイプが戻された時点でラベルを復元する（色分けフィールドの復元はuseFeatureStyle側で行う）。
 */
export const applyColorStyle = (layer: LayerType, colorStyle: ColorStyle): LayerType => {
  if (colorStyle.savedLabel === undefined || colorStyle.colorType === 'INDIVIDUAL') {
    return { ...layer, colorStyle };
  }
  const { savedLabel, ...restored } = colorStyle;
  return { ...layer, colorStyle: restored, label: savedLabel };
};

/**
 * 線の太さを決める。
 * _strokeWidthはマップメモが描画時に記録する太さで、レコード自身の値なのでレイヤ一律の太さより優先する。
 * 色と違い「凡例による意味づけ」と競合しないため、colorTypeには依存させない。
 */
export const getLineWidth = (layer: LayerType, feature: RecordType): number => {
  //エクスポート済みGeoJSONの再インポートでは_strokeWidthが空文字のことがあるため、数値のみ採用する
  if (typeof feature.field._strokeWidth === 'number') return feature.field._strokeWidth;
  return layer.colorStyle.lineWidth ?? 1.5;
};

/**
 * ズームに応じた線の太さ。
 * _zoomはマップメモが描画時に記録したズームレベル。描画時よりズームアウトした場合のみ
 * 2^(zoom - _zoom)倍で地理的に縮小し、ズームアウトで線が地図を覆い尽くすのを防ぐ。
 * ズームイン側は画面上の太さを維持する。
 * _zoomを持たない旧レコードやマップメモ以外のレコードは常に固定幅。
 */
export const getLineWidthAtZoom = (layer: LayerType, feature: RecordType, zoom: number): number => {
  const width = getLineWidth(layer, feature);
  const drawnZoom = feature.field._zoom;
  if (typeof drawnZoom !== 'number' || drawnZoom <= 0) return width;
  if (zoom >= drawnZoom) return width;
  return width * 2 ** (zoom - drawnZoom);
};

/**
 * ズームに応じたマップメモ記号（スタンプ・ブラシ）の縮小率。
 * 線幅と同じく、描画時（_zoom）よりズームアウトした場合のみ2^(zoom - _zoom)倍に縮小する。
 * _zoomを持たない旧レコードは常に1（固定サイズ）。
 */
export const getMapMemoSymbolScaleAtZoom = (feature: RecordType, zoom: number): number => {
  const drawnZoom = feature.field._zoom;
  if (typeof drawnZoom !== 'number' || drawnZoom <= 0) return 1;
  if (zoom >= drawnZoom) return 1;
  return 2 ** (zoom - drawnZoom);
};

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
    // colorListに無いユーザー（色設定後に参加したメンバー等）は透明で見えなくなるため、
    // displayNameから決定的に生成した色でフォールバックする（全端末で同じ色になる）
    color = colorObj
      ? hex2rgba(colorObj.color)
      : feature.displayName
      ? getUserColor(feature.displayName)
      : 'rgba(0,0,0,0)';
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
    // colorListに無いユーザーは決定的な色でフォールバックする（getColorのUSER分岐と同じ扱い）
    const defaultColor = displayName ? getUserColor(displayName) : 'rgba(0,0,0,0)';
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
  newLayer.groupId = undefined;
  newLayer.expanded = undefined;
  newLayer.sortedName = undefined;
  newLayer.sortedOrder = undefined;
  
  // dictionaryFieldIdの初期化
  let newDictionaryFieldId: string | undefined;
  const oldDictionaryFieldId = newLayer.dictionaryFieldId;
  newLayer.dictionaryFieldId = undefined;

  const fieldIdMap: { [key: string]: string } = {};
  newLayer.field.forEach((f) => {
    const newId = ulid();
    fieldIdMap[f.id] = newId;

    // 元のdictionaryFieldIdと一致する場合は、新しいIDを記録（辞書型・動的辞書型のみ有効）
    if (oldDictionaryFieldId === f.id && (f.format === 'STRING_DICTIONARY' || f.format === 'STRING_DYNAMIC')) {
      newDictionaryFieldId = newId;
    }

    f.id = newId;
    // 辞書型・動的辞書型以外に残留したuseDictionaryAddは無効なので解除する
    if (f.format !== 'STRING_DICTIONARY' && f.format !== 'STRING_DYNAMIC' && f.useDictionaryAdd) {
      f.useDictionaryAdd = false;
    }
  });

  // useDictionaryAddがtrueの辞書型・動的辞書型フィールドがある場合、そのIDをdictionaryFieldIdに設定
  const dictionaryField = newLayer.field.find(
    (f) => f.useDictionaryAdd && (f.format === 'STRING_DICTIONARY' || f.format === 'STRING_DYNAMIC')
  );
  if (dictionaryField) {
    newLayer.dictionaryFieldId = dictionaryField.id;
  } else if (newDictionaryFieldId) {
    // 元のdictionaryFieldIdがあった場合は、新しいIDに更新
    newLayer.dictionaryFieldId = newDictionaryFieldId;
  }
  
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
