import { useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';

import { AppState } from '../modules';

export type UseLayersReturnType = {
  isOwnerAdmin: boolean;
  isMember: boolean;
  isSettingProject: boolean;
  isRunningProject: boolean;
  isClosedProject: boolean;
};

export const usePermission = (): UseLayersReturnType => {
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const role = useSelector((state: AppState) => state.settings.role);
  const isSettingProject = useSelector((state: AppState) => state.settings.isSettingProject);
  const isClosedProject = useMemo(() => projectId === undefined, [projectId]);
  const isRunningProject = useMemo(() => !isClosedProject && !isSettingProject, [isClosedProject, isSettingProject]);

  const isOwnerAdmin = useMemo(
    () => !isClosedProject && (role === 'OWNER' || role === 'ADMIN'),
    [isClosedProject, role]
  );
  const isMember = useMemo(() => !isClosedProject && role === 'MEMBER', [isClosedProject, role]);

  useEffect(() => {
    console.assert(!(isSettingProject && role === 'MEMBER'), 'Member should not open Setting Page');
  }, [isSettingProject, role]);

  return {
    isOwnerAdmin,
    isMember,
    isSettingProject,
    isRunningProject,
    isClosedProject,
  } as const;
};
