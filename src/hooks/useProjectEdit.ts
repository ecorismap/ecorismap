import { cloneDeep } from 'lodash';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { getUidsByEmails } from '../lib/firebase/firestore';
import { RootState } from '../store';
import { editSettingsAction } from '../modules/settings';
import { clearDataSyncProjectAction } from '../modules/dataSync';
import { ProjectType, RegionType, UserType, VerifiedType } from '../types';
import { checkDuplicateMember, checkEmails, hasDuplicateMemberUid, normalizeMemberEmail } from '../utils/Project';
import { hasRegisterdUser, initializeUser, isInitialized } from '../lib/virgilsecurity/e3kit';
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
  discardSyncBaselines: () => void;
  saveProject: (updatedProject: ProjectType) => void;
  startProjectSetting: () => void;
  changeText: (name: string, value: string) => void;
  changeMemberText: (value: string, idx: number) => void;
  changeAdmin: (checked: boolean, idx: number) => void;
  addMembers: (emails: string) => void;
  deleteMember: (idx: number) => void;
  /** 保存前にこの画面で追加した行か。管理者でも打ち間違いを直したり消したりできるようにする */
  isAddedMember: (idx: number) => boolean;
};

/**
 * メンバーの登録確認（Virgil Cards の照会）は E3Kit の初期化が前提。プロジェクト一覧は永続化から表示されるため、
 * 起動し直したあとプロジェクトを開かず一覧の「更新」もしないと未初期化のままここへ来て、
 * 「Cannot read property 'findUsers' of undefined」で保存できなかった。照会の前に済ませておく。
 */
const ensureEncryptionReady = async (uid: string | undefined): Promise<boolean> => {
  if (isInitialized()) return true;
  if (!uid) return false;
  const { isOK } = await initializeUser(uid);
  return isOK;
};

export const useProjectEdit = (initialProject: ProjectType, isNew: boolean): UseProjectEditReturnType => {
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.user);
  const projectRegion = useSelector((state: RootState) => state.settings.projectRegion, shallowEqual);
  const currentProjectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const projects = useSelector((state: RootState) => state.projects);
  const [targetProject, setTargetProject] = useState<ProjectType>(initialProject);
  const [originalProject, setOriginalProject] = useState<ProjectType>(initialProject);

  // members と同じ並びで「保存前にこの画面で追加した行」を持つ。メールで照合すると、入力途中に既存メンバーと
  // 同じ文字列になった瞬間に編集不可へ切り替わってしまうので、行の位置で持つ（A-L17）
  const [addedMemberFlags, setAddedMemberFlags] = useState<boolean[]>([]);

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
    setAddedMemberFlags(sortedMembers.map(() => false));
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
        // 設定モードのまま通常の「開く」をすると設定モードが残り、「保存」で自分の記録がテンプレートとして
        // 配られてしまう。設定モードの入口は開いた後に startProjectSetting で立て直す
        isSettingProject: false,
        projectSessionUid: user.uid,
      })
    );
  }, [dispatch, role, targetProject.id, targetProject.name, user]);

  // 開く処理は手元のデータを捨ててクラウドから取り直す。途中で失敗すると手元は空や別プロジェクトの構成のまま
  // 今のプロジェクトの名前で残るので、開く先だけでなく今開いているプロジェクトの基準値も捨て、
  // 次のアップロードで必ず内容を比べさせる（確認なしにクラウドの自分のデータを置き換えさせない）
  const discardSyncBaselines = useCallback(() => {
    dispatch(clearDataSyncProjectAction(targetProject.id));
    if (currentProjectId !== undefined && currentProjectId !== targetProject.id) {
      dispatch(clearDataSyncProjectAction(currentProjectId));
    }
  }, [currentProjectId, dispatch, targetProject.id]);

  const updateProjectMembers = useCallback(
    (baseProject: ProjectType, uids: (string | null)[], hasRegisterd: boolean[]): ProjectType => {
      const updatedProject = cloneDeep(baseProject);
      // 既存プロジェクトで保存済みの有効メンバーは OK のまま残す。一律に HOLD にすると、保留の確認で
      // キャンセルしたり保存に失敗したりしたとき全員がオレンジになり、鍵の再共有も押せなくなる。
      // 新規作成では createE3kitGroup が HOLD を参加者の抽出に使うので HOLD にする
      const isSavedActiveMember = (uid: string | null) =>
        !isNew &&
        uid !== null &&
        originalProject.membersUid.includes(uid) &&
        originalProject.members.some((m) => m.uid === uid && m.verified === 'OK');
      const members = updatedProject.members.map((member, idx) =>
        hasRegisterd[idx]
          ? {
              ...member,
              uid: uids[idx],
              verified: (isSavedActiveMember(uids[idx]) ? 'OK' : 'HOLD') as VerifiedType,
            }
          : { ...member, uid: null, verified: 'NO_ACCOUNT' as VerifiedType }
      );
      // 同じ uid の行が残っていても配列には一度だけ入れる（Rules は重複を拒まない）
      const membersUid = [...new Set(members.map((v) => v.uid).filter((v): v is string => v !== null))];
      const adminsUid = [
        ...new Set(
          members.map((v) => (v.role === 'OWNER' || v.role === 'ADMIN') && v.uid).filter((v): v is string => !!v)
        ),
      ];

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
    [isNew, originalProject]
  );

  // 保留（未登録）メンバーの登録状況を画面表示時に再チェックする。
  // 登録が確認できたメンバーはHOLD（オレンジ）表示に変え、保存ボタンを有効化して
  // 「保存すれば有効になる」ことを管理者に示す（実際の鍵配布・有効化は保存時）。
  useEffect(() => {
    if (isNew) return;
    const pendingEmails = initialProject.members.filter((m) => !m.uid).map((m) => m.email);
    if (pendingEmails.length === 0) return;
    // 保存できるのはオーナー・管理者だけ。一般メンバーで変更ありにすると保存ボタンが無いまま
    // 「開く」が無効になり、プロジェクトを開けなくなる
    const myRole = initialProject.members.find((m) => m.uid === user.uid)?.role;
    const canSave = myRole === 'OWNER' || myRole === 'ADMIN';
    let cancelled = false;
    (async () => {
      try {
        const uids = await getUidsByEmails(pendingEmails);
        if (cancelled || uids === undefined) return;
        if (!(await ensureEncryptionReady(user.uid)) || cancelled) return;
        // 保存時は暗号化キー（Virgil）の登録まで確かめて未登録なら保留に戻すので、ここでも同じ基準で判定する。
        // Firebase だけで判定すると、キー未登録の人が開くたびにオレンジになり保存しても赤に戻る
        const registered = await Promise.all(
          pendingEmails.map(async (_email, idx) => {
            const uid = uids[idx];
            return uid ? hasRegisterdUser(uid) : false;
          })
        );
        if (cancelled) return;
        const resolved = new Map<string, string>();
        pendingEmails.forEach((email, idx) => {
          const uid = uids[idx];
          if (uid && registered[idx]) resolved.set(normalizeMemberEmail(email), uid);
        });
        if (resolved.size === 0) return;
        setTargetProject((prev) => ({
          ...prev,
          members: prev.members.map((m) => {
            const uid = resolved.get(normalizeMemberEmail(m.email));
            return !m.uid && uid !== undefined ? { ...m, uid, verified: 'HOLD' as VerifiedType } : m;
          }),
        }));
        if (canSave) setIsEdited(true);
      } catch (e) {
        // 再チェックは表示の補助。照会に失敗しても保留表示のままにし、保存時に改めて判定させる
        console.log('[useProjectEdit] pending member recheck failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, initialProject, user.uid]);

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
    // 照会・保存は小文字にそろえたメールで行う。大文字小文字の違いを残すと、次の比較でまた別人扱いになる
    const normalizedProject: ProjectType = {
      ...targetProject,
      members: targetProject.members.map((m) => ({ ...m, email: normalizeMemberEmail(m.email) })),
    };
    const { isOK: emailOK, emails } = checkEmails(normalizedProject);
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
    if (!(await ensureEncryptionReady(user.uid))) {
      return { isOK: false, message: t('hooks.message.failedInitializeEncrypt'), project: undefined };
    }
    const { registerd, hasInvalidAccount } = await checkRegisterdUser(uids);
    const updatedProject = updateProjectMembers(normalizedProject, uids, registerd);
    // 別のメール（別名・旧アドレスなど）が同じアカウントに解決された。行ごとに役割が違うと、片方で管理者を外しても
    // 権限が残り表示と食い違うので、保存前に止めてどちらかの行を消してもらう
    if (hasDuplicateMemberUid(updatedProject)) {
      return { isOK: false, message: t('hooks.message.duplicateMemberAccounts'), project: undefined };
    }
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
  }, [checkRegisterdUser, originalProject.name, projects, targetProject, updateProjectMembers, user.uid]);

  const saveProject = useCallback((updatedProject: ProjectType) => {
    setIsEdited(false);
    setTargetProject(updatedProject);
    setOriginalProject(updatedProject);
    setAddedMemberFlags(updatedProject.members.map(() => false));
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
      if (targetProject.members[idx].email === value) return;
      const members = cloneDeep(targetProject.members);
      // メールを書き換えた行は別の人になりうる。元の人の uid・バッジのまま残すと、表示や鍵の再共有が
      // 元の人に向いてしまう。保存時に全メールを解決し直すので、それまでは未確認として扱う
      members[idx] = { ...members[idx], email: value, uid: null, verified: 'NO_ACCOUNT' };
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
      let addedCount = 0;
      values.forEach((value) => {
        const email = normalizeMemberEmail(value);
        if (email === '') return;
        if (members.find((v) => normalizeMemberEmail(v.email) === email)) return;
        members.push({ uid: '', email: email, verified: 'NO_ACCOUNT', role: 'MEMBER' });
        addedCount++;
      });
      // 既存メンバーと重なる・空白だけなど、1人も増えなければ何も変えない。編集ありにすると、
      // 何も変わっていないのに戻るときに「変更を破棄しますか？」が出る
      if (addedCount === 0) return;
      setTargetProject({ ...targetProject, members });
      setAddedMemberFlags((prev) => [
        ...targetProject.members.map((_, i) => prev[i] === true),
        ...Array.from({ length: addedCount }, () => true),
      ]);
      setIsEdited(true);
    },
    [targetProject]
  );

  const deleteMember = useCallback(
    (idx: number) => {
      const members = cloneDeep(targetProject.members);
      members.splice(idx, 1);
      setAddedMemberFlags((prev) => prev.filter((_, i) => i !== idx));
      const membersUid = members.map((v) => v.uid).filter((v): v is string => v !== null);
      const adminsUid = members
        .map((v) => (v.role === 'OWNER' || v.role === 'ADMIN') && v.uid)
        .filter((v): v is string => !!v);
      setTargetProject({ ...targetProject, membersUid, adminsUid, members });
      setIsEdited(true);
    },
    [targetProject]
  );

  const isAddedMember = useCallback((idx: number) => addedMemberFlags[idx] === true, [addedMemberFlags]);

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
    discardSyncBaselines,
    saveProject,
    startProjectSetting,
    changeText,
    changeMemberText,
    changeAdmin,
    addMembers,
    deleteMember,
    isAddedMember,
  } as const;
};
