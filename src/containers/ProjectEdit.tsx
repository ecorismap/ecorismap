import React, { useState, useCallback } from 'react';
import ProjectEdit, { ConflictResolverModal } from '../components/pages/ProjectEdit';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { useProjectEdit } from '../hooks/useProjectEdit';
import { Props_ProjectEdit } from '../routes';
import { Platform } from 'react-native';
import { useProjects } from '../hooks/useProjects';
import { validateMemberLicense, validateProjectLicense } from '../utils/Project';
import { Alert } from '../components/atoms/Alert';
import { t } from '../i18n/config';
import { ProjectEditContext } from '../contexts/ProjectEdit';
import { useE3kitGroup } from '../hooks/useE3kitGroup';
import { useRepository } from '../hooks/useRepository';
import { exportGeoFile } from '../utils/File';
import { ProjectType } from '../types';
import { updateLicense } from '../lib/firebase/firestore';
import dayjs from '../i18n/dayjs';
import { useEcorisMapFile } from '../hooks/useEcorismapFile';

export default function ProjectEditContainer({ navigation, route }: Props_ProjectEdit) {
  const {
    isProjectOpen,
    isOwner,
    isOwnerAdmin,
    isNew,
    targetProject,
    originalProject,
    isEdited,
    checkedProject,
    saveProject,
    changeText,
    changeMemberText,
    changeAdmin,
    addMembers,
    deleteMember,
    openProject,
    startProjectSetting,
  } = useProjectEdit(route.params.project, route.params.isNew);

  const [isLoading, setIsLoading] = useState(false);
  const { ownerProjectsCount } = useProjects();
  const { loadE3kitGroup, deleteE3kitGroup, updateE3kitGroupMembers, createE3kitGroup } = useE3kitGroup();
  const {
    deleteProject,
    fetchProjectSettings,
    fetchAllData,
    createProject,
    updateProject,
    downloadProjectSettings,
    fetchPublicData,
    fetchPrivateData,
    fetchTemplateData,
    downloadCommonData,
    downloadTemplateData,
    createMergedDataSet,
    conflictState,
    setConflictState,
  } = useRepository();
  const { generateEcorisMapData, createExportSettings } = useEcorisMapFile();

  const downloadDataForSetting = useCallback(async () => {
    const shouldPhotoDownload = false;
    const commonDataResult = await downloadCommonData(targetProject, shouldPhotoDownload);
    if (!commonDataResult.isOK) throw new Error(commonDataResult.message);
    const templateDataResult = await downloadTemplateData(targetProject, shouldPhotoDownload);
    if (!templateDataResult.isOK) throw new Error(templateDataResult.message);
  }, [downloadCommonData, downloadTemplateData, targetProject]);

  const downloadData = useCallback(
    async ({ isAdmin = false }) => {
      const shouldPhotoDownload = false;
      const mode = isAdmin ? 'all' : 'own';

      const commonDataResult = await downloadCommonData(targetProject, shouldPhotoDownload);
      if (!commonDataResult.isOK) throw new Error(commonDataResult.message);

      const [publicRes, privateRes, templateRes] = await Promise.all([
        fetchPublicData(targetProject, shouldPhotoDownload, 'all'),
        fetchPrivateData(targetProject, shouldPhotoDownload, mode),
        fetchTemplateData(targetProject, shouldPhotoDownload),
      ]);
      if (!publicRes.isOK || !privateRes.isOK || !templateRes.isOK) {
        throw new Error(publicRes.message || privateRes.message || templateRes.message);
      }
      const mergedDataResult = await createMergedDataSet({
        privateData: privateRes.data,
        publicData: publicRes.data,
        templateData: templateRes.data,
      });
      if (!mergedDataResult.isOK) throw new Error(mergedDataResult.message);
    },
    [createMergedDataSet, downloadCommonData, fetchPrivateData, fetchPublicData, fetchTemplateData, targetProject]
  );

  const pressOpenProject = useCallback(
    async (isSetting: boolean) => {
      try {
        if (isProjectOpen) {
          const ret = await ConfirmAsync(t('Home.confirm.reOpenProject'));
          if (!ret) return false;
        }

        const projectLicenseResult = validateProjectLicense(targetProject.license, ownerProjectsCount());
        if (!projectLicenseResult.isOK && isOwner) {
          if (Platform.OS === 'web') {
            await AlertAsync(projectLicenseResult.message + t('ProjectEdit.alert.openProjectWeb'));
          } else {
            await AlertAsync(t('ProjectEdit.alert.openProject'));
          }
        }

        setIsLoading(true);
        const loadE3kitGroupResult = await loadE3kitGroup(targetProject);
        if (!loadE3kitGroupResult.isOK) throw new Error(loadE3kitGroupResult.message);

        const projectSettingsResult = await downloadProjectSettings(targetProject);
        if (!projectSettingsResult.isOK || projectSettingsResult.region === undefined)
          throw new Error(projectSettingsResult.message);

        if (isSetting) {
          await downloadDataForSetting();
        } else if (Platform.OS === 'web' && isOwnerAdmin) {
          await downloadData({ isAdmin: true });
        } else {
          await downloadData({ isAdmin: false });
        }

        openProject();
        setIsLoading(false);

        navigation.navigate('Home', {
          jumpTo: projectSettingsResult.region,
          previous: 'ProjectEdit',
          mode: 'jumpTo',
        });
        return true;
      } catch (e: any) {
        setIsLoading(false);
        await AlertAsync(e.message);
        return false;
      }
    },
    [
      isProjectOpen,
      targetProject,
      ownerProjectsCount,
      isOwner,
      loadE3kitGroup,
      downloadProjectSettings,
      isOwnerAdmin,
      openProject,
      navigation,
      downloadDataForSetting,
      downloadData,
    ]
  );

  const pressSettingProject = useCallback(async () => {
    const ret = await pressOpenProject(true);
    if (ret) {
      startProjectSetting();
      await AlertAsync(t('ProjectEdit.alert.settingProject'));
    }
  }, [pressOpenProject, startProjectSetting]);

  const pressExportProject = useCallback(async () => {
    try {
      if (Platform.OS !== 'web') {
        await AlertAsync(t('ProjectEdit.alert.exportProject'));
        return;
      }
      setIsLoading(true);
      const projectSettingsResult = await fetchProjectSettings(targetProject);
      if (!projectSettingsResult.isOK || projectSettingsResult.data === undefined)
        throw new Error(projectSettingsResult.message);
      const allDataResult = await fetchAllData(targetProject);
      if (!allDataResult.isOK || allDataResult.data === undefined) throw new Error(allDataResult.message);
      const newSettings = createExportSettings();
      newSettings.mapRegion = projectSettingsResult.data.mapRegion;
      newSettings.plugins = projectSettingsResult.data.plugins;
      newSettings.mapType = projectSettingsResult.data.mapType;

      const data = {
        dataSet: allDataResult.data,
        layers: projectSettingsResult.data.layers,
        maps: projectSettingsResult.data.tileMaps,
        settings: newSettings,
      };
      const includePhoto = true;
      const exportData = await generateEcorisMapData(data, { includePhoto, fromProject: true });
      const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');
      const exportDataName = `${targetProject.name}_${time}`;

      const isOK = await exportGeoFile(exportData, exportDataName, 'ecorismap');
      if (!isOK) await AlertAsync(t('hooks.message.failExport'));

      setIsLoading(false);
    } catch (e: any) {
      setIsLoading(false);
      await AlertAsync(e.message);
    }
  }, [createExportSettings, fetchAllData, fetchProjectSettings, generateEcorisMapData, targetProject]);

  const pressDeleteProject = useCallback(async () => {
    try {
      if (isProjectOpen) {
        await AlertAsync(t('ProjectEdit.alert.deleteProjectOpen'));
        return;
      }
      const ret = await ConfirmAsync(t('ProjectEdit.confirm.deleteProject'));
      if (!ret) return;
      setIsLoading(true);
      //ToDo 消した後に他のユーザーがアップロード、ダウンロードした時のエラー処理
      const deleteProjectResult = await deleteProject(targetProject);
      if (!deleteProjectResult.isOK) throw new Error(deleteProjectResult.message);
      const deleteE3kitGroupResult = await deleteE3kitGroup(targetProject);
      if (!deleteE3kitGroupResult.isOK) throw new Error(deleteE3kitGroupResult.message);
      setIsLoading(false);
      await AlertAsync(t('ProjectEdit.alert.deleteProject'));
      navigation.navigate('Projects');
    } catch (e: any) {
      setIsLoading(false);
      await AlertAsync(e.message);
    }
  }, [deleteE3kitGroup, deleteProject, isProjectOpen, navigation, targetProject]);

  const saveUpdatedProject = useCallback(
    async (project: ProjectType) => {
      const e3kitGroupResult = await updateE3kitGroupMembers(originalProject, project);
      if (!e3kitGroupResult.isOK || e3kitGroupResult.project === undefined) throw new Error(e3kitGroupResult.message);
      const updateProjectResult = await updateProject(e3kitGroupResult.project);
      if (!updateProjectResult.isOK) throw new Error(updateProjectResult.message);
      saveProject(e3kitGroupResult.project);
    },
    [originalProject, saveProject, updateE3kitGroupMembers, updateProject]
  );

  const saveNewProject = useCallback(
    async (project: ProjectType) => {
      const e3kitGroupResult = await createE3kitGroup(project);
      if (!e3kitGroupResult.isOK || e3kitGroupResult.project === undefined) throw new Error(e3kitGroupResult.message);
      const createProjectResult = await createProject(e3kitGroupResult.project);
      if (!createProjectResult.isOK) throw new Error(createProjectResult.message);
      const updateLicenseResult = await updateLicense(e3kitGroupResult.project);
      if (!updateLicenseResult.isOK) throw new Error(updateLicenseResult.message);
    },
    [createE3kitGroup, createProject]
  );

  const pressSaveProject = useCallback(async () => {
    try {
      setIsLoading(true);
      const checkedProjectResult = await checkedProject();
      if (!checkedProjectResult.isOK || checkedProjectResult.project === undefined)
        throw new Error(checkedProjectResult.message);

      if (isNew) {
        await saveNewProject(checkedProjectResult.project);
        setIsLoading(false);
        navigation.navigate('Projects', { reload: true });
      } else {
        await saveUpdatedProject(checkedProjectResult.project);
        setIsLoading(false);
        await AlertAsync(t('hooks.message.updateProjectInfo'));
      }
    } catch (e: any) {
      setIsLoading(false);
      await AlertAsync(e.message);
    }
  }, [checkedProject, isNew, navigation, saveNewProject, saveUpdatedProject]);

  const pressAddMembers = useCallback(
    (emails: string) => {
      const { isOK, message } = validateMemberLicense(targetProject.license, targetProject.members.length);
      if (!isOK) {
        if (Platform.OS === 'web') {
          Alert.alert('', message + t('ProjectEdit.alert.addMemberWeb'));
        } else {
          Alert.alert('', t('ProjectEdit.alert.addMember'));
        }
        return;
      }
      addMembers(emails);
    },
    [addMembers, targetProject.license, targetProject.members.length]
  );

  const pressDeleteMember = useCallback(
    (idx: number) => {
      deleteMember(idx);
    },
    [deleteMember]
  );

  const gotoBack = useCallback(async () => {
    if (isEdited) {
      const ret = await ConfirmAsync(t('ProjectEdit.confirm.gotoBack'));
      if (!ret) return;
    }
    navigation.navigate('Projects');
  }, [isEdited, navigation]);

  // 競合解決モーダルの選択ハンドラ
  const handleSelect = useCallback(
    (_selected: any) => {
      setConflictState((prev: typeof conflictState) => {
        const nextQueue = prev.queue.slice(1);
        return {
          ...prev,
          queue: nextQueue,
          visible: nextQueue.length > 0,
        };
      });
    },
    [setConflictState]
  );

  // 一括選択（自分優先・最新編集優先）
  const handleBulkSelect = useCallback(
    (mode: 'self' | 'latest') => {
      setConflictState((prev: typeof conflictState) => {
        const resolved: Record<string, any> = { ...prev.resolved };
        prev.queue.forEach(({ id, candidates }: { id: string; candidates: any[] }) => {
          let selected;
          if (mode === 'self') {
            selected = candidates.find((c: any) => c.userId === 'self') || candidates[0];
          } else {
            selected = candidates.reduce((a: any, b: any) => (a.updatedAt > b.updatedAt ? a : b));
          }
          resolved[id] = selected;
        });
        return {
          ...prev,
          queue: [],
          resolved,
          visible: false,
        };
      });
    },
    [setConflictState]
  );

  return (
    <ProjectEditContext.Provider
      value={{
        project: targetProject,
        isProjectOpen,
        isEdited,
        isOwner,
        isOwnerAdmin,
        isLoading,
        isNew,
        changeText,
        changeMemberText,
        changeAdmin,
        pressAddMembers,
        pressDeleteMember,
        pressSaveProject,
        pressOpenProject,
        pressExportProject,
        pressDeleteProject,
        pressSettingProject,
        gotoBack,
      }}
    >
      <ProjectEdit />
      {/* 手動マージ用競合解決モーダル */}
      {conflictState.visible && conflictState.queue.length > 0 && (
        <ConflictResolverModal
          visible={conflictState.visible}
          candidates={conflictState.queue[0].candidates}
          id={conflictState.queue[0].id}
          onSelect={handleSelect}
          onBulkSelect={handleBulkSelect}
          onClose={() => setConflictState((prev: typeof conflictState) => ({ ...prev, visible: false, queue: [] }))}
        />
      )}
    </ProjectEditContext.Provider>
  );
}
