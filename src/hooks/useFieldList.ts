import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { LayerType } from '../types';
import { AppState } from '../modules';
import { cloneDeep } from 'lodash';
import { t } from '../i18n/config';

export type UseFieldListReturnType = {
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

  changeCustomFieldReference: (value: string) => void;
  changeCustomFieldPrimary: (value: string) => void;
  changeValue: (index: number, value: string) => void;
  addValue: (isOther?: boolean | undefined) => void;
  deleteValue: (id: number) => void;
  pressListOrder: (index: number) => void;
};

export const useFieldList = (
  targetLayer: LayerType,
  fieldIndex: number,
  isEdited_: boolean
): UseFieldListReturnType => {
  const layers = useSelector((state: AppState) => state.layers);

  const [pickerValues, setPickerValues] = useState(['', '', '']);
  const [itemValues, setItemValues] = useState<{ value: string; isOther: boolean; customFieldValue: string }[]>([]);
  const [isEdited, setIsEdited] = useState(isEdited_);
  const [customFieldReference, setCustomFieldReference] = useState('');
  const [customFieldPrimary, setCustomFieldPrimary] = useState('');

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

  useEffect(() => {
    setIsEdited(isEdited_);
  }, [isEdited_]);

  useEffect(() => {
    let listItems: { value: string; isOther: boolean; customFieldValue: string }[] | undefined;
    if (format === 'STRING' || format === 'INTEGER' || format === 'DECIMAL') {
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
  }, [fieldIndex, format, targetLayer]);

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

  return {
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
    changeCustomFieldReference,
    changeCustomFieldPrimary,
    changeValue,
    addValue,
    deleteValue,
    pressListOrder,
  };
};
