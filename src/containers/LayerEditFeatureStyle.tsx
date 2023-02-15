import React, { useCallback } from 'react';
import LayerEditFeatureStyle from '../components/pages/LayerEditFeatureStyle';
import { LayerEditFeatureStyleContext } from '../contexts/LayerEditFeatureStyle';
import { useFeatureStyle } from '../hooks/useFeatureStyle';
import { Props_LayerEditFeatureStyle } from '../routes';

export default function LayerEditFeatureStyleContainer({ navigation, route }: Props_LayerEditFeatureStyle) {
  const {
    isEdited,
    isCustom,
    customFieldValue,
    colorStyle,
    colorTypes,
    colorTypeLabels,
    colorRamps,
    colorRampLabels,
    fieldNames,
    layerType,
    modalVisible,
    changeCustomFieldValue,
    setIsCustom,
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
  } = useFeatureStyle(route.params.targetLayer, route.params.isEdited);

  const gotoBack = useCallback(() => {
    if (route.params.previous === 'Layers') {
      saveColorStyle();
      navigation.navigate('Layers');
    } else {
      navigation.navigate('LayerEdit', {
        targetLayer: route.params.targetLayer,
        isEdited: isEdited,
        colorStyle: { ...colorStyle },
      });
    }
  }, [colorStyle, isEdited, navigation, route.params.previous, route.params.targetLayer, saveColorStyle]);

  return (
    <LayerEditFeatureStyleContext.Provider
      value={{
        isCustom,
        customFieldValue,
        colorStyle,
        colorTypes,
        colorTypeLabels,
        colorRamps,
        colorRampLabels,
        fieldNames,
        layerType,
        modalVisible,
        setIsCustom,
        changeCustomFieldValue,
        changeColorType,
        changeTransparency,
        changeFieldName,
        changeColorRamp,
        changeValue,
        pressSelectSingleColor,
        pressSelectValueColor,
        pressSelectColorOK: selectColor,
        pressSelectColorCancel: selectColorCancel,
        pressAddValue: addValue,
        pressDeleteValue: deleteValue,
        pressReloadValue: reloadValue,
        gotoBack,
      }}
    >
      <LayerEditFeatureStyle />
    </LayerEditFeatureStyleContext.Provider>
  );
}
