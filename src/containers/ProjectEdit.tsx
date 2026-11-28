import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ulid } from 'ulid';
import ProjectEdit from '../components/pages/ProjectEdit';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { leaveWithTrackingGuard } from '../utils/trackingLeaveGuard';
import { useProjectEdit } from '../hooks/useProjectEdit';
import { Props_ProjectEdit } from '../routes';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { t } from '../i18n/config';
import { ProjectEditContext } from '../contexts/ProjectEdit';
import { useE3kitGroup } from '../hooks/useE3kitGroup';
import { useRepository } from '../hooks/useRepository';
import { exportGeoFile } from '../utils/File';
import { truncateForFileName } from '../utils/General';
import { pickNewProjectIdForSave } from '../utils/Project';
import { ProjectType } from '../types';
import { FUNC_ENCRYPTION, CREATE_DEK_PROJECTS, ENABLE_DEK_SELF_MIGRATION, ENABLE_KEY_LEDGER } from '../constants/AppConstants';
import { getKeyMigrationState } from '../lib/crypto/migration';
import { resolveKeyRestoreMessage } from '../hooks/useProjects';
import {
  getMemberKeyFreshness,
  getProjectEncryptedAt,
  migrateSelfDataToDEK,
  SelfMigrationInputType,
} from '../lib/firebase/firestore';
import { isStaleProjectEdit } from '../utils/projectStaleGuard';
import dayjs from '../i18n/dayjs';
import { useEcorisMapFile } from '../hooks/useEcorismapFile';
import { ConflictResolverModal } from '../components/organisms/HomeModalConflictResolver';
import { useStore } from 'react-redux';
import { RootState } from '../store';
import { backupBeforeReplace } from '../utils/backupBeforeReplace';
import { useProject } from '../hooks/useProject';
import { buildOpenFailedMessage, buildOpenReplaceConfirmMessage, hasLocalRecords } from '../utils/projectOpenGuard';

export default function ProjectEditContainer({ navigation, route }: Props_ProjectEdit) {
  const {
    isProjectOpen,
    isOwner,
    isOwnerAdmin,
    isNew,
    user,
    targetProject,
    originalProject,
    isEdited,
    checkedProject,
    saveProject,
    changeText,
    changeMemberText,
    changeAdmin,
    addMembers,
    deleteMember,
    isAddedMember,
    openProject,
    discardSyncBaselines,
    startProjectSetting,
  } = useProjectEdit(route.params.project, route.params.isNew);

  const store = useStore<RootState>();
  const { clearProject } = useProject();
  const [isLoading, setIsLoading] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState('');
  // 鍵リセット済み（ラップが古く本人が開けない）メンバーのuid。管理者にバッジ表示して再共有を促す
  const [staleKeyUids, setStaleKeyUids] = useState<string[]>([]);

  const refreshMemberKeyFreshness = useCallback(async () => {
    if (isNew || targetProject.cryptoScheme !== 'dek') return;
    const memberUids = targetProject.members.map((m) => m.uid).filter((uid): uid is string => !!uid);
    if (memberUids.length === 0) return;
    const freshness = await getMemberKeyFreshness(targetProject.id, memberUids);
    setStaleKeyUids(memberUids.filter((uid) => freshness[uid] === 'needs-reshare'));
  }, [isNew, targetProject.cryptoScheme, targetProject.id, targetProject.members]);

  useEffect(() => {
    refreshMemberKeyFreshness();
  }, [refreshMemberKeyFreshness]);
  const { loadE3kitGroup, deleteE3kitGroup, updateE3kitGroupMembers, createE3kitGroup, reshareMemberKey } =
    useE3kitGroup();
  const {
    deleteProject,
    fetchProjectSettings,
    fetchAllData,
    createProject,
    updateProject,
    downloadProjectSettings,
    fetchPublicData,
    fetchPrivateData,
    fetchTemplateData,
    downloadCommonData,
    downloadTemplateData,
    createMergedDataSet,
    conflictState,
    handleSelect,
    handleBulkSelect,
  } = useRepository();
  const { generateEcorisMapData, createExportSettings } = useEcorisMapFile();

  const downloadDataForSetting = useCallback(async () => {
    const shouldPhotoDownload = false;
    const commonDataResult = await downloadCommonData(targetProject, shouldPhotoDownload);
    if (!commonDataResult.isOK) throw new Error(commonDataResult.message);
    const templateDataResult = await downloadTemplateData(targetProject, shouldPhotoDownload);
    if (!templateDataResult.isOK) throw new Error(templateDataResult.message);
  }, [downloadCommonData, downloadTemplateData, targetProject]);

  const downloadData = useCallback(
    async ({ isAdmin = false, shouldPhotoDownload = false }): Promise<SelfMigrationInputType> => {
      const mode = isAdmin ? 'all' : 'own';

      const commonDataResult = await downloadCommonData(targetProject, shouldPhotoDownload);
      if (!commonDataResult.isOK) throw new Error(commonDataResult.message);

      const [publicRes, privateRes, templateRes] = await Promise.all([
        fetchPublicData(targetProject, shouldPhotoDownload, 'all'),
        fetchPrivateData(targetProject, shouldPhotoDownload, mode),
        fetchTemplateData(targetProject, shouldPhotoDownload),
      ]);
      if (!publicRes.isOK || !privateRes.isOK || !templateRes.isOK) {
        throw new Error(publicRes.message || privateRes.message || templateRes.message);
      }
      const mergedDataResult = await createMergedDataSet({
        privateData: privateRes.data,
        publicData: publicRes.data,
        templateData: templateRes.data,
        // 他人の PRIVATE を取得するのは管理者として全員分を取ったときだけ
        // 管理者が全員分を取らなかったときは、他人の分を消さない（PRIVATE から PUBLIC に変えた直後の写しを守る）
        fetchedScope: {
          permissions: isAdmin ? ['PUBLIC', 'PRIVATE'] : ['PUBLIC'],
          template: true,
          pruneOthers: isAdmin || !isOwnerAdmin,
        },
        undecryptableGroups: [
          ...(publicRes.undecryptableGroups ?? []),
          ...(privateRes.undecryptableGroups ?? []),
          ...(templateRes.undecryptableGroups ?? []),
        ],
      });
      if (!mergedDataResult.isOK) throw new Error(mergedDataResult.message);
      // 一部を復号できなかったことを知らせる。黙っていると、読めなかった記録が「無い」ように見える
      if (mergedDataResult.warning) await AlertAsync(mergedDataResult.warning);

      // 自己DEK移行(Phase iii)の入力。ここで取得済みの判定情報と復号済みデータを返すことで、
      // 移行処理からの追加ダウンロードをゼロにする
      return {
        unmarkedGroups: [...(privateRes.unmarkedDekGroups ?? []), ...(publicRes.unmarkedDekGroups ?? [])],
        privateData: privateRes.data,
        publicData: publicRes.data,
      };
    },
    [createMergedDataSet, downloadCommonData, fetchPrivateData, fetchPublicData, fetchTemplateData, isOwnerAdmin, targetProject]
  );

  // 端末にE3Kitのローカル鍵がない復帰セッション（機種変更等）は、
  // エラー表示ではなく鍵の復元フォームへ誘導する（Projects画面のfetchProjectsと同じ扱い）
  const navigateToKeyRestoreIfNeeded = useCallback(
    async (message: string) => {
      if (!(ENABLE_KEY_LEDGER && FUNC_ENCRYPTION && message === 'not-localkey' && user.uid !== undefined)) {
        return false;
      }
      const migrationState = await getKeyMigrationState(user.uid);
      navigation.navigate('Account', {
        accountFormState: 'restoreEncryptKey',
        message: resolveKeyRestoreMessage(migrationState),
        previous: 'Projects',
      });
      return true;
    },
    [navigation, user.uid]
  );

  const pressOpenProject = useCallback(
    async (isSetting: boolean) => {
      // 手元のデータに触れ始めたか。触れた後に失敗したら、途中まで読み込んだ状態（今のプロジェクトの名前で中身が空や
      // 開く先の構成）を残さず閉じる。残すと送信や設定の保存で今のプロジェクトのクラウドを上書きしうる（A-H2）
      let hasTouchedLocal = false;
      try {
        // 通信できないときは、確認を出す前に止める。Firestore はオフラインだと失敗せずキャッシュの内容を返すので、
        // 開く処理がそのまま進み、古い（または空の）データで手元の記録を置き換えてしまう
        if ((await NetInfo.fetch()).isConnected === false) {
          await AlertAsync(t('Home.alert.noInternet'));
          return false;
        }
        //通常はユーザーとして自分のデータのみ取得する。管理者は取得時に全てのデータを取得できる。
        //ただしWeb版は集計・確認作業が中心のため、管理者には開く時点で他メンバーのプライベートデータも取得するか確認する。
        let isAdmin = false;
        // 軌跡の記録中なら、開く確認まで了承されてから、今のプロジェクト（開いていなければ端末内のデータ）へ止めて保存・
        // アップロードする。止めずに開くと、記録中の軌跡が開いた先のプロジェクトに保存される。どちらかの確認で
        // キャンセルしたら記録を続けたまま何もしない（同期監査 M13）
        const proceed = await leaveWithTrackingGuard('openProject', async () => {
          if (isProjectOpen) {
            const ret = await ConfirmAsync(t('Home.confirm.reOpenProject'));
            if (!ret) return false;
          } else if (hasLocalRecords(store.getState().dataSet)) {
            // 開いていない状態の記録も確認なしに置き換わる。Drive やファイルから開くときと同じく尋ねる（A-L2）
            const ret = await ConfirmAsync(buildOpenReplaceConfirmMessage(Platform.OS === 'web'));
            if (!ret) return false;
          }
          if (!isSetting && Platform.OS === 'web' && isOwnerAdmin) {
            isAdmin = await ConfirmAsync(t('ProjectEdit.confirm.downloadAllUserData'));
          }
          return true;
        });
        if (!proceed) return false;

        setIsLoading(true);
        const loadE3kitGroupResult = await loadE3kitGroup(targetProject);
        if (!loadE3kitGroupResult.isOK) {
          if (await navigateToKeyRestoreIfNeeded(loadE3kitGroupResult.message)) {
            setIsLoading(false);
            return false;
          }
          throw new Error(loadE3kitGroupResult.message);
        }
        // 開く前の自動バックアップを作れなかったら、手元に触れる前に続けるかを尋ねる。基準値を捨てる前に尋ねるのは、
        // 取りやめたとき今のプロジェクトの基準値（同期監査 L11 の確認）を残すため。
        // downloadProjectSettings の中の保存は直後の重複として飛ばされる（永続化監査 S-L2）
        if (!(await backupBeforeReplace(store.getState(), 'projectOpen'))) {
          setIsLoading(false);
          return false;
        }
        // 開く処理は手元のデータを捨ててクラウドから取り直す。途中で失敗したり自分のデータを復号できなかったりして
        // 手元が空でも、前回アップロード時の基準値が残っていると「同期済み」とみなされ、次のアップロードが
        // 確認なしにクラウドの自分のデータを置き換えてしまう。開く先と今開いているプロジェクトの基準値を捨てて、
        // 次回は必ず内容を比べさせる。手元に触れる直前まで遅らせるのは、鍵の復元誘導や通信エラーで開く前に
        // 中止したとき、今のプロジェクトの「削除済みデータを上げ直すか」の確認（同期監査 L11）を外さないため
        discardSyncBaselines();
        hasTouchedLocal = true;

        const projectSettingsResult = await downloadProjectSettings(targetProject);
        if (!projectSettingsResult.isOK || projectSettingsResult.region === undefined)
          throw new Error(projectSettingsResult.message);

        // isSetting時はPRIVATE/PUBLICをダウンロードしないため自己移行の入力は無い（通常オープン時に実施される）
        let selfMigrationInput: SelfMigrationInputType | null = null;
        if (isSetting) {
          await downloadDataForSetting();
        } else {
          selfMigrationInput = await downloadData({ isAdmin, shouldPhotoDownload: false });
        }

        // DEKプロジェクトなら自分のPRIVATE/PUBLICをDEKへ自己移行(Phase iii パートA)。
        // 判定・復号ともダウンロード済みデータを使うため追加の通信は書き戻しのアップロードのみ。
        // 失敗しても開く処理は継続する(dual-readで復号可能。次回開いた時に自動で再試行される)。
        if (
          FUNC_ENCRYPTION &&
          ENABLE_DEK_SELF_MIGRATION &&
          targetProject.cryptoScheme === 'dek' &&
          selfMigrationInput !== null
        ) {
          // セルラー回線では書き戻しを行わない（現場の弱い回線・通信量への配慮。
          // Wi-Fi等で開いた時に自動で再試行される。Webはtypeがcellularにならないため常に実行）。
          const netState = await NetInfo.fetch();
          if (netState.type !== 'cellular') {
            const migrationResult = await migrateSelfDataToDEK(targetProject.id, selfMigrationInput, (done, total) =>
              setMigrationProgress(t('ProjectEdit.label.migratingData', { done, total }))
            );
            setMigrationProgress('');
            if (!migrationResult.isOK || migrationResult.failedCount > 0) {
              await AlertAsync(t('ProjectEdit.alert.migrateSelfDataFailed'));
            }
          }
        }

        openProject();
        setIsLoading(false);

        navigation.navigate('Home', {
          jumpTo: projectSettingsResult.region,
          previous: 'ProjectEdit',
          mode: 'jumpTo',
        });
        return true;
      } catch (e: any) {
        setIsLoading(false);
        setMigrationProgress('');
        if (hasTouchedLocal && isProjectOpen) {
          // 元の状態の書き戻しではなく閉じた状態に落とす。差し替えた地図タイルや辞書は戻せず、中途半端な復元になるため。
          // 開く直前の状態は開く処理の自動バックアップ（ネイティブ）に残っている。ここで閉じる前のバックアップを取ると
          // 「今のプロジェクトの名前で中身は開く先」の途中状態が最新世代になり、復元すると A-H2 の状態を再現するので取らない。
          // 開いていなかったときは閉じない。projectId が無くクラウドを上書きする経路が無いうえ、閉じると独自の地図一覧や
          // レイヤ構成まで初期化され、記録0件では自動バックアップも残らないため
          clearProject({ skipBackup: true });
          await AlertAsync(buildOpenFailedMessage(e?.message ?? ''));
        } else {
          await AlertAsync(e.message);
        }
        return false;
      }
    },
    [
      clearProject,
      store,
      discardSyncBaselines,
      isProjectOpen,
      isOwnerAdmin,
      targetProject,
      loadE3kitGroup,
      navigateToKeyRestoreIfNeeded,
      downloadProjectSettings,
      openProject,
      navigation,
      downloadDataForSetting,
      downloadData,
    ]
  );

  const pressSettingProject = useCallback(async () => {
    const ret = await pressOpenProject(true);
    if (ret) {
      startProjectSetting();
      await AlertAsync(t('ProjectEdit.alert.settingProject'));
    }
  }, [pressOpenProject, startProjectSetting]);

  const pressExportProject = useCallback(async () => {
    try {
      if (Platform.OS !== 'web') {
        await AlertAsync(t('ProjectEdit.alert.exportProject'));
        return;
      }
      setIsLoading(true);
      const projectSettingsResult = await fetchProjectSettings(targetProject);
      if (!projectSettingsResult.isOK || projectSettingsResult.data === undefined)
        throw new Error(projectSettingsResult.message);
      const allDataResult = await fetchAllData(targetProject);
      if (!allDataResult.isOK || allDataResult.data === undefined) throw new Error(allDataResult.message);
      const newSettings = createExportSettings();
      newSettings.mapRegion = projectSettingsResult.data.mapRegion;
      newSettings.plugins = projectSettingsResult.data.plugins;
      newSettings.mapType = projectSettingsResult.data.mapType;

      const data = {
        dataSet: allDataResult.data,
        layers: projectSettingsResult.data.layers,
        maps: projectSettingsResult.data.tileMaps,
        settings: newSettings,
      };
      const includePhoto = true;
      const exportData = await generateEcorisMapData(data, { includePhoto, fromProject: true });
      const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');
      const exportDataName = `${truncateForFileName(targetProject.name)}_${time}`;

      const result = await exportGeoFile(exportData, exportDataName, 'zip');
      if (result === 'error') await AlertAsync(t('hooks.message.failExport'));

      setIsLoading(false);
    } catch (e: any) {
      setIsLoading(false);
      await AlertAsync(e.message);
    }
  }, [createExportSettings, fetchAllData, fetchProjectSettings, generateEcorisMapData, targetProject]);

  const pressDeleteProject = useCallback(async () => {
    try {
      if (isProjectOpen) {
        await AlertAsync(t('ProjectEdit.alert.deleteProjectOpen'));
        return;
      }
      const ret = await ConfirmAsync(t('ProjectEdit.confirm.deleteProject'));
      if (!ret) return;
      setIsLoading(true);
      const deleteProjectResult = await deleteProject(targetProject);
      if (!deleteProjectResult.isOK) throw new Error(deleteProjectResult.message);
      const deleteE3kitGroupResult = await deleteE3kitGroup(targetProject);
      if (!deleteE3kitGroupResult.isOK) throw new Error(deleteE3kitGroupResult.message);
      setIsLoading(false);
      await AlertAsync(t('ProjectEdit.alert.deleteProject'));
      navigation.navigate('Projects');
    } catch (e: any) {
      setIsLoading(false);
      await AlertAsync(e.message);
    }
  }, [deleteE3kitGroup, deleteProject, isProjectOpen, navigation, targetProject]);

  const saveUpdatedProject = useCallback(
    async (project: ProjectType) => {
      const e3kitGroupResult = await updateE3kitGroupMembers(originalProject, project);
      if (!e3kitGroupResult.isOK || !e3kitGroupResult.project) throw new Error(e3kitGroupResult.message);
      const updateProjectResult = await updateProject(e3kitGroupResult.project);
      if (!updateProjectResult.isOK) throw new Error(updateProjectResult.message);
      saveProject(updateProjectResult.project ?? e3kitGroupResult.project);
    },
    [originalProject, saveProject, updateE3kitGroupMembers, updateProject]
  );

  // 保存を試みた新規プロジェクトの id。失敗の後始末で消した id を再保存で使い回さないために覚える
  const attemptedNewProjectIdsRef = useRef<Set<string>>(new Set());

  const saveNewProject = useCallback(
    async (checked: ProjectType) => {
      const project = { ...checked, id: pickNewProjectIdForSave(checked.id, attemptedNewProjectIdsRef.current, ulid) };
      const e3kitGroupResult = await createE3kitGroup(project);
      if (!e3kitGroupResult.isOK || !e3kitGroupResult.project) throw new Error(e3kitGroupResult.message);
      const createProjectResult = await createProject(e3kitGroupResult.project);
      if (!createProjectResult.isOK) throw new Error(createProjectResult.message);
    },
    [createE3kitGroup, createProject]
  );

  const pressSaveProject = useCallback(async () => {
    try {
      // 一覧は端末に保存した内容から出るので、開いた画面が古いことがある。ほかの端末でメンバーや管理者が
      // 変わっていたら、古い内容で黙って上書きせず止める（2026-11-24 Pixel 実機で古い保留メンバー・管理者が残っていた）
      if (!isNew) {
        setIsLoading(true);
        const latest = await getProjectEncryptedAt(originalProject.id);
        setIsLoading(false);
        if (!latest.isOK) {
          await AlertAsync(t('ProjectEdit.alert.checkLatestFailed'));
          return;
        }
        if (!latest.exists) {
          await AlertAsync(t('ProjectEdit.alert.projectGone'));
          return;
        }
        if (isStaleProjectEdit(originalProject.encryptedAt, latest.encryptedAt)) {
          await AlertAsync(t('ProjectEdit.alert.staleProject'));
          return;
        }
      }
      // DEK方式でメンバーがいるのに管理者がオーナー1人だけの場合は注意を促す
      // （オーナーが暗号化キーを失った際の通常の復旧経路は管理者による再共有のため）。
      const willBeDek = isNew ? FUNC_ENCRYPTION && CREATE_DEK_PROJECTS : targetProject.cryptoScheme === 'dek';
      const adminCount = targetProject.members.filter((m) => m.role === 'OWNER' || m.role === 'ADMIN').length;
      if (willBeDek && targetProject.members.length >= 2 && adminCount === 1) {
        const ret = await ConfirmAsync(t('ProjectEdit.confirm.singleAdmin'));
        if (!ret) return;
      }
      // メンバーのuid照会(Functions)と登録確認(Virgil)は数秒かかることがあるので、
      // 照会中からインジケータを出す。checkedProject内の確認ダイアログが出ている間は
      // Loadingが自動で引っ込む（useModalYieldingToDialog）ため重ならない
      setIsLoading(true);
      const checkedProjectResult = await checkedProject();
      if (!checkedProjectResult.isOK || !checkedProjectResult.project) {
        setIsLoading(false);
        // message空文字はユーザーによるキャンセル（エラー表示しない）
        if (checkedProjectResult.message !== '') await AlertAsync(checkedProjectResult.message);
        return;
      }

      if (isNew) {
        await saveNewProject(checkedProjectResult.project);
        setIsLoading(false);
        navigation.navigate('Projects', { reload: true });
      } else {
        await saveUpdatedProject(checkedProjectResult.project);
        setIsLoading(false);
        await AlertAsync(t('hooks.message.updateProjectInfo'));
      }
    } catch (e: any) {
      setIsLoading(false);
      await AlertAsync(e.message);
    }
  }, [checkedProject, isNew, navigation, originalProject, saveNewProject, saveUpdatedProject, targetProject]);

  const pressAddMembers = useCallback(
    (emails: string) => {
      addMembers(emails);
    },
    [addMembers]
  );

  const pressDeleteMember = useCallback(
    (idx: number) => {
      deleteMember(idx);
    },
    [deleteMember]
  );

  const pressReshareMemberKey = useCallback(
    async (idx: number) => {
      try {
        const member = targetProject.members[idx];
        if (!member || !member.uid) {
          await AlertAsync(t('ProjectEdit.alert.reshareKeyNoUid'));
          return;
        }
        const ret = await ConfirmAsync(t('ProjectEdit.confirm.reshareKey'));
        if (!ret) return;
        setIsLoading(true);
        const res = await reshareMemberKey(targetProject, member.uid);
        setIsLoading(false);
        if (!res.isOK) throw new Error(res.message);
        await AlertAsync(t('ProjectEdit.alert.reshareKey'));
        // 再共有により新しいラップになったためバッジを更新する
        refreshMemberKeyFreshness();
      } catch (e: any) {
        setIsLoading(false);
        await AlertAsync(e.message);
      }
    },
    [refreshMemberKeyFreshness, reshareMemberKey, targetProject]
  );

  const gotoBack = useCallback(async () => {
    if (isEdited) {
      const ret = await ConfirmAsync(t('ProjectEdit.confirm.gotoBack'));
      if (!ret) return;
    }
    navigation.navigate('Projects');
  }, [isEdited, navigation]);

  const pressCloudDataManagement = useCallback(async () => {
    try {
      setIsLoading(true);
      // E3Kitグループをロード（セッションが切れている場合のため）
      const loadE3kitGroupResult = await loadE3kitGroup(targetProject);
      if (!loadE3kitGroupResult.isOK) {
        if (await navigateToKeyRestoreIfNeeded(loadE3kitGroupResult.message)) {
          setIsLoading(false);
          return;
        }
        throw new Error(loadE3kitGroupResult.message);
      }
      setIsLoading(false);
      navigation.navigate('CloudDataManagement', {
        previous: 'ProjectEdit',
        project: targetProject,
      });
    } catch (e: any) {
      setIsLoading(false);
      await AlertAsync(e.message);
    }
  }, [loadE3kitGroup, navigateToKeyRestoreIfNeeded, navigation, targetProject]);

  return (
    <ProjectEditContext.Provider
      value={{
        project: targetProject,
        isProjectOpen,
        isEdited,
        isOwner,
        isOwnerAdmin,
        isLoading,
        migrationProgress,
        isNew,
        userUid: user.uid,
        staleKeyUids,
        isAddedMember,
        changeText,
        changeMemberText,
        changeAdmin,
        pressAddMembers,
        pressDeleteMember,
        pressReshareMemberKey,
        pressSaveProject,
        pressOpenProject,
        pressExportProject,
        pressDeleteProject,
        pressSettingProject,
        pressCloudDataManagement,
        gotoBack,
      }}
    >
      <ProjectEdit />
      {conflictState.visible && conflictState.queue.length > 0 && (
        <ConflictResolverModal
          visible={conflictState.visible}
          candidates={conflictState.queue[0].candidates}
          id={conflictState.queue[0].id}
          onSelect={handleSelect}
          onBulkSelect={handleBulkSelect}
        />
      )}
    </ProjectEditContext.Provider>
  );
}
