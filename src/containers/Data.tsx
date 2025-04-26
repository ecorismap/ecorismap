import React, { useState, useCallback } from 'react';
import { LayerType, RecordType } from '../types';
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
import { usePermission } from '../hooks/usePermission';
import { useGeoFile } from '../hooks/useGeoFile';
import dayjs from 'dayjs';

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
    checkRecordEditable,
    updateOwnRecordSetOrder,
  } = useData(route.params.targetLayer.id);
  const { isOwnerAdmin } = usePermission();

  const { generateExportGeoData } = useGeoFile();

  const pressExportData = useCallback(async () => {
    //Todo : トラブル対応のためしばらくは誰でもエクスポート可能にする
    // if (isMember) {
    //   Alert.alert('', t('Data.alert.exportData'));
    //   return;
    // }

    let exportedRecords: RecordType[] = [];
    if (isMapMemoLayer) {
      checkedRecords.forEach((record) => {
        if (record.field._group && record.field._group !== '') return; //自身がsubGroupの場合はスキップ
        const subGroupRecords = data.filter((r) => r.field._group === record.id);
        exportedRecords = [...exportedRecords, record, ...subGroupRecords];
      });
    } else {
      exportedRecords = checkedRecords;
    }

    const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const fileNameBase = `${route.params.targetLayer.name}_${time}`;
    const exportData = await generateExportGeoData(route.params.targetLayer, exportedRecords, fileNameBase, {
      exportPhoto: true,
    });
    const isOK = await exportGeoFile(exportData, fileNameBase, 'zip');
    if (isOK) {
      await AlertAsync(t('hooks.message.successExportData'));
    } else {
      await AlertAsync(t('hooks.message.failExport'));
    }
  }, [checkedRecords, data, generateExportGeoData, isMapMemoLayer, route.params.targetLayer]);

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
  }, [checkRecordEditable, checkedRecords, deleteRecords, route.params.targetLayer]);

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
