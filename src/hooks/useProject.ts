import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { editSettingsAction } from '../modules/settings';
import { ProjectType, RegionType } from '../types';
import { createLayersInitialState, setLayersAction } from '../modules/layers';
import { createDataSetInitialState, setDataSetAction } from '../modules/dataSet';
import { useRepository } from './useRepository';
import { hasOpened, validateStorageLicense } from '../utils/Project';
import { createTileMapsInitialState, setTileMapsAction } from '../modules/tileMaps';
import * as projectStore from '../lib/firebase/firestore';
import { isLoggedIn } from '../utils/Account';
import { Platform } from 'react-native';
import { t } from '../i18n/config';

export type UseProjectReturnType = {
  isSettingProject: boolean;
  isSynced: boolean;
  project: ProjectType | undefined;
  projectRegion: RegionType;
  downloadData: (shouldPhotoDownload: boolean) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  uploadData: (hasUploadLicense: boolean) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  syncPosition: (shouldSync: boolean) => void;
  clearProject: () => void;
  saveProjectSetting: () => Promise<{
    isOK: boolean;
    message: string;
  }>;
};

export const useProject = (): UseProjectReturnType => {
  const dispatch = useDispatch();
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const user = useSelector((state: AppState) => state.user);
  const isSynced = useSelector((state: AppState) => state.settings.isSynced);
  const isSettingProject = useSelector((state: AppState) => state.settings.isSettingProject);
  const projectRegion = useSelector((state: AppState) => state.settings.projectRegion);
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
  } = useRepository();

  const downloadData = useCallback(
    async (shouldPhotoDownload: boolean) => {
      if (project === undefined) return { isOK: false, message: t('hooks.message.unknownError') };
      if (isOwnerAdmin) {
        const { isOK, message } = await downloadPublicAndAllPrivateData(project, shouldPhotoDownload);
        if (!isOK) {
          return { isOK: false, message };
        }
      } else {
        const { isOK: publicOK, message: publicMessage } = await downloadPublicData(project, shouldPhotoDownload);
        if (!publicOK) {
          return { isOK: false, message: publicMessage };
        }
        const { isOK: privateOK, message: privateMessage } = await downloadPrivateData(project, shouldPhotoDownload);
        if (!privateOK) {
          return { isOK: false, message: privateMessage };
        }
      }
      dispatch(editSettingsAction({ photosToBeDeleted: [] }));
      return { isOK: true, message: '' };
    },
    [dispatch, downloadPrivateData, downloadPublicAndAllPrivateData, downloadPublicData, isOwnerAdmin, project]
  );

  const uploadData = useCallback(
    async (hasUploadLicense: boolean) => {
      if (project === undefined) return { isOK: false, message: t('hooks.message.unknownError') };
      return await uploadDataToRepository(project, hasUploadLicense, 'PublicAndPrivate');
    },
    [project, uploadDataToRepository]
  );

  const syncPosition = useCallback(
    (shouldSync: boolean) => {
      if (project === undefined) return;
      if (!isLoggedIn(user) || !hasOpened(project.id)) {
        return;
      }
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

  const saveProjectSetting = useCallback(async () => {
    //コモンデータの写真はあればアップロードする
    if (project === undefined) return { isOK: false, message: t('hooks.message.unknownError') };
    const { isOK: hasUploadLicense, message: licenseMessage } = validateStorageLicense(
      project.license,
      project.storage.count
    );
    if (!hasUploadLicense) {
      if (Platform.OS === 'web') {
        return { isOK: false, message: licenseMessage + t('hooks.message.upgradeForPhoto') };
      } else {
        return {
          isOK: false,
          message: licenseMessage + t('hooks.message.failUploadPhoto'),
        };
      }
    }
    const { isOK: settingsOK, message: settingsMessage } = await uploadProjectSettings(project);
    if (!settingsOK) {
      return { isOK: false, message: settingsMessage };
    }
    const { isOK: dataOK, message: dataMessage } = await uploadDataToRepository(project, hasUploadLicense, 'Common');
    if (!dataOK) {
      return { isOK: false, message: dataMessage };
    }
    const uploadTemplateResult = await uploadDataToRepository(project, hasUploadLicense, 'Template');
    if (!uploadTemplateResult.isOK) {
      return { isOK: false, message: uploadTemplateResult.message };
    }
    return { isOK: true, message: t('hooks.message.updateProjectSettings') };
  }, [project, uploadDataToRepository, uploadProjectSettings]);

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
