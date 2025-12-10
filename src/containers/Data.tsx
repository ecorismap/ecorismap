import React, { useState, useCallback, useContext } from 'react';
import { LayerType, RecordType } from '../types';
import Data from '../components/pages/Data';
import { shallowEqual, useSelector } from 'react-redux';
import { RootState } from '../store';
import { useData } from '../hooks/useData';
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
import { MapViewContext } from '../contexts/MapView';
import { useBottomSheetNavigation, useBottomSheetRoute } from '../contexts/BottomSheetNavigationContext';

export default function DataContainer() {
  //console.log('render DataContainer');
  const { navigate } = useBottomSheetNavigation();
  const { params } = useBottomSheetRoute<'Data'>();

  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const [layer] = useState<LayerType>(params?.targetLayer as LayerType);
  const [isExporting, setIsExporting] = useState(false);

  // MapViewContextから現在地とGPS状態を取得
  const { currentLocation, gpsState } = useContext(MapViewContext);

  const {
    sortedRecordSet,
    isChecked,
    checkList,
    checkedRecords,
    isMapMemoLayer,
    sortedName,
    sortedOrder,
    isEditable,
    changeVisible,
    changeVisibleAll,
    changeChecked,
    changeCheckedAll,
    changeOrder,
    addDefaultRecord,
    deleteRecords,
    updateRecordSetOrder,
  } = useData(params?.targetLayer?.id ?? '');
  const { changeActiveLayer } = useLayers();
  const { checkRecordEditable } = useRecord();
  const { isOwnerAdmin } = usePermission();

  const { generateExportGeoData } = useGeoFile();

  const pressExportData = useCallback(async () => {
    if (isExporting || !params?.targetLayer) return;

    setIsExporting(true);
    //Todo : トラブル対応のためしばらくは誰でもエクスポート可能にする
    // if (isMember) {
    //   Alert.alert('', t('Data.alert.exportData'));
    //   return;
    // }

    try {
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
      const fileNameBase = `${params.targetLayer.name}_${time}`;
      const exportData = await generateExportGeoData(params.targetLayer, exportedRecords, fileNameBase, {
        exportPhoto: true,
      });
      const isOK = await exportGeoFile(exportData, `data_export_${time}`, 'zip');
      if (isOK) {
        await AlertAsync(t('hooks.message.successExportData'));
      } else {
        await AlertAsync(t('hooks.message.failExport'));
      }
    } catch (error) {
      await AlertAsync(t('hooks.message.failExport'));
    } finally {
      setIsExporting(false);
    }
  }, [checkedRecords, sortedRecordSet, generateExportGeoData, isExporting, isMapMemoLayer, params?.targetLayer]);

  const pressDeleteData = useCallback(async () => {
    if (!params?.targetLayer) return;

    const ret = await ConfirmAsync(t('Data.confirm.deleteData'));
    if (!ret) return;

    const checkResult = checkRecordEditable(params.targetLayer);

    if (!checkResult.isOK) {
      if (checkResult.message === t('hooks.message.noEditMode')) {
        // 編集モードでない場合、確認ダイアログを表示
        const confirmResult = await ConfirmAsync(t('hooks.confirmEditModeMessage'));
        if (!confirmResult) return;
        // 編集モードにする
        changeActiveLayer(params.targetLayer);
      } else {
        // その他の編集不可理由（プロジェクトロックなど）
        Alert.alert('', checkResult.message);
        return;
      }
    }
    deleteRecords();
  }, [changeActiveLayer, checkRecordEditable, deleteRecords, params?.targetLayer]);

  const pressAddData = useCallback(async () => {
    if (!params?.targetLayer) return;

    const checkResult = checkRecordEditable(params.targetLayer);

    if (!checkResult.isOK) {
      if (checkResult.message === t('hooks.message.noEditMode')) {
        // 編集モードでない場合、確認ダイアログを表示
        const confirmResult = await ConfirmAsync(t('hooks.confirmEditModeMessage'));
        if (!confirmResult) return;
        // 編集モードにする
        changeActiveLayer(params.targetLayer);
      } else {
        // その他の編集不可理由（プロジェクトロックなど）
        Alert.alert('', checkResult.message);
        return;
      }
    }

    // GPSが有効で現在地が取得できている場合は、現在地を座標として使用
    const locationToUse = gpsState !== 'off' && currentLocation ? currentLocation : undefined;
    const addedData = addDefaultRecord(undefined, locationToUse);
    navigate('DataEdit', {
      previous: 'Data',
      targetData: addedData,
      targetLayer: layer,
    });
  }, [
    addDefaultRecord,
    changeActiveLayer,
    checkRecordEditable,
    layer,
    navigate,
    params?.targetLayer,
    gpsState,
    currentLocation,
  ]);

  const addDataByDictionary = useCallback(
    async (fieldId: string, value: string) => {
      if (!params?.targetLayer) return;

      const checkResult = checkRecordEditable(params.targetLayer);

      if (!checkResult.isOK) {
        if (checkResult.message === t('hooks.message.noEditMode')) {
          // 編集モードでない場合、確認ダイアログを表示
          const confirmResult = await ConfirmAsync(t('hooks.confirmEditModeMessage'));
          if (!confirmResult) return;
          // 編集モードにする
          changeActiveLayer(params.targetLayer);
        } else {
          // その他の編集不可理由（プロジェクトロックなど）
          Alert.alert('', checkResult.message);
          return;
        }
      }
      const fieldName = params.targetLayer.field.find((f) => f.id === fieldId)?.name;
      if (!fieldName) return;

      // GPSが有効で現在地が取得できている場合は、現在地を座標として使用
      const locationToUse = gpsState !== 'off' && currentLocation ? currentLocation : undefined;
      addDefaultRecord({ [fieldName]: value }, locationToUse);
    },
    [addDefaultRecord, changeActiveLayer, checkRecordEditable, params?.targetLayer, gpsState, currentLocation]
  );
  const gotoDataEdit = useCallback(
    (index: number) => {
      navigate('DataEdit', {
        previous: 'Data',
        targetData: sortedRecordSet[index],
        targetLayer: { ...layer },
      });
    },
    [navigate, sortedRecordSet, layer]
  );

  const gotoBack = useCallback(() => {
    navigate('Layers', undefined);
  }, [navigate]);

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
      isEditable,
      isExporting,
      changeOrder,
      changeChecked,
      changeCheckedAll,
      changeVisible,
      changeVisibleAll,
      addDataByDictionary,
      pressAddData,
      pressDeleteData,
      pressExportData,
      gotoDataEdit,
      gotoBack,
      updateRecordSetOrder,
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
      isEditable,
      isExporting,
      changeOrder,
      changeChecked,
      changeCheckedAll,
      changeVisible,
      changeVisibleAll,
      addDataByDictionary,
      pressAddData,
      pressDeleteData,
      pressExportData,
      gotoDataEdit,
      gotoBack,
      updateRecordSetOrder,
    ]
  );

  return (
    <DataContext.Provider value={dataContextValue}>
      <Data />
    </DataContext.Provider>
  );
}
