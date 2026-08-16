import { useCallback, useMemo, useState } from 'react';
import { ProjectType, UserType } from '../types';
import * as projectRepository from '../lib/firebase/firestore';
import { setProjectsAction, updateProjectAction } from '../modules/projects';
import { FUNC_ENCRYPTION, ENABLE_DEK_MIGRATION, ENABLE_KEY_LEDGER } from '../constants/AppConstants';
import { getKeyMigrationState } from '../lib/crypto/migration';
import {
  toggleFavorite as toggleFavoriteAction,
  setShowOnlyFavorites as setShowOnlyFavoritesAction,
} from '../modules/favoriteProjects';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { ulid } from 'ulid';
import { isLoggedIn } from '../utils/Account';
import { t } from '../i18n/config';
import * as e3kit from '../lib/virgilsecurity/e3kit';

export type UseProjectsReturnType = {
  user: UserType;
  isLoading: boolean;
  projects: ProjectType[];
  favoriteProjectIds: string[];
  showOnlyFavorites: boolean;
  isShowArchive: boolean;
  fetchProjects: (includeArchived?: boolean) => Promise<{
    isOK: boolean;
    message: string;
    needsKeyMigration?: boolean;
    needsKeyRestore?: boolean;
    restoreMessage?: string;
  }>;
  generateProject: () => ProjectType;
  toggleFavorite: (projectId: string) => void;
  toggleShowOnlyFavorites: () => void;
  toggleShowArchive: () => Promise<{ isOK: boolean; message: string }>;
  archiveProject: (projectId: string) => Promise<{ isOK: boolean; message: string }>;
  unarchiveProject: (projectId: string) => Promise<{ isOK: boolean; message: string }>;
  dekMigratableProjects: ProjectType[];
  migrateProjectsToDEK: (
    onProgress?: (done: number, total: number, name: string) => void
  ) => Promise<{ isOK: boolean; message: string; migratedCount: number; failedNames: string[] }>;
};

export const useProjects = (): UseProjectsReturnType => {
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.user);
  const projects = useSelector((state: RootState) => state.projects);
  const favoriteProjectIds = useSelector((state: RootState) => state.favoriteProjects?.projectIds || []);
  const showOnlyFavorites = useSelector((state: RootState) => state.favoriteProjects?.showOnlyFavorites || false);
  const [isLoading, setIsLoading] = useState(false);
  // アーカイブ済みも読み込むか（端末ローカルの一時状態。永続化しない）
  const [isShowArchive, setIsShowArchive] = useState(false);

  const generateProject = useCallback(() => {
    if (!isLoggedIn(user)) throw new Error(t('hooks.message.pleaseLogin'));
    const project: ProjectType = {
      id: ulid(),
      name: '',
      members: [{ uid: user.uid, email: user.email, verified: 'HOLD', role: 'OWNER' }],
      ownerUid: user.uid,
      adminsUid: [user.uid],
      membersUid: [user.uid],
      abstract: '',
      storage: { count: 0 },
    };
    return project;
  }, [user]);

  const fetchProjects = useCallback(
    async (includeArchived: boolean = isShowArchive) => {
    if (!isLoggedIn(user)) return { isOK: false, message: t('hooks.message.pleaseLogin') };

    // const perfStart = performance.now();
    setIsLoading(true);
    try {
      // e3kitの初期化チェック
      // const e3kitInitStart = performance.now();
      if (!e3kit.isInitialized()) {
        const { isOK: initE3kitOK, message: initE3kitMessage } = await e3kit.initializeUser(user.uid);
        if (!initE3kitOK) {
          if (ENABLE_KEY_LEDGER && FUNC_ENCRYPTION && initE3kitMessage === 'not-localkey') {
            // 端末に鍵がない復帰セッション（機種変更でアプリデータだけ引き継がれた場合等）:
            // 鍵なしで先へ進むと復号が全滅するため、復元フォームへ誘導する
            const migrationState = await getKeyMigrationState(user.uid);
            return {
              isOK: false,
              message: '',
              needsKeyRestore: true,
              restoreMessage:
                migrationState.state === 'migrated-need-restore'
                  ? t('hooks.message.inputNewPinRestore')
                  : t('hooks.message.inputEncryptPassword'),
            };
          }
          throw new Error(initE3kitMessage || t('hooks.message.failedInitializeEncrypt'));
        }
        // const e3kitInitEnd = performance.now();
        // console.log(`[PERF] e3kit.initializeUser: ${(e3kitInitEnd - e3kitInitStart).toFixed(0)}ms`);
      } else {
        // console.log(`[PERF] e3kit already initialized`);
      }

      dispatch(setProjectsAction([]));

      const {
        isOK,
        projects: updatedProjects,
        message,
      } = await projectRepository.getAllProjects(user.uid, false, includeArchived);
      if (!isOK || updatedProjects === undefined) {
        return { isOK: false, message };
      }
      //nameでソート

      const sortedProjects = updatedProjects.sort((a, b) => {
        if (a.name > b.name) return 1;
        if (a.name < b.name) return -1;
        return 0; //同じ場合
      });
      dispatch(setProjectsAction(sortedProjects));
      // const perfEnd = performance.now();
      // console.log(`[PERF] === fetchProjects TOTAL: ${(perfEnd - perfStart).toFixed(0)}ms ===`);

      // 脱Virgil移行の取りこぼし対策: ログインフォームを通らない復帰セッション
      // （Webのリロード等）でも未移行を検知し、呼び出し元で移行フォームへ誘導する
      let needsKeyMigration = false;
      if (ENABLE_KEY_LEDGER && FUNC_ENCRYPTION) {
        const migrationState = await getKeyMigrationState(user.uid);
        needsKeyMigration = migrationState.state === 'needs-migration';
      }
      return { isOK: true, message, needsKeyMigration };
    } catch (e: any) {
      return { isOK: false, message: e.message };
    } finally {
      setIsLoading(false);
    }
    },
    [dispatch, isShowArchive, user]
  );

  const toggleFavorite = useCallback(
    (projectId: string) => {
      dispatch(toggleFavoriteAction(projectId));
    },
    [dispatch]
  );

  const toggleShowOnlyFavorites = useCallback(() => {
    dispatch(setShowOnlyFavoritesAction(!showOnlyFavorites));
  }, [dispatch, showOnlyFavorites]);

  // アーカイブ表示のトグル。反転した値でそのまま再取得する（state更新の反映待ちを避ける）。
  const toggleShowArchive = useCallback(async () => {
    const next = !isShowArchive;
    setIsShowArchive(next);
    return fetchProjects(next);
  }, [fetchProjects, isShowArchive]);

  const archiveProject = useCallback(
    async (projectId: string) => {
      const project = projects.find((p) => p.id === projectId);
      if (project === undefined) return { isOK: false, message: t('firebase.message.failUpdateProject') };
      const { isOK, message } = await projectRepository.archiveProject(projectId);
      if (!isOK) return { isOK, message };
      dispatch(updateProjectAction({ ...project, archived: true }));
      return { isOK: true, message: '' };
    },
    [dispatch, projects]
  );

  // 一括DEK移行(Phase ii)の対象: 自分がオーナーで、まだグループ暗号のプロジェクト。
  // Rules上は管理者でも移行可能だが、責任範囲を明確にするため一括移行はオーナーに限定する。
  const dekMigratableProjects = useMemo(() => {
    if (!FUNC_ENCRYPTION || !ENABLE_DEK_MIGRATION || !isLoggedIn(user)) return [];
    return projects.filter((p) => p.cryptoScheme !== 'dek' && p.ownerUid === user.uid);
  }, [projects, user]);

  const migrateProjectsToDEK = useCallback(
    async (onProgress?: (done: number, total: number, name: string) => void) => {
      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin'), migratedCount: 0, failedNames: [] };
      }
      if (!e3kit.isInitialized()) {
        const { isOK: initOK, message: initMessage } = await e3kit.initializeUser(user.uid);
        if (!initOK) {
          return {
            isOK: false,
            message: initMessage || t('hooks.message.failedInitializeEncrypt'),
            migratedCount: 0,
            failedNames: [],
          };
        }
      }
      const targets = dekMigratableProjects;
      let migratedCount = 0;
      const failedNames: string[] = [];
      for (const [index, project] of targets.entries()) {
        onProgress?.(index + 1, targets.length, project.name);
        try {
          const { isOK } = await projectRepository.migrateProjectToDEK(project);
          if (isOK) {
            dispatch(updateProjectAction({ ...project, cryptoScheme: 'dek' }));
            migratedCount++;
          } else {
            failedNames.push(project.name);
          }
        } catch (e) {
          failedNames.push(project.name);
        }
      }
      return { isOK: failedNames.length === 0, message: '', migratedCount, failedNames };
    },
    [dekMigratableProjects, dispatch, user]
  );

  const unarchiveProject = useCallback(
    async (projectId: string) => {
      const project = projects.find((p) => p.id === projectId);
      if (project === undefined) return { isOK: false, message: t('firebase.message.failUpdateProject') };
      const { isOK, message } = await projectRepository.unarchiveProject(projectId);
      if (!isOK) return { isOK, message };
      dispatch(updateProjectAction({ ...project, archived: false }));
      return { isOK: true, message: '' };
    },
    [dispatch, projects]
  );

  return {
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
  } as const;
};
