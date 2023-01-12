import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { LayerType } from '../types';
import { AppState } from '../modules';
import { cloneDeep } from 'lodash';
import { t } from '../i18n/config';

export type UseFieldListReturnType = {
  isEdited: boolean;
  itemValues: { value: string; isOther: boolean }[];
  pickerValues: string[];
  refLayerIds: string[];
  refLayerNames: string[];
  refFieldNames: string[];
  primaryFieldNames: string[];
  editable: boolean;
  changeValue: (index: number, value: string) => void;
  addValue: (isOther?: boolean | undefined) => void;
  deleteValue: (id: number) => void;
};

export const useFieldList = (
  targetLayer: LayerType,
  fieldIndex: number,
  isEdited_: boolean
): UseFieldListReturnType => {
  const tracking = useSelector((state: AppState) => state.settings.tracking);
  const layers = useSelector((state: AppState) => state.layers);
  const [pickerValues, setPickerValues] = useState(['', '', '']);
  const [itemValues, setItemValues] = useState<{ value: string; isOther: boolean }[]>([]);
  const [isEdited, setIsEdited] = useState(isEdited_);
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
    return refLayer?.field.map((l) => l.name) ?? [];
  }, [layers, pickerValues]);

  const primaryFieldNames = useMemo(() => ['', '_id', ...targetLayer.field.map((f) => f.name)], [targetLayer.field]);

  const editable = useMemo(() => {
    if (tracking !== undefined && tracking.layerId === targetLayer.id) {
      return false;
    }

    return true;
  }, [targetLayer.id, tracking]);

  useEffect(() => {
    setIsEdited(isEdited_);
  }, [isEdited_]);

  useEffect(() => {
    let listItems: { value: string; isOther: boolean }[] | undefined;
    if (format === 'STRING' || format === 'INTEGER' || format === 'DECIMAL') {
      listItems =
        targetLayer.field[fieldIndex].defaultValue !== undefined
          ? [{ value: String(targetLayer.field[fieldIndex].defaultValue), isOther: false }]
          : undefined;
    } else if (format === 'REFERENCE') {
      listItems = targetLayer.field[fieldIndex].list;
      if (listItems !== undefined && listItems.length === 3) {
        setPickerValues([listItems[0].value, listItems[1].value, listItems[2].value]);
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
        newValues[index] = value;
        setPickerValues(newValues);
        const newItemValues = newValues.map((v) => ({ value: v, isOther: false }));
        setItemValues(newItemValues);
      } else {
        const newItemValues = cloneDeep(itemValues);
        if (!itemValues[index].isOther) {
          newItemValues[index] = { value, isOther: false };
        }
        setItemValues(newItemValues);
      }
      setIsEdited(true);
    },
    [format, itemValues, pickerValues]
  );

  const addValue = useCallback(
    (isOther?: boolean) => {
      const newItemValues = cloneDeep(itemValues);
      if (isOther === undefined || isOther === false) {
        newItemValues.push({ value: '', isOther: false });
      } else if (isOther === true && itemValues.every((v) => !v.isOther)) {
        newItemValues.push({ value: t('common.other'), isOther: true });
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
  return {
    isEdited,
    itemValues,
    pickerValues,
    refLayerIds,
    refLayerNames,
    refFieldNames,
    primaryFieldNames,
    editable,
    changeValue,
    addValue,
    deleteValue,
  };
};
