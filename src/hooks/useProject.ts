import { useCallback, useMemo } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { editSettingsAction } from '../modules/settings';
import { ProjectType, RegionType } from '../types';
import { createLayersInitialState, setLayersAction } from '../modules/layers';
import { createDataSetInitialState, setDataSetAction } from '../modules/dataSet';
import { useRepository } from './useRepository';
import { hasOpened } from '../utils/Project';
import { createTileMapsInitialState, setTileMapsAction } from '../modules/tileMaps';
import * as projectStore from '../lib/firebase/firestore';
import { isLoggedIn } from '../utils/Account';
import { t } from '../i18n/config';
import { Platform } from 'react-native';

export type UseProjectReturnType = {
  isSettingProject: boolean;
  isSynced: boolean;
  project: ProjectType | undefined;
  projectRegion: RegionType;
  downloadData: (shouldPhotoDownload: boolean) => Promise<void>;
  uploadData: (isLicenseOK: boolean) => Promise<void>;
  syncPosition: (shouldSync: boolean) => void;
  clearProject: () => void;
  saveProjectSetting: (isLicenseOK: boolean) => Promise<void>;
};

export const useProject = (): UseProjectReturnType => {
  const dispatch = useDispatch();
  const projectId = useSelector((state: AppState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: AppState) => state.user);
  const isSynced = useSelector((state: AppState) => state.settings.isSynced, shallowEqual);
  const isSettingProject = useSelector((state: AppState) => state.settings.isSettingProject, shallowEqual);
  const projectRegion = useSelector((state: AppState) => state.settings.projectRegion, shallowEqual);
  const projects = useSelector((state: AppState) => state.projects);
  const project = useMemo(() => projects.find((d) => d.id === projectId), [projectId, projects]);
  const role = useMemo(() => project?.members.find((v) => v.uid === user.uid)?.role, [project?.members, user.uid]);
  const isOwnerAdmin = useMemo(() => role === 'OWNER' || role === 'ADMIN', [role]);

  const {
    downloadPublicData,
    downloadPrivateData,
    downloadPublicAndAllPrivateData,
    uploadData: uploadDataToRepository,
    uploadProjectSettings,
    deleteCommonAndTemplateData,
  } = useRepository();

  const downloadData = useCallback(
    async (shouldPhotoDownload: boolean) => {
      if (project === undefined) throw new Error(t('hooks.message.unknownError'));
      if (isOwnerAdmin && Platform.OS === 'ios') {
        const publicAndAllPrivateDataResult = await downloadPublicAndAllPrivateData(project, shouldPhotoDownload);
        if (!publicAndAllPrivateDataResult.isOK) throw new Error(publicAndAllPrivateDataResult.message);
      } else {
        const publicDataResult = await downloadPublicData(project, shouldPhotoDownload);
        if (!publicDataResult.isOK) throw new Error(publicDataResult.message);
        const privateDataResult = await downloadPrivateData(project, shouldPhotoDownload);
        if (!privateDataResult.isOK) throw new Error(privateDataResult.message);
      }
      dispatch(editSettingsAction({ photosToBeDeleted: [] }));
    },
    [dispatch, downloadPrivateData, downloadPublicAndAllPrivateData, downloadPublicData, isOwnerAdmin, project]
  );

  const uploadData = useCallback(
    async (isLicenseOK: boolean) => {
      if (project === undefined) throw new Error(t('hooks.message.unknownError'));
      await uploadDataToRepository(project, isLicenseOK, 'PublicAndPrivate');
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
        tracking: undefined,
        photosToBeDeleted: [],
      })
    );
    dispatch(setLayersAction(createLayersInitialState()));
    dispatch(setDataSetAction(createDataSetInitialState()));
    dispatch(setTileMapsAction(createTileMapsInitialState()));
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
    project,
    projectRegion,
    downloadData,
    uploadData,
    syncPosition,
    clearProject,
    saveProjectSetting,
  } as const;
};
