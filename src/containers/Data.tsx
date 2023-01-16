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

export default function DataContainer({ navigation, route }: Props_Data) {
  const projectId = useSelector((state: AppState) => state.settings.projectId);

  const [targetLayer] = useState<LayerType>(route.params.targetLayer);

  const {
    isOwnerAdmin,
    allUserRecordSet,
    isChecked,
    checkList,
    sortedName,
    sortedOrder,
    changeVisible,
    changeChecked,
    changeOrder,
    addRecord,
    deleteSelectedRecords,
    exportRecords,
  } = useData(route.params.targetLayer);

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
      const { isOK, message } = await deleteSelectedRecords();
      if (!isOK) {
        await AlertAsync(message);
      }
    }
  }, [deleteSelectedRecords]);

  const pressAddData = useCallback(async () => {
    const { message, data } = await addRecord();
    if (data === undefined) {
      await AlertAsync(message);
    } else {
      navigation.navigate('DataEdit', {
        previous: 'Data',
        targetData: data,
        targetLayer: targetLayer,
      });
    }
  }, [addRecord, navigation, targetLayer]);

  const gotoDataEdit = useCallback(
    (index: number) => {
      navigation.navigate('DataEdit', {
        previous: 'Data',
        targetData: allUserRecordSet[index],
        targetLayer: { ...targetLayer },
        targetRecordSet: allUserRecordSet,
        targetIndex: index,
      });
    },
    [allUserRecordSet, navigation, targetLayer]
  );

  const gotoBack = useCallback(() => {
    navigation.navigate('Layers');
  }, [navigation]);

  return (
    <Data
      data={allUserRecordSet}
      layer={targetLayer}
      projectId={projectId}
      isChecked={isChecked}
      checkList={checkList}
      sortedOrder={sortedOrder}
      sortedName={sortedName}
      changeOrder={changeOrder}
      changeChecked={changeChecked}
      changeVisible={changeVisible}
      pressAddData={pressAddData}
      pressDeleteData={pressDeleteData}
      pressExportData={pressExportData}
      gotoDataEdit={gotoDataEdit}
      gotoBack={gotoBack}
    />
  );
}
