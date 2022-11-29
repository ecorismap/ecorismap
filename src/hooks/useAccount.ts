import { Dispatch, SetStateAction, useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as firebase from '../lib/firebase/sign-in';
import { createUserInitialState, setUserAction } from '../modules/user';
import { Platform } from 'react-native';
import { initFirebaseAuth } from '../lib/firebase/sign-in.web';

import { AppState } from '../modules';
import { AccountFormStateType, UserType } from '../types';
import { formattedInputs } from '../utils/Format';
import * as e3kit from '../lib/virgilsecurity/e3kit';
import { editSettingsAction } from '../modules/settings';
import { getAllProjects } from '../lib/firebase/firestore';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { hasLoggedIn } from '../utils/Account';
import { createLayersInitialState, setLayersAction } from '../modules/layers';
import { createDataSetInitialState, setDataSetAction } from '../modules/dataSet';
import { createTileMapsInitialState, setTileMapsAction } from '../modules/tileMaps';
import { hasOpened } from '../utils/Project';
import { createProjectsInitialState, setProjectsAction } from '../modules/projects';
import * as projectStore from '../lib/firebase/firestore';
import * as projectStorage from '../lib/firebase/storage';
import { t } from '../i18n/config';
import { FUNC_LOGIN } from '../constants/AppConstants';

export type UseAccountReturnType = {
  user: UserType;
  accountMessage: string;
  accountFormState: AccountFormStateType | undefined;
  setAccountFormState: Dispatch<SetStateAction<AccountFormStateType | undefined>>;
  setAccountMessage: Dispatch<SetStateAction<string>>;
  login: (email: string, password: string) => Promise<{ isOK: boolean }>;
  signUp: (email: string, password: string) => Promise<{ isOK: boolean }>;
  logout: (cleanupLocalEncryptkey?: boolean) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  resetUserPassword: (email: string) => Promise<{ isOK: boolean }>;
  updateUserProfile: (displayName: string, photoURL: string) => Promise<{ isOK: boolean }>;
  changeUserPassword: (oldPassword: string, password: string) => Promise<{ isOK: boolean }>;
  deleteUserAccount: (password: string) => Promise<{ isOK: boolean }>;
  changeEncryptPassword: (oldPassword: string, password: string) => Promise<{ isOK: boolean }>;
  registEncryptPassword: (password: string) => Promise<{ isOK: boolean }>;
  backupEncryptPassword: (password: string) => Promise<{ isOK: boolean }>;
  restoreEncryptKey: (password: string) => Promise<{ isOK: boolean }>;
  resetEncryptKey: (password: string) => Promise<{
    isOK: boolean;
  }>;
  deleteAllProjects: (password: string) => Promise<{
    isOK: boolean;
    message: string;
  }>;
};

export const useAccount = (accountFormState_?: AccountFormStateType, message?: string): UseAccountReturnType => {
  const dispatch = useDispatch();
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const user = useSelector((state: AppState) => state.user);
  const tracking = useSelector((state: AppState) => state.settings.tracking);
  const [accountMessage, setAccountMessage] = useState(message ? message : '');
  const [accountFormState, setAccountFormState] = useState(accountFormState_);

  const login = useCallback(
    async (email: string, password: string): Promise<{ isOK: boolean }> => {
      const emailCheck = formattedInputs(email, 'email');
      if (!emailCheck.isOK) {
        setAccountMessage(t('hooks.message.inputValidMail'));
        return { isOK: false };
      }
      const passwordCheck = formattedInputs(password, 'password');
      if (!passwordCheck.isOK) {
        setAccountMessage(t('hooks.message.inputValidPassword'));
        return { isOK: false };
      }

      const { isOK: signInOK, message: signInMessage, authUser } = await firebase.signInWithEmail(email, password);
      if (!signInOK || authUser === undefined) {
        if (signInMessage === 'auth/wrong-password') {
          //setAccountMessage('パスワードが間違っています。');
        } else if (signInMessage === 'auth/user-not-found') {
          //setAccountMessage('ユーザーが存在しません。');
        } else if (signInMessage === 'auth/too-many-requests') {
          //setAccountMessage('しばらくしてから試すかパスワードをリセットしてください。');
        } else {
          //setAccountMessage('不明なエラーです。');
        }
        setAccountMessage(t('hooks.message.invalidEmailOrPassword'));
        return { isOK: false };
      }
      if (!authUser.emailVerified) {
        setAccountMessage(t('hooks.message.noActivate'));
        const ret = await ConfirmAsync(t('hooks.confirm.sendMailForActivate'));
        if (ret) {
          await firebase.confirmEmail();
          await AlertAsync(t('hooks.alert.pleaseActivate'));
        }
        t('hooks.message.pleaseActivate');
        return { isOK: false };
      }
      dispatch(
        setUserAction({
          uid: authUser.uid,
          email: authUser.email,
          displayName: authUser.displayName,
          photoURL: authUser.photoURL,
        })
      );

      const { isOK: initE3kitOK, message: initE3kitMessage } = await e3kit.initializeUser(authUser.uid);
      if (!initE3kitOK) {
        if (initE3kitMessage === 'not-registered') {
          setAccountMessage(t('hooks.message.registEncryptPassword'));
          setAccountFormState('registEncryptPassword');
        } else if (initE3kitMessage === 'not-localkey') {
          setAccountMessage(t('hooks.message.inputEncryptPassword'));
          setAccountFormState('restoreEncryptKey');
        } else if (initE3kitMessage === 'not-backup') {
          setAccountMessage(t('hooks.message.registEncryptPassword'));
          setAccountFormState('backupEncryptPassword');
        } else {
          setAccountMessage(t('hooks.message.errorInitEncrypt'));
        }
        return { isOK: false };
      }

      setAccountMessage('');
      return { isOK: true };
    },
    [dispatch]
  );

  const logout = useCallback(
    async (cleanupLocalEncryptkey: boolean = false) => {
      if (tracking !== undefined) {
        return { isOK: false, message: t('hooks.message.finishTrackking') };
      }

      if (cleanupLocalEncryptkey) {
        await e3kit.cleanupEncryptKey();
      }
      await firebase.signOut();

      dispatch(setUserAction(createUserInitialState()));
      dispatch(setProjectsAction(createProjectsInitialState()));

      //プロジェクトに入ってたらデータ、レイヤ、地図情報を初期状態にする。
      if (hasOpened(projectId)) {
        dispatch(
          editSettingsAction({
            role: undefined,
            isSettingProject: false,
            isSynced: false,
            projectId: undefined,
            projectName: undefined,
            tracking: undefined,
          })
        );
        dispatch(setLayersAction(createLayersInitialState()));
        dispatch(setDataSetAction(createDataSetInitialState()));
        dispatch(setTileMapsAction(createTileMapsInitialState()));
      }
      return { isOK: true, message: '' };
    },
    [dispatch, projectId, tracking]
  );

  const resetUserPassword = useCallback(async (email: string) => {
    const { isOK: emailOK } = formattedInputs(email, 'email');
    if (!emailOK) {
      setAccountMessage(t('hooks.message.inputValidMail'));
      return { isOK: false };
    }
    const response = await firebase.sendPasswordResetEmail(email);
    if (response === 'auth/user-not-found') {
      setAccountMessage(t('hooks.message.noUser'));
      return { isOK: false };
    }
    setAccountMessage('');
    return { isOK: true };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const emailCheck = formattedInputs(email, 'email');
    if (!emailCheck.isOK) {
      setAccountMessage(t('hooks.message.inputValidMail'));
      return { isOK: false };
    }
    const passwordCheck = formattedInputs(password, 'password');
    if (!passwordCheck.isOK) {
      setAccountMessage(t('hooks.message.inputValidPassword'));
      return { isOK: false };
    }

    const displayName = email.substring(0, email.lastIndexOf('@'));
    const {
      isOK: signUpOK,
      message: signUpMessage,
      authUser,
    } = await firebase.signUpWithEmail(email, password, displayName);
    if (!signUpOK || authUser === undefined) {
      if (signUpMessage === 'auth/email-already-in-use') {
        setAccountMessage(t('hooks.message.emailInUse'));
      } else if (signUpMessage === 'auth/invalid-email') {
        setAccountMessage(t('hooks.message.invalidEmail'));
      } else if (signUpMessage === 'profile/fail-update') {
        setAccountMessage(t('hooks.message.failSetProfile'));
      } else {
        setAccountMessage(t('hooks.message.unknownError'));
      }
      return { isOK: false };
    }
    const sending = await firebase.confirmEmail();
    if (sending === 'error') {
      setAccountMessage(t('hooks.message.unknownError'));
      return { isOK: false };
    }
    setAccountMessage('');
    return { isOK: true };
  }, []);

  const updateUserProfile = useCallback(
    async (displayName: string, photoURL: string) => {
      const displayNameCheck = formattedInputs(displayName, 'STRING', false);
      if (!displayNameCheck.isOK) {
        setAccountMessage(t('hooks.message.inputValidDisplayName'));
        return { isOK: false };
      }
      const photoURLCheck = formattedInputs(photoURL, 'STRING', false);
      if (!photoURLCheck.isOK) {
        setAccountMessage(t('hooks.message.inputValidIconURL'));
        return { isOK: false };
      }
      const { isOK, authUser } = await firebase.updateProfile(displayName, photoURL);
      if (!isOK || authUser === undefined) {
        setAccountMessage(t('hooks.message.failUpdateProfile'));
        return { isOK: false };
      }
      dispatch(
        setUserAction({
          uid: authUser.uid,
          email: authUser.email,
          displayName: authUser.displayName,
          photoURL: authUser.photoURL,
        })
      );
      setAccountMessage('');
      return { isOK: true };
    },
    [dispatch]
  );

  const changeUserPassword = useCallback(async (oldPassword: string, password: string) => {
    const passwordCheck = formattedInputs(password, 'password', false);
    if (!passwordCheck.isOK) {
      setAccountMessage(t('hooks.message.inputValidUpdatePassword'));
      return { isOK: false };
    }
    const { isOK } = await firebase.changePassword(oldPassword, password);

    if (!isOK) {
      setAccountMessage(`パスワードの変更に失敗しました。
変更前のパスワードは正しいですか？`);
      return { isOK: false };
    }

    setAccountMessage('');
    return { isOK: true };
  }, []);

  const checkUserPassword = useCallback(async (password: string) => {
    const passwordCheck = formattedInputs(password, 'password', false);
    if (!passwordCheck.isOK) {
      setAccountMessage(t('hooks.message.inputValidPassword'));
      return { isOK: false };
    }
    const { isOK } = await firebase.checkPassword(password);
    if (!isOK) {
      setAccountMessage(`パスワードが違います。`);
      return { isOK: false };
    }
    setAccountMessage('');
    return { isOK: true };
  }, []);

  const changeEncryptPassword = useCallback(async (oldPassword: string, password: string) => {
    const passwordCheck = formattedInputs(password, 'pin', false);
    if (!passwordCheck.isOK) {
      setAccountMessage(t('hooks.message.inputValidUpdatePassword'));
      return { isOK: false };
    }
    const { isOK } = await e3kit.changeEncryptPassword(oldPassword, password);

    if (!isOK) {
      setAccountMessage(t('hooks.message.failedUpdatePassword'));
      return { isOK: false };
    }
    setAccountMessage('');
    return { isOK: true };
  }, []);

  const resetEncryptKey = useCallback(
    async (password: string) => {
      const passwordCheck = await checkUserPassword(password);
      if (!passwordCheck.isOK) {
        setAccountMessage(t('hooks.message.inputValidPassword'));
        return { isOK: false };
      }
      const { isOK } = await e3kit.resetEncryptKey();
      if (!isOK) {
        setAccountMessage(t('hooks.message.failResetEncryptKey'));
        return { isOK: false };
      }
      setAccountMessage('');
      return { isOK: true };
    },
    [checkUserPassword]
  );

  const registEncryptPassword = useCallback(
    async (password: string) => {
      const passwordCheck = formattedInputs(password, 'pin', false);
      if (!passwordCheck.isOK) {
        setAccountMessage(t('hooks.message.inputValidPassword'));
        return { isOK: false };
      }
      const { isOK } = await e3kit.registEncrypt(password);
      if (!isOK) {
        setAccountMessage(t('hooks.message.failCreateBackupKey'));
        await logout();
        return { isOK: false };
      }
      setAccountMessage('');
      return { isOK: true };
    },
    [logout]
  );

  const backupEncryptPassword = useCallback(async (password: string) => {
    const passwordCheck = formattedInputs(password, 'pin', false);
    if (!passwordCheck.isOK) {
      setAccountMessage(t('hooks.message.inputValidPassword'));
      return { isOK: false };
    }
    const { isOK } = await e3kit.backupEncryptKey(password);
    if (!isOK) {
      setAccountMessage(t('hooks.message.failCreateBackupKey'));
      return { isOK: false };
    }
    setAccountMessage('');
    return { isOK: true };
  }, []);

  const restoreEncryptKey = useCallback(
    async (password: string): Promise<{ isOK: boolean }> => {
      const passwordCheck = formattedInputs(password, 'pin', false);
      if (!passwordCheck.isOK) {
        setAccountMessage(t('hooks.message.inputValidPassword'));
        return { isOK: false };
      }
      const { isOK } = await e3kit.restoreEncryptKey(password);
      if (!isOK) {
        //ToDo roatate,clear?
        setAccountMessage(t('hooks.message.failRestoreBackupKey'));
        await logout();
        return { isOK: false };
      }
      setAccountMessage('');
      return { isOK: true };
    },
    [logout]
  );

  const deleteAllProjects = useCallback(
    async (password: string) => {
      if (!hasLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }
      const { isOK: isPasswordOK } = await checkUserPassword(password);
      if (!isPasswordOK) {
        return { isOK: false, message: t('hooks.message.wrongPassword') };
      }
      const { isOK: isProjectsOK, message: getProjectsMessage, projects } = await getAllProjects(user.uid, true);
      if (!isProjectsOK || projects === undefined) {
        return { isOK: false, message: getProjectsMessage };
      }
      //ToDo useE3kitGroup使う？
      for (const project of projects) {
        const participants = project.membersUid.filter((v) => v !== project.ownerUid);
        if (participants.length > 0) {
          await e3kit.deleteGroupMembers(project.id, project.ownerUid, participants);
        }
        await e3kit.deleteGroup(project.id);
      }

      const { isOK: projectOK, message: projectMessage, deletedIds } = await projectStore.deleteAllProjects(user.uid);
      if (!projectOK || deletedIds === undefined) {
        return { isOK: false, message: projectMessage };
      }
      const { isOK: photoOK, message: photoMessage } = await projectStorage.deleteAllProjectPhotos(deletedIds);
      if (!photoOK) {
        return { isOK: false, message: photoMessage };
      }
      dispatch(setProjectsAction([]));

      return { isOK: true, message: '' };
    },
    [checkUserPassword, dispatch, user]
  );

  const deleteUserAccount = useCallback(
    async (password: string) => {
      if (!hasLoggedIn(user)) {
        setAccountMessage(t('hooks.message.pleaseReLogin'));
        return { isOK: false };
      }
      const { isOK: passwordOK } = await checkUserPassword(password);
      if (!passwordOK) {
        setAccountMessage(t('hooks.message.inputValidPassword'));
        return { isOK: false };
      }
      const { isOK: encryptKeyOK } = await e3kit.deleteEncryptKey();
      if (!encryptKeyOK) {
        setAccountMessage(t('hooks.message.failDeleteEncryptKey'));
        return { isOK: false };
      }
      const { isOK: deleteProjectOK } = await deleteAllProjects(user.uid);
      if (!deleteProjectOK) {
        setAccountMessage(t('hooks.message.failDeleteProject'));
        return { isOK: false };
      }
      const { isOK: isDeleteOK } = await firebase.deleteUserAccount(password);
      if (!isDeleteOK) {
        setAccountMessage(t('hooks.message.failDeleteAccount'));
        return { isOK: false };
      }
      setAccountMessage('');
      return { isOK: true };
    },
    [checkUserPassword, deleteAllProjects, user]
  );

  useEffect(() => {
    setAccountFormState(accountFormState_ ?? 'loginUserAccount');
    setAccountMessage(message ?? '');
  }, [accountFormState_, message]);

  useEffect(() => {
    (async () => {
      if (FUNC_LOGIN && Platform.OS === 'web') {
        await initFirebaseAuth();
      }
      if (hasLoggedIn(user)) {
        const { isOK, message: initUserMessage } = await e3kit.initializeUser(user.uid);
        if (!isOK) {
          console.log('useAccountError:', initUserMessage);
          //長時間ログイン状態で時間切れ？が発生する。
          await AlertAsync(t('hooks.message.failInitializeUser'));
          //ToDo データをリセットするか？
          // await logout();
          // dispatch(setUserAction(createUserInitialState()));
          // dispatch(
          //   editSettingsAction({
          //     role: undefined,
          //     isSettingProject: false,
          //     isSynced: false,
          //     projectId: undefined,
          //     projectName: undefined,
          //     photosToBeDeleted: [],
          //   })
          // );
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    user,
    accountMessage,
    accountFormState,
    setAccountFormState,
    setAccountMessage,
    login,
    signUp,
    logout,
    updateUserProfile,
    changeUserPassword,
    resetUserPassword,
    deleteUserAccount,
    backupEncryptPassword,
    changeEncryptPassword,
    registEncryptPassword,
    restoreEncryptKey,
    resetEncryptKey,
    deleteAllProjects,
  } as const;
};
