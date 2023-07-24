import React, { useCallback, useEffect, useState } from 'react';
import { Alert } from '../components/atoms/Alert';
import { AlertAsync } from '../components/molecules/AlertAsync';
import Projects from '../components/pages/Projects';
import { useScreen } from '../hooks/useScreen';
import { useProjects } from '../hooks/useProjects';
import { usePurchasesWeb } from '../hooks/usePurchasesWeb';
import { t } from '../i18n/config';
import { Props_Projects } from '../routes';
import { validateProjectLicense } from '../utils/Project';
import { ProjectsContext } from '../contexts/Projects';
import { usePermission } from '../hooks/usePermission';
import { useAccount } from '../hooks/useAccount';
import { Platform } from 'react-native';

export default function ProjectsContainers({ navigation, route }: Props_Projects) {
  const [isEncryptPasswordModalOpen, setIsEncryptPasswordModalOpen] = useState(false);
  const [projectIndex, setProjectIndex] = useState(0);
  const { isSettingProject } = usePermission();
  const { user, isLoading, projects, ownerProjectsCount, fetchProjects, generateProject } = useProjects();
  const { customerLicense } = usePurchasesWeb();
  const { closeData } = useScreen();
  const { restoreEncryptKey, cleanupEncryptKey } = useAccount();
  const pressAddProject = useCallback(() => {
    try {
      if (isSettingProject) {
        Alert.alert('', t('hooks.message.cannotAddProject'));
        return;
      }
      const { isOK: licenseIsOK, message: licenseMessage } = validateProjectLicense(
        customerLicense,
        ownerProjectsCount()
      );
      if (!licenseIsOK) {
        Alert.alert('', licenseMessage + t('Projects.alert.addProject'));
        return;
      }
      navigation.navigate('ProjectEdit', {
        previous: 'Projects',
        project: generateProject(),
        isNew: true,
      });
    } catch (e: any) {
      Alert.alert('error', e.message);
    }
  }, [customerLicense, generateProject, isSettingProject, navigation, ownerProjectsCount]);

  const gotoBack = useCallback(async () => {
    closeData();
    navigation.navigate('Home');
  }, [closeData, navigation]);

  const gotoProject = useCallback(
    (index: number) => {
      navigation.navigate('ProjectEdit', { previous: 'Projects', project: projects[index], isNew: false });
    },
    [navigation, projects]
  );

  const reloadProjects = useCallback(async () => {
    try {
      const { isOK, message } = await fetchProjects();
      if (!isOK) {
        await AlertAsync(message);
      }
    } catch (e: any) {
      Alert.alert('error', e.message);
    }
  }, [fetchProjects]);

  const onPressGotoProject = useCallback(
    async (index: number) => {
      //暗号化パスワードのチェック。今は煩雑なのでオフにしている
      if (true || Platform.OS === 'web') {
        gotoProject(index);
      } else {
        setProjectIndex(index);
        setIsEncryptPasswordModalOpen(true);
      }
    },
    [gotoProject]
  );

  const pressEncryptPasswordOK = useCallback(
    async (value: string) => {
      setIsEncryptPasswordModalOpen(false);
      await cleanupEncryptKey();
      const { isOK } = await restoreEncryptKey(value);
      if (!isOK) {
        await AlertAsync(t('hooks.message.encryptKeyFailed'));
        return;
      }
      gotoProject(projectIndex);
    },
    [cleanupEncryptKey, gotoProject, projectIndex, restoreEncryptKey]
  );

  const pressEncryptPasswordCancel = useCallback(() => {
    setIsEncryptPasswordModalOpen(false);
  }, []);

  useEffect(() => {
    if (projects.length === 0 || route.params?.reload) {
      (async () => {
        await reloadProjects();
        navigation.setParams({ reload: undefined });
      })();
    }
  }, [navigation, projects.length, reloadProjects, route.params?.reload]);

  return (
    <ProjectsContext.Provider
      value={{
        projects,
        user,
        isLoading,
        isEncryptPasswordModalOpen,
        pressEncryptPasswordOK,
        pressEncryptPasswordCancel,
        onReloadProjects: reloadProjects,
        gotoProject: onPressGotoProject,
        pressAddProject,
        gotoBack,
      }}
    >
      <Projects />
    </ProjectsContext.Provider>
  );
}
