import React, { useCallback, useMemo } from 'react';
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
    fieldValues,
    fieldLabels,
    layerType,
    modalVisible,
    changeCustomFieldValue,
    setIsCustom,
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
  } = useFeatureStyle(route.params.targetLayer, route.params.isEdited);

  const isStyleChangeOnly = useMemo(() => route.params.previous === 'Layers', [route.params.previous]);

  const gotoBack = useCallback(() => {
    if (route.params.previous === 'Layers') {
      navigation.navigate('Layers');
    } else {
      navigation.navigate('LayerEdit', {
        targetLayer: route.params.targetLayer,
        isEdited: isEdited,
        colorStyle: { ...colorStyle },
      });
    }
  }, [colorStyle, isEdited, navigation, route.params.previous, route.params.targetLayer]);

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
        fieldValues,
        fieldLabels,
        layerType,
        modalVisible,
        isStyleChangeOnly,
        isEdited,
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
        pressSelectColorOK: selectColor,
        pressSelectColorCancel: selectColorCancel,
        pressAddValue: addValue,
        pressDeleteValue: deleteValue,
        pressReloadValue: reloadValue,
        gotoBack,
        saveColorStyle,
      }}
    >
      <LayerEditFeatureStyle />
    </LayerEditFeatureStyleContext.Provider>
  );
}
