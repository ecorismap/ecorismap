import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useStore } from 'react-redux';
import { RootState } from '../store';
import { RegionType } from '../types';
import { setDataSetAction } from '../modules/dataSet';
import { setLayersAction } from '../modules/layers';
import { setTileMapsAction } from '../modules/tileMaps';
import { dropUnsafeTileMaps } from '../utils/tileMapId';
import { setSettingsAction } from '../modules/settings';
import { setUserAction } from '../modules/user';
import { setProjectsAction } from '../modules/projects';
import { setDataSyncAllAction } from '../modules/dataSync';
import {
  BackupMetaType,
  BackupSnapshotType,
  listBackups,
  loadBackup,
  saveProjectBackup,
  isBackupAvailable,
  deleteBackup as deleteBackupStorage,
  clearAllBackups as clearAllBackupsStorage,
} from '../utils/projectBackup';
import { getAuthUid } from '../lib/firebase/sign-in';
import { runPhotoUriRebase } from '../utils/photoUriRebase';
import { flushPersistence } from '../utils/persistFlush';

export type RestoreBackupResultType = { isOK: boolean; region?: RegionType; reason?: 'differentUser' };

export type UseProjectBackupReturnType = {
  isBackupAvailable: boolean;
  backupList: BackupMetaType[];
  refreshBackupList: () => void;
  /** 復元できるか（スナップショットが読めるか・別ユーザーのものでないか）だけを確かめる。状態は変えない */
  canRestoreBackup: (id: string) => RestoreBackupResultType;
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

  /**
   * 復元の可否の判定。復元の前（記録を止める前、軌跡監査 T-M8）にも呼べるよう restoreBackup から分ける。
   * 読めないときは一覧が古いので更新する
   */
  const checkRestorable = useCallback(
    (id: string): { result: RestoreBackupResultType; snapshot?: BackupSnapshotType } => {
      const snapshot = loadBackup(id);
      if (snapshot === undefined) {
        refreshBackupList();
        return { result: { isOK: false } };
      }
      //別ユーザーのログイン中に他ユーザーのスナップショットを復元すると、認証uidとRedux上の
      //uidが食い違い、管理者権限では他人名義でCOMMON/TEMPLATEを上書きできてしまうためブロックする
      const authUid = getAuthUid();
      const snapshotUid = snapshot.state.user.uid;
      if (authUid !== undefined && snapshotUid !== undefined && snapshotUid !== authUid) {
        return { result: { isOK: false, reason: 'differentUser' } };
      }
      return { result: { isOK: true }, snapshot };
    },
    [refreshBackupList]
  );

  const canRestoreBackup = useCallback((id: string) => checkRestorable(id).result, [checkRestorable]);

  const restoreBackup = useCallback(
    (id: string): RestoreBackupResultType => {
      //事前に canRestoreBackup で確かめていても、その間に消えた・ログインが変わった場合に備えてもう一度確かめる
      const { result, snapshot } = checkRestorable(id);
      if (snapshot === undefined) return result;

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
      //スナップショットには検証導入前に取り込んだ地図が残っている可能性があるため、
      //保存先フォルダ（TILE_FOLDER/{id}）の外を指すIDの地図は復元しない
      dispatch(setTileMapsAction(dropUnsafeTileMaps(state.tileMaps)));
      dispatch(setDataSetAction(state.dataSet));
      //ログイン中に未ログイン時（uid なし）のスナップショットを戻すと、Redux だけがログアウト状態になり、
      //認証と鍵は残ったまま鍵削除付きのログアウトもできなくなる。今のユーザーとプロジェクト一覧を残す（設定監査 S-L1）
      const keepCurrentUser = getAuthUid() !== undefined && state.user.uid == null;
      if (!keepCurrentUser) {
        dispatch(setUserAction(state.user));
        dispatch(setProjectsAction(state.projects));
      }
      dispatch(setDataSyncAllAction(state.dataSync ?? {}));
      //iOSはアプリ更新でコンテナUUIDが変わる。更新前の自動バックアップの写真uriは古いコンテナを指すので、
      //次の起動を待たずにここで付け替える（冪等。iOS以外は何もしない。写真監査 P-L10）
      runPhotoUriRebase(store);
      // 置き換えた複数のスライスを揃えて書く（設定監査 S-L3）
      flushPersistence();

      refreshBackupList();
      const region = state.settings.projectId !== undefined ? state.settings.projectRegion : state.settings.mapRegion;
      return { isOK: true, region };
    },
    [checkRestorable, dispatch, refreshBackupList, store]
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

  return {
    isBackupAvailable,
    backupList,
    refreshBackupList,
    canRestoreBackup,
    restoreBackup,
    deleteBackup,
    clearAllBackups,
  } as const;
};
