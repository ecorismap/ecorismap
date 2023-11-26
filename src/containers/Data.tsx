import React, { useState, useCallback } from 'react';
import { LayerType } from '../types';
import Data from '../components/pages/Data';
import { shallowEqual, useSelector } from 'react-redux';
import { AppState } from '../modules';
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
  const projectId = useSelector((state: AppState) => state.settings.projectId, shallowEqual);
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
    addDefaultRecord,
    deleteRecords,
    generateExportGeoData,
    checkRecordEditable,
  } = useData(route.params.targetLayer);
  const { isOwnerAdmin } = usePermission();

  const { deleteRecordPhotos } = usePhoto();

  const pressExportData = useCallback(async () => {
    //Todo : トラブル対応のためしばらくは誰でもエクスポート可能にする
    // if (isMember) {
    //   Alert.alert('', t('Data.alert.exportData'));
    //   return;
    // }
    const { exportData, fileName } = generateExportGeoData();
    const isOK = await exportGeoFile(exportData, fileName, 'zip');
    if (!isOK) await AlertAsync(t('hooks.message.failExport'));
  }, [generateExportGeoData]);

  const pressDeleteData = useCallback(async () => {
    const ret = await ConfirmAsync(t('Data.confirm.deleteData'));
    if (!ret) return;
    for (const record of targetRecords) {
      const { isOK, message } = checkRecordEditable(route.params.targetLayer, record);
      if (!isOK) {
        await AlertAsync(message);
        return;
      }
    }
    deleteRecords();
    targetRecords.forEach((record) => {
      deleteRecordPhotos(route.params.targetLayer, record, projectId, record.userId);
    });
  }, [checkRecordEditable, deleteRecordPhotos, deleteRecords, projectId, route.params.targetLayer, targetRecords]);

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
      targetRecordSet: [...data, addedData],
      targetIndex: data.length,
    });
  }, [addDefaultRecord, data, layer, navigation, route.params.targetLayer.active]);

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
