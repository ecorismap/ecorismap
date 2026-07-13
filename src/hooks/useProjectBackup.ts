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
} from '../utils/projectBackup';

export type UseProjectBackupReturnType = {
  isBackupAvailable: boolean;
  backupList: BackupMetaType[];
  refreshBackupList: () => void;
  restoreBackup: (id: string) => { isOK: boolean; region?: RegionType };
};

/**
 * 自動バックアップ（端末内スナップショット）の一覧取得と復元を提供する。
 * 復元はRedux全置換dispatchで行い、再起動不要で「プロジェクトに入っている状態」に戻す。
 * 注意: ログアウト後の復元ではFirebase認証・E3Kit鍵は戻らないため、
 * サーバー同期にはオンラインでの再ログイン（と鍵復元）が必要。ローカル記録は継続できる。
 */
export const useProjectBackup = (): UseProjectBackupReturnType => {
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const [backupList, setBackupList] = useState<BackupMetaType[]>([]);

  const refreshBackupList = useCallback(() => {
    setBackupList(listBackups());
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

  return { isBackupAvailable, backupList, refreshBackupList, restoreBackup } as const;
};
