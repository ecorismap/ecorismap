import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useStore } from 'react-redux';
import { RootState } from '../store';
import { RegionType } from '../types';
import { setDataSetAction } from '../modules/dataSet';
import { setLayersAction } from '../modules/layers';
import { setTileMapsAction } from '../modules/tileMaps';
import { setSettingsAction } from '../modules/settings';
import { setUserAction } from '../modules/user';
import { setProjectsAction } from '../modules/projects';
import { setDataSyncAllAction } from '../modules/dataSync';
import {
  BackupMetaType,
  listBackups,
  loadBackup,
  saveProjectBackup,
  isBackupAvailable,
  deleteBackup as deleteBackupStorage,
  clearAllBackups as clearAllBackupsStorage,
} from '../utils/projectBackup';
import { getAuthUid } from '../lib/firebase/sign-in';

export type RestoreBackupResultType = { isOK: boolean; region?: RegionType; reason?: 'differentUser' };

export type UseProjectBackupReturnType = {
  isBackupAvailable: boolean;
  backupList: BackupMetaType[];
  refreshBackupList: () => void;
  restoreBackup: (id: string) => RestoreBackupResultType;
  deleteBackup: (id: string) => void;
  clearAllBackups: () => void;
};

/**
 * 自動バックアップ（端末内スナップショット）の一覧取得と復元を提供する。
 * 復元はRedux全置換dispatchで行い、再起動不要で「プロジェクトに入っている状態」に戻す。
 * 注意: ログアウト後の復元ではFirebase認証・E3Kit鍵は戻らないため、
 * サーバー同期にはオンラインでの再ログイン（と鍵復元）が必要。ローカル記録は継続できる。
 * 別ユーザーのログイン中は他ユーザーのバックアップを一覧に出さず、復元もブロックする
 * （認証uidとRedux上のuidが食い違う「なりすまし状態」を防ぐ）。
 */
export const useProjectBackup = (): UseProjectBackupReturnType => {
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const [backupList, setBackupList] = useState<BackupMetaType[]>([]);

  const refreshBackupList = useCallback(() => {
    const all = listBackups();
    const authUid = getAuthUid();
    //未ログイン時は救済（ログアウト直後の復元）のため全件表示する。
    //ログイン中は自分のバックアップと未ログイン時（uid: null）のものだけを見せる。
    setBackupList(authUid === undefined ? all : all.filter((meta) => meta.uid == null || meta.uid === authUid));
  }, []);

  useEffect(() => {
    refreshBackupList();
  }, [refreshBackupList]);

  const restoreBackup = useCallback(
    (id: string) => {
      const snapshot = loadBackup(id);
      if (snapshot === undefined) {
        refreshBackupList();
        return { isOK: false };
      }

      //別ユーザーのログイン中に他ユーザーのスナップショットを復元すると、認証uidとRedux上の
      //uidが食い違い、管理者権限では他人名義でCOMMON/TEMPLATEを上書きできてしまうためブロックする
      const authUid = getAuthUid();
      const snapshotUid = snapshot.state.user.uid;
      if (authUid !== undefined && snapshotUid !== undefined && snapshotUid !== authUid) {
        return { isOK: false, reason: 'differentUser' as const };
      }

      //復元で現在のデータが失われないよう、復元前の状態も自動バックアップする
      const current = store.getState();
      saveProjectBackup(
        {
          settings: current.settings,
          layers: current.layers,
          tileMaps: current.tileMaps,
          dataSet: current.dataSet,
          user: current.user,
          projects: current.projects,
          dataSync: current.dataSync,
        },
        'beforeRestore'
      );

      const { state } = snapshot;
      dispatch(setSettingsAction(state.settings));
      dispatch(setLayersAction(state.layers));
      dispatch(setTileMapsAction(state.tileMaps));
      dispatch(setDataSetAction(state.dataSet));
      dispatch(setUserAction(state.user));
      dispatch(setProjectsAction(state.projects));
      dispatch(setDataSyncAllAction(state.dataSync ?? {}));

      refreshBackupList();
      const region = state.settings.projectId !== undefined ? state.settings.projectRegion : state.settings.mapRegion;
      return { isOK: true, region };
    },
    [dispatch, refreshBackupList, store]
  );

  const deleteBackup = useCallback(
    (id: string) => {
      deleteBackupStorage(id);
      refreshBackupList();
    },
    [refreshBackupList]
  );

  const clearAllBackups = useCallback(() => {
    clearAllBackupsStorage();
    refreshBackupList();
  }, [refreshBackupList]);

  return { isBackupAvailable, backupList, refreshBackupList, restoreBackup, deleteBackup, clearAllBackups } as const;
};
