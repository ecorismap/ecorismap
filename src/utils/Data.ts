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
import { isPoint, LatLonDMS } from './Coords';
import { t } from '../i18n/config';
import { v4 as uuidv4 } from 'uuid';

export type SortOrderType = 'ASCENDING' | 'DESCENDING' | 'UNSORTED';

export const sortData = (data: RecordType[], fieldName: string, order: SortOrderType = 'UNSORTED') => {
  const dataWithIdx = data.map((d, idx) => ({ ...d, idx }));
  let idx = data.map((_, i) => i);
  if (data.length === 0 || order === 'UNSORTED') {
    return { data, idx };
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
  const sortedData: RecordType[] = sortedDataWithIdx.map(({ idx: _, ...d }) => d);
  idx = sortedDataWithIdx.map(({ idx: Idx }) => Idx);
  return { data: sortedData, idx };
};

export const getInitialFieldValue = (
  format: FormatType,
  list?: { value: string; isOther: boolean }[]
): string | number | PhotoType[] => {
  switch (format) {
    case 'STRING':
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

export const getDataSerial = (dataSet: RecordType[], serialFieldName: string): number => {
  const serials = dataSet.map((data) => data.field[serialFieldName]).filter((v) => v) as number[];
  return serials.length === 0 ? 1 : Math.max(...serials) + 1;
};

export const getDefaultFieldValue = (field: FieldType, dataSet: RecordType[]) => {
  switch (field.format) {
    case 'STRING':
      return { [field.name]: field.defaultValue ?? '' };
    case 'SERIAL':
      const serial = getDataSerial(dataSet, field.name);
      return { [field.name]: serial };
    case 'INTEGER':
      return { [field.name]: field.defaultValue ?? 0 };
    case 'DECIMAL':
      return { [field.name]: field.defaultValue ?? 0 };
    case 'NUMBERRANGE':
      return { [field.name]: `${t('common.ndash')}` };
    case 'LIST':
      return { [field.name]: field.list![0].value };
    case 'RADIO':
      return { [field.name]: field.list![0].value };
    case 'CHECK':
      return { [field.name]: field.list![0].value };
    case 'DATETIME':
      return { [field.name]: dayjs().format() };
    case 'DATESTRING':
      return { [field.name]: field.defaultValue ?? dayjs().format('L') };
    case 'TIMESTRING':
      return { [field.name]: field.defaultValue ?? dayjs().format('HH:mm') };
    case 'TIMERANGE':
      return { [field.name]: `${dayjs().format('HH:mm')}${t('common.ndash')}${dayjs().format('HH:mm')}` };
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

export const getDefaultField = (layer: LayerType, dataSet: RecordType[], id: string) => {
  const defaultField = layer.field
    .map((fieldObject) => getDefaultFieldValue(fieldObject, dataSet))
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
  const updateRecord = cloneDeep(record);
  if (isPoint(updateRecord.coords)) {
    const latLonDms = LatLonDMS(latlon, isDecimal);
    updateRecord.coords.latitude = parseFloat(latLonDms.latitude.decimal);
    updateRecord.coords.longitude = parseFloat(latLonDms.longitude.decimal);
    return updateRecord;
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
  } else {
    targetDataSet = dataSet.find((d) => d.layerId === layer.id && (d.userId === undefined || d.userId === user.uid));
  }
  const recordSet: RecordType[] = cloneDeep(targetDataSet?.data ?? []);
  return isTemplate
    ? recordSet.map((d) => ({ ...d, userId: 'template', displayName: 'template' }))
    : recordSet.map((d) => ({ ...d, userId: user.uid, displayName: user.displayName }));
};

export const createRecordSetFromTemplate = (
  dataSet: DataType[],
  user: UserType,
  publicOwnLayerIds: string[],
  privateLayerIds: string[]
) => {
  return dataSet
    .map((recordSet) => {
      const alreadyHasData = [...publicOwnLayerIds, ...privateLayerIds].find((id) => id === recordSet.layerId);
      // console.log('alreadyHasData', alreadyHasData);
      // console.log('displayName', user.displayName);
      // console.log(recordSet.data);
      if (alreadyHasData) return undefined;
      const updatedRecordSet = recordSet.data.map((d) => ({
        ...d,
        id: uuidv4(),
        userId: user.uid,
        displayName: user.displayName,
      }));

      return { ...recordSet, data: updatedRecordSet, userId: user.uid };
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
