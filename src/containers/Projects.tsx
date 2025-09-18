import React, { useCallback, useEffect, useState } from 'react';
import { Alert } from '../components/atoms/Alert';
import { AlertAsync } from '../components/molecules/AlertAsync';
import Projects from '../components/pages/Projects';
import { useProjects } from '../hooks/useProjects';
import { usePurchasesWeb } from '../hooks/usePurchasesWeb';
import { t } from '../i18n/config';
import { Props_Projects } from '../routes';
import { validateProjectLicense } from '../utils/Project';
import { ProjectsContext } from '../contexts/Projects';
import { usePermission } from '../hooks/usePermission';
import { useAccount } from '../hooks/useAccount';
import { Platform } from 'react-native';
import { isLoggedIn } from '../utils/Account';

export default function ProjectsContainers({ navigation, route }: Props_Projects) {
  const [isEncryptPasswordModalOpen, setIsEncryptPasswordModalOpen] = useState(false);
  const [projectIndex, setProjectIndex] = useState(0);
  const { isSettingProject } = usePermission();
  const {
    user,
    isLoading,
    projects,
    favoriteProjectIds,
    showOnlyFavorites,
    ownerProjectsCount,
    fetchProjects,
    generateProject,
    toggleFavorite,
    toggleShowOnlyFavorites,
  } = useProjects();
  const { customerLicense } = usePurchasesWeb();
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
    navigation.navigate('Home', { previous: 'Projects', mode: undefined });
  }, [navigation]);

  const gotoProject = useCallback(
    (projectId: string) => {
      const project = projects.find((p) => p.id === projectId);
      if (project) {
        navigation.navigate('ProjectEdit', { previous: 'Projects', project, isNew: false });
      }
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
    async (projectId: string) => {
      //暗号化パスワードのチェック。今は煩雑なのでオフにしている
      if (true || Platform.OS === 'web') {
        gotoProject(projectId);
      } else {
        const index = projects.findIndex((p) => p.id === projectId);
        setProjectIndex(index);
        setIsEncryptPasswordModalOpen(true);
      }
    },
    [gotoProject, projects]
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
      const project = projects[projectIndex];
      if (project) {
        gotoProject(project.id);
      }
    },
    [cleanupEncryptKey, gotoProject, projectIndex, projects, restoreEncryptKey]
  );

  const pressEncryptPasswordCancel = useCallback(() => {
    setIsEncryptPasswordModalOpen(false);
  }, []);

  useEffect(() => {
    // 画面がフォーカスされた時のみ実行
    const unsubscribe = navigation.addListener('focus', () => {
      if (isLoggedIn(user) && (projects.length === 0 || route.params?.reload)) {
        (async () => {
          await reloadProjects();
          navigation.setParams({ reload: undefined });
        })();
      }
    });

    return unsubscribe;
  }, [navigation, projects.length, reloadProjects, route.params?.reload, user]);

  return (
    <ProjectsContext.Provider
      value={{
        projects,
        user,
        isLoading,
        isEncryptPasswordModalOpen,
        favoriteProjectIds,
        showOnlyFavorites,
        pressEncryptPasswordOK,
        pressEncryptPasswordCancel,
        onReloadProjects: reloadProjects,
        gotoProject: onPressGotoProject,
        pressAddProject,
        gotoBack,
        toggleFavorite,
        toggleShowOnlyFavorites,
      }}
    >
      <Projects />
    </ProjectsContext.Provider>
  );
}
