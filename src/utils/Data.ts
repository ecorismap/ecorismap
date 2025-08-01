import {
  DataType,
  DMSKey,
  FieldType,
  FormatType,
  LatLonDMSKey,
  LatLonDMSType,
  LayerType,
  PhotoType,
  PointRecordType,
  RecordType,
  UserType,
  LineRecordType,
  PolygonRecordType,
} from '../types';
import dayjs from '../i18n/dayjs';
import { formattedInputs } from './Format';
import { cloneDeep } from 'lodash';
import { latLonDMS } from './Coords';
import { t } from '../i18n/config';
import { isLocationType } from './General';

export type SortOrderType = 'ASCENDING' | 'DESCENDING' | 'UNSORTED';

export const sortData = (data: RecordType[], fieldName: string, order: SortOrderType = 'UNSORTED') => {
  //console.log('sortData', fieldName, order);
  const dataWithIdx = data.map((d, idx) => ({ ...d, idx }));
  let idx = data.map((_, i) => i);
  if (data.length === 0) {
    return { data: [], idx: [] };
  }

  let sortedDataWithIdx;
  if (fieldName === '_user_') {
    sortedDataWithIdx = [...dataWithIdx].sort((a, b) =>
      (a.displayName || '').toString().localeCompare((b.displayName || '').toString(), undefined, { numeric: true })
    );
  } else {
    if (data[0].field[fieldName] === undefined) {
      return { data, idx };
    }
    sortedDataWithIdx = [...dataWithIdx].sort((a, b) =>
      a.field[fieldName].toString().localeCompare(b.field[fieldName].toString(), undefined, { numeric: true })
    );
  }

  if (order === 'DESCENDING') {
    sortedDataWithIdx.reverse();
  }
  // 二次ソート
  sortedDataWithIdx = sortedDataWithIdx.sort((a, b) => {
    if (fieldName === '_user_') {
      if ((a.displayName || '') === (b.displayName || '')) {
        return a.idx - b.idx;
      }
      return 0;
    } else {
      if (a.field[fieldName] === b.field[fieldName]) {
        return a.idx - b.idx;
      }
      return 0;
    }
  });
  const sortedData: RecordType[] = sortedDataWithIdx.map(({ idx: _, ...d }) => d);
  idx = sortedDataWithIdx.map(({ idx: Idx }) => Idx);
  return { data: sortedData, idx };
};

export const changeFieldValue = (
  originalData: string | number | PhotoType[],
  originalFormat: FormatType,
  changedFormat: FormatType,
  list?: { value: string; isOther: boolean }[]
): string | number | PhotoType[] => {
  if (originalFormat === 'INTEGER' && (changedFormat === 'STRING' || changedFormat === 'STRING_MULTI')) {
    return originalData.toString();
  } else if (originalFormat === 'INTEGER' && changedFormat === 'DECIMAL') {
    return originalData;
  } else if (originalFormat === 'INTEGER' && changedFormat === 'SERIAL') {
    return originalData;
  } else if (originalFormat === 'SERIAL' && (changedFormat === 'STRING' || changedFormat === 'STRING_MULTI')) {
    return originalData.toString();
  } else if (originalFormat === 'SERIAL' && changedFormat === 'INTEGER') {
    return originalData;
  } else if (originalFormat === 'SERIAL' && changedFormat === 'DECIMAL') {
    return originalData;
  } else if (originalFormat === 'DECIMAL' && (changedFormat === 'STRING' || changedFormat === 'STRING_MULTI')) {
    return originalData.toString();
  } else if (originalFormat === 'DATETIME' && (changedFormat === 'STRING' || changedFormat === 'STRING_MULTI')) {
    return originalData;
  } else if (originalFormat === 'DATESTRING' && (changedFormat === 'STRING' || changedFormat === 'STRING_MULTI')) {
    return originalData;
  } else if (originalFormat === 'TIMESTRING' && (changedFormat === 'STRING' || changedFormat === 'STRING_MULTI')) {
    return originalData;
  } else if (originalFormat === 'TIMERANGE' && (changedFormat === 'STRING' || changedFormat === 'STRING_MULTI')) {
    return originalData;
  } else if (originalFormat === 'NUMBERRANGE' && (changedFormat === 'STRING' || changedFormat === 'STRING_MULTI')) {
    return originalData;
  } else if (originalFormat === 'STRING' && changedFormat === 'INTEGER') {
    return parseInt(originalData as string, 10);
  } else if (originalFormat === 'STRING' && changedFormat === 'DECIMAL') {
    return parseFloat(originalData as string);
  } else if (originalFormat === 'STRING' && changedFormat === 'SERIAL') {
    return parseInt(originalData as string, 10);
  } else if (originalFormat === 'STRING' && changedFormat === 'DATETIME') {
    return originalData;
  } else if (originalFormat === 'STRING' && changedFormat === 'LIST') {
    return originalData;
  } else if (originalFormat === 'LIST' && changedFormat === 'LIST') {
    return originalData;
  } else if (originalFormat === 'LIST' && changedFormat === 'STRING') {
    return originalData;
  }
  return getInitialFieldValue(changedFormat, list);
};

export const getInitialFieldValue = (
  format: FormatType,
  list?: { value: string; isOther: boolean }[]
): string | number | PhotoType[] => {
  switch (format) {
    case 'STRING':
      return '';
    case 'STRING_MULTI':
      return '';
    case 'LIST':
      return list === undefined || list[0] === undefined ? '' : list[0].value;
    case 'RADIO':
      return list === undefined || list[0] === undefined ? '' : list[0].value;
    case 'CHECK':
      return '';
    case 'SERIAL':
      return 0;
    case 'INTEGER':
      return 0;
    case 'DECIMAL':
      return 0;
    case 'NUMBERRANGE':
      return `${t('common.ndash')}`;
    case 'DATETIME':
      return '';
    case 'DATESTRING':
      return '';
    case 'TIMESTRING':
      return '';
    case 'TIMERANGE':
      return `${t('common.ndash')}`;
    case 'TABLE':
      return '';
    case 'LISTTABLE':
      return '';
    case 'PHOTO':
      return [];
    default:
      return '';
  }
};

export const getDataLastValue = (dataSet: RecordType[], fieldName: string) => {
  const value = dataSet[dataSet.length - 1]?.field[fieldName];
  return value as string | number | undefined;
};

export const getGroupLastValue = (dataSet: RecordType[], groupFieldName: string, groupId: string) => {
  const groupDataSet = dataSet.filter((data) => data.id === groupId);
  if (groupDataSet === undefined) return '';
  const value = groupDataSet[groupDataSet.length - 1]?.field[groupFieldName] ?? '';
  return value as string | number | undefined;
};

export const getDefaultFieldValue = (field: FieldType, dataSet: RecordType[], options?: { groupId?: string }) => {
  switch (field.format) {
    case 'STRING': {
      let value;
      if (options?.groupId) {
        value = field.useLastValue ? getGroupLastValue(dataSet, field.name, options.groupId) : field.defaultValue;
      } else {
        value = field.useLastValue ? getDataLastValue(dataSet, field.name) : field.defaultValue;
      }
      return { [field.name]: value ?? '' };
    }
    case 'STRING_MULTI':
      return { [field.name]: field.defaultValue ?? '' };
    case 'SERIAL': {
      if (options?.groupId) {
        const lastValue = getGroupLastValue(dataSet, field.name, options.groupId);
        const serial = (typeof lastValue === 'number' ? lastValue : parseInt(lastValue ?? '0', 10)) + 1;
        return { [field.name]: serial };
      } else {
        const lastValue = getDataLastValue(dataSet, field.name);
        const serial = (typeof lastValue === 'number' ? lastValue : parseInt(lastValue ?? '0', 10)) + 1;
        return { [field.name]: serial };
      }
    }
    case 'INTEGER': {
      let value;
      if (options?.groupId) {
        value = field.useLastValue ? getGroupLastValue(dataSet, field.name, options.groupId) : field.defaultValue;
      } else {
        value = field.useLastValue ? getDataLastValue(dataSet, field.name) : field.defaultValue;
      }
      return { [field.name]: value ?? 0 };
    }
    case 'DECIMAL':
      return { [field.name]: field.defaultValue ?? 0 };
    case 'NUMBERRANGE':
      return { [field.name]: `${t('common.ndash')}` };
    case 'LIST': {
      let value;
      const defaultValue = field.list![0].isOther ? '' : field.list![0].value;
      if (options?.groupId) {
        value = field.useLastValue ? getGroupLastValue(dataSet, field.name, options.groupId) : defaultValue;
      } else {
        value = field.useLastValue ? getDataLastValue(dataSet, field.name) : defaultValue;
      }
      return { [field.name]: value ?? '' };
    }
    case 'RADIO':
      return { [field.name]: field.list![0].value };
    case 'CHECK':
      return { [field.name]: '' };
    case 'DATETIME':
      return { [field.name]: dayjs().format() };
    case 'DATESTRING': {
      let value;
      if (options?.groupId) {
        value = field.useLastValue ? getGroupLastValue(dataSet, field.name, options.groupId) : dayjs().format('L');
      } else {
        value = field.useLastValue ? getDataLastValue(dataSet, field.name) : dayjs().format('L');
      }
      return { [field.name]: value ?? '' };
    }
    case 'TIMESTRING':
      return { [field.name]: field.defaultValue ?? dayjs().format('HH:mm') };
    case 'TIMERANGE': {
      let value;
      const defaultValue =
        field.defaultValue ?? `${dayjs().format('HH:mm')}${t('common.ndash')}${dayjs().format('HH:mm')}`;
      if (options?.groupId) {
        value = field.useLastValue ? getGroupLastValue(dataSet, field.name, options.groupId) : defaultValue;
      } else {
        value = field.useLastValue ? getDataLastValue(dataSet, field.name) : defaultValue;
      }
      return { [field.name]: value ?? '' };
    }
    case 'PHOTO':
      return { [field.name]: [] as PhotoType[] };
    case 'TABLE':
      return { [field.name]: '' };
    case 'LISTTABLE':
      return { [field.name]: '' };
    case 'REFERENCE':
      return { [field.name]: '' };
    default:
      return { [field.name]: '' };
  }
};

export const updateReferenceFieldValue = (layer: LayerType, field: RecordType['field'], id: string) => {
  const referenceField = layer.field.find(({ format }) => format === 'REFERENCE');
  if (referenceField === undefined) return field;
  const primaryField = referenceField.list && referenceField.list[2] && referenceField.list[2].value;
  const primaryKey = primaryField === '_id' ? id : primaryField && field[primaryField];
  if (primaryKey === undefined) return field;
  const updatedField = cloneDeep(field);
  updatedField[referenceField.name] = primaryKey;
  return updatedField;
};

export const getDefaultField = (
  layer: LayerType,
  dataSet: RecordType[],
  id: string,
  options?: { groupId?: string }
) => {
  const defaultField = layer.field
    .map((fieldObject) => getDefaultFieldValue(fieldObject, dataSet, options))
    .reduce((obj, userObj) => Object.assign(obj, userObj), {});
  return updateReferenceFieldValue(layer, defaultField, id);
};

export const checkFieldInput = (layer: LayerType, record: RecordType) => {
  for (const l of layer.field) {
    //console.log(l.name, l.format, record.field[l.name]);
    const { isOK } = formattedInputs(record.field[l.name], l.format, false);
    if (!isOK) {
      return {
        isOK: false,
        message: `${t('Data.alert.checkFieldInput')} ${l.name}(${l.format}):${record.field[l.name]} `,
      };
    }
  }

  return { isOK: true, message: '' };
};

export const checkCoordsInput = (latlon: LatLonDMSType, isDecimal: boolean) => {
  if (isDecimal) {
    const dmsType = 'decimal';
    const latlonTypes: LatLonDMSKey[] = ['latitude', 'longitude'];
    for (const latlonType of latlonTypes) {
      const formatted = formattedInputs(latlon[latlonType][dmsType], `${latlonType}-${dmsType}`, false);
      if (!formatted.isOK) return false;
    }
  } else {
    const latlonTypes: LatLonDMSKey[] = ['latitude', 'longitude'];
    for (const latlonType of latlonTypes) {
      const dmsTypes: DMSKey[] = ['deg', 'min', 'sec'];
      for (const dmsType of dmsTypes) {
        const formatted = formattedInputs(latlon[latlonType][dmsType], `${latlonType}-${dmsType}`);
        if (!formatted.isOK) return false;
      }
    }
  }
  return true;
};

export const updateRecordCoords = (record: RecordType, latlon: LatLonDMSType, isDecimal: boolean) => {
  if (isLocationType(record.coords) || record.coords === undefined) {
    const latLonDms = latLonDMS(latlon, isDecimal);
    return {
      ...record,
      coords: {
        latitude: parseFloat(latLonDms.latitude.decimal),
        longitude: parseFloat(latLonDms.longitude.decimal),
      },
    };
  } else {
    return record;
  }
};

export const getTargetRecordSet = (
  dataSet: DataType[],
  layer: LayerType,
  user: UserType,
  isTemplate?: boolean
): RecordType[] => {
  //Commonの時は、全データが対象（アップロード後にCommonに変更した場合などもあるため）.Commonのデータをアップロードするのは管理者の場合のみ
  //PublicとPrivateの時は、自分のデータまたはundefine（プロジェクト作成時にログインしていない時に作成したデータをsaveでアップロードする場合）
  let targetDataSet: DataType | undefined;
  if (layer.permission === 'COMMON') {
    targetDataSet = dataSet.find((d) => d.layerId === layer.id);
  } else if (isTemplate) {
    targetDataSet = dataSet.find(
      (d) => d.layerId === layer.id && (d.userId === 'template' || d.userId === undefined || d.userId === user.uid)
    );
  } else {
    targetDataSet = dataSet.find((d) => d.layerId === layer.id && (d.userId === undefined || d.userId === user.uid));
  }
  const recordSet: RecordType[] = cloneDeep(targetDataSet?.data ?? []);
  return isTemplate
    ? recordSet.map((d) => ({ ...d, userId: 'template', displayName: t('common.admin'), uploaded: true }))
    : recordSet.map((d) => ({ ...d, userId: user.uid, displayName: user.displayName, uploaded: true }));
};

export const createMergedDataSetWithTemplate = (
  dataSet: DataType[],
  _user: UserType,
  publicOwnLayerIds: string[],
  privateLayerIds: string[]
) => {
  // テンプレートデータはuserId/displayName/idを変換せず、そのまま返す
  // 既に自分のデータが存在するレイヤはスキップ
  return dataSet
    .map((recordSet) => {
      const alreadyHasData = [...publicOwnLayerIds, ...privateLayerIds].find((id) => id === recordSet.layerId);
      if (alreadyHasData) return undefined;
      // ここでidやuserId, displayNameは変換しない
      return { ...recordSet };
    })
    .filter((v) => v !== undefined) as DataType[];
};

export const resetDataSetUser = (dataSet: DataType[]) => {
  const updatedDataSet: DataType[] = dataSet.map((data) => {
    const recordSet: RecordType[] = data.data.map((record) => ({ ...record, userId: undefined, displayName: null }));
    return { ...data, userId: undefined, data: recordSet };
  });
  return updatedDataSet;
};

export const isPointRecordType = (
  recordSet: RecordType | PointRecordType | LineRecordType | PolygonRecordType | undefined
): recordSet is PointRecordType => {
  return recordSet !== undefined && !Array.isArray(recordSet.coords);
};

/**
 * マージ処理
 * 自分のデータが優先、なければ他人、テンプレートデータを利用
 * [ユーザーのデータ配列, テンプレートのデータ] のタプルで返す
 */
export async function mergeLayerData({
  layerData,
  templateData,
  ownUserId,
  strategy = 'self',
  conflictsResolver,
}: {
  layerData: DataType[];
  templateData: DataType | undefined;
  ownUserId: string | undefined;
  strategy?: 'self' | 'latest' | 'manual';
  conflictsResolver?: (candidates: RecordType[], id: string) => Promise<RecordType>;
}): Promise<[DataType[], DataType | undefined]> {
  // --- 全レコードを一旦まとめる ---
  const allRecords = layerData.flatMap((d) => d.data);
  const templateRecords = templateData ? templateData.data : [];
  const combinedRecords: RecordType[] = [...allRecords, ...templateRecords];

  // --- ユニークな ID を収集 ---
  const idSet = Array.from(new Set(combinedRecords.map((r) => r.id)));

  // --- layerId はどの DataType を参照しても同じものを利用 ---
  const layerId = layerData[0]?.layerId ?? templateData?.layerId ?? '';

  // --- ID ごとにマージ戦略を適用し、選ばれたレコードを userId 毎に集計 ---
  const resolvedMap = new Map<string, RecordType[]>();

  for (const id of idSet) {
    const candidates = combinedRecords.filter((r) => r.id === id);
    let chosen: RecordType;

    // ユーザー候補のみ抽出 (template を除外)
    const userCandidates = candidates.filter((r) => r.userId !== 'template');

    // ユーザーが2人以上いる場合 → template を除外して手動マージ
    if (userCandidates.length > 1 && conflictsResolver) {
      chosen = await conflictsResolver(userCandidates, id);
    } else if (
      // 「候補が２つ」で「一方が template、もう一方がユーザー」の場合は必ずユーザーを選択
      candidates.length === 2 &&
      candidates.some((r) => r.userId === 'template') &&
      candidates.some((r) => r.userId !== 'template')
    ) {
      chosen = candidates.find((r) => r.userId !== 'template')!;
    } else if (candidates.length === 1) {
      chosen = candidates[0];
    } else {
      // 通常の戦略適用部
      if (strategy === 'manual' && conflictsResolver) {
        chosen = await conflictsResolver(candidates, id);
      } else if (strategy === 'latest') {
        chosen = candidates.reduce((prev, cur) =>
          prev.updatedAt && cur.updatedAt && cur.updatedAt > prev.updatedAt ? cur : prev
        );
      } else if (strategy === 'self' && ownUserId) {
        const own = candidates.find((r) => r.userId === ownUserId);
        chosen = own ?? candidates[0];
      } else {
        chosen = candidates[0];
      }
    }

    // 選ばれたレコードを userId 毎に集計
    const list = resolvedMap.get(chosen.userId!) ?? [];
    list.push(chosen);
    resolvedMap.set(chosen.userId!, list);
  }

  // --- 結果の整形 ---
  const mergedUserData: DataType[] = Array.from(resolvedMap.entries())
    .filter(([userId]) => userId !== 'template')
    .map(([userId, records]) => ({
      layerId,
      userId,
      data: records,
    }));

  const templateOnly = resolvedMap.get('template');
  const mergedTemplateData: DataType | undefined = templateOnly
    ? { layerId, userId: 'template', data: templateOnly }
    : undefined;

  return [mergedUserData, mergedTemplateData];
}
