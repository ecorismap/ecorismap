import { useCallback, useMemo } from 'react';
import { shallowEqual, useDispatch, useSelector, useStore } from 'react-redux';
import { RootState } from '../store';
import { saveProjectBackup } from '../utils/projectBackup';
import { flushPersistence } from '../utils/persistFlush';
import { editSettingsAction } from '../modules/settings';
import { clearDataSyncProjectAction } from '../modules/dataSync';
import { ProjectType, RegionType } from '../types';
import { buildCommonAbsorption, CommonAbsorption } from '../utils/Data';
import { layersInitialState, setLayersAction } from '../modules/layers';
import { dataSetInitialState, setDataSetAction } from '../modules/dataSet';
import { useRepository } from './useRepository';
import { hasOpened } from '../utils/Project';
import { tileMapsInitialState, setTileMapsAction } from '../modules/tileMaps';
import { mapTypeFromTileMaps } from '../utils/baseMapType';
import * as projectStore from '../lib/firebase/firestore';
import { isLoggedIn } from '../utils/Account';
import { t } from '../i18n/config';
import { clearAllDynamicDictionaries } from './useDynamicDictionaryInput';
import { clearAllVisibilitySnapshots } from './useData';

export type UseProjectReturnType = {
  isSettingProject: boolean;
  isSynced: boolean;
  isOwnerAdmin: boolean;
  project: ProjectType | undefined;
  projectRegion: RegionType;
  /** layerIds を渡すと、そのレイヤだけを送る（軌跡の記録を止めてプロジェクトを離れるときの軌跡のアップロード） */
  uploadData: (options?: { layerIds?: string[] }) => Promise<{
    isOK: boolean;
    message: string;
    warning?: string;
  }>;
  syncPosition: (shouldSync: boolean) => void;
  /** skipBackup: 閉じる前の自動バックアップを取らない（開く途中の失敗など、手元が途中状態で直前に別の世代を保存済みのとき） */
  clearProject: (options?: { skipBackup?: boolean }) => void;
  /** 一部の写真をアップロードできなかったときは警告文を返す */
  saveProjectSetting: () => Promise<string | undefined>;
  /** 設定モードで開いた後に、別の端末（別の管理者）が設定を保存していないか */
  isProjectSettingCurrent: () => Promise<boolean>;
};

export const useProject = (): UseProjectReturnType => {
  const dispatch = useDispatch();
  const store = useStore<RootState>();
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
    async (options: { layerIds?: string[] } = {}) => {
      if (project === undefined) throw new Error(t('hooks.message.unknownError'));
      return await uploadDataToRepository(project, 'PublicAndPrivate', { onlyLayerIds: options.layerIds });
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

  const clearProject = useCallback(
    (options?: { skipBackup?: boolean }) => {
      //破棄直前の自動バックアップ（プロジェクトを閉じる/切替/ログアウト/設定破棄の全経路が通る）
      const state = store.getState();
      if (options?.skipBackup !== true)
        saveProjectBackup(
          {
            settings: state.settings,
            layers: state.layers,
            tileMaps: state.tileMaps,
            dataSet: state.dataSet,
            user: state.user,
            projects: state.projects,
            dataSync: state.dataSync,
          },
          'projectClose'
        );
      // 手元のデータを捨てるので、そのプロジェクトの同期の基準値も捨てる（残すと、次に開いた後の
      // アップロードが「同期済み」とみなされ、確認なしにクラウドを置き換えうる）。バックアップには上で保存済み
      if (state.settings.projectId !== undefined) dispatch(clearDataSyncProjectAction(state.settings.projectId));
      dispatch(
        editSettingsAction({
          role: undefined,
          isSettingProject: false,
          isSynced: false,
          projectId: undefined,
          projectName: undefined,
          projectSessionUid: undefined,
          // 地図一覧を初期状態に戻すので背景の地図種別も合わせる。残すと衛星写真で閉じたとき一覧と食い違う（M-M20）
          mapType: mapTypeFromTileMaps(tileMapsInitialState) ?? state.settings.mapType,
        })
      );
      dispatch(setLayersAction(layersInitialState));
      dispatch(setDataSetAction(dataSetInitialState));
      dispatch(setTileMapsAction(tileMapsInitialState));
      // 置き換えた複数のスライスを揃えて書く。数秒ずれた間に落ちると「基準値は閉じる前・記録は空」で起動する（設定監査 S-L3）
      flushPersistence();
      // 動的辞書をクリア
      clearAllDynamicDictionaries();
      clearAllVisibilitySnapshots();
    },
    [dispatch, store]
  );

  const isProjectSettingCurrent = useCallback(async () => {
    if (project === undefined) return true;
    try {
      return await projectStore.isSettingsUpdatedAtCurrent(project.id, store.getState().settings.updatedAt);
    } catch (e) {
      // 確かめられないときは「別の端末で保存されたかもしれない」として利用者に選ばせる
      return false;
    }
  }, [project, store]);

  const saveProjectSetting = useCallback(async () => {
    //コモンデータの写真はあればアップロードする
    if (project === undefined) throw new Error(t('hooks.message.unknownError'));
    const projectSettingsResult = await uploadProjectSettings(project);
    if (!projectSettingsResult.isOK) throw new Error(projectSettingsResult.message);
    // COMMON は、クラウドにあって手元に無い記録（PUBLIC/PRIVATE から付け替えたメンバーと自分の記録、途中で失敗した
    // 保存のやり直しで残っている記録、開いた後に他の管理者が足した記録）を取り込んでから、自分の名義にまとめて送る
    const state = store.getState();
    const commonLayerIds = state.layers.filter((layer) => layer.permission === 'COMMON').map((layer) => layer.id);
    let commonAbsorption: CommonAbsorption | undefined;
    if (commonLayerIds.length > 0 && user.uid !== undefined) {
      const commonRes = await projectStore.downloadCommonData(project.id);
      if (!commonRes.isOK || commonRes.data === undefined) throw new Error(commonRes.message);
      commonAbsorption = buildCommonAbsorption({
        localDataSet: state.dataSet,
        cloudCommonDataSet: commonRes.data,
        layerIds: commonLayerIds,
        ownUserId: user.uid,
      });
    }
    const dataToRepositoryResult = await uploadDataToRepository(project, 'Common', { commonAbsorption });
    if (!dataToRepositoryResult.isOK) throw new Error(dataToRepositoryResult.message);
    // PUBLIC/PRIVATE のテンプレートは、送る直前に古いものを消す（途中の手順が失敗したときに消えたまま残る時間を短くする）
    const deleteDataResult = await deleteCommonAndTemplateData(project);
    if (!deleteDataResult.isOK) throw new Error(deleteDataResult.message);
    const uploadTemplateResult = await uploadDataToRepository(project, 'Template');
    if (!uploadTemplateResult.isOK) throw new Error(uploadTemplateResult.message);
    // 共有データとテンプレートのどちらの警告も伝える（片方だけだと写真の送れなかった枚数などが落ちる）
    const warnings = [dataToRepositoryResult.warning, uploadTemplateResult.warning].filter(
      (w): w is string => w !== undefined && w !== ''
    );
    return warnings.length > 0 ? warnings.join('\n') : undefined;
  }, [deleteCommonAndTemplateData, project, store, uploadDataToRepository, uploadProjectSettings, user.uid]);

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
    isProjectSettingCurrent,
  } as const;
};
