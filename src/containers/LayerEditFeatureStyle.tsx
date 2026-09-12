import React, { useCallback, useMemo } from 'react';
import LayerEditFeatureStyle from '../components/pages/LayerEditFeatureStyle';
import { LayerEditFeatureStyleContext } from '../contexts/LayerEditFeatureStyle';
import { useFeatureStyle } from '../hooks/useFeatureStyle';
import { useBottomSheetNavigation, useBottomSheetRoute } from '../contexts/BottomSheetNavigationContext';

export default function LayerEditFeatureStyleContainer() {
  const { navigate } = useBottomSheetNavigation();
  const { params } = useBottomSheetRoute<'LayerEditFeatureStyle'>();

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
  } = useFeatureStyle(params!.targetLayer, params!.isEdited);

  const isStyleChangeOnly = useMemo(() => params?.previous === 'Layers', [params?.previous]);

  const gotoBack = useCallback(() => {
    if (params?.previous === 'Layers') {
      navigate('Layers', undefined);
    } else {
      navigate('LayerEdit', {
        targetLayer: params!.targetLayer,
        isEdited: isEdited,
        colorStyle: { ...colorStyle },
      });
    }
  }, [colorStyle, isEdited, navigate, params]);

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
