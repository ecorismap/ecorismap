import React, { useState, useCallback } from 'react';
import { LayerType } from '../types';
import Data from '../components/pages/Data';
import { shallowEqual, useSelector } from 'react-redux';
import { RootState } from '../store';
import { useData } from '../hooks/useData';
import { Props_Data } from '../routes';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { Alert } from '../components/atoms/Alert';
import { t } from '../i18n/config';
import { DataContext } from '../contexts/Data';
import { exportGeoFile } from '../utils/File';
import { usePhoto } from '../hooks/usePhoto';
import { usePermission } from '../hooks/usePermission';

export default function DataContainer({ navigation, route }: Props_Data) {
  //console.log('render DataContainer');
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const [layer] = useState<LayerType>(route.params.targetLayer);

  const {
    allUserRecordSet: data,
    isChecked,
    checkList,
    checkedRecords,
    isMapMemoLayer,
    sortedName,
    sortedOrder,
    changeVisible,
    changeVisibleAll,
    changeChecked,
    changeCheckedAll,
    changeOrder,
    addDefaultRecord,
    deleteRecords,
    generateExportGeoData,
    checkRecordEditable,
    updateOwnRecordSetOrder,
  } = useData(route.params.targetLayer.id);
  const { isOwnerAdmin } = usePermission();

  const { deleteRecordPhotos } = usePhoto();

  const pressExportData = useCallback(async () => {
    //Todo : トラブル対応のためしばらくは誰でもエクスポート可能にする
    // if (isMember) {
    //   Alert.alert('', t('Data.alert.exportData'));
    //   return;
    // }
    const { exportData, fileName } = await generateExportGeoData();
    const isOK = await exportGeoFile(exportData, fileName, 'zip');
    if (!isOK) await AlertAsync(t('hooks.message.failExport'));
  }, [generateExportGeoData]);

  const pressDeleteData = useCallback(async () => {
    const ret = await ConfirmAsync(t('Data.confirm.deleteData'));
    if (!ret) return;
    for (const record of checkedRecords) {
      const { isOK, message } = checkRecordEditable(route.params.targetLayer, record);
      if (!isOK) {
        await AlertAsync(message);
        return;
      }
    }
    deleteRecords();
    checkedRecords.forEach((record) => {
      deleteRecordPhotos(route.params.targetLayer, record, projectId, record.userId);
    });
  }, [checkRecordEditable, checkedRecords, deleteRecordPhotos, deleteRecords, projectId, route.params.targetLayer]);

  const pressAddData = useCallback(() => {
    if (!route.params.targetLayer.active) {
      Alert.alert('', t('hooks.message.noEditMode'));
      return;
    }
    const addedData = addDefaultRecord();
    navigation.navigate('DataEdit', {
      previous: 'Data',
      targetData: addedData,
      targetLayer: layer,
    });
  }, [addDefaultRecord, layer, navigation, route.params.targetLayer.active]);

  const addDataByDictinary = useCallback(
    (fieldId: string, value: string) => {
      if (!route.params.targetLayer.active) {
        Alert.alert('', t('hooks.message.noEditMode'));
        return;
      }
      const fieldName = route.params.targetLayer.field.find((f) => f.id === fieldId)?.name;
      if (!fieldName) return;
      addDefaultRecord({ [fieldName]: value });
    },
    [addDefaultRecord, route.params.targetLayer.active, route.params.targetLayer.field]
  );
  const gotoDataEdit = useCallback(
    (index: number) => {
      navigation.navigate('DataEdit', {
        previous: 'Data',
        targetData: data[index],
        targetLayer: { ...layer },
      });
    },
    [navigation, data, layer]
  );

  const gotoBack = useCallback(() => {
    navigation.navigate('Layers');
  }, [navigation]);

  return (
    <DataContext.Provider
      value={{
        projectId,
        isOwnerAdmin,
        data,
        layer,
        isChecked,
        checkList,
        isMapMemoLayer,
        sortedName,
        sortedOrder,
        changeOrder,
        changeChecked,
        changeCheckedAll,
        changeVisible,
        changeVisibleAll,
        addDataByDictinary,
        pressAddData,
        pressDeleteData,
        pressExportData,
        gotoDataEdit,
        gotoBack,
        updateOwnRecordSetOrder,
      }}
    >
      <Data />
    </DataContext.Provider>
  );
}
