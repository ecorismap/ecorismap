import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

import { COLORTYPE, COLORRAMP, COLOR } from '../constants/AppConstants';
import { ColorRampType, ColorStyle, ColorTypesType, RecordType, LayerType, FeatureType } from '../types';
import { ItemValue } from '@react-native-picker/picker/typings/Picker';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { cloneDeep } from 'lodash';
import { getRandomColor, hsv2rgb } from '../utils/Color';
import { updateLayerAction } from '../modules/layers';

export type UseFeatureStyleReturnType = {
  isEdited: boolean;
  colorStyle: ColorStyle;
  colorTypes: ColorTypesType[];
  colorTypeLabels: string[];
  colorRamps: ColorRampType[];
  colorRampLabels: string[];
  fieldNames: string[];
  layerType: FeatureType;
  modalVisible: boolean;
  changeColorType: (itemValue: ItemValue) => void;
  changeTransparency: (value: number) => void;
  changeFieldName: (itemValue: ItemValue) => void;
  changeColorRamp: (itemValue: ItemValue) => void;
  changeValue: (index: number, value: string) => void;
  pressSelectSingleColor: () => void;
  pressSelectValueColor: (index: number) => void;
  addValue: () => void;
  deleteValue: (id: number) => void;
  reloadValue: () => void;
  selectColor: (hue: number, sat: number, val: number) => void;
  selectColorCancel: () => void;
  saveColorStyle: () => void;
};

export const useRecordStyle = (layer_: LayerType, isEdited_: boolean): UseFeatureStyleReturnType => {
  const dispatch = useDispatch();
  const allUserData = useSelector((state: AppState) =>
    state.dataSet
      .map((d) => d.layerId === layer_.id && d.data)
      .filter((v): v is RecordType[] => v !== false)
      .flat()
  );

  const [colorStyle, setColorStyle] = useState<ColorStyle>(layer_.colorStyle);
  const [targetLayer, setTargetLayer] = useState<LayerType>(layer_);
  const [isEdited, setIsEdited] = useState(isEdited_);
  const [modalVisible, setModalVisible] = useState(false);
  const colorListIndex = useRef(0);

  const fieldNames = useMemo(
    () => targetLayer.field.reduce((a: any, b: any) => (b.format !== 'PHOTO' ? [...a, b.name] : [...a]), ['']),
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
    (value: number) => {
      if (colorStyle.transparency !== value) {
        setColorStyle({ ...colorStyle, transparency: value });
        setIsEdited(true);
      }
    },
    [colorStyle]
  );

  const changeFieldName = useCallback(
    (itemValue: ItemValue) => {
      if (colorStyle.fieldName !== itemValue) {
        setColorStyle({ ...colorStyle, fieldName: itemValue as string });
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
      valueList = Array.from(
        new Set(allUserData.map((data) => data !== undefined && data.field[colorStyle.fieldName]).filter((v) => v))
      ) as (string | number)[];
    }
    const colorList = valueList.map(() => getRandomColor());
    const newColorStyle = cloneDeep(colorStyle);
    newColorStyle.colorList = [];
    valueList.forEach((value, index) => {
      newColorStyle.colorList.push({ value: value as string | number, color: colorList[index] });
    });
    setColorStyle(newColorStyle);
    setIsEdited(true);
  }, [allUserData, colorStyle]);

  const selectColor = useCallback(
    (hue: number, sat: number, val: number) => {
      setModalVisible(!modalVisible);
      const rgb = hsv2rgb(hue, sat, val);

      const newColorStyle = cloneDeep(colorStyle);
      if (colorListIndex.current === -1) {
        newColorStyle.color = rgb;
      } else {
        newColorStyle.colorList[colorListIndex.current].color = rgb;
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
  }, [colorStyle, dispatch, targetLayer]);

  return {
    isEdited,
    colorStyle,
    colorTypes,
    colorTypeLabels,
    colorRamps,
    colorRampLabels,
    fieldNames,
    layerType,
    modalVisible,
    changeColorType,
    changeTransparency,
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
