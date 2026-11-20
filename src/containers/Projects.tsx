import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useE3kitGroup } from '../hooks/useE3kitGroup';
import { findStaleMemberKeys, StaleMemberKey } from '../lib/firebase/firestore';
import { ReshareCandidate } from '../components/organisms/ProjectsModalReshareKeys';

export default function ProjectsContainers({ navigation, route }: Props_Projects) {
  const [isEncryptPasswordModalOpen, setIsEncryptPasswordModalOpen] = useState(false);
  const [projectIndex, setProjectIndex] = useState(0);
  const [migrationProgress, setMigrationProgress] = useState('');
  const [reshareProgress, setReshareProgress] = useState('');
  const [isReshareRunning, setIsReshareRunning] = useState(false);
  const [staleMemberKeys, setStaleMemberKeys] = useState<StaleMemberKey[]>([]);
  const [isReshareModalOpen, setIsReshareModalOpen] = useState(false);
  const reshareCancelledRef = useRef(false);
  const { reshareMemberKeys } = useE3kitGroup();
  const { isSettingProject } = usePermission();
  const {
    user,
    isLoading,
    projects,
    favoriteProjectIds,
    showOnlyFavorites,
    isShowArchive,
    sortField,
    sortOrder,
    changeProjectSort,
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
      const { isOK, message, needsKeyMigration, needsKeyRestore, needsKeyRegist, needsKeyBackup, restoreMessage } =
        await fetchProjects();
      if (!isOK) {
        if (needsKeyRestore) {
          // 端末に鍵がない復帰セッション: 復元フォームへ（移行済み=移行後のPIN/未移行=旧PIN）
          navigation.navigate('Account', {
            accountFormState: 'restoreEncryptKey',
            message: restoreMessage ?? t('hooks.message.inputEncryptPassword'),
            previous: 'Projects',
          });
          return;
        }
        if (needsKeyRegist || needsKeyBackup) {
          // 暗号化キーの登録を完了せず中断した復帰セッション: 登録フォームへ誘導
          navigation.navigate('Account', {
            accountFormState: needsKeyRegist ? 'registEncryptPassword' : 'backupEncryptPassword',
            message: t('hooks.message.registEncryptPassword'),
            previous: 'Projects',
          });
          return;
        }
        await AlertAsync(message);
        return;
      }
      if (needsKeyMigration) {
        // 復帰セッションの未移行ユーザー: 暗号化キーの保護方式更新（これまでのPINを入力）へ誘導
        navigation.navigate('Account', {
          accountFormState: 'migrateEncryptPassword',
          message: t('hooks.message.migrateEncryptPassword'),
        });
      }
    } catch (e: any) {
      Alert.alert('error', e.message);
    }
  }, [fetchProjects, navigation]);

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

  // 一括再共有の候補はメンバー単位にまとめる（1人の鍵リセットが参加中の全プロジェクトに及ぶため）。
  // メールアドレスは暗号化されたプロジェクト本体にしかないので、読み込み済みの一覧から引く。
  const reshareCandidates = useMemo<ReshareCandidate[]>(() => {
    const emailByUid = new Map<string, string>();
    projects.forEach((p) => p.members.forEach((m) => m.uid && emailByUid.set(m.uid, m.email)));
    const byUid = new Map<string, ReshareCandidate>();
    staleMemberKeys.forEach((s) => {
      const c = byUid.get(s.uid);
      if (c) {
        c.projectCount++;
      } else {
        byUid.set(s.uid, { uid: s.uid, label: emailByUid.get(s.uid) ?? s.uid, keyChangedAt: s.keyChangedAt, projectCount: 1 });
      }
    });
    return [...byUid.values()];
  }, [projects, staleMemberKeys]);

  const pressCheckStaleKeys = useCallback(async () => {
    if (!user.uid) return;
    try {
      setReshareProgress(t('Projects.label.reshareKeysChecking', { done: 0, total: 0 }));
      const stale = await findStaleMemberKeys(user.uid, (done, total) =>
        setReshareProgress(t('Projects.label.reshareKeysChecking', { done, total }))
      );
      setReshareProgress('');
      if (stale.length === 0) {
        await AlertAsync(t('Projects.alert.reshareKeysNone'));
        return;
      }
      setStaleMemberKeys(stale);
      setIsReshareModalOpen(true);
    } catch (e: any) {
      setReshareProgress('');
      Alert.alert('error', e.message);
    }
  }, [user.uid]);

  const pressReshareKeysCancel = useCallback(() => {
    setIsReshareModalOpen(false);
  }, []);

  const pressCancelReshareRunning = useCallback(() => {
    reshareCancelledRef.current = true;
  }, []);

  const pressReshareKeysOK = useCallback(
    async (uids: string[]) => {
      setIsReshareModalOpen(false);
      const targets = staleMemberKeys.filter((s) => uids.includes(s.uid));
      reshareCancelledRef.current = false;
      setIsReshareRunning(true);
      try {
        setReshareProgress(t('Projects.label.reshareKeysRunning', { done: 0, total: targets.length }));
        const { isOK, message, succeeded, failed } = await reshareMemberKeys(
          targets,
          (done, total) => setReshareProgress(t('Projects.label.reshareKeysRunning', { done, total })),
          () => reshareCancelledRef.current
        );
        setReshareProgress('');
        setIsReshareRunning(false);
        if (!isOK) {
          await AlertAsync(message || t('hooks.message.failReshareKey'));
          return;
        }
        const nameById = new Map(projects.map((p) => [p.id, p.name]));
        const skipped = targets.length - succeeded.length - failed.length;
        let text = t('Projects.alert.reshareKeysDone', { num: succeeded.length });
        if (skipped > 0) text += '\n' + t('Projects.alert.reshareKeysCancelled', { num: skipped });
        if (failed.length > 0) {
          const names = [...new Set(failed.map((f) => nameById.get(f.projectId) ?? f.projectId))];
          text += '\n' + t('Projects.alert.reshareKeysFailed', { num: failed.length, names: names.join(', ') });
        }
        await AlertAsync(text);
      } catch (e: any) {
        setReshareProgress('');
        setIsReshareRunning(false);
        Alert.alert('error', e.message);
      }
    },
    [projects, reshareMemberKeys, staleMemberKeys]
  );

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
        sortField,
        sortOrder,
        changeProjectSort,
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
        reshareProgress,
        isReshareRunning,
        isReshareModalOpen,
        reshareCandidates,
        pressCheckStaleKeys,
        pressReshareKeysOK,
        pressReshareKeysCancel,
        pressCancelReshareRunning,
      }}
    >
      <Projects />
    </ProjectsContext.Provider>
  );
}
