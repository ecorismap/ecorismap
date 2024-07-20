import { useEffect, useMemo } from 'react';
import { shallowEqual, useSelector } from 'react-redux';

import { RootState } from '../store';

export type UseLayersReturnType = {
  isOwnerAdmin: boolean;
  isMember: boolean;
  isSettingProject: boolean;
  isRunningProject: boolean;
  isClosedProject: boolean;
};

export const usePermission = (): UseLayersReturnType => {
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const role = useSelector((state: RootState) => state.settings.role, shallowEqual);
  const isSettingProject = useSelector((state: RootState) => state.settings.isSettingProject, shallowEqual);
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
