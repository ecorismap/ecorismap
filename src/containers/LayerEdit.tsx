import React, { useCallback } from 'react';
import LayerEdit from '../components/pages/LayerEdit';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { useLayerEdit } from '../hooks/useLayerEdit';
import { Props_LayerEdit } from '../routes';
import { FieldType } from '../types';
import { Alert } from '../components/atoms/Alert';
import { t } from '../i18n/config';
import { LayerEditContext } from '../contexts/LayerEdit';
import { checkLayerInputs } from '../utils/Layer';
import { exportGeoFile } from '../utils/File';
import { useGeoFile } from '../hooks/useGeoFile';
import dayjs from 'dayjs';
export default function LayerEditContainer({ navigation, route }: Props_LayerEdit) {
  const {
    targetLayer,
    isEdited,
    isNewLayer,
    saveLayer,
    deleteLayer,
    deleteLayerPhotos,
    changeLayerName,
    submitLayerName,
    changeFeatureType,
    changeFieldOrder,
    changeFieldName,
    changeOption,
    submitFieldName,
    changeFieldFormat,
    deleteField,
    addField,
  } = useLayerEdit(
    route.params.targetLayer,
    route.params.isEdited,
    route.params.fieldIndex,
    route.params.itemValues,
    route.params.colorStyle,
    route.params.useLastValue
  );
  const { generateExportGeoData } = useGeoFile();

  const pressSaveLayer = useCallback(() => {
    const checkLayerInputsResult = checkLayerInputs(targetLayer);
    if (!checkLayerInputsResult.isOK) {
      Alert.alert('', checkLayerInputsResult.message);
      return;
    }
    saveLayer();
  }, [saveLayer, targetLayer]);

  const pressDeleteLayer = useCallback(async () => {
    const ret = await ConfirmAsync(t('LayerEdit.confirm.deleteLayer'));
    if (ret) {
      deleteLayer();
      await deleteLayerPhotos();
      navigation.navigate('Layers');
    }
  }, [deleteLayer, deleteLayerPhotos, navigation]);

  const pressExportLayer = useCallback(async () => {
    const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const fileNameBase = `${route.params.targetLayer.name}_${time}`;
    const exportData = await generateExportGeoData(targetLayer, [], fileNameBase, {
      settingsOnly: true,
      exportDictionary: true,
    });
    const isOK = await exportGeoFile(exportData, fileNameBase, 'zip');
    if (!isOK) await AlertAsync(t('hooks.message.failExport'));
  }, [generateExportGeoData, route.params.targetLayer.name, targetLayer]);

  const gotoLayerEditFeatureStyle = useCallback(() => {
    navigation.navigate('LayerEditFeatureStyle', {
      targetLayer: { ...targetLayer },
      isEdited: isEdited,
    });
  }, [isEdited, navigation, targetLayer]);

  const gotoLayerEditFieldItem = useCallback(
    (fieldIndex: number, fieldItem: FieldType) => {
      navigation.navigate('LayerEditFieldItem', {
        targetLayer: { ...targetLayer },
        fieldIndex: fieldIndex,
        fieldItem: fieldItem,
        isEdited: isEdited,
      });
    },
    [isEdited, navigation, targetLayer]
  );

  const gotoBack = useCallback(async () => {
    if (isEdited) {
      const ret = await ConfirmAsync(t('LayerEdit.confirm.gotoBack'));
      if (ret) navigation.navigate('Layers');
    } else {
      navigation.navigate('Layers');
    }
  }, [isEdited, navigation]);

  return (
    <LayerEditContext.Provider
      value={{
        layer: targetLayer,
        isEdited,
        isNewLayer,
        onChangeLayerName: changeLayerName,
        submitLayerName,
        onChangeFeatureType: changeFeatureType,
        onChangeFieldOrder: changeFieldOrder,
        onChangeFieldName: changeFieldName,
        onChangeOption: changeOption,
        submitFieldName,
        onChangeFieldFormat: changeFieldFormat,
        pressSaveLayer,
        pressDeleteField: deleteField,
        pressAddField: addField,
        pressDeleteLayer,
        gotoLayerEditFeatureStyle,
        gotoLayerEditFieldItem,
        gotoBack,
        pressExportLayer,
      }}
    >
      <LayerEdit />
    </LayerEditContext.Provider>
  );
}
