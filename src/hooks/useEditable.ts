import { useMemo } from 'react';
import { useSelector } from 'react-redux';

import { AppState } from '../modules';

export type UseLayersReturnType = {
  editable: boolean;
};

export const useEditable = (): UseLayersReturnType => {
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const user = useSelector((state: AppState) => state.user);
  const role = useSelector((state: AppState) => state.settings.role);
  const isSettingProject = useSelector((state: AppState) => state.settings.isSettingProject);

  const editable = useMemo(
    () =>
      ((role === 'OWNER' || role === 'ADMIN') && isSettingProject) || user.uid === undefined || projectId === undefined,
    [isSettingProject, projectId, role, user.uid]
  );

  return {
    editable,
  } as const;
};
