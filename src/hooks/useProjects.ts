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
import { initializeUser } from '../lib/virgilsecurity/e3kit';

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
    try {
      if (!isLoggedIn(user)) throw new Error(t('hooks.message.pleaseLogin'));
      setIsLoading(true);
      const initResult = await initializeUser(user.uid);
      if (!initResult.isOK) throw new Error(initResult.message);

      dispatch(setProjectsAction([]));

      const { isOK, projects: updatedProjects, message } = await projectRepository.getAllProjects(user.uid);
      setIsLoading(false);
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
      setIsLoading(false);
      return { isOK: false, message: e.message };
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
