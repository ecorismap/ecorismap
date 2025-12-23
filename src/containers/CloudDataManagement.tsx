import React, { useCallback, useEffect, useMemo } from 'react';
import CloudDataManagement from '../components/pages/CloudDataManagement';
import { ConfirmAsync } from '../components/molecules/AlertAsync';
import { useCloudDataManagement } from '../hooks/useCloudDataManagement';
import { Props_CloudDataManagement } from '../routes';
import { t } from '../i18n/config';
import { CloudDataManagementContext } from '../contexts/CloudDataManagement';
import { Alert } from '../components/atoms/Alert';

export default function CloudDataManagementContainer({ navigation, route }: Props_CloudDataManagement) {
  const { project } = route.params;

  const { isLoading, dataGroups, checkList, isChecked, fetchCloudData, deleteCloudData, changeChecked, changeCheckedAll } =
    useCloudDataManagement(project);

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

  const pressDeleteSelected = useCallback(async () => {
    const selectedGroups = dataGroups.filter((_, index) => checkList[index]?.checked);
    if (selectedGroups.length === 0) return;

    const confirmed = await ConfirmAsync(
      t('CloudDataManagement.confirm.delete', { count: selectedGroups.length })
    );
    if (!confirmed) return;

    const result = await deleteCloudData(selectedGroups);
    if (result.isOK) {
      // 削除成功後、データを再取得
      await fetchCloudData();
      Alert.alert('', t('CloudDataManagement.message.deleteSuccess'));
    } else {
      Alert.alert('', result.message);
    }
  }, [dataGroups, checkList, deleteCloudData, fetchCloudData]);

  const refreshData = useCallback(async () => {
    await fetchCloudData();
  }, [fetchCloudData]);

  const contextValue = useMemo(
    () => ({
      project,
      isLoading,
      dataGroups,
      checkList,
      isChecked,
      refreshData,
      changeChecked,
      changeCheckedAll,
      pressDeleteSelected,
      gotoBack,
    }),
    [
      project,
      isLoading,
      dataGroups,
      checkList,
      isChecked,
      refreshData,
      changeChecked,
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
