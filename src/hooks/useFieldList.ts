import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { LayerType } from '../types';
import { AppState } from '../modules';
import { cloneDeep } from 'lodash';
import { hasOpened } from '../utils/Project';
import { t } from '../i18n/config';

export type UseFieldListReturnType = {
  itemValues: { value: string; isOther: boolean }[];
  isEdited: boolean;
  layerIds: string[];
  layerNames: string[];
  editable: {
    state: boolean;
    message: string;
  };
  changeValue: (index: number, value: string) => void;
  addValue: (isOther?: boolean | undefined) => void;
  deleteValue: (id: number) => void;
};

export const useFieldList = (
  targetLayer: LayerType,
  fieldIndex: number,
  isEdited_: boolean
): UseFieldListReturnType => {
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const role = useSelector((state: AppState) => state.settings.role);
  const tracking = useSelector((state: AppState) => state.settings.tracking);
  const isSettingProject = useSelector((state: AppState) => state.settings.isSettingProject);
  const layers = useSelector((state: AppState) => state.layers);
  const [itemValues, setItemValues] = useState<{ value: string; isOther: boolean }[]>([]);
  const [isEdited, setIsEdited] = useState(isEdited_);
  const isOwnerAdmin = useMemo(() => role === 'OWNER' || role === 'ADMIN', [role]);
  const format = useMemo(() => targetLayer.field[fieldIndex].format, [fieldIndex, targetLayer.field]);

  const layerIds = useMemo(
    () => ['', ...layers.filter((layer) => layer.id !== targetLayer.id).map((layer) => layer.id)],
    [layers, targetLayer.id]
  );
  const layerNames = useMemo(
    () => ['', ...layers.filter((layer) => layer.id !== targetLayer.id).map((layer) => layer.name)],
    [layers, targetLayer.id]
  );

  const editable = useMemo(() => {
    if (tracking !== undefined && tracking.layerId === targetLayer.id) {
      return { state: false, message: t('hooks.message.cannotChangeInTracking') };
    }
    if (hasOpened(projectId) && !isOwnerAdmin) {
      return { state: false, message: t('hooks.message.onlyAdminCanEdit') };
    }
    if (hasOpened(projectId) && isOwnerAdmin && !isSettingProject) {
      return { state: false, message: t('hooks.message.lockProject') };
    }
    return { state: true, message: '' };
  }, [isSettingProject, isOwnerAdmin, projectId, targetLayer.id, tracking]);

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
    } else {
      listItems = targetLayer.field[fieldIndex].list;
    }
    setItemValues(listItems === undefined ? [] : listItems);
  }, [fieldIndex, format, targetLayer]);

  const changeValue = useCallback(
    (index: number, value: string) => {
      const newItemValues = cloneDeep(itemValues);
      if (!itemValues[index].isOther) {
        newItemValues[index] = { value, isOther: false };
      }
      setItemValues(newItemValues);
      setIsEdited(true);
    },
    [itemValues]
  );

  const addValue = useCallback(
    (isOther?: boolean) => {
      if (
        //以下のフォーマットはデフォルト値の設定なので1つ以上の値は追加しない
        (format === 'STRING' || format === 'INTEGER' || format === 'DECIMAL' || format === 'REFERENCE') &&
        itemValues.length > 0
      )
        return;

      const newItemValues = cloneDeep(itemValues);
      if (isOther === undefined || isOther === false) {
        newItemValues.push({ value: '', isOther: false });
      } else if (isOther === true && itemValues.every((v) => !v.isOther)) {
        newItemValues.push({ value: t('common.other'), isOther: true });
      }
      setItemValues(newItemValues);
      setIsEdited(true);
    },
    [format, itemValues]
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
  return { itemValues, isEdited, layerIds, layerNames, editable, changeValue, addValue, deleteValue };
};
