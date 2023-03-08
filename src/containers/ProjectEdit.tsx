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
import { useSelector } from 'react-redux';
import { useE3kitGroup } from '../hooks/useE3kitGroup';
import { useRepository } from '../hooks/useRepository';
import { exportGeoFile } from '../utils/File';
import { ProjectType } from '../types';
import { updateLicense } from '../lib/firebase/firestore';

export default function ProjectEditContainer({ navigation, route }: Props_ProjectEdit) {
  const {
    isProjectOpen,
    isOwner,
    isOwnerAdmin,
    isNew,
    targetProject,
    originalProject,
    createType,
    ownerProjectNames,
    copiedProjectName,
    isEdited,
    checkedProject,
    saveProject,
    setCreateType,
    setCopiedProjectName,
    changeText,
    changeMemberText,
    changeAdmin,
    addMember,
    deleteMember,
    generateExportProjectData,
    openProject,
    startProjectSetting,
  } = useProjectEdit(route.params.project, route.params.createType, route.params.isNew);

  const tracking = useSelector((state: AppState) => state.settings.tracking);
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
    downloadAllData,
    downloadPublicAndCommonData,
    downloadCommonData,
    downloadPrivateData,
    downloadTemplateData,
  } = useRepository();

  const downloadDataForAdmin = useCallback(async () => {
    const shouldPhotoDownload = false;
    const allDataResult = await downloadAllData(targetProject, shouldPhotoDownload);
    if (!allDataResult.isOK) {
      await AlertAsync(allDataResult.message);
      return false;
    }
    return true;
  }, [downloadAllData, targetProject]);

  const downloadDataForSetting = useCallback(async () => {
    const shouldPhotoDownload = false;
    const commonDataResult = await downloadCommonData(targetProject, shouldPhotoDownload);
    if (!commonDataResult.isOK) throw new Error(commonDataResult.message);
    const templateDataResult = await downloadTemplateData(targetProject, shouldPhotoDownload, []);
    if (!templateDataResult.isOK) throw new Error(templateDataResult.message);
  }, [downloadCommonData, downloadTemplateData, targetProject]);

  const downloadDataForUser = useCallback(async () => {
    const shouldPhotoDownload = false;
    const publicAndCommonDataResult = await downloadPublicAndCommonData(targetProject, shouldPhotoDownload);
    if (!publicAndCommonDataResult.isOK) throw new Error(publicAndCommonDataResult.message);

    const privateDataResult = await downloadPrivateData(targetProject, shouldPhotoDownload);
    if (!privateDataResult.isOK || privateDataResult.privateLayerIds === undefined)
      throw new Error(privateDataResult.message);

    const downloadTemplateResult = await downloadTemplateData(
      targetProject,
      shouldPhotoDownload,
      privateDataResult.privateLayerIds
    );
    if (!downloadTemplateResult.isOK) throw new Error(downloadTemplateResult.message);
  }, [downloadPublicAndCommonData, downloadPrivateData, downloadTemplateData, targetProject]);

  const pressOpenProject = useCallback(
    async (isSetting: boolean) => {
      try {
        if (tracking !== undefined) {
          Alert.alert('', t('hooks.message.finishTrackking'));
          return;
        }
        const projectLicenseResult = validateProjectLicense(targetProject.license, ownerProjectsCount());
        if (!projectLicenseResult.isOK && isOwner) {
          if (Platform.OS === 'web') {
            Alert.alert('', projectLicenseResult.message + t('ProjectEdit.alert.openProjectWeb'));
          } else {
            Alert.alert('', t('ProjectEdit.alert.openProject'));
          }
        }
        setIsLoading(true);
        const loadE3kitGroupResult = await loadE3kitGroup(targetProject);
        if (!loadE3kitGroupResult.isOK) throw new Error(loadE3kitGroupResult.message);

        const projectSettingsResult = await downloadProjectSettings(targetProject);
        if (!projectSettingsResult.isOK || projectSettingsResult.region === undefined)
          throw new Error(projectSettingsResult.message);

        if (isOwnerAdmin && Platform.OS === 'web') {
          isSetting ? await downloadDataForSetting() : await downloadDataForAdmin();
        } else {
          await downloadDataForUser();
        }

        openProject();
        setIsLoading(false);

        navigation.navigate('Home', {
          jumpTo: projectSettingsResult.region,
        });
      } catch (e: any) {
        setIsLoading(false);
        Alert.alert('error', e.message);
      }
    },
    [
      tracking,
      targetProject,
      ownerProjectsCount,
      isOwner,
      loadE3kitGroup,
      downloadProjectSettings,
      isOwnerAdmin,
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
    Alert.alert('', t('ProjectEdit.alert.settingProject'));
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

      const { exportData, exportDataName } = await generateExportProjectData(
        projectSettingsResult.data,
        allDataResult.data
      );
      const isOK = await exportGeoFile(exportData, exportDataName, 'zip');
      if (!isOK) Alert.alert('', t('hooks.message.failExport'));

      setIsLoading(false);
    } catch (e: any) {
      setIsLoading(false);
      Alert.alert('error', e.message);
    }
  }, [fetchAllData, fetchProjectSettings, generateExportProjectData, targetProject]);

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
      Alert.alert('error', e.message);
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
      if (createType === 'COPY' && copiedProjectName === undefined) throw new Error(t('hooks.message.noCopyProject'));

      const e3kitGroupResult = await createE3kitGroup(project);
      if (!e3kitGroupResult.isOK || e3kitGroupResult.project === undefined) throw new Error(e3kitGroupResult.message);
      const isPhotoUpload = true; //コモンデータの写真もあればコピーする
      const createProjectResult = await createProject(
        e3kitGroupResult.project,
        createType,
        isPhotoUpload,
        copiedProjectName
      );
      if (!createProjectResult.isOK) throw new Error(createProjectResult.message);
      const updateLicenseResult = await updateLicense(e3kitGroupResult.project);
      if (!updateLicenseResult.isOK) throw new Error(updateLicenseResult.message);
    },
    [copiedProjectName, createE3kitGroup, createProject, createType]
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
        await AlertAsync(t('hooks.message.updateProjectInfo'));
        setIsLoading(false);
      }
    } catch (e: any) {
      setIsLoading(false);
      Alert.alert('error', e.message);
    }
  }, [checkedProject, isNew, navigation, saveNewProject, saveUpdatedProject]);

  const pressAddMember = useCallback(() => {
    const { isOK, message } = validateMemberLicense(targetProject.license, targetProject.members.length);
    if (!isOK) {
      if (Platform.OS === 'web') {
        Alert.alert('', message + t('ProjectEdit.alert.addMemberWeb'));
      } else {
        Alert.alert('', t('ProjectEdit.alert.addMember'));
      }
      return;
    }
    addMember();
  }, [addMember, targetProject.license, targetProject.members.length]);

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
        createType,
        pickerValue: copiedProjectName ?? '',
        pickerItems: ownerProjectNames,
        changeText,
        changeCreateType: setCreateType,
        changeDuplicateProjectName: setCopiedProjectName,
        changeMemberText,
        changeAdmin,
        pressAddMember,
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
