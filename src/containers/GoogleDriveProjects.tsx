import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import GoogleDriveProjects from '../components/pages/GoogleDriveProjects';
import { GoogleDriveProjectsContext } from '../contexts/GoogleDriveProjects';
import { useBottomSheetNavigation } from '../contexts/BottomSheetNavigationContext';
import { useGoogleDriveProjects } from '../hooks/useGoogleDriveProjects';
import { usePermission } from '../hooks/usePermission';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { DriveProjectItem } from '../lib/googledrive/types';
import { RootState } from '../store';
import { t } from '../i18n/config';
import dayjs from '../i18n/dayjs';

export default function GoogleDriveProjectsContainers() {
  const { goBack, navigateToHome } = useBottomSheetNavigation();
  const { isRunningProject } = usePermission();
  const lastSync = useSelector((state: RootState) => state.googleDrive.lastSync);
  const {
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
  } = useGoogleDriveProjects();

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  useEffect(() => {
    initialize();
    // 画面を開いたときに一度だけサイレント再接続を試す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const defaultSaveName = (() => {
    const synced = Object.values(lastSync).sort((a, b) => (a.syncedAt < b.syncedAt ? 1 : -1));
    return synced[0]?.name ?? `ecorismap_${dayjs().format('YYYY-MM-DD')}`;
  })();

  const pressConnect = useCallback(async () => {
    const { isOK, message } = await connect();
    if (!isOK && message !== '') await AlertAsync(message);
  }, [connect]);

  const pressDisconnect = useCallback(async () => {
    const ret = await ConfirmAsync(t('GoogleDriveProjects.confirm.disconnect'));
    if (!ret) return;
    await disconnect();
  }, [disconnect]);

  const pressReload = useCallback(async () => {
    const { isOK, message } = await reloadProjects();
    if (!isOK && message !== '') await AlertAsync(message);
  }, [reloadProjects]);

  const pressSaveToDrive = useCallback(() => {
    setIsSaveModalOpen(true);
  }, []);

  const pressSaveCancel = useCallback(() => {
    setIsSaveModalOpen(false);
  }, []);

  const pressSaveOK = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (trimmed === '') return;
      setIsSaveModalOpen(false);
      const existing = driveProjects.find((p) => p.name === trimmed);
      if (existing !== undefined) {
        const ret = await ConfirmAsync(t('GoogleDriveProjects.confirm.overwrite'));
        if (!ret) return;
      }
      const { isOK, message } = await saveToDrive(trimmed, existing);
      if (!isOK) {
        if (message !== '') await AlertAsync(message);
      } else {
        await AlertAsync(t('GoogleDriveProjects.alert.saved'));
      }
    },
    [driveProjects, saveToDrive]
  );

  const pressLoadProject = useCallback(
    async (item: DriveProjectItem) => {
      if (isRunningProject) {
        await AlertAsync(t('hooks.message.cannotInRunningProject'));
        return;
      }
      const ret = await ConfirmAsync(t('GoogleDriveProjects.confirm.load'));
      if (!ret) return;
      const { isOK, message, region } = await loadFromDrive(item);
      if (isOK && message === '') {
        await AlertAsync(t('Settings.alert.loadEcorisMapFile'));
        navigateToHome?.({
          jumpTo: region,
          previous: 'Settings',
          mode: 'openEcorisMap',
        });
      } else if (message !== '') {
        await AlertAsync(message);
      }
    },
    [isRunningProject, loadFromDrive, navigateToHome]
  );

  const pressDeleteProject = useCallback(
    async (item: DriveProjectItem) => {
      const ret = await ConfirmAsync(t('GoogleDriveProjects.confirm.delete'));
      if (!ret) return;
      const { isOK, message } = await removeFromDrive(item);
      if (!isOK && message !== '') await AlertAsync(message);
    },
    [removeFromDrive]
  );

  const gotoBack = useCallback(() => {
    goBack();
  }, [goBack]);

  return (
    <GoogleDriveProjectsContext.Provider
      value={{
        isLoading,
        progress,
        isConnected,
        connectedEmail,
        driveProjects,
        isSaveModalOpen,
        defaultSaveName,
        pressConnect,
        pressDisconnect,
        pressReload,
        pressSaveToDrive,
        pressSaveOK,
        pressSaveCancel,
        pressLoadProject,
        pressDeleteProject,
        gotoBack,
      }}
    >
      <GoogleDriveProjects />
    </GoogleDriveProjectsContext.Provider>
  );
}
