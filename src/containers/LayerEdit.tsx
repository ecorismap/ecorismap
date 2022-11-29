import React, { useCallback, useEffect } from 'react';
import LayerEdit from '../components/pages/LayerEdit';
import { ConfirmAsync } from '../components/molecules/AlertAsync';
import { useLayerEdit } from '../hooks/useLayerEdit';
import { Props_LayerEdit } from '../routes';
import { LayerType } from '../types';
import { Alert } from '../components/atoms/Alert';
import { t } from '../i18n/config';

export default function LayerEditContainer({ navigation, route }: Props_LayerEdit) {
  const {
    targetLayer,
    isEdited,
    isNewLayer,
    editable,
    saveLayer,
    deleteLayer,
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

  useEffect(() => {
    if (!editable.state) setTimeout(() => Alert.alert('', editable.message), 500);
  }, [editable.message, editable.state]);

  const pressSaveLayer = useCallback(() => {
    const { isOK, message } = saveLayer();
    if (!isOK) {
      Alert.alert('', message);
    }
  }, [saveLayer]);

  const pressDeleteLayer = useCallback(async () => {
    const ret = await ConfirmAsync(t('LayerEdit.confirm.deleteLayer'));
    if (ret) {
      deleteLayer();
      navigation.navigate('Layers');
    }
  }, [deleteLayer, navigation]);

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
    <LayerEdit
      layer={targetLayer}
      isEdited={isEdited}
      isNewLayer={isNewLayer}
      editable={editable.state}
      onChangeLayerName={changeLayerName}
      submitLayerName={submitLayerName}
      onChangeFeatureType={changeFeatureType}
      onChangeFieldOrder={changeFieldOrder}
      onChangeFieldName={changeFieldName}
      submitFieldName={submitFieldName}
      onChangeFieldFormat={changeFieldFormat}
      pressSaveLayer={pressSaveLayer}
      pressDeleteLayer={pressDeleteLayer}
      pressAddField={addField}
      pressDeleteField={deleteField}
      gotoLayerEditFeatureStyle={gotoLayerEditFeatureStyle}
      gotoLayerEditFieldItem={gotoLayerEditFieldItem}
      gotoBack={gotoBack}
    />
  );
}
