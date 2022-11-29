import { useCallback, useMemo } from 'react';
import { ProjectType, UserType } from '../types';
import * as projectRepository from '../lib/firebase/firestore';
import { setProjectsAction } from '../modules/projects';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { hasLoggedIn } from '../utils/Account';
import { v4 as uuidv4 } from 'uuid';
import { t } from '../i18n/config';

export type UseProjectsReturnType = {
  projects: ProjectType[];
  user: UserType;
  ownerProjectsCount: number;
  fetchProjects: () => Promise<{
    isOK: boolean;
    message: string;
  }>;
  addProject: () => {
    isOK: boolean;
    message: string;
    project: ProjectType | undefined;
  };
};

export const useProjects = (): UseProjectsReturnType => {
  const dispatch = useDispatch();
  const user = useSelector((state: AppState) => state.user);
  const isSettingProject = useSelector((state: AppState) => state.settings.isSettingProject);
  const projects = useSelector((state: AppState) => state.projects);
  //console.log('useProjects', projects);

  const ownerProjectsCount = useMemo(
    () => projects.filter((project) => project.ownerUid === user.uid).length,
    [projects, user.uid]
  );

  const addProject = useCallback(() => {
    if (!hasLoggedIn(user)) {
      return { isOK: false, message: t('hooks.message.pleaseLogin'), project: undefined };
    }
    if (isSettingProject) {
      return { isOK: false, message: t('hooks.message.cannotAddProject'), project: undefined };
    }
    //ライセンスは不正防止のためadd後にfunctionsで更新するが、ひとまず入れておく。本当は、Listnerで更新した方が良い。
    const project: ProjectType = {
      id: uuidv4(),
      name: '',
      members: [{ uid: user.uid, email: user.email, verified: 'HOLD', role: 'OWNER' }],
      ownerUid: user.uid,
      adminsUid: [user.uid],
      membersUid: [user.uid],
      abstract: '',
      storage: { count: 0 },
      license: 'Unkown',
    };
    return { isOK: true, message: '', project };
  }, [isSettingProject, user]);

  const fetchProjects = useCallback(async () => {
    //console.log('fetch');
    if (user.uid === undefined) {
      return { isOK: false, message: t('hooks.message.cannotFindUser') };
    }
    dispatch(setProjectsAction([]));
    const { isOK, projects: updatedProjects, message } = await projectRepository.getAllProjects(user.uid);
    if (!isOK || updatedProjects === undefined) {
      return { isOK: false, message };
    }
    dispatch(setProjectsAction(updatedProjects));
    return { isOK: true, message };
  }, [user.uid, dispatch]);

  return { projects, user, ownerProjectsCount, fetchProjects, addProject } as const;
};
