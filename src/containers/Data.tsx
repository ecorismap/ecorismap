import React, { useState, useCallback } from 'react';
import { LayerType } from '../types';
import Data from '../components/pages/Data';
import { useSelector } from 'react-redux';
import { AppState } from '../modules';
import { useData } from '../hooks/useData';
import { Props_Data } from '../routes';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { Alert } from '../components/atoms/Alert';
import { t } from '../i18n/config';
import { DataContext } from '../contexts/Data';
import { usePermission } from '../hooks/usePermission';

export default function DataContainer({ navigation, route }: Props_Data) {
  const projectId = useSelector((state: AppState) => state.settings.projectId);

  const [layer] = useState<LayerType>(route.params.targetLayer);

  const {
    allUserRecordSet: data,
    isChecked,
    checkList,
    changeVisible,
    changeVisibleAll,
    changeChecked,
    changeCheckedAll,
    changeOrder,
    addRecord,
    deleteRecords,
    exportRecords,
  } = useData(route.params.targetLayer);
  const { isOwnerAdmin } = usePermission();

  const pressExportData = useCallback(async () => {
    if (!(isOwnerAdmin || projectId === undefined)) {
      Alert.alert('', t('Data.alert.exportData'));
      return;
    }
    const { isOK, message } = await exportRecords();
    if (!isOK) {
      await AlertAsync(message);
    }
  }, [exportRecords, isOwnerAdmin, projectId]);

  const pressDeleteData = useCallback(async () => {
    const ret = await ConfirmAsync(t('Data.confirm.deleteData'));
    if (ret) {
      const { isOK, message } = await deleteRecords();
      if (!isOK) {
        await AlertAsync(message);
      }
    }
  }, [deleteRecords]);

  const pressAddData = useCallback(async () => {
    const { message, data: addedData } = await addRecord();
    if (addedData === undefined) {
      await AlertAsync(message);
    } else {
      navigation.navigate('DataEdit', {
        previous: 'Data',
        targetData: addedData,
        targetLayer: layer,
        targetRecordSet: [],
        targetIndex: 0,
      });
    }
  }, [addRecord, layer, navigation]);

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
