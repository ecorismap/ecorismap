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
import { useRecord } from '../hooks/useRecord';
import { useLayers } from '../hooks/useLayers';

export default function DataContainer({ navigation, route }: Props_Data) {
  //console.log('render DataContainer');
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const [layer] = useState<LayerType>(route.params.targetLayer);

  const {
    sortedRecordSet,
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
    updateOwnRecordSetOrder,
  } = useData(route.params.targetLayer.id);
  const { changeActiveLayer } = useLayers();
  const { checkRecordEditable } = useRecord();
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
        const subGroupRecords = sortedRecordSet.filter((r) => r.field._group === record.id);
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
  }, [checkedRecords, sortedRecordSet, generateExportGeoData, isMapMemoLayer, route.params.targetLayer]);

  const pressDeleteData = useCallback(async () => {
    const ret = await ConfirmAsync(t('Data.confirm.deleteData'));
    if (!ret) return;

    const checkResult = checkRecordEditable(route.params.targetLayer);

    if (!checkResult.isOK) {
      if (checkResult.message === t('hooks.message.noEditMode')) {
        // 編集モードでない場合、確認ダイアログを表示
        const confirmResult = await ConfirmAsync(t('hooks.confirmEditModeMessage'));
        if (!confirmResult) return;
        // 編集モードにする
        changeActiveLayer(route.params.targetLayer);
      } else {
        // その他の編集不可理由（プロジェクトロックなど）
        Alert.alert('', checkResult.message);
        return;
      }
    }
    deleteRecords();
  }, [changeActiveLayer, checkRecordEditable, deleteRecords, route.params.targetLayer]);

  const pressAddData = useCallback(async () => {
    const checkResult = checkRecordEditable(route.params.targetLayer);

    if (!checkResult.isOK) {
      if (checkResult.message === t('hooks.message.noEditMode')) {
        // 編集モードでない場合、確認ダイアログを表示
        const confirmResult = await ConfirmAsync(t('hooks.confirmEditModeMessage'));
        if (!confirmResult) return;
        // 編集モードにする
        changeActiveLayer(route.params.targetLayer);
      } else {
        // その他の編集不可理由（プロジェクトロックなど）
        Alert.alert('', checkResult.message);
        return;
      }
    }

    const addedData = addDefaultRecord();
    navigation.navigate('DataEdit', {
      previous: 'Data',
      targetData: addedData,
      targetLayer: layer,
    });
  }, [addDefaultRecord, changeActiveLayer, checkRecordEditable, layer, navigation, route.params.targetLayer]);

  const addDataByDictinary = useCallback(
    async (fieldId: string, value: string) => {
      const checkResult = checkRecordEditable(route.params.targetLayer);

      if (!checkResult.isOK) {
        if (checkResult.message === t('hooks.message.noEditMode')) {
          // 編集モードでない場合、確認ダイアログを表示
          const confirmResult = await ConfirmAsync(t('hooks.confirmEditModeMessage'));
          if (!confirmResult) return;
          // 編集モードにする
          changeActiveLayer(route.params.targetLayer);
        } else {
          // その他の編集不可理由（プロジェクトロックなど）
          Alert.alert('', checkResult.message);
          return;
        }
      }
      const fieldName = route.params.targetLayer.field.find((f) => f.id === fieldId)?.name;
      if (!fieldName) return;
      addDefaultRecord({ [fieldName]: value });
    },
    [addDefaultRecord, changeActiveLayer, checkRecordEditable, route.params.targetLayer]
  );
  const gotoDataEdit = useCallback(
    (index: number) => {
      navigation.navigate('DataEdit', {
        previous: 'Data',
        targetData: sortedRecordSet[index],
        targetLayer: { ...layer },
      });
    },
    [navigation, sortedRecordSet, layer]
  );

  const gotoBack = useCallback(() => {
    navigation.navigate('Layers');
  }, [navigation]);

  // DataContext.ProviderのvalueをuseMemoでメモ化し、props変更時のみ再生成
  const dataContextValue = React.useMemo(
    () => ({
      projectId,
      isOwnerAdmin,
      sortedRecordSet,
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
    }),
    [
      projectId,
      isOwnerAdmin,
      sortedRecordSet,
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
    ]
  );

  return (
    <DataContext.Provider value={dataContextValue}>
      <Data />
    </DataContext.Provider>
  );
}
