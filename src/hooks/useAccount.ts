import { Dispatch, SetStateAction, useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as firebase from '../lib/firebase/sign-in';
import { userInitialState, setUserAction } from '../modules/user';
import { Platform } from 'react-native';
import { FBsignOut, initFirebaseAuth, FBsendPasswordResetEmail, FBupdateProfile } from '../lib/firebase/sign-in';

import { RootState } from '../store';
import { AccountFormStateType, UserType } from '../types';
import { formattedInputs } from '../utils/Format';
import * as e3kit from '../lib/virgilsecurity/e3kit';
import { clearPublicKeyLedgerCache } from '../lib/crypto';
import * as migration from '../lib/crypto/migration';
import * as keyBackup from '../lib/crypto/backup';
import { deleteIdentityPrivateKey, saveIdentityPrivateKey } from '../lib/crypto/keyStorage';
import { ENABLE_KEY_LEDGER, FUNC_ENCRYPTION } from '../constants/AppConstants';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { isLoggedIn } from '../utils/Account';
import { projectsInitialState, setProjectsAction } from '../modules/projects';
import * as projectStore from '../lib/firebase/firestore';
import * as projectStorage from '../lib/firebase/storage';
import { t } from '../i18n/config';
import { FirebaseAuthTypes } from '@react-native-firebase/auth';

export type UseAccountReturnType = {
  user: UserType;
  accountMessage: string;
  accountFormState: AccountFormStateType;
  isLoading: boolean;
  setAccountFormState: Dispatch<SetStateAction<AccountFormStateType>>;
  setAccountMessage: Dispatch<SetStateAction<string>>;
  initializeEncript: (authUser: FirebaseAuthTypes.User) => Promise<{
    isOK: boolean;
  }>;
  checkPassword: (password: string) => {
    isOK: boolean;
  };
  checkUserPassword: (password: string) => Promise<{
    isOK: boolean;
  }>;
  checkEncryptPassword: (password: string) => {
    isOK: boolean;
  };
  checkNewEncryptPassword: (password: string) => {
    isOK: boolean;
  };
  checkEmail: (email: string) => {
    isOK: boolean;
  };
  checkProfile: (
    displayName: string,
    photoURL: string
  ) => {
    isOK: boolean;
  };
  sendConfirmEMail: () => Promise<{
    isOK: boolean;
  }>;
  login: (email: string, password: string) => Promise<{ isOK: boolean; authUser: FirebaseAuthTypes.User | undefined }>;
  signUp: (email: string, password: string) => Promise<{ isOK: boolean }>;
  logout: () => Promise<void>;
  resetUserPassword: (email: string) => Promise<{ isOK: boolean }>;
  updateUserProfile: (displayName: string, photoURL: string) => Promise<{ isOK: boolean }>;
  changeUserPassword: (oldPassword: string, password: string) => Promise<{ isOK: boolean }>;
  deleteUserAccount: (password: string) => Promise<{ isOK: boolean }>;
  changeEncryptPassword: (oldPassword: string, password: string) => Promise<{ isOK: boolean }>;
  registEncryptPassword: (password: string) => Promise<{ isOK: boolean }>;
  backupEncryptPassword: (password: string) => Promise<{ isOK: boolean }>;
  cleanupEncryptKey: () => Promise<void>;
  migrateEncryptKey: (password: string) => Promise<{ isOK: boolean }>;
  restoreEncryptKey: (password: string) => Promise<{ isOK: boolean; needsMigration?: boolean; retry?: boolean }>;
  resetEncryptKey: (password: string) => Promise<{
    isOK: boolean;
  }>;
  deleteAllProjects: (password: string) => Promise<{
    isOK: boolean;
    message: string;
  }>;
};

export const useAccount = (): UseAccountReturnType => {
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.user);
  const [isLoading, setIsLoading] = useState(false);
  const [accountMessage, setAccountMessage] = useState('');
  const [accountFormState, setAccountFormState] = useState<AccountFormStateType>('loginUserAccount');

  const initializeEncript = useCallback(async (authUser: FirebaseAuthTypes.User) => {
    //暗号化の初期化
    if (ENABLE_KEY_LEDGER && FUNC_ENCRYPTION) {
      // 脱Virgil移行フロー: 移行状態で分岐する（詳細は src/lib/crypto/migration.ts）
      setIsLoading(true);
      const migrationState = await migration.getKeyMigrationState(authUser.uid);
      if (migrationState.state === 'migrated') {
        // 旧グループ暗号のdual-read用にe3kitも初期化しておく（失敗しても続行=Virgil障害時もDEKは動く）
        await e3kit.initializeUser(authUser.uid);
        setIsLoading(false);
        return { isOK: true };
      }
      if (migrationState.state === 'error') {
        setIsLoading(false);
        setAccountMessage(t('hooks.message.errorInitEncrypt'));
        return { isOK: false };
      }
      // 未移行 or この端末に鍵なし: 移行元鍵の取得・従来フォールバックのためにe3kitを初期化
      const { isOK: initE3kitOK, message: initE3kitMessage } = await e3kit.initializeUser(authUser.uid);
      if (migrationState.state === 'migrated-need-restore') {
        // 他端末で移行済み。e3kit側にローカル鍵が残っていて台帳の現行鍵と一致すれば
        // 新ストレージへコピーして完了（古い鍵の可能性があるため必ず整合検証する）
        const exported = await e3kit.exportLocalIdentityKey(authUser.uid);
        if (exported !== undefined && (await migration.isKeyConsistentWithLedger(authUser.uid, exported.privateKey))) {
          await saveIdentityPrivateKey(authUser.uid, exported.privateKey);
          await migration.markMigrated(authUser.uid);
          setIsLoading(false);
          return { isOK: true };
        }
        setIsLoading(false);
        setAccountMessage(t('hooks.message.inputNewPinRestore'));
        setAccountFormState('restoreEncryptKey');
        return { isOK: false };
      }
      // needs-migration
      setIsLoading(false);
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
      // e3kit健全＝端末に鍵がある未移行ユーザー（大多数）→ 移行フォームへ
      setAccountMessage(t('hooks.message.migrateEncryptPassword'));
      setAccountFormState('migrateEncryptPassword');
      return { isOK: false };
    }

    setIsLoading(true);
    const { isOK: initE3kitOK, message: initE3kitMessage } = await e3kit.initializeUser(authUser.uid);
    setIsLoading(false);
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
    return { isOK: true };
  }, []);

  const checkEmail = useCallback((email: string) => {
    const { isOK: emailOK } = formattedInputs(email, 'email');
    if (!emailOK) {
      setAccountMessage(t('hooks.message.inputValidMail'));
      return { isOK: false };
    }
    return { isOK: true };
  }, []);

  const checkPassword = useCallback((password: string) => {
    const passwordCheck = formattedInputs(password, 'password');
    if (!passwordCheck.isOK) {
      setAccountMessage(t('hooks.message.inputValidPassword'));
      return { isOK: false };
    }
    return { isOK: true };
  }, []);

  const checkEncryptPassword = useCallback((password: string) => {
    const passwordCheck = formattedInputs(password, 'pin');
    if (!passwordCheck.isOK) {
      setAccountMessage(t('hooks.message.inputValidPassword'));
      return { isOK: false };
    }
    return { isOK: true };
  }, []);

  const checkNewEncryptPassword = useCallback((password: string) => {
    const passwordCheck = formattedInputs(password, 'pin6');
    if (!passwordCheck.isOK) {
      setAccountMessage(t('hooks.message.inputValidNewPin'));
      return { isOK: false };
    }
    return { isOK: true };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      //ログイン処理
      setIsLoading(true);
      const { isOK: signInOK, message: signInMessage, authUser } = await firebase.signInWithEmail(email, password);
      setIsLoading(false);
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
        return { isOK: false, authUser: undefined };
      }
      if (!authUser.emailVerified) {
        setAccountMessage(t('hooks.message.noActivate'));
        const ret = await ConfirmAsync(t('hooks.confirm.sendMailForActivate'));
        if (ret) {
          await firebase.confirmEmail();
          await AlertAsync(t('hooks.alert.pleaseActivate'));
        }
        t('hooks.message.pleaseActivate');
        return { isOK: false, authUser: undefined };
      }
      dispatch(
        setUserAction({
          uid: authUser.uid,
          email: authUser.email,
          // displayName 未設定(null)のアカウントでも isLoggedIn を満たすよう email でフォールバックする。
          displayName: authUser.displayName || authUser.email || '',
          photoURL: authUser.photoURL,
        })
      );

      return { isOK: true, authUser };
    },
    [dispatch]
  );

  const logout = useCallback(async () => {
    await FBsignOut();
    // アカウント切替時に前ユーザーの公開鍵・DEK（復号済み秘密鍵を含む）をキャッシュに残さない。
    e3kit.clearPublicKeyCache();
    clearPublicKeyLedgerCache();
    projectStore.clearProjectCryptoCache();
    dispatch(setUserAction(userInitialState));
    dispatch(setProjectsAction(projectsInitialState));
  }, [dispatch]);

  const resetUserPassword = useCallback(async (email: string) => {
    setIsLoading(true);
    const response = await FBsendPasswordResetEmail(email);
    setIsLoading(false);
    if (response === 'auth/user-not-found') {
      setAccountMessage(t('hooks.message.noUser'));
      return { isOK: false };
    }
    return { isOK: true };
  }, []);

  const sendConfirmEMail = useCallback(async () => {
    const sending = await firebase.confirmEmail();
    if (sending === 'error') {
      setAccountMessage(t('hooks.message.unknownError'));
      return { isOK: false };
    }
    return { isOK: true };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    const displayName = email.substring(0, email.lastIndexOf('@'));
    const {
      isOK: signUpOK,
      message: signUpMessage,
      authUser,
    } = await firebase.signUpWithEmail(email, password, displayName);
    setIsLoading(false);
    if (!signUpOK || authUser === undefined) {
      if (signUpMessage === 'auth/email-already-in-use') {
        setAccountMessage(t('hooks.message.emailInUse'));
      } else if (signUpMessage === 'auth/signup-restricted') {
        setAccountMessage(t('hooks.message.signupRestricted'));
      } else if (signUpMessage === 'auth/invalid-email') {
        setAccountMessage(t('hooks.message.invalidEmail'));
      } else if (signUpMessage === 'profile/fail-update') {
        setAccountMessage(t('hooks.message.failSetProfile'));
      } else {
        setAccountMessage(t('hooks.message.unknownError'));
      }
      return { isOK: false };
    }
    return { isOK: true };
  }, []);

  const checkProfile = useCallback((displayName: string, photoURL: string) => {
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
    return { isOK: true };
  }, []);

  const updateUserProfile = useCallback(
    async (displayName: string, photoURL: string) => {
      setIsLoading(true);
      const { isOK, authUser } = await FBupdateProfile(displayName, photoURL);
      setIsLoading(false);
      if (!isOK || authUser === undefined) {
        setAccountMessage(t('hooks.message.failUpdateProfile'));
        return { isOK: false };
      }
      dispatch(
        setUserAction({
          uid: authUser.uid,
          email: authUser.email,
          // displayName 未設定(null)でも isLoggedIn を満たすよう email でフォールバックする。
          displayName: authUser.displayName || authUser.email || '',
          photoURL: authUser.photoURL,
        })
      );
      return { isOK: true };
    },
    [dispatch]
  );

  const changeUserPassword = useCallback(async (oldPassword: string, password: string) => {
    setIsLoading(true);
    const { isOK } = await firebase.changePassword(oldPassword, password);
    setIsLoading(false);
    if (!isOK) {
      setAccountMessage(t('hooks.message.failUpdateLoginPassword'));
      return { isOK: false };
    }
    return { isOK: true };
  }, []);

  const changeEncryptPassword = useCallback(
    async (oldPassword: string, password: string) => {
      if (ENABLE_KEY_LEDGER && FUNC_ENCRYPTION && user.uid !== undefined) {
        setIsLoading(true);
        const migrationState = await migration.getKeyMigrationState(user.uid);
        if (migrationState.state === 'migrated') {
          // 旧PINの検証を兼ねてKMSバックアップから復元し、新PINで作り直す。
          // keyknox側は旧PINが一致する場合のみベストエフォートで同期される。
          const restoreResult = await keyBackup.restoreKeyBackup(oldPassword);
          if (!restoreResult.isOK) {
            setIsLoading(false);
            setAccountMessage(
              restoreResult.message === 'backup-locked'
                ? t('hooks.message.backupLocked')
                : t('hooks.message.failedUpdatePassword')
            );
            return { isOK: false };
          }
          const createResult = await keyBackup.createKeyBackup(
            password,
            restoreResult.privateKey,
            restoreResult.keyVersion
          );
          await e3kit.changeEncryptPassword(oldPassword, password);
          setIsLoading(false);
          if (!createResult.isOK) {
            setAccountMessage(t('hooks.message.failedUpdatePassword'));
            return { isOK: false };
          }
          return { isOK: true };
        }
        // 未移行: 従来のkeyknox変更に続けて、新PIN(6桁)でそのまま移行する
        const { isOK: legacyOK } = await e3kit.changeEncryptPassword(oldPassword, password);
        if (!legacyOK) {
          setIsLoading(false);
          setAccountMessage(t('hooks.message.failedUpdatePassword'));
          return { isOK: false };
        }
        const migrateResult = await migration.migrateIdentityKey(user.uid, password);
        setIsLoading(false);
        if (!migrateResult.isOK) {
          setAccountMessage(t('hooks.message.failedUpdatePassword'));
          return { isOK: false };
        }
        return { isOK: true };
      }
      setIsLoading(true);
      const { isOK } = await e3kit.changeEncryptPassword(oldPassword, password);
      setIsLoading(false);
      if (!isOK) {
        setAccountMessage(t('hooks.message.failedUpdatePassword'));
        return { isOK: false };
      }
      return { isOK: true };
    },
    [user.uid]
  );

  const checkUserPassword = useCallback(async (password: string) => {
    setIsLoading(true);
    const { isOK } = await firebase.checkPassword(password);
    setIsLoading(false);
    if (!isOK) {
      setAccountMessage(t('hooks.message.wrongPassword'));
      return { isOK: false };
    }
    return { isOK: true };
  }, []);

  const resetEncryptKey = useCallback(async () => {
    setIsLoading(true);
    const { isOK } = await e3kit.resetEncryptKey();
    if (isOK && ENABLE_KEY_LEDGER && FUNC_ENCRYPTION && user.uid !== undefined) {
      // 鍵が変わったため新ストレージの旧鍵とマーカーを破棄する。
      // 直後のbackupEncryptPasswordステップで台帳publish+KMSバックアップが再同期される。
      await deleteIdentityPrivateKey(user.uid);
      await migration.clearMigratedMarker(user.uid);
      clearPublicKeyLedgerCache();
    }
    setIsLoading(false);
    if (!isOK) return { isOK: false };
    return { isOK: true };
  }, [user.uid]);

  const registEncryptPassword = useCallback(
    async (password: string) => {
      setIsLoading(true);
      // V2登録: Card+keyknoxを同一PINで併行作成し（旧アプリとの相互運用）、台帳publish+KMSバックアップまで行う
      const { isOK } =
        ENABLE_KEY_LEDGER && FUNC_ENCRYPTION && user.uid !== undefined
          ? await migration.registerIdentityV2(user.uid, password)
          : await e3kit.registEncrypt(password);
      setIsLoading(false);
      if (!isOK) return { isOK: false };
      return { isOK: true };
    },
    [user.uid]
  );

  const migrateEncryptKey = useCallback(
    async (password: string) => {
      if (user.uid === undefined) return { isOK: false };
      setIsLoading(true);
      // 移行は「これまでのPINをそのまま使う」運用のため、打ち間違い・記憶違いのPINで
      // バックアップが作られないようkeyknoxと照合する。不一致でも、旧PINを忘れたユーザーが
      // 移行できなくならないよう、確認の上で入力したPINのまま続行できる
      const verifyResult = await e3kit.verifyEncryptPassword(password);
      if (!verifyResult.isOK && verifyResult.message === 'wrong-password') {
        setIsLoading(false);
        const proceed = await ConfirmAsync(t('hooks.confirm.migrateEncryptPinMismatch'));
        if (!proceed) {
          setAccountMessage(t('hooks.message.migrateEncryptPassword'));
          return { isOK: false };
        }
        setIsLoading(true);
      }
      // 照合の通信エラー等はベストエフォート扱いで続行し、移行本体の失敗で拾う
      const { isOK, message } = await migration.migrateIdentityKey(user.uid, password);
      setIsLoading(false);
      if (!isOK) {
        console.log('[migrateEncryptKey]', message);
        setAccountMessage(t('hooks.message.failMigrateEncryptKey'));
        return { isOK: false };
      }
      return { isOK: true };
    },
    [user.uid]
  );

  const restoreEncryptKey = useCallback(
    async (password: string): Promise<{ isOK: boolean; needsMigration?: boolean; retry?: boolean }> => {
      if (ENABLE_KEY_LEDGER && FUNC_ENCRYPTION && user.uid !== undefined) {
        // モードはサーバー真実で毎回判定する（フォームへの入口がログイン経由とは限らないため）:
        // 移行済み=移行後のPINでKMSバックアップから復元 / 未移行=旧PINでkeyknoxから復元
        setIsLoading(true);
        const statusResult = await keyBackup.getKeyBackupStatus();
        const migratedOnServer = statusResult.isOK && statusResult.status.exists;
        if (migratedOnServer) {
          // 誤PINはフォームに留まって再試行できる（retry=true）
          const result = await migration.restoreIdentityKeyV2(user.uid, password);
          setIsLoading(false);
          if (!result.isOK) {
            setAccountMessage(
              result.message === 'backup-locked'
                ? t('hooks.message.backupLocked')
                : result.message === 'backup-wrong-pin'
                ? t('hooks.message.backupWrongPin')
                : t('hooks.message.failMigrateEncryptKey')
            );
            return { isOK: false, retry: true };
          }
          return { isOK: true };
        }
        const { isOK: legacyOK } = await e3kit.restoreEncryptKey(password);
        if (!legacyOK) {
          setIsLoading(false);
          return { isOK: false };
        }
        // 旧PINで復元できた＝PIN検証済みなので、同じPINでそのまま新方式へ移行する（フォーム省略）。
        // 移行に失敗した場合のみ移行フォームへ誘導して再試行できるようにする
        const migrateResult = await migration.migrateIdentityKey(user.uid, password);
        setIsLoading(false);
        if (!migrateResult.isOK) {
          console.log('[restoreEncryptKey] migrate failed', migrateResult.message);
          return { isOK: true, needsMigration: true };
        }
        return { isOK: true };
      }
      setIsLoading(true);
      const { isOK } = await e3kit.restoreEncryptKey(password);
      setIsLoading(false);
      if (!isOK) return { isOK: false };
      return { isOK: true };
    },
    [user.uid]
  );

  const backupEncryptPassword = useCallback(
    async (password: string) => {
      setIsLoading(true);
      const { isOK } = await e3kit.backupEncryptKey(password);
      if (isOK && ENABLE_KEY_LEDGER && FUNC_ENCRYPTION && user.uid !== undefined) {
        // 鍵リセット直後のkeyknoxバックアップと同時に、新方式(台帳+KMS)も同じPINで再同期する。
        // 鍵が変わっていれば台帳は自動でkeyVersion+1・旧世代をhistoryへ退避する
        const migrateResult = await migration.migrateIdentityKey(user.uid, password);
        if (!migrateResult.isOK) {
          setIsLoading(false);
          return { isOK: false };
        }
      }
      setIsLoading(false);
      if (!isOK) return { isOK: false };
      return { isOK: true };
    },
    [user.uid]
  );

  const cleanupEncryptKey = useCallback(async () => {
    await e3kit.cleanupEncryptKey();
  }, []);

  const deleteAllProjects = useCallback(async () => {
    if (!isLoggedIn(user)) {
      return { isOK: false, message: t('hooks.message.pleaseLogin') };
    }

    // アカウント削除のクリーンアップではアーカイブ済みも対象にする（E3Kitグループ削除の漏れを防ぐ）。
    const {
      isOK: isProjectsOK,
      message: getProjectsMessage,
      projects,
    } = await projectStore.getAllProjects(user.uid, true, true);
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

    // Storage Rulesがprojectドキュメントを参照するため、ドキュメント削除より先にStorageを削除する。
    // getAllProjectsは復号失敗プロジェクトを除外するため、IDはクエリで直接取得して漏れを防ぐ。
    const { isOK: idsOK, message: idsMessage, ids: ownedProjectIds } = await projectStore.getOwnedProjectIds(user.uid);
    if (!idsOK || ownedProjectIds === undefined) {
      return { isOK: false, message: idsMessage };
    }
    const { isOK: photoOK, message: photoMessage } = await projectStorage.deleteAllProjectStorageData(
      ownedProjectIds
    );
    if (!photoOK) {
      return { isOK: false, message: photoMessage };
    }
    const { isOK: projectOK, message: projectMessage, deletedIds } = await projectStore.deleteAllProjects(user.uid);
    if (!projectOK || deletedIds === undefined) {
      return { isOK: false, message: projectMessage };
    }
    dispatch(setProjectsAction([]));

    return { isOK: true, message: '' };
  }, [dispatch, user]);

  const deleteUserAccount = useCallback(
    async (password: string) => {
      if (!isLoggedIn(user)) {
        setAccountMessage(t('hooks.message.pleaseReLogin'));
        return { isOK: false };
      }
      setIsLoading(true);
      const { isOK: encryptKeyOK } = await e3kit.deleteEncryptKey();
      setIsLoading(false);
      if (!encryptKeyOK) {
        setAccountMessage(t('hooks.message.failDeleteEncryptKey'));
        return { isOK: false };
      }
      if (ENABLE_KEY_LEDGER && FUNC_ENCRYPTION && user.uid !== undefined) {
        // 新方式の鍵データも削除（台帳・KMSバックアップはRulesでクライアント削除不可のためFunctions経由）。
        // 失敗しても残るのは公開鍵と本人にしか開けない暗号化blobのみなので、アカウント削除は続行する
        await keyBackup.deleteKeyData();
        await deleteIdentityPrivateKey(user.uid);
        await migration.clearMigratedMarker(user.uid);
      }
      setIsLoading(true);
      const { isOK: deleteProjectOK } = await deleteAllProjects();
      setIsLoading(false);
      if (!deleteProjectOK) {
        setAccountMessage(t('hooks.message.failDeleteProject'));
        return { isOK: false };
      }
      setIsLoading(true);
      const { isOK: isDeleteOK } = await firebase.deleteUserAccount(password);
      setIsLoading(true);
      if (!isDeleteOK) {
        setAccountMessage(t('hooks.message.failDeleteAccount'));
        return { isOK: false };
      }

      return { isOK: true };
    },
    [deleteAllProjects, user]
  );

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'web') {
        await initFirebaseAuth();
      }
    })();
  }, []);

  return {
    user,
    accountMessage,
    accountFormState,
    isLoading,
    setAccountFormState,
    setAccountMessage,
    checkPassword,
    checkUserPassword,
    checkEncryptPassword,
    checkNewEncryptPassword,
    checkEmail,
    checkProfile,
    initializeEncript,
    sendConfirmEMail,
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
    migrateEncryptKey,
    restoreEncryptKey,
    cleanupEncryptKey,
    resetEncryptKey,
    deleteAllProjects,
  } as const;
};
