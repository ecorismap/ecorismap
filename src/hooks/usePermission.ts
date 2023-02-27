import { useMemo } from 'react';
import { useSelector } from 'react-redux';

import { AppState } from '../modules';

export type UseLayersReturnType = {
  isOwnerAdmin: boolean;
  isMemberAndProjectOpened: boolean;
  isSettingProject: boolean;
  isRunningProject: boolean;
};

export const usePermission = (): UseLayersReturnType => {
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const role = useSelector((state: AppState) => state.settings.role);
  const projectOpened = useMemo(() => projectId !== undefined, [projectId]);
  const isSettingProject = useSelector((state: AppState) => state.settings.isSettingProject);
  const isRunningProject = useMemo(() => projectOpened && !isSettingProject, [isSettingProject, projectOpened]);

  const isOwnerAdmin = useMemo(() => role === 'OWNER' || role === 'ADMIN', [role]);
  const isMemberAndProjectOpened = useMemo(() => role === 'MEMBER' && projectId !== undefined, [projectId, role]);

  return {
    isOwnerAdmin,
    isMemberAndProjectOpened,
    isSettingProject,
    isRunningProject,
  } as const;
};
