import { useMemo } from 'react';
import { useSelector } from 'react-redux';

import { AppState } from '../modules';

export type UseLayersReturnType = {
  isOwnerAdmin: boolean;
  isMemberAndProjectOpened: boolean;
  editable: boolean;
};

export const usePermission = (): UseLayersReturnType => {
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const user = useSelector((state: AppState) => state.user);
  const role = useSelector((state: AppState) => state.settings.role);
  const isSettingProject = useSelector((state: AppState) => state.settings.isSettingProject);

  const isOwnerAdmin = useMemo(() => role === 'OWNER' || role === 'ADMIN', [role]);
  const isMemberAndProjectOpened = useMemo(() => role === 'MEMBER' && projectId !== undefined, [projectId, role]);

  const editable = useMemo(
    () =>
      ((role === 'OWNER' || role === 'ADMIN') && isSettingProject) || user.uid === undefined || projectId === undefined,
    [isSettingProject, projectId, role, user.uid]
  );

  return {
    isOwnerAdmin,
    isMemberAndProjectOpened,
    editable,
  } as const;
};
