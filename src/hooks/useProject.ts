import { useCallback, useMemo } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { editSettingsAction } from '../modules/settings';
import { ProjectType, RegionType } from '../types';
import { layersInitialState, setLayersAction } from '../modules/layers';
import { dataSetInitialState, setDataSetAction } from '../modules/dataSet';
import { useRepository } from './useRepository';
import { hasOpened } from '../utils/Project';
import { tileMapsInitialState, setTileMapsAction } from '../modules/tileMaps';
import * as projectStore from '../lib/firebase/firestore';
import { isLoggedIn } from '../utils/Account';
import { t } from '../i18n/config';

export type UseProjectReturnType = {
  isSettingProject: boolean;
  isSynced: boolean;
  isOwnerAdmin: boolean;
  project: ProjectType | undefined;
  projectRegion: RegionType;
  uploadData: (isLicenseOK: boolean) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  syncPosition: (shouldSync: boolean) => void;
  clearProject: () => void;
  saveProjectSetting: (isLicenseOK: boolean) => Promise<void>;
};

export const useProject = (): UseProjectReturnType => {
  const dispatch = useDispatch();
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: RootState) => state.user);
  const isSynced = useSelector((state: RootState) => state.settings.isSynced, shallowEqual);
  const isSettingProject = useSelector((state: RootState) => state.settings.isSettingProject, shallowEqual);
  const projectRegion = useSelector((state: RootState) => state.settings.projectRegion, shallowEqual);
  const projects = useSelector((state: RootState) => state.projects);
  const project = useMemo(() => projects.find((d) => d.id === projectId), [projectId, projects]);
  const role = useMemo(() => project?.members.find((v) => v.uid === user.uid)?.role, [project?.members, user.uid]);
  const isOwnerAdmin = useMemo(() => role === 'OWNER' || role === 'ADMIN', [role]);

  const { uploadDataToRepository, uploadProjectSettings, deleteCommonAndTemplateData } = useRepository();

  const uploadData = useCallback(
    async (isLicenseOK: boolean) => {
      if (project === undefined) throw new Error(t('hooks.message.unknownError'));
      return await uploadDataToRepository(project, isLicenseOK, 'PublicAndPrivate');
    },
    [project, uploadDataToRepository]
  );

  const syncPosition = useCallback(
    (shouldSync: boolean) => {
      if (project === undefined) return;
      if (!isLoggedIn(user) || !hasOpened(project.id)) return;
      if (shouldSync) {
        dispatch(editSettingsAction({ isSynced: true }));
      } else {
        dispatch(editSettingsAction({ isSynced: false }));
        projectStore.deleteCurrentPosition(user.uid, project.id);
      }
    },
    [dispatch, project, user]
  );

  const clearProject = useCallback(() => {
    dispatch(
      editSettingsAction({
        role: undefined,
        isSettingProject: false,
        isSynced: false,
        projectId: undefined,
        projectName: undefined,
        photosToBeDeleted: [],
      })
    );
    dispatch(setLayersAction(layersInitialState));
    dispatch(setDataSetAction(dataSetInitialState));
    dispatch(setTileMapsAction(tileMapsInitialState));
  }, [dispatch]);

  const saveProjectSetting = useCallback(
    async (isLicenseOK: boolean) => {
      //コモンデータの写真はあればアップロードする
      if (project === undefined) throw new Error(t('hooks.message.unknownError'));
      const deleteDataResult = await deleteCommonAndTemplateData(project);
      if (!deleteDataResult.isOK) throw new Error(deleteDataResult.message);
      const projectSettingsResult = await uploadProjectSettings(project);
      if (!projectSettingsResult.isOK) throw new Error(projectSettingsResult.message);
      const dataToRepositoryResult = await uploadDataToRepository(project, isLicenseOK, 'Common');
      if (!dataToRepositoryResult.isOK) throw new Error(dataToRepositoryResult.message);
      const uploadTemplateResult = await uploadDataToRepository(project, isLicenseOK, 'Template');
      if (!uploadTemplateResult.isOK) throw new Error(uploadTemplateResult.message);
    },
    [deleteCommonAndTemplateData, project, uploadDataToRepository, uploadProjectSettings]
  );

  return {
    isSettingProject,
    isSynced,
    isOwnerAdmin,
    project,
    projectRegion,
    uploadData,
    syncPosition,
    clearProject,
    saveProjectSetting,
  } as const;
};
