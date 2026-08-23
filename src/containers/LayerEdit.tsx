import React, { useCallback } from 'react';
import LayerEdit from '../components/pages/LayerEdit';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { useLayerEdit } from '../hooks/useLayerEdit';
import { useBottomSheetNavigation, useBottomSheetRoute } from '../contexts/BottomSheetNavigationContext';
import { FieldType } from '../types';
import { Alert } from '../components/atoms/Alert';
import { t } from '../i18n/config';
import { LayerEditContext } from '../contexts/LayerEdit';
import { checkLayerInputs } from '../utils/Layer';
import { isViewshedLayer } from '../utils/viewshedLayers';
import { usePermission } from '../hooks/usePermission';
import { exportGeoFile } from '../utils/File';
import { MAX_BACKUP_LABEL_LENGTH, truncateForFileName } from '../utils/General';
import { useGeoFile } from '../hooks/useGeoFile';
import dayjs from 'dayjs';

export default function LayerEditContainer() {
  const { navigate } = useBottomSheetNavigation();
  const { params } = useBottomSheetRoute<'LayerEdit'>();
  const {
    targetLayer,
    isEdited,
    isNewLayer,
    canChangePermission,
    saveLayer,
    deleteLayer,
    deleteLayerPhotos,
    changeLayerName,
    submitLayerName,
    changeFeatureType,
    changePermission,
    changeFieldOrder,
    changeFieldName,
    changeOption,
    submitFieldName,
    changeFieldFormat,
    deleteField,
    addField,
    applyLayerPreset,
  } = useLayerEdit(
    params!.targetLayer,
    params!.isEdited,
    params?.fieldIndex,
    params?.itemValues,
    params?.colorStyle,
    params?.useLastValue
  );
  const { isRunningProject } = usePermission();
  const { generateExportGeoData } = useGeoFile();

  const pressSaveLayer = useCallback(() => {
    if (isRunningProject) {
      AlertAsync(t('hooks.message.cannotInRunningProject'));
      return;
    }
    const checkLayerInputsResult = checkLayerInputs(targetLayer);
    if (!checkLayerInputsResult.isOK) {
      Alert.alert('', checkLayerInputsResult.message);
      return;
    }
    saveLayer();
  }, [isRunningProject, saveLayer, targetLayer]);

  const pressDeleteLayer = useCallback(async () => {
    // 可視領域レイヤはオンデマンド作成のお試しレイヤなので、プロジェクト中でも削除して元に戻せる
    if (isRunningProject && !isViewshedLayer(targetLayer.id)) {
      await AlertAsync(t('hooks.message.cannotInRunningProject'));
      return;
    }
    const ret = await ConfirmAsync(t('LayerEdit.confirm.deleteLayer'));
    if (ret) {
      await deleteLayer();
      await deleteLayerPhotos();
      navigate('Layers', undefined);
    }
  }, [deleteLayer, deleteLayerPhotos, isRunningProject, navigate, targetLayer.id]);

  const pressExportLayer = useCallback(async () => {
    const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    // レイヤ名はzip名（=Windows展開時のフォルダ名）と内部ファイル名の2か所に入るため、
    // バックアップzipと同じ42文字上限でMAX_PATH超過を防ぐ
    const layerNameLabel = truncateForFileName(targetLayer.name, MAX_BACKUP_LABEL_LENGTH);
    const fileNameBase = `${layerNameLabel}_${time}`;
    const exportData = await generateExportGeoData(targetLayer, [], fileNameBase, {
      settingsOnly: true,
      exportDictionary: true,
    });
    const result = await exportGeoFile(exportData, `layer_${layerNameLabel}_${time}`, 'zip');
    if (result === 'error') await AlertAsync(t('hooks.message.failExport'));
  }, [generateExportGeoData, targetLayer]);

  const gotoLayerEditFeatureStyle = useCallback(() => {
    navigate('LayerEditFeatureStyle', {
      targetLayer: { ...targetLayer },
      isEdited: isEdited,
    });
  }, [isEdited, navigate, targetLayer]);

  const gotoLayerEditFieldItem = useCallback(
    (fieldIndex: number, fieldItem: FieldType) => {
      navigate('LayerEditFieldItem', {
        targetLayer: { ...targetLayer },
        fieldIndex: fieldIndex,
        fieldItem: fieldItem,
        isEdited: isEdited,
      });
    },
    [isEdited, navigate, targetLayer]
  );

  const gotoBack = useCallback(async () => {
    if (isEdited) {
      const ret = await ConfirmAsync(t('LayerEdit.confirm.gotoBack'));
      if (ret) navigate('Layers', undefined);
    } else {
      navigate('Layers', undefined);
    }
  }, [isEdited, navigate]);

  const layersContextValue = React.useMemo(
    () => ({
      layer: targetLayer,
      isEdited,
      isNewLayer,
      onChangeLayerName: changeLayerName,
      submitLayerName,
      onChangeFeatureType: changeFeatureType,
      onChangeFieldOrder: changeFieldOrder,
      onChangeFieldName: changeFieldName,
      canChangePermission,
      changePermission,
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
      onChangeLayerPreset: applyLayerPreset,
    }),
    [
      addField,
      applyLayerPreset,
      changeFeatureType,
      changeFieldFormat,
      changeFieldName,
      changeFieldOrder,
      changeLayerName,
      changeOption,
      canChangePermission,
      changePermission,
      deleteField,
      gotoBack,
      gotoLayerEditFeatureStyle,
      gotoLayerEditFieldItem,
      isEdited,
      isNewLayer,
      pressDeleteLayer,
      pressExportLayer,
      pressSaveLayer,
      submitFieldName,
      submitLayerName,
      targetLayer,
    ]
  );

  return (
    <LayerEditContext.Provider value={layersContextValue}>
      <LayerEdit />
    </LayerEditContext.Provider>
  );
}
