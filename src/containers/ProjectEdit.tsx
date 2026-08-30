import React, { useState, useCallback, useEffect } from 'react';
import ProjectEdit from '../components/pages/ProjectEdit';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
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
import { ProjectType } from '../types';
import { FUNC_ENCRYPTION, CREATE_DEK_PROJECTS, ENABLE_DEK_SELF_MIGRATION, ENABLE_KEY_LEDGER } from '../constants/AppConstants';
import { getKeyMigrationState } from '../lib/crypto/migration';
import { getMemberKeyFreshness, migrateSelfDataToDEK, SelfMigrationInputType } from '../lib/firebase/firestore';
import dayjs from '../i18n/dayjs';
import { useEcorisMapFile } from '../hooks/useEcorismapFile';
import { ConflictResolverModal } from '../components/organisms/HomeModalConflictResolver';

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
    openProject,
    startProjectSetting,
  } = useProjectEdit(route.params.project, route.params.isNew);

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
      });
      if (!mergedDataResult.isOK) throw new Error(mergedDataResult.message);

      // 自己DEK移行(Phase iii)の入力。ここで取得済みの判定情報と復号済みデータを返すことで、
      // 移行処理からの追加ダウンロードをゼロにする
      return {
        unmarkedGroups: [...(privateRes.unmarkedDekGroups ?? []), ...(publicRes.unmarkedDekGroups ?? [])],
        privateData: privateRes.data,
        publicData: publicRes.data,
      };
    },
    [createMergedDataSet, downloadCommonData, fetchPrivateData, fetchPublicData, fetchTemplateData, targetProject]
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
        message:
          migrationState.state === 'migrated-need-restore'
            ? t('hooks.message.inputNewPinRestore')
            : t('hooks.message.inputEncryptPassword'),
        previous: 'Projects',
      });
      return true;
    },
    [navigation, user.uid]
  );

  const pressOpenProject = useCallback(
    async (isSetting: boolean) => {
      try {
        if (isProjectOpen) {
          const ret = await ConfirmAsync(t('Home.confirm.reOpenProject'));
          if (!ret) return false;
        }

        //通常はユーザーとして自分のデータのみ取得する。管理者は取得時に全てのデータを取得できる。
        //ただしWeb版は集計・確認作業が中心のため、管理者には開く時点で他メンバーのプライベートデータも取得するか確認する。
        let isAdmin = false;
        if (!isSetting && Platform.OS === 'web' && isOwnerAdmin) {
          isAdmin = await ConfirmAsync(t('ProjectEdit.confirm.downloadAllUserData'));
        }

        setIsLoading(true);
        const loadE3kitGroupResult = await loadE3kitGroup(targetProject);
        if (!loadE3kitGroupResult.isOK) {
          if (await navigateToKeyRestoreIfNeeded(loadE3kitGroupResult.message)) {
            setIsLoading(false);
            return false;
          }
          throw new Error(loadE3kitGroupResult.message);
        }

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
        await AlertAsync(e.message);
        return false;
      }
    },
    [
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
      saveProject(e3kitGroupResult.project);
    },
    [originalProject, saveProject, updateE3kitGroupMembers, updateProject]
  );

  const saveNewProject = useCallback(
    async (project: ProjectType) => {
      const e3kitGroupResult = await createE3kitGroup(project);
      if (!e3kitGroupResult.isOK || !e3kitGroupResult.project) throw new Error(e3kitGroupResult.message);
      const createProjectResult = await createProject(e3kitGroupResult.project);
      if (!createProjectResult.isOK) throw new Error(createProjectResult.message);
    },
    [createE3kitGroup, createProject]
  );

  const pressSaveProject = useCallback(async () => {
    try {
      // DEK方式でメンバーがいるのに管理者がオーナー1人だけの場合は注意を促す
      // （オーナーが暗号化キーを失った際の通常の復旧経路は管理者による再共有のため）。
      const willBeDek = isNew ? FUNC_ENCRYPTION && CREATE_DEK_PROJECTS : targetProject.cryptoScheme === 'dek';
      const adminCount = targetProject.members.filter((m) => m.role === 'OWNER' || m.role === 'ADMIN').length;
      if (willBeDek && targetProject.members.length >= 2 && adminCount === 1) {
        const ret = await ConfirmAsync(t('ProjectEdit.confirm.singleAdmin'));
        if (!ret) return;
      }
      setIsLoading(true);
      const checkedProjectResult = await checkedProject();
      if (!checkedProjectResult.isOK || !checkedProjectResult.project) throw new Error(checkedProjectResult.message);

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
  }, [checkedProject, isNew, navigation, saveNewProject, saveUpdatedProject, targetProject]);

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
