import React, { useCallback } from 'react';
import LayerEditFieldItem from '../components/pages/LayerEditFieldItem';
import { LayerEditFieldItemContext } from '../contexts/LayerEditFieldItem';
import { useFieldList } from '../hooks/useFieldList';
import { Props_LayerEditFieldItem } from '../routes';

export default function LayerEditFieldItemContainer({ navigation, route }: Props_LayerEditFieldItem) {
  const {
    isEdited,
    itemValues,
    pickerValues,
    refLayerIds,
    refLayerNames,
    refFieldNames,
    primaryFieldNames,
    changeValue,
    addValue,
    deleteValue,
  } = useFieldList(route.params.targetLayer, route.params.fieldIndex, route.params.isEdited);

  const gotoBack = useCallback(() => {
    navigation.navigate('LayerEdit', {
      isEdited: isEdited,
      fieldIndex: route.params.fieldIndex,
      itemValues: itemValues,
      targetLayer: route.params.targetLayer,
    });
  }, [isEdited, itemValues, navigation, route.params.fieldIndex, route.params.targetLayer]);

  return (
    <LayerEditFieldItemContext.Provider
      value={{
        itemValues,
        itemFormat: route.params.fieldItem.format,
        pickerValues,
        refLayerIds,
        refLayerNames,
        refFieldNames,
        primaryFieldNames,
        changeValue,
        pressAddValue: addValue,
        pressDeleteValue: deleteValue,
        gotoBack,
      }}
    >
      <LayerEditFieldItem />
    </LayerEditFieldItemContext.Provider>
  );
}
