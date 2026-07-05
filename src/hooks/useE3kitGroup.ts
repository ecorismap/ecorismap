import { cloneDeep } from 'lodash';
import { useCallback } from 'react';
import { t } from '../i18n/config';
import {
  addGroupMembers,
  clearPublicKeyCache,
  createGroup,
  deleteGroup,
  deleteGroupMembers,
  initializeUser,
  loadGroup,
} from '../lib/virgilsecurity/e3kit';
import { addMemberKey, clearProjectCryptoCache, removeMemberKey, migrateProjectToDEK } from '../lib/firebase/firestore';
import { FUNC_ENCRYPTION, CREATE_DEK_PROJECTS, ENABLE_DEK_MIGRATION } from '../constants/AppConstants';
import { ProjectType, VerifiedType } from '../types';

/** DEK（エンベロープ暗号）方式のプロジェクトか。未設定は従来のグループ暗号。 */
const isDek = (project: ProjectType) => project.cryptoScheme === 'dek';

export type UseE3kitGroupReturnType = {
  loadE3kitGroup: (project: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  createE3kitGroup: (project: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
    project: ProjectType;
  }>;
  updateE3kitGroupMembers: (
    originalProject: ProjectType,
    updateProject: ProjectType
  ) => Promise<{
    isOK: boolean;
    message: string;
    project: ProjectType;
  }>;
  deleteE3kitGroupMembers: (
    projectId: string,
    ownerUid: string,
    uid: string
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  deleteE3kitGroup: (project: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  reshareMemberKey: (
    project: ProjectType,
    uid: string
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
};

export const useE3kitGroup = (): UseE3kitGroupReturnType => {
  const loadE3kitGroup = async (project: ProjectType) => {
    // プロジェクトを開くたびにDEKキャッシュをクリアして keys/{uid} を再unwrapさせる。
    // （鍵の再共有を受けた後、開き直すだけで復号が回復するようにするため）
    clearProjectCryptoCache();
    // まずE3Kitが初期化されているか確認
    const initResult = await initializeUser(project.ownerUid);
    if (!initResult.isOK) {
      console.error('[loadE3kitGroup] E3Kit initialization failed:', initResult.message);
      return { isOK: false, message: initResult.message };
    }

    // DEK方式はグループをロードしない（DEKは復号時に keys/{uid} から遅延取得される）。
    if (isDek(project)) return { isOK: true, message: '' };

    const { isOK } = await loadGroup(project.id, project.ownerUid);
    if (!isOK) {
      return { isOK: false, message: t('hooks.message.failLoadE3kitGroup') };
    }
    return { isOK: true, message: '' };
  };

  const createE3kitGroup = useCallback(async (project: ProjectType) => {
    const useDek = FUNC_ENCRYPTION && CREATE_DEK_PROJECTS;
    if (!useDek) {
      // 従来のグループ暗号方式（フラグOFF/暗号無効時）: Virgilグループを作成する。
      const addedMembers = project.members.map((d) => d.verified === 'HOLD' && d.uid).filter((v): v is string => !!v);
      const result = await createGroup(project.id, addedMembers);
      if (!result.isOK) {
        return { isOK: false, message: t('hooks.message.failCreateE3kitGroup'), project };
      }
    }
    // DEK方式ではグループを作らない（DEKの生成・配布は addProject が行う）。
    // 共通: HOLD のメンバーを OK に更新し、暗号方式をin-memoryでも一致させる。
    const members = cloneDeep(project.members);
    const updatedMembers = members.map((d) =>
      d.verified === 'HOLD' ? { ...d, verified: 'OK' as VerifiedType } : d
    );
    const cryptoScheme: ProjectType['cryptoScheme'] = useDek ? 'dek' : 'group';
    return { isOK: true, message: '', project: { ...project, members: updatedMembers, cryptoScheme } };
  }, []);

  const deleteE3kitGroup = useCallback(async (project: ProjectType) => {
    // DEK方式: keys サブコレクションはプロジェクト削除時に Cloud Functions が連鎖削除するため何もしない。
    if (isDek(project)) return { isOK: true, message: '' };

    const participants = project.membersUid.filter((v) => v !== project.ownerUid);
    if (participants.length > 0) {
      const { isOK } = await deleteGroupMembers(project.id, project.ownerUid, participants);
      if (!isOK) {
        return { isOK: false, message: t('hooks.message.failDeleteE3kitGroup') };
      }
    }
    const { isOK } = await deleteGroup(project.id);
    if (!isOK) {
      return { isOK: false, message: t('hooks.message.failDeleteGroup') };
    }
    return { isOK: true, message: '' };
  }, []);

  const deleteE3kitGroupMembers = useCallback(async (projectId: string, ownerUid: string, uid: string) => {
    // DEKのkeysを削除しつつ、旧グループからも除去を試みる（どちらかは存在しないがエラーは無視）。
    await removeMemberKey(projectId, uid);
    const { isOK } = await deleteGroupMembers(projectId, ownerUid, [uid]);
    if (!isOK) {
      return { isOK: false, message: t('hooks.message.failDeleteGroupMembers') };
    }
    return { isOK: true, message: '' };
  }, []);

  const updateE3kitGroupMembers = useCallback(async (originalProject: ProjectType, updateProject: ProjectType) => {
    const addedMembers = updateProject.membersUid.filter((d) => originalProject.membersUid.indexOf(d) === -1);
    const deletedMembers = originalProject.membersUid.filter((d) => updateProject.membersUid.indexOf(d) === -1);

    // Phase ii(遅延移行): 旧グループ方式のプロジェクトで管理者がメンバーを増減した時にDEKへ移行する。
    // 移行後はDEK方式として以降の鍵配布(addMemberKey/removeMemberKey)に進む。
    let project = updateProject;
    if (
      FUNC_ENCRYPTION &&
      ENABLE_DEK_MIGRATION &&
      !isDek(project) &&
      (addedMembers.length > 0 || deletedMembers.length > 0)
    ) {
      const initResult = await initializeUser(project.ownerUid);
      if (!initResult.isOK) {
        return { isOK: false, message: initResult.message, project };
      }
      // 既存メンバーへの配布は originalProject を基準にする（新メンバーは後段の addMemberKey で追加）。
      const migrateRes = await migrateProjectToDEK(originalProject);
      if (!migrateRes.isOK) {
        return { isOK: false, message: migrateRes.message, project };
      }
      project = { ...project, cryptoScheme: 'dek' };
    }

    if (isDek(project)) {
      // DEK方式: 任意の管理者が新メンバーの公開鍵でDEKをラップする（オーナー不要）。
      // unwrap/wrap に eThree を使うため初期化を保証する。
      const initResult = await initializeUser(project.ownerUid);
      if (!initResult.isOK) {
        return { isOK: false, message: initResult.message, project };
      }
      for (const uid of addedMembers) {
        const res = await addMemberKey(project.id, uid);
        if (!res.isOK) {
          return {
            isOK: false,
            message: res.message || t('hooks.message.failAddGroupMembers'),
            project,
          };
        }
      }
      for (const uid of deletedMembers) {
        await removeMemberKey(project.id, uid);
      }
    } else {
      // 従来のグループ暗号（既存プロジェクト）: 参加者変更はオーナーのみ可能。
      if (addedMembers.length > 0) {
        const addedResult = await addGroupMembers(project.id, project.ownerUid, addedMembers);
        if (!addedResult.isOK) {
          return { isOK: false, message: t('hooks.message.failAddGroupMembers'), project };
        }
      }
      if (deletedMembers.length > 0) {
        const deletedResult = await deleteGroupMembers(project.id, project.ownerUid, deletedMembers);
        if (!deletedResult.isOK) {
          return { isOK: false, message: t('hooks.message.failDeleteGroupMembers'), project };
        }
      }
    }

    const members = cloneDeep(project.members);
    const updatedMembers = members.map((d) =>
      d.verified === 'HOLD' ? { ...d, verified: 'OK' as VerifiedType } : d
    );

    return { isOK: true, message: '', project: { ...project, members: updatedMembers } };
  }, []);

  const reshareMemberKey = useCallback(async (project: ProjectType, uid: string) => {
    if (!FUNC_ENCRYPTION) return { isOK: true, message: '' };
    // DEK方式専用: 暗号化キーをリセットした相手の新しい公開鍵でDEKを再ラップする。
    // 管理者は任意のメンバーへ、一般メンバーはオーナー宛てのみ実行できる（Rulesで制限）。
    if (!isDek(project)) {
      return { isOK: false, message: t('hooks.message.failReshareKey') };
    }
    // unwrap/wrap に eThree を使うため初期化を保証する。
    const initResult = await initializeUser(project.ownerUid);
    if (!initResult.isOK) {
      return { isOK: false, message: initResult.message };
    }
    // 対象メンバーの旧公開鍵がキャッシュに残っていると旧鍵で再ラップしてしまうため必ずクリアする。
    clearPublicKeyCache();
    let res = await addMemberKey(project.id, uid);
    if (!res.isOK) {
      // 実行者側のDEKキャッシュに開封失敗(undefined)が焼き付いている場合を救済して1回だけ再試行する。
      clearProjectCryptoCache();
      res = await addMemberKey(project.id, uid);
    }
    if (!res.isOK) {
      return { isOK: false, message: res.message || t('hooks.message.failReshareKey') };
    }
    return { isOK: true, message: '' };
  }, []);

  return {
    loadE3kitGroup,
    createE3kitGroup,
    updateE3kitGroupMembers,
    deleteE3kitGroupMembers,
    deleteE3kitGroup,
    reshareMemberKey,
  } as const;
};
