import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { FieldType, LayerType } from '../types';
import { RootState } from '../store';
import { cloneDeep } from 'lodash';
import { t } from '../i18n/config';
import { Platform } from 'react-native';
import { decodeUri } from '../utils/File.web';
import * as FileSystem from 'expo-file-system';
import { getDatabase } from '../utils/SQLite';
import { ulid } from 'ulid';

export type UseFieldListReturnType = {
  isLoading: boolean;
  isEdited: boolean;
  itemValues: { value: string; isOther: boolean; customFieldValue: string }[];
  pickerValues: string[];
  refLayerIds: string[];
  refLayerNames: string[];
  refFieldNames: string[];
  primaryFieldNames: string[];
  refFieldValues: string[];
  primaryFieldValues: string[];
  customFieldReference: string;
  customFieldPrimary: string;
  useLastValue: boolean;
  dictionaryData: string[];
  changeUseLastValue: (value: boolean) => void;
  changeCustomFieldReference: (value: string) => void;
  changeCustomFieldPrimary: (value: string) => void;
  changeValue: (index: number, value: string) => void;
  addValue: (isOther?: boolean | undefined) => void;
  deleteValue: (id: number) => void;
  pressListOrder: (index: number) => void;
  importDictionaryFromCSV: (
    uri: string,
    tableName: string
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
};

export const useFieldList = (
  targetLayer: LayerType,
  fieldItem: FieldType,
  fieldIndex: number,
  isEdited_: boolean
): UseFieldListReturnType => {
  const layers = useSelector((state: RootState) => state.layers);

  const [pickerValues, setPickerValues] = useState(['', '', '']);
  const [itemValues, setItemValues] = useState<{ value: string; isOther: boolean; customFieldValue: string }[]>([]);
  const [isEdited, setIsEdited] = useState(isEdited_);

  const [customFieldReference, setCustomFieldReference] = useState('');
  const [customFieldPrimary, setCustomFieldPrimary] = useState('');
  const [useLastValue, setUseLastValue] = useState(false);
  const [redraw, setRedraw] = useState(ulid());
  const [isLoading, setIsLoading] = useState(false);

  const format = useMemo(() => targetLayer.field[fieldIndex].format, [fieldIndex, targetLayer.field]);

  const refLayerIds = useMemo(
    () => ['', ...layers.filter((layer) => layer.id !== targetLayer.id).map((layer) => layer.id)],
    [layers, targetLayer.id]
  );
  const refLayerNames = useMemo(
    () => ['', ...layers.filter((layer) => layer.id !== targetLayer.id).map((layer) => layer.name)],
    [layers, targetLayer.id]
  );

  const refFieldNames = useMemo(() => {
    const layerId = pickerValues[0];
    const refLayer = layers.find((layer) => layer.id === layerId);
    return ['', ...(refLayer?.field.map((l) => l.name) ?? ['']), t('common.custom')];
  }, [layers, pickerValues]);

  const refFieldValues = useMemo(() => [...refFieldNames.slice(0, -1), '__CUSTOM'], [refFieldNames]);
  const primaryFieldNames = useMemo(
    () => ['', '_id', ...targetLayer.field.map((f) => f.name), t('common.custom')],
    [targetLayer.field]
  );
  const primaryFieldValues = useMemo(() => [...primaryFieldNames.slice(0, -1), '__CUSTOM'], [primaryFieldNames]);

  const [dictionaryData, setDictionaryData] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        const tableName = `_${targetLayer.id}_${fieldItem.id}`;
        const db = await getDatabase();
        const allRows = db.getAllSync(`SELECT value FROM ${tableName}`);
        //@ts-ignore
        setDictionaryData(allRows.map((row) => row.value));
      } catch (e) {
        console.log(e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [fieldItem.id, targetLayer.id, redraw]);

  useEffect(() => {
    setIsEdited(isEdited_);
  }, [isEdited_]);

  useEffect(() => {
    let listItems: { value: string; isOther: boolean; customFieldValue: string }[] | undefined;
    if (format === 'STRING' || format === 'STRING_MULTI' || format === 'INTEGER' || format === 'DECIMAL') {
      listItems =
        targetLayer.field[fieldIndex].defaultValue !== undefined
          ? [{ value: String(targetLayer.field[fieldIndex].defaultValue), isOther: false, customFieldValue: '' }]
          : undefined;
    } else if (format === 'REFERENCE') {
      listItems = targetLayer.field[fieldIndex].list;
      if (listItems !== undefined && listItems.length === 3) {
        setPickerValues([listItems[0].value, listItems[1].value, listItems[2].value]);
        if (listItems[1].value === '__CUSTOM') {
          setCustomFieldReference(listItems[1].customFieldValue);
        }
        if (listItems[2].value === '__CUSTOM') {
          setCustomFieldPrimary(listItems[2].customFieldValue);
        }
      } else {
        setPickerValues(['', '', '']);
        listItems = [
          { value: '', isOther: false, customFieldValue: '' },
          { value: '', isOther: false, customFieldValue: '' },
          { value: '', isOther: false, customFieldValue: '' },
        ];
      }
    } else {
      listItems = targetLayer.field[fieldIndex].list;
    }
    setItemValues(listItems === undefined ? [] : listItems);

    if (format === 'STRING' || format === 'INTEGER') {
      setUseLastValue(targetLayer.field[fieldIndex].useLastValue ?? false);
    }
  }, [fieldIndex, format, targetLayer]);

  const changeUseLastValue = useCallback(
    (value: boolean) => {
      setUseLastValue(value);
      setIsEdited(true);
    },
    [setUseLastValue]
  );
  const changeValue = useCallback(
    (index: number, value: string) => {
      if (format === 'REFERENCE') {
        const newValues = cloneDeep(pickerValues);
        //console.log('valu', value);
        newValues[index] = value;
        setPickerValues(newValues);

        const newItemValues = cloneDeep(itemValues);
        //console.log('new', newItemValues);
        newItemValues[index].value = value;
        setItemValues(newItemValues);
      } else {
        const newItemValues = cloneDeep(itemValues);
        if (!itemValues[index].isOther) {
          newItemValues[index] = { value, isOther: false, customFieldValue: '' };
        }
        setItemValues(newItemValues);
      }
      setIsEdited(true);
    },
    [format, itemValues, pickerValues]
  );

  const changeCustomFieldReference = useCallback(
    (value: string) => {
      const newItemValues = cloneDeep(itemValues);
      newItemValues[1] = { ...itemValues[1], customFieldValue: value };
      setItemValues(newItemValues);
      setCustomFieldReference(value);
    },
    [itemValues]
  );

  const changeCustomFieldPrimary = useCallback(
    (value: string) => {
      const newItemValues = cloneDeep(itemValues);
      newItemValues[2] = { ...itemValues[2], customFieldValue: value };
      setItemValues(newItemValues);
      setCustomFieldPrimary(value);
    },
    [itemValues]
  );

  const addValue = useCallback(
    (isOther?: boolean) => {
      const newItemValues = cloneDeep(itemValues);
      if (isOther === undefined || isOther === false) {
        newItemValues.push({ value: '', isOther: false, customFieldValue: '' });
      } else if (isOther === true && itemValues.every((v) => !v.isOther)) {
        newItemValues.push({ value: t('common.other'), isOther: true, customFieldValue: '' });
      }
      setItemValues(newItemValues);
      setIsEdited(true);
    },
    [itemValues]
  );

  const deleteValue = useCallback(
    (id: number) => {
      const newItemValues = cloneDeep(itemValues);
      newItemValues.splice(id, 1);
      setItemValues(newItemValues);
      setIsEdited(true);
    },
    [itemValues]
  );

  const pressListOrder = useCallback(
    (index: number) => {
      const newItemValues = cloneDeep(itemValues);
      if (index === 0) return;
      [newItemValues[index], newItemValues[index - 1]] = [newItemValues[index - 1], newItemValues[index]];
      setItemValues(newItemValues);
      setIsEdited(true);
    },
    [itemValues]
  );

  const importDictionaryFromCSV = useCallback(async (uri: string, tableName: string) => {
    try {
      const db = await getDatabase();
      if (!db) throw new Error(t('hooks.message.cannotOpenDB'));
      setIsLoading(true);
      // CSVファイルを読み込む
      const csvStrings = Platform.OS === 'web' ? decodeUri(uri) : await FileSystem.readAsStringAsync(uri);
      const values = csvStrings.split('\n');
      // テーブルを削除する（存在する場合）
      await db.execAsync(`DROP TABLE IF EXISTS ${tableName}`);
      console.log(`Table ${tableName} dropped (if it existed).`);

      // 新しいテーブルを作成する
      const createTableSQL = `CREATE TABLE ${tableName} (value TEXT)`;
      await db.execAsync(createTableSQL);
      console.log(`Table ${tableName} created.`);
      // データを挿入する
      await db.withTransactionAsync(async () => {
        const insertSQL = `INSERT INTO ${tableName} (value) VALUES (?)`;
        for (const value of values) {
          await db.runAsync(insertSQL, [value.trim()]);
        }
      });
      setRedraw(ulid());
      return { isOK: true, message: t('hooks.message.receiveFile') };
    } catch (e: any) {
      console.log(e);
      return { isOK: false, message: e.message + '\n' + t('hooks.message.failReceiveFile') };
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    isEdited,
    itemValues,
    pickerValues,
    refLayerIds,
    refLayerNames,
    refFieldNames,
    primaryFieldNames,
    refFieldValues,
    primaryFieldValues,
    customFieldReference,
    customFieldPrimary,
    useLastValue,
    dictionaryData,
    changeUseLastValue,
    changeCustomFieldReference,
    changeCustomFieldPrimary,
    changeValue,
    addValue,
    deleteValue,
    pressListOrder,
    importDictionaryFromCSV,
  };
};
