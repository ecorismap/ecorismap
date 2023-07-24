import React, { useCallback } from 'react';
import LayerEdit from '../components/pages/LayerEdit';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { useLayerEdit } from '../hooks/useLayerEdit';
import { Props_LayerEdit } from '../routes';
import { LayerType } from '../types';
import { Alert } from '../components/atoms/Alert';
import { t } from '../i18n/config';
import { LayerEditContext } from '../contexts/LayerEdit';
import { useSelector } from 'react-redux';
import { AppState } from '../modules';
import { checkLayerInputs } from '../utils/Layer';
import { exportFile } from '../utils/File';
import dayjs from 'dayjs';
import sanitize from 'sanitize-filename';
import { Platform } from 'react-native';

export default function LayerEditContainer({ navigation, route }: Props_LayerEdit) {
  const tracking = useSelector((state: AppState) => state.settings.tracking);
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
    submitFieldName,
    changeFieldFormat,
    deleteField,
    addField,
  } = useLayerEdit(
    route.params.targetLayer,
    route.params.isEdited,
    route.params.fieldIndex,
    route.params.itemValues,
    route.params.colorStyle
  );

  const pressSaveLayer = useCallback(() => {
    if (tracking !== undefined && tracking.layerId === route.params.targetLayer.id) {
      Alert.alert('', t('hooks.message.cannotSaveInTracking'));
      return;
    }
    const checkLayerInputsResult = checkLayerInputs(targetLayer);
    if (!checkLayerInputsResult.isOK) {
      Alert.alert('', checkLayerInputsResult.message);
      return;
    }
    saveLayer();
  }, [route.params.targetLayer.id, saveLayer, targetLayer, tracking]);

  const pressDeleteLayer = useCallback(async () => {
    const ret = await ConfirmAsync(t('LayerEdit.confirm.deleteLayer'));
    if (ret) {
      if (tracking !== undefined && tracking.layerId === route.params.targetLayer.id) {
        await AlertAsync(t('hooks.message.cannotDeleteInTracking'));
        return;
      }
      deleteLayer();
      await deleteLayerPhotos();
      navigation.navigate('Layers');
    }
  }, [deleteLayer, deleteLayerPhotos, navigation, route.params.targetLayer.id, tracking]);

  const pressExportLayer = useCallback(async () => {
    const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const mapSettings = JSON.stringify(targetLayer);
    const fileName = `${sanitize(targetLayer.name)}_${time}.json`;
    const isOK = await exportFile(mapSettings, fileName);
    //webではFileSaverのawaitが未対応のため
    if (!isOK && Platform.OS !== 'web') await AlertAsync(t('hooks.message.failExport'));
  }, [targetLayer]);

  const gotoLayerEditFeatureStyle = useCallback(() => {
    navigation.navigate('LayerEditFeatureStyle', {
      targetLayer: { ...targetLayer },
      isEdited: isEdited,
    });
  }, [isEdited, navigation, targetLayer]);

  const gotoLayerEditFieldItem = useCallback(
    (fieldIndex: number, fieldItem: LayerType['field'][0]) => {
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
