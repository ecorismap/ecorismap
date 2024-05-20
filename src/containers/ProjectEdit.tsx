import React, { useState, useCallback } from 'react';
import ProjectEdit from '../components/pages/ProjectEdit';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { useProjectEdit } from '../hooks/useProjectEdit';
import { Props_ProjectEdit } from '../routes';
import { Platform } from 'react-native';
import { useProjects } from '../hooks/useProjects';
import { validateMemberLicense, validateProjectLicense } from '../utils/Project';
import { Alert } from '../components/atoms/Alert';
import { t } from '../i18n/config';
import { ProjectEditContext } from '../contexts/ProjectEdit';
import { AppState } from '../modules';
import { shallowEqual, useSelector } from 'react-redux';
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

  const tracking = useSelector((state: AppState) => state.settings.tracking, shallowEqual);
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
    downloadAllPrivateData,
    downloadPublicData,
    downloadCommonData,
    downloadPrivateData,
    downloadTemplateData,
  } = useRepository();
  const { generateEcorisMapData, createExportSettings } = useEcorisMapFile();

  const downloadDataForSetting = useCallback(async () => {
    const shouldPhotoDownload = false;
    const commonDataResult = await downloadCommonData(targetProject, shouldPhotoDownload);
    if (!commonDataResult.isOK) throw new Error(commonDataResult.message);
    const templateDataResult = await downloadTemplateData(targetProject, shouldPhotoDownload, [], []);
    if (!templateDataResult.isOK) throw new Error(templateDataResult.message);
  }, [downloadCommonData, downloadTemplateData, targetProject]);

  const downloadDataForAdmin = useCallback(async () => {
    const shouldPhotoDownload = false;
    const commonDataResult = await downloadCommonData(targetProject, shouldPhotoDownload);
    if (!commonDataResult.isOK) throw new Error(commonDataResult.message);
    const publicDataResult = await downloadPublicData(targetProject, shouldPhotoDownload);
    if (!publicDataResult.isOK || publicDataResult.publicOwnLayerIds === undefined)
      throw new Error(publicDataResult.message);

    const privateDataResult = await downloadAllPrivateData(targetProject, shouldPhotoDownload);
    if (!privateDataResult.isOK || privateDataResult.privateLayerIds === undefined)
      throw new Error(privateDataResult.message);

    const downloadTemplateResult = await downloadTemplateData(
      targetProject,
      shouldPhotoDownload,
      publicDataResult.publicOwnLayerIds,
      privateDataResult.privateLayerIds
    );
    if (!downloadTemplateResult.isOK) throw new Error(downloadTemplateResult.message);
  }, [downloadAllPrivateData, downloadCommonData, downloadPublicData, downloadTemplateData, targetProject]);

  const downloadDataForUser = useCallback(async () => {
    const shouldPhotoDownload = false;

    const commonDataResult = await downloadCommonData(targetProject, shouldPhotoDownload);
    if (!commonDataResult.isOK) throw new Error(commonDataResult.message);
    const publicDataResult = await downloadPublicData(targetProject, shouldPhotoDownload);
    if (!publicDataResult.isOK || publicDataResult.publicOwnLayerIds === undefined)
      throw new Error(publicDataResult.message);

    const privateDataResult = await downloadPrivateData(targetProject, shouldPhotoDownload);
    if (!privateDataResult.isOK || privateDataResult.privateLayerIds === undefined)
      throw new Error(privateDataResult.message);
    const downloadTemplateResult = await downloadTemplateData(
      targetProject,
      shouldPhotoDownload,
      publicDataResult.publicOwnLayerIds,
      privateDataResult.privateLayerIds
    );
    if (!downloadTemplateResult.isOK) throw new Error(downloadTemplateResult.message);
  }, [downloadCommonData, targetProject, downloadPublicData, downloadPrivateData, downloadTemplateData]);

  const pressOpenProject = useCallback(
    async (isSetting: boolean) => {
      try {
        if (isProjectOpen) {
          const ret = await ConfirmAsync(t('Home.confirm.reOpenProject'));
          if (!ret) return;
        }
        if (tracking !== undefined) {
          await AlertAsync(t('hooks.message.finishTrackking'));
          return;
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
        } else if (Platform.OS === 'web') {
          await downloadDataForAdmin();
        } else {
          await downloadDataForUser();
        }

        openProject();
        setIsLoading(false);

        navigation.navigate('Home', {
          jumpTo: projectSettingsResult.region,
          previous: 'ProjectEdit',
          mode: 'jumpTo',
        });
      } catch (e: any) {
        setIsLoading(false);
        await AlertAsync(e.message);
      }
    },
    [
      isProjectOpen,
      tracking,
      targetProject,
      ownerProjectsCount,
      isOwner,
      loadE3kitGroup,
      downloadProjectSettings,
      openProject,
      navigation,
      downloadDataForSetting,
      downloadDataForAdmin,
      downloadDataForUser,
    ]
  );

  const pressSettingProject = useCallback(async () => {
    await pressOpenProject(true);
    startProjectSetting();
    await AlertAsync(t('ProjectEdit.alert.settingProject'));
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
      const exportData = await generateEcorisMapData(data, { includePhoto, fromProject: true, includeGISData: true });
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
  }, [deleteE3kitGroup, deleteProject, navigation, targetProject]);

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
    </ProjectEditContext.Provider>
  );
}
