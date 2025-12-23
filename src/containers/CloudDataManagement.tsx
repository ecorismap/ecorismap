import React, { useCallback, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import CloudDataManagement from '../components/pages/CloudDataManagement';
import { ConfirmAsync } from '../components/molecules/AlertAsync';
import { useCloudDataManagement } from '../hooks/useCloudDataManagement';
import { Props_CloudDataManagement } from '../routes';
import { t } from '../i18n/config';
import { CloudDataManagementContext } from '../contexts/CloudDataManagement';
import { Alert } from '../components/atoms/Alert';
import { RootState } from '../store';

export default function CloudDataManagementContainer({ navigation, route }: Props_CloudDataManagement) {
  const { project } = route.params;
  const user = useSelector((state: RootState) => state.user);

  const {
    isLoading,
    layerGroups,
    checkStates,
    isChecked,
    fetchCloudData,
    deleteCloudData,
    deleteLayerDefinition,
    changeLayerChecked,
    changeDataChecked,
    changeCheckedAll,
  } = useCloudDataManagement(project, user);

  // 画面表示時にデータを取得
  useEffect(() => {
    fetchCloudData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const gotoBack = useCallback(() => {
    navigation.navigate('ProjectEdit', {
      previous: 'CloudDataManagement',
      project,
      isNew: false,
    });
  }, [navigation, project]);

  // 選択されたデータ件数をカウント
  const getSelectedDataCount = useCallback(() => {
    let count = 0;
    checkStates.forEach((layerCheck, layerIndex) => {
      const layer = layerGroups[layerIndex];
      if (!layer) return;

      if (layerCheck.checked) {
        count += layer.dataItems.length;
      } else {
        count += layerCheck.dataChecks.filter((d) => d.checked).length;
      }
    });
    return count;
  }, [checkStates, layerGroups]);

  // レイヤ（親）が選択されているかどうか
  const hasLayerSelected = useCallback(() => {
    return checkStates.some((layerCheck) => layerCheck.checked);
  }, [checkStates]);

  // 選択されたレイヤ件数をカウント
  const getSelectedLayerCount = useCallback(() => {
    return checkStates.filter((layerCheck) => layerCheck.checked).length;
  }, [checkStates]);

  const pressDeleteSelected = useCallback(async () => {
    const isLayerDelete = hasLayerSelected();

    if (isLayerDelete) {
      // レイヤ（親）が選択されている場合はレイヤ定義ごと削除
      const layerCount = getSelectedLayerCount();
      if (layerCount === 0) return;

      const confirmed = await ConfirmAsync(t('CloudDataManagement.confirm.deleteLayer', { count: layerCount }));
      if (!confirmed) return;

      const result = await deleteLayerDefinition();
      if (result.isOK) {
        await fetchCloudData();
        Alert.alert('', t('CloudDataManagement.message.deleteSuccess'));
      } else {
        Alert.alert('', result.message);
      }
    } else {
      // データ（子）のみ選択されている場合はデータのみ削除
      const dataCount = getSelectedDataCount();
      if (dataCount === 0) return;

      const confirmed = await ConfirmAsync(t('CloudDataManagement.confirm.delete', { count: dataCount }));
      if (!confirmed) return;

      const result = await deleteCloudData();
      if (result.isOK) {
        await fetchCloudData();
        Alert.alert('', t('CloudDataManagement.message.deleteSuccess'));
      } else {
        Alert.alert('', result.message);
      }
    }
  }, [hasLayerSelected, getSelectedLayerCount, getSelectedDataCount, deleteLayerDefinition, deleteCloudData, fetchCloudData]);

  const refreshData = useCallback(async () => {
    await fetchCloudData();
  }, [fetchCloudData]);

  const contextValue = useMemo(
    () => ({
      project,
      isLoading,
      layerGroups,
      checkStates,
      isChecked,
      refreshData,
      changeLayerChecked,
      changeDataChecked,
      changeCheckedAll,
      pressDeleteSelected,
      gotoBack,
    }),
    [
      project,
      isLoading,
      layerGroups,
      checkStates,
      isChecked,
      refreshData,
      changeLayerChecked,
      changeDataChecked,
      changeCheckedAll,
      pressDeleteSelected,
      gotoBack,
    ]
  );

  return (
    <CloudDataManagementContext.Provider value={contextValue}>
      <CloudDataManagement />
    </CloudDataManagementContext.Provider>
  );
}
