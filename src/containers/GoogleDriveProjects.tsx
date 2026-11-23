import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import GoogleDriveProjects from '../components/pages/GoogleDriveProjects';
import { GoogleDriveProjectsContext } from '../contexts/GoogleDriveProjects';
import { useBottomSheetNavigation, useBottomSheetRoute } from '../contexts/BottomSheetNavigationContext';
import { useGoogleDriveProjects } from '../hooks/useGoogleDriveProjects';
import { usePermission } from '../hooks/usePermission';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { DriveProjectItem } from '../lib/googledrive/types';
import { RootState } from '../store';
import { t } from '../i18n/config';
import dayjs from '../i18n/dayjs';
import { replaceDataWithTrackingGuard } from '../utils/trackingLeaveGuard';

export default function GoogleDriveProjectsContainers() {
  const { goBack, navigateToHome } = useBottomSheetNavigation();
  // 保存/読み込みどちらから開いたかで画面の機能を絞る（誤操作防止）
  const { params } = useBottomSheetRoute<'GoogleDriveProjects'>();
  const mode = params?.mode;
  const { isRunningProject } = usePermission();
  const lastSync = useSelector((state: RootState) => state.googleDrive.lastSync);
  const {
    isLoading,
    progress,
    isConnected,
    connectedEmail,
    driveProjects,
    isListLoaded,
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
    (async () => {
      // 接続できたのに一覧だけ取れなかったとき、黙っていると「0件」に見えて同名の別ファイルを作ってしまう
      const { isOK, message } = await initialize();
      if (!isOK && message !== '') await AlertAsync(message);
    })();
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

  const pressSaveToDrive = useCallback(async () => {
    // 共有プロジェクト実行中は「チームへの共有(データ送信)」との混同を防ぐため確認を挟む
    if (isRunningProject) {
      const ret = await ConfirmAsync(t('GoogleDriveProjects.confirm.saveInRunningProject'));
      if (!ret) return;
    }
    setIsSaveModalOpen(true);
  }, [isRunningProject]);

  const pressSaveCancel = useCallback(() => {
    setIsSaveModalOpen(false);
  }, []);

  const pressSaveOK = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (trimmed === '') return;
      setIsSaveModalOpen(false);
      // 一覧を取れていないまま同名判定すると上書きの確認が出ず、同じ名前の別ファイルができる
      let projects = driveProjects;
      if (!isListLoaded) {
        const listed = await reloadProjects();
        if (!listed.isOK || listed.items === undefined) {
          if (listed.message !== '') await AlertAsync(listed.message);
          return;
        }
        projects = listed.items;
      }
      const existing = projects.find((p) => p.name === trimmed);
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
    [driveProjects, isListLoaded, reloadProjects, saveToDrive]
  );

  const pressLoadProject = useCallback(
    async (item: DriveProjectItem) => {
      if (isRunningProject) {
        await AlertAsync(t('hooks.message.cannotInRunningProject'));
        return;
      }
      // 記録中なら、読み込む前に止めて保存させる（軌跡監査 T-M8）。止めずに読み込むと、ここまでの軌跡が
      // 読み込んだ別のデータの軌跡レイヤへ保存される
      await replaceDataWithTrackingGuard(
        'openFile',
        async () => ((await ConfirmAsync(t('GoogleDriveProjects.confirm.load'))) ? true : undefined),
        async () => {
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
        }
      );
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
        mode,
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
