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

export default function ProjectEditContainer({ navigation, route }: Props_ProjectEdit) {
  const {
    isProjectOpen,
    isOwner,
    isOwnerAdmin,
    isNew,
    targetProject,
    createType,
    ownerProjectNames,
    copiedProjectName,
    isEdited,
    saveNewProject,
    saveProject,
    setCreateType,
    setCopiedProjectName,
    changeText,
    changeMemberText,
    changeAdmin,
    addMember,
    deleteMember,
    exportProject,
    deleteProject,
    openProject,
    startProjectSetting,
  } = useProjectEdit(route.params.project, route.params.createType, route.params.isNew);

  const [isLoading, setIsLoading] = useState(false);
  const { ownerProjectsCount } = useProjects();

  const pressOpenProject = useCallback(
    async (isSetting: boolean) => {
      const { isOK: licenseIsOK, message: licenseMessage } = validateProjectLicense(
        targetProject.license,
        ownerProjectsCount
      );
      if (!licenseIsOK && isOwner) {
        if (Platform.OS === 'web') {
          Alert.alert('', licenseMessage + t('ProjectEdit.alert.openProjectWeb'));
        } else {
          Alert.alert('', t('ProjectEdit.alert.openProject'));
        }
        return;
      }

      setIsLoading(true);
      const { isOK, message, region } = await openProject(isSetting);
      setIsLoading(false);
      if (!isOK) {
        await AlertAsync(message);
      } else {
        navigation.navigate('Home', {
          jumpTo: region,
        });
      }
    },
    [isOwner, navigation, openProject, ownerProjectsCount, targetProject.license]
  );

  const pressExportProject = useCallback(async () => {
    if (Platform.OS !== 'web') {
      await AlertAsync(t('ProjectEdit.alert.exportProject'));
      return;
    }
    setIsLoading(true);
    //FileSaverはawaitできないので、ダウンロード完了メッセージはなし
    const { isOK, message } = await exportProject();
    if (!isOK) {
      await AlertAsync(message);
    }
    setIsLoading(false);
  }, [exportProject]);

  const pressDeleteProject = useCallback(async () => {
    const ret = await ConfirmAsync(t('ProjectEdit.confirm.deleteProject'));
    if (ret) {
      setIsLoading(true);
      const { isOK, message } = await deleteProject();
      setIsLoading(false);
      if (!isOK) {
        await AlertAsync(message);
      } else {
        await AlertAsync(t('ProjectEdit.alert.deleteProject'));
        navigation.navigate('Projects');
      }
    }
  }, [deleteProject, navigation]);

  const pressSaveProject = useCallback(async () => {
    if (isNew) {
      setIsLoading(true);
      const { isOK, message } = await saveNewProject();
      setIsLoading(false);
      if (!isOK) {
        await AlertAsync(message);
        return;
      }
      navigation.navigate('Projects', { reload: true });
    } else {
      setIsLoading(true);
      const { message } = await saveProject();
      setIsLoading(false);
      await AlertAsync(message);
    }
  }, [isNew, navigation, saveNewProject, saveProject]);

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

  const pressSettingProject = useCallback(async () => {
    await pressOpenProject(true);
    startProjectSetting();
    Alert.alert('', t('ProjectEdit.alert.settingProject'));
  }, [pressOpenProject, startProjectSetting]);

  const gotoBack = useCallback(async () => {
    if (isEdited) {
      const ret = await ConfirmAsync(t('ProjectEdit.confirm.gotoBack'));
      if (ret) {
        navigation.navigate('Projects');
      }
    } else {
      navigation.navigate('Projects');
    }
  }, [isEdited, navigation]);

  return (
    <ProjectEdit
      project={targetProject}
      isProjectOpen={isProjectOpen}
      isEdited={isEdited}
      isOwner={isOwner}
      isOwnerAdmin={isOwnerAdmin}
      isLoading={isLoading}
      isNew={isNew}
      createType={createType}
      pickerValue={copiedProjectName ?? ''}
      pickerItems={ownerProjectNames}
      changeText={changeText}
      changeCreateType={setCreateType}
      changeDuplicateProjectName={setCopiedProjectName}
      changeMemberText={changeMemberText}
      changeAdmin={changeAdmin}
      pressAddMember={pressAddMember}
      pressDeleteMember={pressDeleteMember}
      pressSaveProject={pressSaveProject}
      pressOpenProject={pressOpenProject}
      pressExportProject={pressExportProject}
      pressDeleteProject={pressDeleteProject}
      pressSettingProject={pressSettingProject}
      gotoBack={gotoBack}
    />
  );
}
