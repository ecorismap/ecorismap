import { useCallback, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { useEcorisMapFile } from './useEcorismapFile';
import { generateEcorisMapZip, unlink } from '../utils/File';
import {
  getAccessToken,
  getConnectedEmail,
  signInGoogleDrive,
  signOutGoogleDrive,
  trySilentSignIn,
} from '../lib/googledrive/auth';
import { clearAppFolderCache } from '../lib/googledrive/driveApi';
import {
  deleteDriveProject,
  downloadDriveProject,
  isOverwritableDriveProject,
  listDriveProjects,
  uploadDriveProject,
  UPLOAD_CHUNK_SIZE,
} from '../lib/googledrive/driveProjectStore';
import { DriveApiError, DriveProjectItem, GoogleDriveAuthError } from '../lib/googledrive/types';
import {
  deleteGoogleDriveLastSyncAction,
  setGoogleDriveConnectedEmailAction,
  setGoogleDriveCurrentFileAction,
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
  /** 接続中のアカウントの一覧を取得できているか。false の間は driveProjects を同名判定に使えない */
  isListLoaded: boolean;
  /** 画面を開いたときのサイレント再接続。接続後の一覧取得に失敗したときだけ message にエラー文が入る */
  initialize: () => Promise<{ isOK: boolean; message: string }>;
  connect: () => Promise<{ isOK: boolean; message: string }>;
  disconnect: () => Promise<void>;
  reloadProjects: () => Promise<{ isOK: boolean; message: string; items?: DriveProjectItem[] }>;
  saveToDrive: (name: string, existing?: DriveProjectItem) => Promise<{ isOK: boolean; message: string }>;
  loadFromDrive: (item: DriveProjectItem) => Promise<{ isOK: boolean; message: string; region?: RegionType }>;
  removeFromDrive: (item: DriveProjectItem) => Promise<{ isOK: boolean; message: string }>;
};

function toErrorMessage(e: unknown): string {
  // eslint-disable-next-line no-console
  console.log('GoogleDrive error:', e);
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
  const [isListLoaded, setIsListLoaded] = useState(false);
  // 接続中に重ねて押すと、2回目が処理中のトークン要求に当たって「接続できませんでした」になる
  const isConnectingRef = useRef(false);

  const fetchProjects = useCallback(async () => {
    const items = await listDriveProjects();
    setDriveProjects(items);
    setIsListLoaded(true);
    return items;
  }, []);

  const reloadProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      const items = await fetchProjects();
      return { isOK: true, message: '', items };
    } catch (e) {
      return { isOK: false, message: toErrorMessage(e) };
    } finally {
      setIsLoading(false);
    }
  }, [fetchProjects]);

  const connect = useCallback(async () => {
    if (isConnectingRef.current) return { isOK: false, message: '' };
    isConnectingRef.current = true;
    try {
      // iOSではLoading Modalの提示中にサインインのネイティブVCを提示できずフリーズするため、
      // Loadingはサインイン完了後のfetchProjectsに対してのみ表示する
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
      setIsLoading(true);
      setIsConnected(true);
      setConnectedEmail(result.email);
      // 別のアカウントで入り直した場合、取得し直すまで前の一覧で同名判定をさせない
      setIsListLoaded(false);
      dispatch(setGoogleDriveConnectedEmailAction(result.email));
      await fetchProjects();
      return { isOK: true, message: '' };
    } catch (e) {
      return { isOK: false, message: toErrorMessage(e) };
    } finally {
      isConnectingRef.current = false;
      setIsLoading(false);
    }
  }, [dispatch, fetchProjects]);

  const initialize = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await trySilentSignIn();
      if (!result.isOK) return { isOK: false, message: '' };
      const email = result.email ?? getConnectedEmail();
      setIsConnected(true);
      setConnectedEmail(email);
      setIsListLoaded(false);
      // Webでは接続ヒントがタブをまたいで残るため、ここで接続した場合も全体の接続状態に反映する。
      // 反映しないとアカウントボタンが未接続表示になり、ログアウトで Google 接続が切れない
      dispatch(setGoogleDriveConnectedEmailAction(email));
      await fetchProjects();
      return { isOK: true, message: '' };
    } catch (e) {
      return { isOK: false, message: toErrorMessage(e) };
    } finally {
      setIsLoading(false);
    }
  }, [dispatch, fetchProjects]);

  const disconnect = useCallback(async () => {
    await signOutGoogleDrive();
    clearAppFolderCache();
    setIsConnected(false);
    setConnectedEmail(undefined);
    setDriveProjects([]);
    setIsListLoaded(false);
    dispatch(setGoogleDriveConnectedEmailAction(undefined));
  }, [dispatch]);

  const saveToDrive = useCallback(
    async (name: string, existing?: DriveProjectItem) => {
      let source: string | Blob | undefined;
      try {
        setIsLoading(true);
        // Webではトークンの再取得がポップアップになり、タップ直後でないとブロックされる。
        // 写真を含むデータ生成の後では間に合わないため、先にアップロードに要る残寿命を確保しておく
        await getAccessToken({ minTtlSec: 600 });
        const data = { dataSet, layers, settings: createExportSettings(), maps };
        const exportData = await generateEcorisMapData(data, { includePhoto: true, fromProject: false });
        const zip = await generateEcorisMapZip(exportData, name);
        if (zip === undefined) return { isOK: false, message: t('hooks.message.failSaveFile') };
        source = zip.source;

        // 1チャンクで完了するサイズだと0%のまま完了して紛らわしいため、
        // 複数チャンクになる場合のみ%を表示する（それ以外はスピナーのみ）
        const showProgress = zip.size > UPLOAD_CHUNK_SIZE;
        if (showProgress) setProgress(0);
        // ゴミ箱に入った（または消えた）ファイルへは上書きせず新しく作る。projectId は引き継いで同期記録を新しいファイルへ向ける
        let overwriteFileId: string | undefined = existing?.fileId;
        if (overwriteFileId !== undefined) {
          const usable = await isOverwritableDriveProject(overwriteFileId);
          if (!usable) overwriteFileId = undefined;
        }
        const staleFileId = existing !== undefined && overwriteFileId === undefined ? existing.fileId : undefined;
        const item = await uploadDriveProject({
          name,
          source: zip.source,
          size: zip.size,
          existingFileId: overwriteFileId,
          projectId: existing !== undefined && existing.projectId !== '' ? existing.projectId : undefined,
          onProgress: showProgress ? setProgress : undefined,
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
        dispatch(setGoogleDriveCurrentFileAction(item.fileId));
        setDriveProjects((prev) => [item, ...prev.filter((p) => p.fileId !== item.fileId && p.fileId !== staleFileId)]);
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
          // 読み込みでデータを置き換えると対応が外れるので、置き換えの後で付け直す
          dispatch(setGoogleDriveCurrentFileAction(item.fileId));
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
    isListLoaded,
    initialize,
    connect,
    disconnect,
    reloadProjects,
    saveToDrive,
    loadFromDrive,
    removeFromDrive,
  } as const;
};
