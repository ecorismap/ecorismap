import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

import { COLORTYPE, COLORRAMP, COLOR } from '../constants/AppConstants';
import { ColorRampType, ColorStyle, ColorTypesType, LayerType, FeatureType } from '../types';
import { ItemValue } from '@react-native-picker/picker/typings/Picker';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { cloneDeep } from 'lodash';
import { getRandomColor, hsv2rgbaString } from '../utils/Color';
import { updateLayerAction } from '../modules/layers';
import { t } from '../i18n/config';
import { selectDataSetForLayer } from '../modules/selectors';

export type UseFeatureStyleReturnType = {
  isEdited: boolean;
  isCustom: boolean;
  customFieldValue: string;
  colorStyle: ColorStyle;
  colorTypes: ColorTypesType[];
  colorTypeLabels: string[];
  colorRamps: ColorRampType[];
  colorRampLabels: string[];
  fieldValues: string[];
  fieldLabels: string[];
  layerType: FeatureType;
  modalVisible: boolean;
  setIsCustom: React.Dispatch<React.SetStateAction<boolean>>;
  changeCustomFieldValue: (value: string) => void;
  changeColorType: (itemValue: ItemValue) => void;
  changeTransparency: (value: boolean) => void;
  changeLineWidth: (value: number) => void;
  changeFieldName: (itemValue: ItemValue) => void;
  changeColorRamp: (itemValue: ItemValue) => void;
  changeValue: (index: number, value: string) => void;
  pressSelectSingleColor: () => void;
  pressSelectValueColor: (index: number) => void;
  addValue: () => void;
  deleteValue: (id: number) => void;
  reloadValue: () => void;
  selectColor: (hue: number, sat: number, val: number, alpha: number) => void;
  selectColorCancel: () => void;
  saveColorStyle: () => void;
};

export const useFeatureStyle = (layer_: LayerType, isEdited_: boolean): UseFeatureStyleReturnType => {
  const dispatch = useDispatch();
  // メモ化されたセレクターを使用
  const layerDataSet = useSelector((state: RootState) => selectDataSetForLayer(state, layer_.id));

  // 複雑な計算を useMemo でメモ化
  const allUserData = useMemo(() => layerDataSet.flatMap((d) => d.data), [layerDataSet]);

  const displayNames = useMemo(
    () =>
      layerDataSet
        .map((d) => d.data.length > 0 && d.data[0].displayName)
        .filter((v): v is string => typeof v === 'string'),
    [layerDataSet]
  );

  const [colorStyle, setColorStyle] = useState<ColorStyle>(layer_.colorStyle);
  const [targetLayer, setTargetLayer] = useState<LayerType>(layer_);
  const [isEdited, setIsEdited] = useState(isEdited_);
  const [modalVisible, setModalVisible] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const [customFieldValue, setCustomFieldValue] = useState('');
  const colorListIndex = useRef(0);

  const fieldValues: string[] = useMemo(
    () => [
      ...targetLayer.field.reduce((a: any, b: any) => (b.format !== 'PHOTO' ? [...a, b.name] : [...a]), ['']),
      '__CUSTOM',
    ],
    [targetLayer.field]
  );
  const fieldLabels: string[] = useMemo(
    () => [
      ...targetLayer.field.reduce((a: any, b: any) => (b.format !== 'PHOTO' ? [...a, b.name] : [...a]), ['']),
      t('common.custom'),
    ],
    [targetLayer.field]
  );
  const colorRamps = useMemo(() => Object.keys(COLORRAMP) as ColorRampType[], []);
  const colorRampLabels = useMemo(() => Object.values(COLORRAMP), []);
  const colorTypes = useMemo(() => Object.keys(COLORTYPE) as ColorTypesType[], []);
  const colorTypeLabels = useMemo(() => Object.values(COLORTYPE), []);
  const layerType = useMemo(() => layer_.type, [layer_.type]);

  useEffect(() => {
    setTargetLayer(layer_);
    setIsEdited(isEdited_);
  }, [isEdited_, layer_]);

  useEffect(() => {
    setColorStyle(layer_.colorStyle);
    setTargetLayer(layer_);
    setIsCustom(layer_.colorStyle.fieldName === '__CUSTOM');
    setCustomFieldValue(layer_.colorStyle.customFieldValue);
  }, [layer_, layer_.colorStyle]);

  const changeColorType = useCallback(
    (itemValue: ItemValue) => {
      if (colorStyle.colorType !== itemValue) {
        setColorStyle({ ...colorStyle, colorType: itemValue as ColorTypesType });
        setIsEdited(true);
      }
    },
    [colorStyle]
  );

  const changeTransparency = useCallback(
    (value: boolean) => {
      setColorStyle({ ...colorStyle, transparency: value });
      setIsEdited(true);
    },
    [colorStyle]
  );

  const changeLineWidth = useCallback(
    (value: number) => {
      if (colorStyle.lineWidth !== value) {
        setColorStyle({ ...colorStyle, lineWidth: value });
        setIsEdited(true);
      }
    },
    [colorStyle]
  );

  const changeFieldName = useCallback(
    (itemValue: ItemValue) => {
      if (colorStyle.fieldName !== itemValue) {
        const fieldName = itemValue === t('common.custom') ? '__CUSTOM' : (itemValue as string);
        setIsCustom(fieldName === '__CUSTOM');
        setColorStyle({ ...colorStyle, fieldName });
        setIsEdited(true);
      }
    },
    [colorStyle]
  );

  const changeColorRamp = useCallback(
    (itemValue: ItemValue) => {
      if (colorStyle.colorRamp !== itemValue) {
        setColorStyle({ ...colorStyle, colorRamp: itemValue as ColorRampType });
        setIsEdited(true);
      }
    },
    [colorStyle]
  );

  const changeValue = useCallback(
    (index: number, value: string) => {
      const newColorStyle = cloneDeep(colorStyle);
      newColorStyle.colorList[index].value = value;
      setColorStyle(newColorStyle);
      setIsEdited(true);
    },
    [colorStyle]
  );

  const changeCustomFieldValue = useCallback(
    (value: string) => {
      setColorStyle({ ...colorStyle, customFieldValue: value });
      setCustomFieldValue(value);
      setIsEdited(true);
    },
    [colorStyle]
  );

  const pressSelectSingleColor = useCallback(() => {
    colorListIndex.current = -1;
    setModalVisible(true);
  }, []);

  const pressSelectValueColor = useCallback((index: number) => {
    colorListIndex.current = index;
    setModalVisible(true);
  }, []);

  const addValue = useCallback(() => {
    const newColorStyle = cloneDeep(colorStyle);
    newColorStyle.colorList.push({ value: '', color: COLOR.WHITE });
    setColorStyle(newColorStyle);
    setIsEdited(true);
  }, [colorStyle]);

  const deleteValue = useCallback(
    (id: number) => {
      //カラーリストの削除
      const newColorStyle = cloneDeep(colorStyle);
      newColorStyle.colorList.splice(id, 1);
      setColorStyle(newColorStyle);
      setIsEdited(true);
    },
    [colorStyle]
  );

  const reloadValue = useCallback(() => {
    let valueList: (string | number)[] = [];
    if (colorStyle.colorType === 'CATEGORIZED') {
      if (colorStyle.fieldName === '__CUSTOM') {
        const customFieldNames = colorStyle.customFieldValue.split('|');

        const valueListArray = customFieldNames.map((name) =>
          Array.from(
            new Set(
              allUserData
                .map((data) => data !== undefined && data.field[name])
                .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
            )
          )
        );
        valueList = valueListArray.reduce((a, b) => a.flatMap((x) => b.map((y) => `${x}|${y}`)));
      } else {
        valueList = Array.from(
          new Set(
            allUserData
              .map((data) => data !== undefined && data.field[colorStyle.fieldName])
              .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
          )
        );
      }
    } else if (colorStyle.colorType === 'USER') {
      valueList = displayNames;
    }
    const colorList = valueList.map(() => getRandomColor());
    const newColorStyle = cloneDeep(colorStyle);
    newColorStyle.colorList = [];
    valueList.forEach((value, index) => {
      newColorStyle.colorList.push({ value, color: colorList[index] });
    });
    setColorStyle(newColorStyle);
    setIsEdited(true);
  }, [allUserData, colorStyle, displayNames]);

  const selectColor = useCallback(
    (hue: number, sat: number, val: number, alpha: number) => {
      setModalVisible(!modalVisible);
      const rgbaString = hsv2rgbaString(hue, sat, val, alpha);

      const newColorStyle = cloneDeep(colorStyle);
      if (colorListIndex.current === -1) {
        newColorStyle.color = rgbaString;
      } else {
        newColorStyle.colorList[colorListIndex.current].color = rgbaString;
      }
      setColorStyle(newColorStyle);
      setIsEdited(true);
    },
    [colorStyle, modalVisible]
  );

  const selectColorCancel = useCallback(() => {
    setModalVisible(false);
  }, []);

  const saveColorStyle = useCallback(() => {
    dispatch(updateLayerAction({ ...targetLayer, colorStyle: colorStyle }));
    setIsEdited(false);
  }, [colorStyle, dispatch, targetLayer]);

  return {
    isEdited,
    isCustom,
    customFieldValue,
    colorStyle,
    colorTypes,
    colorTypeLabels,
    colorRamps,
    colorRampLabels,
    fieldValues,
    fieldLabels,
    layerType,
    modalVisible,
    setIsCustom,
    changeCustomFieldValue,
    changeColorType,
    changeTransparency,
    changeLineWidth,
    changeFieldName,
    changeColorRamp,
    changeValue,
    pressSelectSingleColor,
    pressSelectValueColor,
    selectColor,
    selectColorCancel,
    addValue,
    deleteValue,
    reloadValue,
    saveColorStyle,
  };
};
