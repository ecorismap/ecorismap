import React, { useCallback } from 'react';
import LayerEditFieldItem from '../components/pages/LayerEditFieldItem';
import { LayerEditFieldItemContext } from '../contexts/LayerEditFieldItem';
import { useFieldList } from '../hooks/useFieldList';
import { Props_LayerEditFieldItem } from '../routes';
import { getExt } from '../utils/General';
import { AlertAsync } from '../components/molecules/AlertAsync';
import { t } from '../i18n/config';
import * as DocumentPicker from 'expo-document-picker';

export default function LayerEditFieldItemContainer({ navigation, route }: Props_LayerEditFieldItem) {
  const {
    isLoading,
    isEdited,
    itemValues,
    pickerValues,
    refLayerIds,
    refLayerNames,
    refFieldNames,
    refFieldValues,
    primaryFieldNames,
    primaryFieldValues,
    customFieldReference,
    customFieldPrimary,
    useLastValue,
    dictionaryData,
    changeUseLastValue,
    changeCustomFieldReference,
    changeCustomFieldPrimary,
    changeValue,
    addValue,
    deleteValue,
    pressListOrder,
    importDictionary,
  } = useFieldList(route.params.targetLayer, route.params.fieldItem, route.params.fieldIndex, route.params.isEdited);

  const gotoBack = useCallback(() => {
    navigation.navigate('LayerEdit', {
      isEdited: isEdited,
      fieldIndex: route.params.fieldIndex,
      itemValues: itemValues,
      useLastValue: useLastValue,
      targetLayer: route.params.targetLayer,
    });
  }, [isEdited, itemValues, navigation, route.params.fieldIndex, route.params.targetLayer, useLastValue]);

  const pressImportDictionary = useCallback(async () => {
    const file = await DocumentPicker.getDocumentAsync({});
    if (file.assets === null) return;
    const ext = getExt(file.assets[0].name)?.toLowerCase();
    if (!(ext === 'csv')) {
      await AlertAsync(t('hooks.message.wrongExtension'));
      return;
    }
    const tableName = `_${route.params.targetLayer.id}_${route.params.fieldItem.id}`;
    const { message } = await importDictionary(file.assets[0].uri, tableName);
    if (message !== '') await AlertAsync(message);
  }, [importDictionary, route.params.fieldItem, route.params.targetLayer.id]);

  return (
    <LayerEditFieldItemContext.Provider
      value={{
        isLoading,
        dictionaryData,
        itemValues,
        itemFormat: route.params.fieldItem.format,
        pickerValues,
        refLayerIds,
        refLayerNames,
        refFieldNames,
        primaryFieldNames,
        refFieldValues,
        primaryFieldValues,
        customFieldReference,
        customFieldPrimary,
        useLastValue,
        changeUseLastValue,
        changeCustomFieldReference,
        changeCustomFieldPrimary,
        changeValue,
        pressAddValue: addValue,
        pressDeleteValue: deleteValue,
        gotoBack,
        pressListOrder,
        pressImportDictionary,
      }}
    >
      <LayerEditFieldItem />
    </LayerEditFieldItemContext.Provider>
  );
}
