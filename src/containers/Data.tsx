import React, { useState, useCallback } from 'react';
import { LayerType } from '../types';
import Data from '../components/pages/Data';
import { useSelector } from 'react-redux';
import { AppState } from '../modules';
import { useData } from '../hooks/useData';
import { Props_Data } from '../routes';
import { ConfirmAsync } from '../components/molecules/AlertAsync';
import { Alert } from '../components/atoms/Alert';
import { t } from '../i18n/config';
import { DataContext } from '../contexts/Data';
import { usePermission } from '../hooks/usePermission';
import { exportGeoFile } from '../utils/File';
import { usePhoto } from '../hooks/usePhoto';
import { useRecord } from '../hooks/useRecord';

export default function DataContainer({ navigation, route }: Props_Data) {
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const [layer] = useState<LayerType>(route.params.targetLayer);

  const {
    allUserRecordSet: data,
    isChecked,
    checkList,
    targetRecords,
    changeVisible,
    changeVisibleAll,
    changeChecked,
    changeCheckedAll,
    changeOrder,
    addRecord,
    deleteRecords,
    generateExportGeoData,
  } = useData(route.params.targetLayer);
  const { isMember, isOwnerAdmin } = usePermission();
  const { checkRecordEditable } = useRecord();
  const { deleteRecordPhotos } = usePhoto();

  const pressExportData = useCallback(async () => {
    if (isMember) {
      Alert.alert('', t('Data.alert.exportData'));
      return;
    }
    const { exportData, fileName } = generateExportGeoData();
    const isOK = await exportGeoFile(exportData, fileName, 'zip');
    if (!isOK) Alert.alert('', t('hooks.message.failExport'));
  }, [generateExportGeoData, isMember]);

  const pressDeleteData = useCallback(async () => {
    const ret = await ConfirmAsync(t('Data.confirm.deleteData'));
    if (!ret) return;
    for (const record of targetRecords) {
      const { isOK, message } = checkRecordEditable(route.params.targetLayer, record);
      if (!isOK) {
        Alert.alert('', message);
        return;
      }
    }
    deleteRecords();
    targetRecords.forEach((record) => {
      deleteRecordPhotos(route.params.targetLayer, record, projectId, record.userId);
    });
  }, [checkRecordEditable, deleteRecordPhotos, deleteRecords, projectId, route.params.targetLayer, targetRecords]);

  const pressAddData = useCallback(async () => {
    if (!route.params.targetLayer.active) {
      Alert.alert('', t('hooks.message.noEditMode'));
      return;
    }

    const addedData = addRecord();
    navigation.navigate('DataEdit', {
      previous: 'Data',
      targetData: addedData,
      targetLayer: layer,
      targetRecordSet: [],
      targetIndex: 0,
    });
  }, [addRecord, layer, navigation, route.params.targetLayer.active]);

  const gotoDataEdit = useCallback(
    (index: number) => {
      navigation.navigate('DataEdit', {
        previous: 'Data',
        targetData: data[index],
        targetLayer: { ...layer },
        targetRecordSet: data,
        targetIndex: index,
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
        changeOrder,
        changeChecked,
        changeCheckedAll,
        changeVisible,
        changeVisibleAll,
        pressAddData,
        pressDeleteData,
        pressExportData,
        gotoDataEdit,
        gotoBack,
      }}
    >
      <Data />
    </DataContext.Provider>
  );
}
