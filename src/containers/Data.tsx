import React, { useState, useCallback, useContext } from 'react';
import { LayerType, RecordType } from '../types';
import Data from '../components/pages/Data';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { setAddLocationForLayerAction, setLockLocationForLayerAction } from '../modules/settings';
import { useData } from '../hooks/useData';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { Alert } from '../components/atoms/Alert';
import { t } from '../i18n/config';
import { DataContext } from '../contexts/Data';
import { exportGeoFile } from '../utils/File';
import { MAX_BACKUP_LABEL_LENGTH, truncateForFileName } from '../utils/General';
import { boundingBoxFromRecords, resolveAddLocation } from '../utils/Data';
import { deltaToZoom } from '../utils/Coords';
import { useWindow } from '../hooks/useWindow';
import { usePermission } from '../hooks/usePermission';
import { useGeoFile } from '../hooks/useGeoFile';
import dayjs from 'dayjs';
import { useRecord } from '../hooks/useRecord';
import { useLayers } from '../hooks/useLayers';
import { MapViewContext } from '../contexts/MapView';
import { useBottomSheetNavigation, useBottomSheetRoute } from '../contexts/BottomSheetNavigationContext';
import { addToDynamicDictionary } from '../hooks/useDynamicDictionaryInput';

export default function DataContainer() {
  //console.log('render DataContainer');
  const { navigate, navigateToHome } = useBottomSheetNavigation();
  const { isLandscape, windowWidth, mapRegion } = useWindow();
  const { params } = useBottomSheetRoute<'Data'>();

  const dispatch = useDispatch();
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const [layer] = useState<LayerType>(params?.targetLayer as LayerType);
  //レイヤごとの「追加時に現在地を付与するか」設定。辞書追加後に自動OFFになるワンショット運用のためデフォルトOFF
  const isLocationEnabled = useSelector(
    (state: RootState) => state.settings.addLocationPerLayer?.[params?.targetLayer?.id ?? ''] ?? false,
    shallowEqual
  );
  //ロック中は記録後の自動OFFを行わず、位置ありのまま連続で追加できる
  const isLocationLocked = useSelector(
    (state: RootState) => state.settings.lockLocationPerLayer?.[params?.targetLayer?.id ?? ''] ?? false,
    shallowEqual
  );
  // Reduxから最新のレイヤーを取得（params.targetLayerは画面遷移時のスナップショットでactive状態が古くなるため）
  const liveTargetLayer = useSelector(
    (state: RootState) => state.layers.find((l) => l.id === params?.targetLayer?.id),
    shallowEqual
  );
  const [isExporting, setIsExporting] = useState(false);
  //絞り込みモーダル。列ヘッダ長押しとヘッダの絞り込みボタンの両方から開くため、ここで状態を持つ
  const [filterTarget, setFilterTarget] = useState<string | undefined>(undefined);

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
    filterText,
    filterFieldName,
    isFiltering,
    setFilter,
    clearFilter,
    getFieldCandidates,
    showOnlyFilteredRecords,
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
      // レイヤ名はzip名（=Windows展開時のフォルダ名）と内部ファイル名の2か所に入るため、
      // バックアップzipと同じ42文字上限でMAX_PATH超過を防ぐ
      const layerNameLabel = truncateForFileName(params.targetLayer.name, MAX_BACKUP_LABEL_LENGTH);
      const fileNameBase = `${layerNameLabel}_${time}`;
      const exportData = await generateExportGeoData(params.targetLayer, exportedRecords, fileNameBase, {
        exportPhoto: true,
      });
      const result = await exportGeoFile(exportData, `data_${layerNameLabel}_${time}`, 'zip');
      if (result === 'saved') {
        await AlertAsync(t('hooks.message.successExportData'));
      } else if (result === 'error') {
        await AlertAsync(t('hooks.message.failExport'));
      }
    } catch (error) {
      await AlertAsync(t('hooks.message.failExport'));
    } finally {
      setIsExporting(false);
    }
  }, [checkedRecords, sortedRecordSet, generateExportGeoData, isExporting, isMapMemoLayer, params?.targetLayer]);

  const pressDeleteData = useCallback(async () => {
    if (!params?.targetLayer || !liveTargetLayer) return;

    const ret = await ConfirmAsync(t('Data.confirm.deleteData'));
    if (!ret) return;

    const checkResult = checkRecordEditable(liveTargetLayer);

    if (!checkResult.isOK) {
      if (checkResult.message === t('hooks.message.noEditMode')) {
        // 編集モードでない場合、確認ダイアログを表示
        const confirmResult = await ConfirmAsync(t('hooks.confirmEditModeMessage'));
        if (!confirmResult) return;
        // 編集モードにする
        changeActiveLayer(liveTargetLayer);
      } else {
        // その他の編集不可理由（プロジェクトロックなど）
        Alert.alert('', checkResult.message);
        return;
      }
    }
    deleteRecords();
  }, [changeActiveLayer, checkRecordEditable, deleteRecords, liveTargetLayer, params?.targetLayer]);

  const pressAddData = useCallback(async () => {
    if (!params?.targetLayer || !liveTargetLayer) return;

    const checkResult = checkRecordEditable(liveTargetLayer);

    if (!checkResult.isOK) {
      if (checkResult.message === t('hooks.message.noEditMode')) {
        // 編集モードでない場合、確認ダイアログを表示
        const confirmResult = await ConfirmAsync(t('hooks.confirmEditModeMessage'));
        if (!confirmResult) return;
        // 編集モードにする
        changeActiveLayer(liveTargetLayer);
      } else {
        // その他の編集不可理由（プロジェクトロックなど）
        Alert.alert('', checkResult.message);
        return;
      }
    }

    // 位置トグルがONかつGPSが有効で現在地が取得できている場合は、現在地を座標として使用
    const { location } = resolveAddLocation({
      layerType: liveTargetLayer.type,
      isLocationEnabled,
      gpsState,
      currentLocation,
    });
    const addedData = addDefaultRecord(undefined, location);
    navigate('DataEdit', {
      previous: 'Data',
      targetData: addedData,
      targetLayer: layer,
    });
  }, [
    addDefaultRecord,
    changeActiveLayer,
    checkRecordEditable,
    liveTargetLayer,
    layer,
    navigate,
    params?.targetLayer,
    gpsState,
    currentLocation,
    isLocationEnabled,
  ]);

  const addDataByDictionary = useCallback(
    async (fieldId: string, value: string) => {
      if (!params?.targetLayer || !liveTargetLayer) return;

      const checkResult = checkRecordEditable(liveTargetLayer);

      if (!checkResult.isOK) {
        if (checkResult.message === t('hooks.message.noEditMode')) {
          // 編集モードでない場合、確認ダイアログを表示
          const confirmResult = await ConfirmAsync(t('hooks.confirmEditModeMessage'));
          if (!confirmResult) return;
          // 編集モードにする
          changeActiveLayer(liveTargetLayer);
        } else {
          // その他の編集不可理由（プロジェクトロックなど）
          Alert.alert('', checkResult.message);
          return;
        }
      }
      const targetField = params.targetLayer.field.find((f) => f.id === fieldId);
      const fieldName = targetField?.name;
      if (!fieldName) return;

      // 動的辞書はデータ保存時に語彙が蓄積されるが、この追加経路は保存を経ない場合があるため即時登録する
      if (targetField?.format === 'STRING_DYNAMIC') {
        addToDynamicDictionary(`${params.targetLayer.id}_${fieldId}`, value);
      }

      // 位置トグルがONかつGPSが有効で現在地が取得できている場合は、現在地を座標として使用
      const { location, needsGpsWarning } = resolveAddLocation({
        layerType: liveTargetLayer.type,
        isLocationEnabled,
        gpsState,
        currentLocation,
      });
      const addedData = addDefaultRecord({ [fieldName]: value }, location);

      //位置ONで1件追加したらトグルを戻す。座標が付かなかった場合も戻さないとOFFにし忘れたのと同じ状態になる
      if ((addedData.coords !== undefined || needsGpsWarning) && !isLocationLocked) {
        dispatch(setAddLocationForLayerAction({ layerId: liveTargetLayer.id, enabled: false }));
      }

      if (needsGpsWarning) {
        //位置なしでの記録自体は許容し、付いていないことだけを知らせる
        Alert.alert('', t('Data.alert.addWithoutLocation'));
        return;
      }
      if (addedData.coords === undefined) return;

      //続けて株数などを入力できるよう編集画面を開く
      navigate('DataEdit', {
        previous: 'Data',
        targetData: addedData,
        targetLayer: layer,
      });
    },
    [
      addDefaultRecord,
      changeActiveLayer,
      checkRecordEditable,
      dispatch,
      layer,
      liveTargetLayer,
      navigate,
      params?.targetLayer,
      gpsState,
      currentLocation,
      isLocationEnabled,
      isLocationLocked,
    ]
  );

  const pressToggleLocation = useCallback(() => {
    if (!params?.targetLayer) return;
    const enabled = !isLocationEnabled;
    dispatch(setAddLocationForLayerAction({ layerId: params.targetLayer.id, enabled }));
    //手動でOFFにしたらロックも解除する（隠れたロック状態が残らないように）
    if (!enabled && isLocationLocked) {
      dispatch(setLockLocationForLayerAction({ layerId: params.targetLayer.id, locked: false }));
    }
  }, [dispatch, isLocationEnabled, isLocationLocked, params?.targetLayer]);

  //絞り込み結果だけを地図に表示し、その範囲へ移動する
  const pressShowFilteredOnMap = useCallback(() => {
    const bounds = boundingBoxFromRecords(sortedRecordSet);
    if (bounds === undefined) {
      //地図に出るものが無いのに表示だけ切り替えると、他が消えて何も見えない状態になるため何もしない
      Alert.alert('', t('Data.alert.noLocationData'));
      return;
    }
    showOnlyFilteredRecords();

    //1点だけ（または同一地点）の場合は現在の縮尺を保ったまま移動する
    const latitudeDelta = bounds.north - bounds.south;
    const longitudeDelta = bounds.east - bounds.west;
    const hasExtent = latitudeDelta > 0 || longitudeDelta > 0;
    const jumpTo = hasExtent
      ? (() => {
          const tempZoom = deltaToZoom(windowWidth, { latitudeDelta, longitudeDelta }).zoom;
          const jumpZoom = Math.min(tempZoom, 20);
          //DataEditのジャンプと同じく、ボトムシートで隠れる分をずらして中心を合わせる
          const delta = longitudeDelta * 2 ** (tempZoom - jumpZoom);
          return {
            latitude: (isLandscape ? 0 : -delta / 4) + (bounds.north + bounds.south) / 2,
            longitude: (isLandscape ? delta / 4 : 0) + (bounds.east + bounds.west) / 2,
            latitudeDelta: delta,
            longitudeDelta: delta,
            zoom: jumpZoom,
          };
        })()
      : {
          latitude: bounds.north,
          longitude: bounds.east,
          latitudeDelta: mapRegion.latitudeDelta,
          longitudeDelta: mapRegion.longitudeDelta,
          zoom: mapRegion.zoom,
        };

    navigateToHome?.({ jumpTo, previous: 'Data', mode: 'jumpTo' });
  }, [isLandscape, mapRegion, navigateToHome, showOnlyFilteredRecords, sortedRecordSet, windowWidth]);

  const pressToggleLocationLock = useCallback(() => {
    if (!params?.targetLayer) return;
    //ロックONにすると位置トグルもONになる（reducer側でそろえる）
    dispatch(setLockLocationForLayerAction({ layerId: params.targetLayer.id, locked: !isLocationLocked }));
  }, [dispatch, isLocationLocked, params?.targetLayer]);

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

  const openFilterDialog = useCallback((fieldName: string) => setFilterTarget(fieldName), []);
  const closeFilterDialog = useCallback(() => setFilterTarget(undefined), []);

  const applyFilter = useCallback(
    (value: string, fieldName: string) => {
      //空欄でOKしたら解除扱い。対象列も戻さないとヘッダのフィルタアイコンが残る
      if (value.trim() === '') {
        clearFilter();
      } else {
        setFilter(value, fieldName);
      }
      setFilterTarget(undefined);
    },
    [clearFilter, setFilter]
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
      isLocationEnabled,
      isLocationLocked,
      filterText,
      filterFieldName,
      isFiltering,
      setFilter,
      clearFilter,
      getFieldCandidates,
      filterTarget,
      openFilterDialog,
      closeFilterDialog,
      applyFilter,
      showOnlyFilteredRecords: pressShowFilteredOnMap,
      changeOrder,
      changeChecked,
      changeCheckedAll,
      changeVisible,
      changeVisibleAll,
      addDataByDictionary,
      pressAddData,
      pressDeleteData,
      pressExportData,
      pressToggleLocation,
      pressToggleLocationLock,
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
      isLocationEnabled,
      isLocationLocked,
      filterText,
      filterFieldName,
      isFiltering,
      setFilter,
      clearFilter,
      getFieldCandidates,
      filterTarget,
      openFilterDialog,
      closeFilterDialog,
      applyFilter,
      pressShowFilteredOnMap,
      changeOrder,
      changeChecked,
      changeCheckedAll,
      changeVisible,
      changeVisibleAll,
      addDataByDictionary,
      pressAddData,
      pressDeleteData,
      pressExportData,
      pressToggleLocation,
      pressToggleLocationLock,
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
