import { useCallback, useState } from 'react';
import { ProjectType, UserType } from '../types';
import * as projectRepository from '../lib/firebase/firestore';
import { setProjectsAction } from '../modules/projects';
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
  ownerProjectsCount: () => number;
  fetchProjects: () => Promise<{
    isOK: boolean;
    message: string;
  }>;
  generateProject: () => ProjectType;
  toggleFavorite: (projectId: string) => void;
  toggleShowOnlyFavorites: () => void;
};

export const useProjects = (): UseProjectsReturnType => {
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.user);
  const projects = useSelector((state: RootState) => state.projects);
  const favoriteProjectIds = useSelector((state: RootState) => state.favoriteProjects?.projectIds || []);
  const showOnlyFavorites = useSelector((state: RootState) => state.favoriteProjects?.showOnlyFavorites || false);
  const [isLoading, setIsLoading] = useState(false);

  const ownerProjectsCount = useCallback(() => {
    if (!isLoggedIn(user)) throw new Error(t('hooks.message.pleaseLogin'));
    return projects.filter((project) => project.ownerUid === user.uid).length;
  }, [projects, user]);

  const generateProject = useCallback(() => {
    //ライセンスは不正防止のためadd後にfunctionsで更新するが、ひとまず入れておく。本当は、Listnerで更新した方が良い。
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
      license: 'Unknown',
    };
    return project;
  }, [user]);

  const fetchProjects = useCallback(async () => {
    if (!isLoggedIn(user)) return { isOK: false, message: t('hooks.message.pleaseLogin') };

    setIsLoading(true);
    try {
      // e3kitの初期化チェック
      if (!e3kit.isInitialized()) {
        const { isOK: initE3kitOK, message: initE3kitMessage } = await e3kit.initializeUser(user.uid);
        if (!initE3kitOK) {
          throw new Error(initE3kitMessage || t('hooks.message.failedInitializeEncrypt'));
        }
      }

      dispatch(setProjectsAction([]));

      const { isOK, projects: updatedProjects, message } = await projectRepository.getAllProjects(user.uid);
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
      return { isOK: true, message };
    } catch (e: any) {
      return { isOK: false, message: e.message };
    } finally {
      setIsLoading(false);
    }
  }, [dispatch, user]);

  const toggleFavorite = useCallback(
    (projectId: string) => {
      dispatch(toggleFavoriteAction(projectId));
    },
    [dispatch]
  );

  const toggleShowOnlyFavorites = useCallback(() => {
    dispatch(setShowOnlyFavoritesAction(!showOnlyFavorites));
  }, [dispatch, showOnlyFavorites]);

  return {
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
  } as const;
};
