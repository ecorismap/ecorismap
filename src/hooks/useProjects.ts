import { useCallback, useState } from 'react';
import { ProjectType, LoginUserType } from '../types';
import * as projectRepository from '../lib/firebase/firestore';
import { setProjectsAction } from '../modules/projects';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { v4 as uuidv4 } from 'uuid';

export type UseProjectsReturnType = {
  isLoading: boolean;
  projects: ProjectType[];
  getOwnerProjectsCount: (user: LoginUserType) => number;
  fetchProjects: (user: LoginUserType) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  generateProject: (user: LoginUserType) => ProjectType;
};

export const useProjects = (): UseProjectsReturnType => {
  const dispatch = useDispatch();
  const projects = useSelector((state: AppState) => state.projects);
  const [isLoading, setIsLoading] = useState(false);

  const getOwnerProjectsCount = useCallback(
    (user: LoginUserType) => {
      return projects.filter((project) => project.ownerUid === user.uid).length;
    },
    [projects]
  );

  const generateProject = useCallback((user: LoginUserType) => {
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
    return project;
  }, []);

  const fetchProjects = useCallback(
    async (user: LoginUserType) => {
      dispatch(setProjectsAction([]));
      setIsLoading(true);
      const { isOK, projects: updatedProjects, message } = await projectRepository.getAllProjects(user.uid);
      setIsLoading(false);
      if (!isOK || updatedProjects === undefined) {
        return { isOK: false, message };
      }
      dispatch(setProjectsAction(updatedProjects));
      return { isOK: true, message };
    },
    [dispatch]
  );

  return { isLoading, projects, getOwnerProjectsCount, fetchProjects, generateProject } as const;
};
