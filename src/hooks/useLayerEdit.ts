import { useCallback, useEffect, useMemo, useState } from 'react';
import { ColorStyle, FeatureType, FieldType, FormatType, LayerType, PermissionType } from '../types';
import { PHOTO_FOLDER } from '../constants/AppConstants';

import { cloneDeep } from 'lodash';
import { ulid } from 'ulid';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { formattedInputs } from '../utils/Format';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { addDataAction, deleteDataAction, updateDataAction } from '../modules/dataSet';
import { addLayerAction, deleteLayerAction, setLayersAction, updateLayerAction } from '../modules/layers';
import { changeFieldValue, getInitialFieldValue } from '../utils/Data';
import sanitize from 'sanitize-filename';
import { selectDataSet, selectIsNewLayer } from '../modules/selectors';

export type UseLayerEditReturnType = {
  targetLayer: LayerType;
  isEdited: boolean;
  isNewLayer: boolean;
  saveLayer: () => void;
  deleteLayer: () => void;
  deleteLayerPhotos: () => Promise<void>;
  changeLayerName: (val: string) => void;
  submitLayerName: () => void;
  changeFeatureType: (itemValue: FeatureType) => void;
  changePermission: (val: PermissionType) => void;
  changeFieldOrder: (index: number) => void;
  changeFieldName: (index: number, val: string) => void;
  changeOption: (index: number, val: boolean) => void;
  submitFieldName: (index: number) => void;
  changeFieldFormat: (index: number, itemValue: FormatType) => void;
  deleteField: (id: number) => void;
  addField: () => void;
};

export const useLayerEdit = (
  layer: LayerType,
  isStyleEdited: boolean,
  fieldIndex: number | undefined,
  itemValues: { value: string; isOther: boolean; customFieldValue: string }[] | undefined,
  colorStyle: ColorStyle | undefined,
  useLastValue: boolean | undefined
): UseLayerEditReturnType => {
  const dispatch = useDispatch();
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const layers = useSelector((state: RootState) => state.layers, shallowEqual);
  const user = useSelector((state: RootState) => state.user, shallowEqual);
  const dataSet = useSelector((state: RootState) => selectDataSet(state, layer.id), shallowEqual);
  const isNewLayer = useSelector((state: RootState) => selectIsNewLayer(state, layer.id));

  const [targetLayer, setTargetLayer] = useState<LayerType>(layer);
  const [isEdited, setIsEdited] = useState(isStyleEdited);

  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );

  useEffect(() => {
    setTargetLayer(layer);
    setIsEdited(isStyleEdited);
  }, [isStyleEdited, layer]);

  useEffect(() => {
    if (isStyleEdited && colorStyle !== undefined) {
      setIsEdited(true);
      setTargetLayer({ ...targetLayer, colorStyle: colorStyle });
    }
    //targetLayerはループするので入れてはいけない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStyleEdited, colorStyle]);

  useEffect(() => {
    if (isStyleEdited && itemValues !== undefined && fieldIndex !== undefined) {
      const newTargetLayer = cloneDeep(targetLayer);
      const targetFormat = newTargetLayer.field[fieldIndex].format;
      if (
        targetFormat === 'STRING' ||
        targetFormat === 'STRING_MULTI' ||
        targetFormat === 'TIMERANGE' ||
        targetFormat === 'DATESTRING'
      ) {
        newTargetLayer.field[fieldIndex].defaultValue = itemValues[0] ? itemValues[0].value : undefined;
      } else if (targetFormat === 'INTEGER') {
        newTargetLayer.field[fieldIndex].defaultValue = itemValues[0] ? parseInt(itemValues[0].value, 10) : undefined;
      } else if (targetFormat === 'DECIMAL') {
        newTargetLayer.field[fieldIndex].defaultValue = itemValues[0] ? parseFloat(itemValues[0].value) : undefined;
      } else {
        newTargetLayer.field[fieldIndex].list = itemValues;
      }
      newTargetLayer.field[fieldIndex].useLastValue = useLastValue;
      setIsEdited(true);
      setTargetLayer(newTargetLayer);
    }
    //targetLayerはループするので入れてはいけない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStyleEdited, itemValues, fieldIndex]);

  const updateDataOfTheLayer = useCallback(
    (initialFields: FieldType[], addedFields: FieldType[], changeFields: FieldType[], deletedFields: FieldType[]) => {
      const updateDataSet = cloneDeep(dataSet);
      updateDataSet.forEach((userData) => {
        //既存のデータに追加フィールドの値を初期化
        userData.data.forEach((d) =>
          addedFields.forEach(({ name, format, list }) => (d.field[name] = getInitialFieldValue(format, list)))
        );
        //更新されたフィールドの値を初期化
        userData.data.forEach((d) =>
          changeFields.forEach(({ id, name, format: changedFormat, list }) => {
            const originalFormat = initialFields.find((f) => f.id === id)!.format;
            const originalData = d.field[name];
            d.field[name] = changeFieldValue(originalData, originalFormat, changedFormat, list);
          })
        );
        //データのフィールドを削除
        userData.data.forEach((d) => {
          deletedFields.forEach(({ name }) => delete d.field[name]);
        });
      });
      dispatch(updateDataAction(updateDataSet));
    },
    [dataSet, dispatch]
  );

  const saveLayer = useCallback(() => {
    const oldLayer = layers.find((l) => l.id === targetLayer.id);
    const initialFields = oldLayer !== undefined ? oldLayer.field : [];
    const updateFields = targetLayer.field;
    const deletedFields = initialFields.filter((n) => !updateFields.find((p) => p.id === n.id));
    const addedFields = updateFields.filter((n) => !initialFields.find((p) => p.id === n.id));
    const changedFields = updateFields.filter((n) =>
      initialFields.find(
        (p) => p.id === n.id && (p.format !== n.format || JSON.stringify(p.list) !== JSON.stringify(n.list))
      )
    );
    //ラベル対象のフィールドが削除されていたらラベルを変更
    if (deletedFields.some(({ name }) => name === targetLayer.label)) {
      targetLayer.label = '';
    }

    //追加されたフィールドのデータを初期化し、削除されたフィールドをデータからも削除
    updateDataOfTheLayer(initialFields, addedFields, changedFields, deletedFields);

    if (isNewLayer) {
      dispatch(addLayerAction(targetLayer));
      dispatch(addDataAction([{ layerId: targetLayer.id, userId: dataUser.uid, data: [] }]));
    } else {
      dispatch(updateLayerAction(targetLayer));
    }
    setIsEdited(false);
  }, [dataUser.uid, dispatch, isNewLayer, layers, targetLayer, updateDataOfTheLayer]);

  const deleteLayerPhotos = useCallback(async () => {
    if (Platform.OS === 'web') return;
    if (projectId === undefined) return;
    const folder = `${PHOTO_FOLDER}/${projectId}/${targetLayer.id}`;
    await FileSystem.deleteAsync(folder, { idempotent: true });
  }, [projectId, targetLayer.id]);

  const deleteLayer = useCallback(() => {
    if (targetLayer.type === 'LAYERGROUP') {
      const childLayers = layers
        .map((l) => {
          if (l.groupId === targetLayer.id) {
            return { ...l, groupId: undefined };
          }
          return l;
        })
        .filter((l) => l.id !== targetLayer.id);
      dispatch(setLayersAction(childLayers));
    } else {
      dispatch(deleteDataAction(dataSet));
      dispatch(deleteLayerAction(targetLayer));
    }
  }, [dataSet, dispatch, layers, targetLayer]);

  const changeLayerName = useCallback(
    (val: string) => {
      const m = cloneDeep(targetLayer);
      m.name = val;
      setTargetLayer(m);
      setIsEdited(true);
    },
    [targetLayer]
  );

  const submitLayerName = useCallback(() => {
    const m = cloneDeep(targetLayer);
    m.name = sanitize(targetLayer.name);
    setTargetLayer(m);
  }, [targetLayer]);

  const changeFeatureType = useCallback(
    (itemValue: FeatureType) => {
      const m = cloneDeep(targetLayer);
      if (m.type !== itemValue) {
        m.type = itemValue;
        if (itemValue === 'LAYERGROUP') {
          m.permission = 'COMMON';
        }
        setTargetLayer(m);
        setIsEdited(true);
      }
    },
    [targetLayer]
  );

  const changePermission = useCallback(
    (val: PermissionType) => {
      const m = cloneDeep(targetLayer);
      m.permission = val;
      setTargetLayer(m);
      setIsEdited(true);
    },
    [targetLayer]
  );

  const changeFieldOrder = useCallback(
    (index: number) => {
      if (index === 0) return;
      const newTargetLayer = cloneDeep(targetLayer);
      [newTargetLayer.field[index], newTargetLayer.field[index - 1]] = [
        newTargetLayer.field[index - 1],
        newTargetLayer.field[index],
      ];
      setTargetLayer(newTargetLayer);
      setIsEdited(true);
    },
    [targetLayer]
  );

  const changeFieldName = useCallback(
    (index: number, val: string) => {
      const m = cloneDeep(targetLayer);
      m.field[index].name = val;
      setTargetLayer(m);
      setIsEdited(true);
    },
    [targetLayer]
  );

  const submitFieldName = useCallback(
    (index: number) => {
      const { result } = formattedInputs(targetLayer.field[index].name, 'STRING');
      const m = cloneDeep(targetLayer);
      m.field[index].name = result.toString();
      setTargetLayer(m);
    },
    [targetLayer]
  );

  const changeFieldFormat = useCallback(
    (index: number, itemValue: FormatType) => {
      const m = cloneDeep(targetLayer);
      if (m.field[index].format !== itemValue) {
        m.field[index].format = itemValue;
        setTargetLayer(m);
        setIsEdited(true);
      }
    },
    [targetLayer]
  );

  const changeOption = useCallback(
    (index: number, val: boolean) => {
      //辞書型のフィールドの場合は追加ボタンの表示を切り替える
      //trueにする場合は、他のフィールドの辞書型をfalseにする
      //trueにする場合は、layer.dictionaryFieldIdを設定する
      //falseにする場合は、layer.dictionaryFieldIdが自分のidの場合はundefinedにする
      const m = cloneDeep(targetLayer);
      if (val) {
        m.dictionaryFieldId = m.field[index].id;
        m.field.forEach((f) => {
          if (f.id !== m.field[index].id) {
            f.useDictionaryAdd = false;
          }
        });
        m.field[index].useDictionaryAdd = true;
      } else {
        m.dictionaryFieldId = m.field[index].id === m.dictionaryFieldId ? undefined : m.dictionaryFieldId;
        m.field[index].useDictionaryAdd = false;
      }
      setTargetLayer(m);
      setIsEdited(true);
    },
    [targetLayer]
  );

  const deleteField = useCallback(
    (id: number) => {
      const m = cloneDeep(targetLayer);
      m.field.splice(id, 1);

      setTargetLayer(m);
      setIsEdited(true);
    },
    [targetLayer]
  );

  const addField = useCallback(() => {
    const m = cloneDeep(targetLayer);
    m.field.push({ id: ulid(), name: '', format: 'STRING' });
    setTargetLayer(m);
    setIsEdited(true);
  }, [targetLayer]);

  return {
    targetLayer,
    isEdited,
    isNewLayer,
    saveLayer,
    deleteLayer,
    deleteLayerPhotos,
    changeLayerName,
    submitLayerName,
    changeFeatureType,
    changePermission,
    changeFieldOrder,
    changeFieldName,
    changeOption,
    submitFieldName,
    changeFieldFormat,
    deleteField,
    addField,
  } as const;
};
