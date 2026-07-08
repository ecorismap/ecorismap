import { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { useEcorisMapFile } from './useEcorismapFile';
import { generateEcorisMapZip, unlink } from '../utils/File';
import {
  getConnectedEmail,
  signInGoogleDrive,
  signOutGoogleDrive,
  trySilentSignIn,
} from '../lib/googledrive/auth';
import { clearAppFolderCache } from '../lib/googledrive/driveApi';
import {
  deleteDriveProject,
  downloadDriveProject,
  listDriveProjects,
  uploadDriveProject,
} from '../lib/googledrive/driveProjectStore';
import { DriveApiError, DriveProjectItem, GoogleDriveAuthError } from '../lib/googledrive/types';
import {
  deleteGoogleDriveLastSyncAction,
  setGoogleDriveConnectedEmailAction,
  setGoogleDriveLastSyncAction,
} from '../modules/googleDrive';
import { selectNonDeletedDataSet } from '../modules/selectors';
import { t } from '../i18n/config';
import dayjs from '../i18n/dayjs';
import { RegionType } from '../types';

export type UseGoogleDriveProjectsReturnType = {
  isLoading: boolean;
  progress: number | undefined;
  isConnected: boolean;
  connectedEmail: string | undefined;
  driveProjects: DriveProjectItem[];
  initialize: () => Promise<void>;
  connect: () => Promise<{ isOK: boolean; message: string }>;
  disconnect: () => Promise<void>;
  reloadProjects: () => Promise<{ isOK: boolean; message: string }>;
  saveToDrive: (name: string, existing?: DriveProjectItem) => Promise<{ isOK: boolean; message: string }>;
  loadFromDrive: (item: DriveProjectItem) => Promise<{ isOK: boolean; message: string; region?: RegionType }>;
  removeFromDrive: (item: DriveProjectItem) => Promise<{ isOK: boolean; message: string }>;
};

function toErrorMessage(e: unknown): string {
  if (e instanceof GoogleDriveAuthError) {
    if (e.reason === 'cancelled') return '';
    if (e.reason === 'scope-denied') return t('hooks.message.googleDriveScopeDenied');
    return t('hooks.message.googleDriveReauth');
  }
  if (e instanceof DriveApiError) {
    return `${t('hooks.message.googleDriveApiError')}(${e.status}: ${e.reason})`;
  }
  return t('hooks.message.googleDriveApiError');
}

export const useGoogleDriveProjects = (): UseGoogleDriveProjectsReturnType => {
  const dispatch = useDispatch();
  const layers = useSelector((state: RootState) => state.layers);
  const dataSet = useSelector(selectNonDeletedDataSet);
  const maps = useSelector((state: RootState) => state.tileMaps);
  const { generateEcorisMapData, openEcorisMapFile, createExportSettings } = useEcorisMapFile();

  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState<string | undefined>(undefined);
  const [driveProjects, setDriveProjects] = useState<DriveProjectItem[]>([]);

  const fetchProjects = useCallback(async () => {
    const items = await listDriveProjects();
    setDriveProjects(items);
  }, []);

  const reloadProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      await fetchProjects();
      return { isOK: true, message: '' };
    } catch (e) {
      return { isOK: false, message: toErrorMessage(e) };
    } finally {
      setIsLoading(false);
    }
  }, [fetchProjects]);

  const connect = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await signInGoogleDrive();
      if (!result.isOK) {
        const message =
          result.message === 'cancelled'
            ? ''
            : result.message === 'scope-denied'
            ? t('hooks.message.googleDriveScopeDenied')
            : t('hooks.message.googleDriveConnectFailed');
        return { isOK: false, message };
      }
      setIsConnected(true);
      setConnectedEmail(result.email);
      dispatch(setGoogleDriveConnectedEmailAction(result.email));
      await fetchProjects();
      return { isOK: true, message: '' };
    } catch (e) {
      return { isOK: false, message: toErrorMessage(e) };
    } finally {
      setIsLoading(false);
    }
  }, [dispatch, fetchProjects]);

  const initialize = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await trySilentSignIn();
      if (!result.isOK) return;
      setIsConnected(true);
      setConnectedEmail(result.email ?? getConnectedEmail());
      await fetchProjects();
    } catch (e) {
      console.log(e);
    } finally {
      setIsLoading(false);
    }
  }, [fetchProjects]);

  const disconnect = useCallback(async () => {
    await signOutGoogleDrive();
    clearAppFolderCache();
    setIsConnected(false);
    setConnectedEmail(undefined);
    setDriveProjects([]);
    dispatch(setGoogleDriveConnectedEmailAction(undefined));
  }, [dispatch]);

  const saveToDrive = useCallback(
    async (name: string, existing?: DriveProjectItem) => {
      let source: string | Blob | undefined;
      try {
        setIsLoading(true);
        const data = { dataSet, layers, settings: createExportSettings(), maps };
        const exportData = await generateEcorisMapData(data, { includePhoto: true, fromProject: false });
        const zip = await generateEcorisMapZip(exportData, name);
        if (zip === undefined) return { isOK: false, message: t('hooks.message.failSaveFile') };
        source = zip.source;

        setProgress(0);
        const item = await uploadDriveProject({
          name,
          source: zip.source,
          size: zip.size,
          existingFileId: existing?.fileId,
          projectId: existing !== undefined && existing.projectId !== '' ? existing.projectId : undefined,
          onProgress: setProgress,
        });
        dispatch(
          setGoogleDriveLastSyncAction({
            projectId: item.projectId,
            fileId: item.fileId,
            headRevisionId: item.headRevisionId,
            syncedAt: dayjs().toISOString(),
            name: item.name,
          })
        );
        setDriveProjects((prev) => [item, ...prev.filter((p) => p.fileId !== item.fileId)]);
        return { isOK: true, message: '' };
      } catch (e) {
        return { isOK: false, message: toErrorMessage(e) };
      } finally {
        if (typeof source === 'string') await unlink(source);
        setProgress(undefined);
        setIsLoading(false);
      }
    },
    [createExportSettings, dataSet, dispatch, generateEcorisMapData, layers, maps]
  );

  const loadFromDrive = useCallback(
    async (item: DriveProjectItem) => {
      let uri: string | undefined;
      try {
        setIsLoading(true);
        uri = await downloadDriveProject(item.fileId);
        const result = await openEcorisMapFile(uri);
        if (result.isOK && result.message === '') {
          dispatch(
            setGoogleDriveLastSyncAction({
              projectId: item.projectId,
              fileId: item.fileId,
              headRevisionId: item.headRevisionId,
              syncedAt: dayjs().toISOString(),
              name: item.name,
            })
          );
        }
        return result;
      } catch (e) {
        return { isOK: false, message: toErrorMessage(e) };
      } finally {
        if (uri !== undefined) {
          if (uri.startsWith('blob:')) {
            URL.revokeObjectURL(uri);
          } else {
            await unlink(uri.replace('file://', ''));
          }
        }
        setIsLoading(false);
      }
    },
    [dispatch, openEcorisMapFile]
  );

  const removeFromDrive = useCallback(
    async (item: DriveProjectItem) => {
      try {
        setIsLoading(true);
        await deleteDriveProject(item.fileId);
        if (item.projectId !== '') dispatch(deleteGoogleDriveLastSyncAction(item.projectId));
        setDriveProjects((prev) => prev.filter((p) => p.fileId !== item.fileId));
        return { isOK: true, message: '' };
      } catch (e) {
        return { isOK: false, message: toErrorMessage(e) };
      } finally {
        setIsLoading(false);
      }
    },
    [dispatch]
  );

  return {
    isLoading,
    progress,
    isConnected,
    connectedEmail,
    driveProjects,
    initialize,
    connect,
    disconnect,
    reloadProjects,
    saveToDrive,
    loadFromDrive,
    removeFromDrive,
  } as const;
};
