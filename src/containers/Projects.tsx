import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '../components/atoms/Alert';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import Projects from '../components/pages/Projects';
import { useProjects } from '../hooks/useProjects';
import { t } from '../i18n/config';
import { Props_Projects } from '../routes';
import { ProjectsContext } from '../contexts/Projects';
import { usePermission } from '../hooks/usePermission';
import { useAccount } from '../hooks/useAccount';
import { Platform } from 'react-native';
import { isLoggedIn } from '../utils/Account';

export default function ProjectsContainers({ navigation, route }: Props_Projects) {
  const [isEncryptPasswordModalOpen, setIsEncryptPasswordModalOpen] = useState(false);
  const [projectIndex, setProjectIndex] = useState(0);
  const [migrationProgress, setMigrationProgress] = useState('');
  const { isSettingProject } = usePermission();
  const {
    user,
    isLoading,
    projects,
    favoriteProjectIds,
    showOnlyFavorites,
    isShowArchive,
    fetchProjects,
    generateProject,
    toggleFavorite,
    toggleShowOnlyFavorites,
    toggleShowArchive,
    archiveProject,
    unarchiveProject,
    dekMigratableProjects,
    migrateProjectsToDEK,
  } = useProjects();
  const { restoreEncryptKey, cleanupEncryptKey } = useAccount();
  const pressAddProject = useCallback(() => {
    try {
      if (isSettingProject) {
        Alert.alert('', t('hooks.message.cannotAddProject'));
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
  }, [generateProject, isSettingProject, navigation]);

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

  const onToggleShowArchive = useCallback(async () => {
    try {
      const { isOK, message } = await toggleShowArchive();
      if (!isOK) {
        await AlertAsync(message);
      }
    } catch (e: any) {
      Alert.alert('error', e.message);
    }
  }, [toggleShowArchive]);

  const pressArchiveProject = useCallback(
    async (projectId: string) => {
      const ret = await ConfirmAsync(t('Projects.confirm.archive'));
      if (!ret) return;
      try {
        const { isOK, message } = await archiveProject(projectId);
        if (!isOK) await AlertAsync(message);
      } catch (e: any) {
        Alert.alert('error', e.message);
      }
    },
    [archiveProject]
  );

  const pressRestoreProject = useCallback(
    async (projectId: string) => {
      const ret = await ConfirmAsync(t('Projects.confirm.restore'));
      if (!ret) return;
      try {
        const { isOK, message } = await unarchiveProject(projectId);
        if (!isOK) await AlertAsync(message);
      } catch (e: any) {
        Alert.alert('error', e.message);
      }
    },
    [unarchiveProject]
  );

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

  const pressMigrateProjects = useCallback(async () => {
    if (dekMigratableProjects.length === 0) return;
    const ret = await ConfirmAsync(
      t('Projects.confirm.migrateDek', { num: dekMigratableProjects.length })
    );
    if (!ret) return;
    try {
      setMigrationProgress(t('Projects.label.migrating', { done: 0, total: dekMigratableProjects.length }));
      const { migratedCount, failedNames } = await migrateProjectsToDEK((done, total) =>
        setMigrationProgress(t('Projects.label.migrating', { done, total }))
      );
      setMigrationProgress('');
      if (failedNames.length === 0) {
        await AlertAsync(t('Projects.alert.migrateDekDone', { num: migratedCount }));
      } else {
        await AlertAsync(
          t('Projects.alert.migrateDekFailed', { num: migratedCount, failed: failedNames.join(', ') })
        );
      }
    } catch (e: any) {
      setMigrationProgress('');
      Alert.alert('error', e.message);
    }
  }, [dekMigratableProjects, migrateProjectsToDEK]);

  const didInitialLoadRef = useRef(false);
  useEffect(() => {
    // プロジェクト一覧の読み込み。
    // 0件アカウントでは projects.length===0 が真のままになり、fetch後の navigation.setParams による
    // 依存変化で useEffect が再発火して無限ループ（画面の点滅）になっていた。
    // 初回の自動ロードは ref で1回に限定し、明示的な reload 指定時のみ再取得する。
    if (!isLoggedIn(user)) return;
    if (route.params?.reload) {
      (async () => {
        await reloadProjects();
        navigation.setParams({ reload: undefined });
      })();
    } else if (!didInitialLoadRef.current && projects.length === 0) {
      didInitialLoadRef.current = true;
      reloadProjects();
    }
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
        isShowArchive,
        pressEncryptPasswordOK,
        pressEncryptPasswordCancel,
        onReloadProjects: reloadProjects,
        gotoProject: onPressGotoProject,
        pressAddProject,
        gotoBack,
        toggleFavorite,
        toggleShowOnlyFavorites,
        toggleShowArchive: onToggleShowArchive,
        pressArchiveProject,
        pressRestoreProject,
        dekMigratableCount: dekMigratableProjects.length,
        migrationProgress,
        pressMigrateProjects,
      }}
    >
      <Projects />
    </ProjectsContext.Provider>
  );
}
