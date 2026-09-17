import { cloneDeep } from 'lodash';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { getUidsByEmails } from '../lib/firebase/firestore';
import { RootState } from '../store';
import { editSettingsAction } from '../modules/settings';
import { ProjectType, RegionType, UserType, VerifiedType } from '../types';
import { checkDuplicateMember, checkEmails } from '../utils/Project';
import { hasRegisterdUser } from '../lib/virgilsecurity/e3kit';
import { t } from '../i18n/config';
import { isLoggedIn } from '../utils/Account';
import { ConfirmAsync } from '../components/molecules/AlertAsync';

export type UseProjectEditReturnType = {
  user: UserType;
  isProjectOpen: boolean;
  isOwner: boolean;
  isOwnerAdmin: boolean;
  isNew: boolean;
  originalProject: ProjectType;
  targetProject: ProjectType;
  isEdited: boolean;
  projectRegion: RegionType;
  checkedProject: () => Promise<{
    isOK: boolean;
    message: string;
    project: ProjectType | undefined;
  }>;
  openProject: () => void;
  saveProject: (updatedProject: ProjectType) => void;
  startProjectSetting: () => void;
  changeText: (name: string, value: string) => void;
  changeMemberText: (value: string, idx: number) => void;
  changeAdmin: (checked: boolean, idx: number) => void;
  addMembers: (emails: string) => void;
  deleteMember: (idx: number) => void;
};

export const useProjectEdit = (initialProject: ProjectType, isNew: boolean): UseProjectEditReturnType => {
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.user);
  const projectRegion = useSelector((state: RootState) => state.settings.projectRegion, shallowEqual);
  const currentProjectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const projects = useSelector((state: RootState) => state.projects);
  const [targetProject, setTargetProject] = useState<ProjectType>(initialProject);
  const [originalProject, setOriginalProject] = useState<ProjectType>(initialProject);

  const [isEdited, setIsEdited] = useState(false);
  const isProjectOpen = useMemo(() => currentProjectId !== undefined, [currentProjectId]);

  const role = useMemo(
    () => targetProject.members.find((v) => v.uid === user.uid)?.role,
    [targetProject.members, user.uid]
  );
  const isOwnerAdmin = useMemo(() => role === 'OWNER' || role === 'ADMIN', [role]);
  const isOwner = useMemo(() => role === 'OWNER', [role]);

  useEffect(() => {
    // Ownerを先頭にして他はアルファベット順に並び替え
    const sortedMembers = [...initialProject.members].sort((a, b) => {
      if (a.role === 'OWNER' && b.role !== 'OWNER') return -1;
      if (a.role !== 'OWNER' && b.role === 'OWNER') return 1;
      return a.email.localeCompare(b.email);
    });
    setTargetProject({ ...initialProject, members: sortedMembers });
  }, [initialProject]);

  const startProjectSetting = useCallback(() => {
    dispatch(editSettingsAction({ isSettingProject: true }));
  }, [dispatch]);

  const openProject = useCallback(() => {
    //オープンするときは写真はダウンロードしない
    if (!isLoggedIn(user)) throw new Error('no user');
    dispatch(
      editSettingsAction({
        role: role,
        projectId: targetProject.id,
        projectName: targetProject.name,
      })
    );
  }, [dispatch, role, targetProject.id, targetProject.name, user]);

  const updateProjectMembers = useCallback(
    (uids: (string | null)[], hasRegisterd: boolean[]): ProjectType => {
      const updatedProject = cloneDeep(targetProject);
      const members = updatedProject.members.map((member, idx) =>
        hasRegisterd[idx]
          ? { ...member, uid: uids[idx], verified: 'HOLD' as VerifiedType }
          : { ...member, uid: null, verified: 'NO_ACCOUNT' as VerifiedType }
      );
      const membersUid = members.map((v) => v.uid).filter((v): v is string => v !== null);
      const adminsUid = members
        .map((v) => (v.role === 'OWNER' || v.role === 'ADMIN') && v.uid)
        .filter((v): v is string => !!v);

      return { ...updatedProject, membersUid, adminsUid, members: members };

      // ToDo ここの処理をどうするか考える.不要になった？
      //
      // //まだグループに入っていないかもしれないが、ローテーションしたユーザーのために一旦削除処理する。エラーは無視。
      // const { isOK: deleteOK, message: deleteMessage } = await deleteE3kitGroupMembers(
      //   targetProject.id,
      //   targetProject.ownerUid,
      //   uid
      // );
      // if (!deleteOK) {
      //   console.log(deleteMessage);
      // }
    },
    [targetProject]
  );

  // 保留（未登録）メンバーの登録状況を画面表示時に再チェックする。
  // 登録が確認できたメンバーはHOLD（オレンジ）表示に変え、保存ボタンを有効化して
  // 「保存すれば有効になる」ことを管理者に示す（実際の鍵配布・有効化は保存時）。
  useEffect(() => {
    if (isNew) return;
    const pendingEmails = initialProject.members.filter((m) => !m.uid).map((m) => m.email);
    if (pendingEmails.length === 0) return;
    let cancelled = false;
    (async () => {
      const uids = await getUidsByEmails(pendingEmails);
      if (cancelled || uids === undefined) return;
      const resolved = new Map<string, string>();
      pendingEmails.forEach((email, idx) => {
        const uid = uids[idx];
        if (uid) resolved.set(email, uid);
      });
      if (resolved.size === 0) return;
      setTargetProject((prev) => ({
        ...prev,
        members: prev.members.map((m) =>
          !m.uid && resolved.has(m.email)
            ? { ...m, uid: resolved.get(m.email)!, verified: 'HOLD' as VerifiedType }
            : m
        ),
      }));
      setIsEdited(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, initialProject]);

  const checkRegisterdUser = useCallback(async (uids: (string | null)[]) => {
    const registerd = await Promise.all(uids.map(async (uid) => hasRegisterdUser(uid)));
    const hasInvalidAccount = !registerd.every((v) => v === true);
    return { registerd, hasInvalidAccount };
  }, []);

  const checkedProject = useCallback(async () => {
    if (targetProject.name.trim() === '') {
      return { isOK: false, message: t('hooks.message.inputProjectName'), project: undefined };
    }
    if (originalProject.name !== targetProject.name && projects.find((d) => d.name === targetProject.name)) {
      //ToDo 取得後の変更で重複するエラーを防ぐ（まれだと思うが）
      return { isOK: false, message: t('hooks.message.changeProjectName'), project: undefined };
    }

    for (const [idx] of targetProject.members.entries()) {
      if (!checkDuplicateMember(targetProject, idx)) {
        return { isOK: false, message: t('hooks.message.duplicateMembers'), project: undefined };
      }
    }
    const { isOK: emailOK, emails } = checkEmails(targetProject);
    if (!emailOK) {
      return {
        isOK: false,
        message: t('hooks.message.invalidEmail'),
        project: undefined,
      };
    }
    const uids = await getUidsByEmails(emails);
    if (uids === undefined) {
      return { isOK: false, message: t('hooks.message.failUserCheck'), project: undefined };
    }
    const { registerd, hasInvalidAccount } = await checkRegisterdUser(uids);
    const updatedProject = updateProjectMembers(uids, registerd);
    if (hasInvalidAccount) {
      // アカウントが未登録（サインアップ前）または退会済みのメンバーは「保留」（NO_ACCOUNT・赤バッジ）の
      // まま保存できるようにする。membersUid には含まれないためアクセス権は付与されず、
      // 登録後に再度保存するとuidが解決されて有効化される。オーナーが無効な場合のみ中断。
      const invalidMembers = updatedProject.members.filter((m) => m.verified === 'NO_ACCOUNT');
      const hasInvalidOwner = invalidMembers.some((m) => m.role === 'OWNER');
      if (hasInvalidOwner) {
        setTargetProject(updatedProject);
        return {
          isOK: false,
          message: t('hooks.message.invalidAccount'),
          project: updatedProject,
        };
      }
      const emailList = invalidMembers.map((m) => m.email).join('\n');
      const shouldContinue = await ConfirmAsync(`${t('hooks.message.confirmPendingMembers')}\n${emailList}`);
      setTargetProject(updatedProject);
      if (!shouldContinue) {
        // ユーザーによるキャンセル。エラー表示はしない（message空文字が目印）
        return { isOK: false, message: '', project: updatedProject };
      }
      return { isOK: true, message: '', project: updatedProject };
    }
    return {
      isOK: true,
      message: '',
      project: updatedProject,
    };
  }, [checkRegisterdUser, originalProject.name, projects, targetProject, updateProjectMembers]);

  const saveProject = useCallback((updatedProject: ProjectType) => {
    setIsEdited(false);
    setTargetProject(updatedProject);
    setOriginalProject(updatedProject);
  }, []);

  const changeText = useCallback(
    (name: string, value: string) => {
      if (name === 'abstract' && targetProject.abstract !== value) {
        setTargetProject({ ...targetProject, abstract: value });
        setIsEdited(true);
      } else if (name === 'name' && targetProject.name !== value) {
        setTargetProject({ ...targetProject, name: value });
        setIsEdited(true);
      }
    },
    [targetProject]
  );

  const changeMemberText = useCallback(
    (value: string, idx: number) => {
      const members = cloneDeep(targetProject.members);
      members[idx].email = value;
      setTargetProject({ ...targetProject, members: members });
      setIsEdited(true);
    },
    [targetProject]
  );

  const changeAdmin = useCallback(
    (checked: boolean, idx: number) => {
      const members = cloneDeep(targetProject.members);
      members[idx].role = checked ? 'ADMIN' : 'MEMBER';
      const adminsUid = members
        .map((v) => (v.role === 'OWNER' || v.role === 'ADMIN') && v.uid)
        .filter((v): v is string => !!v);
      setTargetProject({ ...targetProject, adminsUid, members });
      setIsEdited(true);
    },
    [targetProject]
  );

  const addMembers = useCallback(
    (emails: string) => {
      //,か、空白か、改行で区切る
      const values = emails
        .trim()
        .split(/,|\s|\r\n|\r|\n/)
        .filter((v) => v !== '');
      const members = cloneDeep(targetProject.members);
      values.forEach((email) => {
        if (email === '') return;
        if (members.find((v) => v.email === email)) return;
        members.push({ uid: '', email: email, verified: 'NO_ACCOUNT', role: 'MEMBER' });
      });
      setTargetProject({ ...targetProject, members });
      setIsEdited(true);
    },
    [targetProject]
  );

  const deleteMember = useCallback(
    (idx: number) => {
      const members = cloneDeep(targetProject.members);
      members.splice(idx, 1);
      const membersUid = members.map((v) => v.uid).filter((v): v is string => v !== null);
      const adminsUid = members
        .map((v) => (v.role === 'OWNER' || v.role === 'ADMIN') && v.uid)
        .filter((v): v is string => !!v);
      setTargetProject({ ...targetProject, membersUid, adminsUid, members });
      setIsEdited(true);
    },
    [targetProject]
  );

  return {
    user,
    isProjectOpen,
    isOwner,
    isOwnerAdmin,
    isNew,
    targetProject,
    originalProject,
    isEdited,
    projectRegion,
    checkedProject,
    openProject,
    saveProject,
    startProjectSetting,
    changeText,
    changeMemberText,
    changeAdmin,
    addMembers,
    deleteMember,
  } as const;
};
