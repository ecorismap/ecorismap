import React, { useCallback } from 'react';
import LayerEditFieldItem from '../components/pages/LayerEditFieldItem';
import { LayerEditFieldItemContext } from '../contexts/LayerEditFieldItem';
import { useFieldList } from '../hooks/useFieldList';
import { useBottomSheetNavigation, useBottomSheetRoute } from '../contexts/BottomSheetNavigationContext';
import { getExt } from '../utils/General';
import { AlertAsync } from '../components/molecules/AlertAsync';
import { t } from '../i18n/config';
import * as DocumentPicker from 'expo-document-picker';

export default function LayerEditFieldItemContainer() {
  const { navigate } = useBottomSheetNavigation();
  const { params } = useBottomSheetRoute<'LayerEditFieldItem'>();

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
    importDictionaryFromCSV,
  } = useFieldList(params!.targetLayer, params!.fieldItem, params!.fieldIndex, params!.isEdited);

  const gotoBack = useCallback(() => {
    navigate('LayerEdit', {
      isEdited: isEdited,
      fieldIndex: params!.fieldIndex,
      itemValues: itemValues,
      useLastValue: useLastValue,
      targetLayer: params!.targetLayer,
    });
  }, [isEdited, itemValues, navigate, params, useLastValue]);

  const pressImportDictionary = useCallback(async () => {
    const file = await DocumentPicker.getDocumentAsync({});
    if (file.assets === null) return;
    const ext = getExt(file.assets[0].name)?.toLowerCase();
    if (!(ext === 'csv')) {
      await AlertAsync(t('hooks.message.wrongExtension'));
      return;
    }
    const tableName = `_${params!.targetLayer.id}_${params!.fieldItem.id}`;
    const { message } = await importDictionaryFromCSV(file.assets[0].uri, tableName);
    if (message !== '') await AlertAsync(message);
  }, [importDictionaryFromCSV, params]);

  return (
    <LayerEditFieldItemContext.Provider
      value={{
        isLoading,
        dictionaryData,
        itemValues,
        itemFormat: params!.fieldItem.format,
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
