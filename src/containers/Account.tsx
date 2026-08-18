import React, { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { useDispatch } from 'react-redux';
import { AlertAsync } from '../components/molecules/AlertAsync';
import Account from '../components/pages/Account';
import { AccountContext } from '../contexts/Account';
import { useAccount } from '../hooks/useAccount';
import { signInGoogleDrive } from '../lib/googledrive/auth';
import { setGoogleDriveConnectedEmailAction } from '../modules/googleDrive';
import { t } from '../i18n/config';
import { Props_Account } from '../routes';

export default function AccountContainers({ navigation, route }: Props_Account) {
  const dispatch = useDispatch();
  const {
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
    logout,
    signUp,
    updateUserProfile,
    changeUserPassword,
    resetUserPassword,
    deleteUserAccount,
    changeEncryptPassword,
    registEncryptPassword,
    backupEncryptPassword,
    migrateEncryptKey,
    restoreEncryptKey,
    resetEncryptKey,
    deleteAllProjects,
  } = useAccount();

  useEffect(() => {
    // パラメータが存在する場合のみ処理（無限ループ防止）
    if (route.params?.accountFormState !== undefined || route.params?.message !== undefined) {
      setAccountFormState(route.params?.accountFormState ?? 'loginUserAccount');
      setAccountMessage(route.params?.message ?? '');
      navigation.setParams({ accountFormState: undefined, message: undefined });
    }
  }, [navigation, route.params?.accountFormState, route.params?.message, setAccountFormState, setAccountMessage]);

  const pressLoginUserAccount = useCallback(
    async (email: string, password: string) => {
      const checkEmailResult = checkEmail(email);
      if (!checkEmailResult.isOK) return;
      const checkPasswordResult = checkPassword(password);
      if (!checkPasswordResult.isOK) return;
      const loginResult = await login(email, password);
      if (!loginResult.isOK || loginResult.authUser === undefined) return;
      const initializeEncriptResult = await initializeEncript(loginResult.authUser);
      if (!initializeEncriptResult.isOK) return;
      setAccountMessage('');
      navigation.navigate('Projects');
    },
    [checkEmail, checkPassword, initializeEncript, login, navigation, setAccountMessage]
  );

  const pressSignupUserAccount = useCallback(
    async (email: string, password: string) => {
      const checkEmailResult = checkEmail(email);
      if (!checkEmailResult.isOK) return;
      const checkPasswordResult = checkPassword(password);
      if (!checkPasswordResult.isOK) return;
      const signUpResult = await signUp(email, password);
      if (!signUpResult.isOK) return;
      const sendConfirmEMailResult = await sendConfirmEMail();
      if (!sendConfirmEMailResult.isOK) return;
      setAccountMessage('');

      await AlertAsync(t('Account.alert.activate'));
      if (Platform.OS === 'web') {
        //同一画面のためnavigateでは再マウントされない。フォーム状態を直接切り替える。
        setAccountFormState('loginUserAccount');
        setAccountMessage(t('Account.message.signupSent'));
      } else {
        navigation.navigate('Home');
      }
    },
    [checkEmail, checkPassword, navigation, sendConfirmEMail, setAccountFormState, setAccountMessage, signUp]
  );

  const pressResetUserPassword = useCallback(
    async (email: string) => {
      const checkEmailResult = checkEmail(email);
      if (!checkEmailResult.isOK) return;
      const resetUserPasswordResult = await resetUserPassword(email);
      if (!resetUserPasswordResult.isOK) return;
      setAccountMessage('');
      await AlertAsync(t('Account.alert.resetPassword'));
      setAccountFormState('loginUserAccount');
      setAccountMessage(t('Account.message.resetPasswordSent'));
    },
    [checkEmail, resetUserPassword, setAccountFormState, setAccountMessage]
  );

  const navigateToPrevious = useCallback(() => {
    if (route.params?.previous === 'AccountSettings') {
      navigation.navigate('AccountSettings', { previous: 'Home' });
    } else if (route.params?.previous === 'Projects') {
      navigation.navigate('Projects');
    } else {
      navigation.navigate('Home');
    }
  }, [navigation, route.params?.previous]);

  const pressClose = useCallback(async () => {
    if (
      accountFormState === 'registEncryptPassword' ||
      accountFormState === 'backupEncryptPassword' ||
      accountFormState === 'migrateEncryptPassword'
    ) {
      // 暗号化キーの登録・更新はスキップ不可（中断=ログアウト）
      await AlertAsync(
        accountFormState === 'migrateEncryptPassword'
          ? t('Account.alert.migrateEncryptKeyRequired')
          : t('Account.alert.registEncryptKey')
      );
      await logout();
      //ログアウト済みのためAccountSettingsには戻さない
      if (Platform.OS === 'web') {
        setAccountFormState('loginUserAccount');
        setAccountMessage('');
      } else {
        navigation.navigate('Home');
      }
      return;
    }
    navigateToPrevious();
  }, [accountFormState, logout, navigateToPrevious, navigation, setAccountFormState, setAccountMessage]);

  const pressUpdateUserProfile = useCallback(
    async (displayName: string, photoURL: string) => {
      const checkProfileResult = checkProfile(displayName, photoURL);
      if (!checkProfileResult.isOK) return;
      const updateUserProfileResult = await updateUserProfile(displayName, photoURL);
      if (!updateUserProfileResult.isOK) return;
      setAccountMessage('');
      await AlertAsync(t('Account.alert.updateUserProfile'));
      navigateToPrevious();
    },
    [checkProfile, navigateToPrevious, setAccountMessage, updateUserProfile]
  );

  const pressChangeUserPassword = useCallback(
    async (oldPassword: string, password: string) => {
      const checkPasswordResult = checkPassword(password);
      if (!checkPasswordResult.isOK) return;
      const { isOK } = await changeUserPassword(oldPassword, password);
      if (!isOK) return;
      setAccountMessage('');
      await AlertAsync(t('Account.alert.changeUserPassword'));
      navigateToPrevious();
    },
    [changeUserPassword, checkPassword, navigateToPrevious, setAccountMessage]
  );

  const pressChangeEncryptPassword = useCallback(
    async (oldPassword: string, password: string) => {
      const checkEncryptPasswordResult = checkNewEncryptPassword(password);
      if (!checkEncryptPasswordResult.isOK) return;
      const { isOK } = await changeEncryptPassword(oldPassword, password);
      if (!isOK) return;
      setAccountMessage('');
      await AlertAsync(t('Account.alert.changeEncryptPassword'));
      navigateToPrevious();
    },
    [changeEncryptPassword, checkNewEncryptPassword, navigateToPrevious, setAccountMessage]
  );

  const pressRestoreEncryptKey = useCallback(
    async (password: string) => {
      const checkEncryptPasswordResult = checkEncryptPassword(password);
      if (!checkEncryptPasswordResult.isOK) return;
      const { isOK, needsMigration, retry } = await restoreEncryptKey(password);
      if (!isOK) {
        // 新方式の復元は誤PINでもフォームに留まって再試行できる（メッセージはフック側でセット済み）
        if (retry) return;
        setAccountMessage('');
        await AlertAsync(t('Account.alert.FailRestoreEncryptKey'));
        await logout();
        return;
      }
      if (needsMigration) {
        // 旧PINで復元した未移行ユーザーの保護方式更新はフック側で自動実行される。
        // ここに来るのは自動移行に失敗した場合のみで、移行フォームから再試行する
        setAccountMessage(t('hooks.message.migrateEncryptPassword'));
        setAccountFormState('migrateEncryptPassword');
        return;
      }
      setAccountMessage('');
      // 何が起きたか分かるように結果を通知し、プロジェクト系画面から来た場合は一覧へ戻して開き直しを促す
      if (route.params?.previous === 'Projects') {
        await AlertAsync(t('Account.alert.restoreEncryptKeySuccessOpenProject'));
      } else {
        await AlertAsync(t('Account.alert.restoreEncryptKeySuccess'));
      }
      navigateToPrevious();
    },
    [
      checkEncryptPassword,
      logout,
      navigateToPrevious,
      restoreEncryptKey,
      route.params?.previous,
      setAccountFormState,
      setAccountMessage,
    ]
  );

  const pressMigrateEncryptPassword = useCallback(
    async (password: string) => {
      // 移行はこれまでのPINをそのまま使うため旧4桁も受け付ける（新規設定・自発変更は6桁強制のまま）
      const checkEncryptPasswordResult = checkEncryptPassword(password);
      if (!checkEncryptPasswordResult.isOK) return;
      const { isOK } = await migrateEncryptKey(password);
      // 失敗時はメッセージ表示済み・フォームに留まって再試行できる
      if (!isOK) return;
      setAccountMessage('');
      await AlertAsync(t('Account.alert.migrateEncryptKey'));
      navigation.navigate('Projects');
    },
    [checkEncryptPassword, migrateEncryptKey, navigation, setAccountMessage]
  );

  const pressRegistEncryptPassword = useCallback(
    async (password: string) => {
      const checkEncryptPasswordResult = checkNewEncryptPassword(password);
      if (!checkEncryptPasswordResult.isOK) return;
      const { isOK } = await registEncryptPassword(password);

      setAccountMessage('');
      if (!isOK) {
        await AlertAsync(t('Account.alert.FailRegistEncryptPassword'));
        await logout();
      } else {
        navigation.navigate('Home');
      }
    },
    [checkNewEncryptPassword, logout, navigation, registEncryptPassword, setAccountMessage]
  );

  const pressBackupEncryptPassword = useCallback(
    async (password: string) => {
      const checkEncryptPasswordResult = checkNewEncryptPassword(password);
      if (!checkEncryptPasswordResult.isOK) return;
      const { isOK } = await backupEncryptPassword(password);
      setAccountMessage('');
      if (!isOK) {
        await AlertAsync(t('Account.alert.FailBackupEncryptPassword'));
        await logout();
      } else {
        await AlertAsync(t('Account.alert.backupEncryptPassword'));
        await logout();
        if (Platform.OS === 'web') {
          //同一画面のためnavigateでは再マウントされない。フォーム状態を直接切り替える。
          setAccountFormState('loginUserAccount');
        } else {
          navigation.navigate('Home');
        }
      }
    },
    [backupEncryptPassword, checkNewEncryptPassword, logout, navigation, setAccountFormState, setAccountMessage]
  );

  const pressResetEncryptKey = useCallback(
    async (password: string) => {
      const checkPasswordResult = checkPassword(password);
      if (!checkPasswordResult.isOK) return;
      const checkUserPasswordResult = await checkUserPassword(password);
      if (!checkUserPasswordResult.isOK) return;
      const { isOK } = await resetEncryptKey(password);
      setAccountMessage('');
      if (!isOK) {
        await AlertAsync(t('Account.alert.FailResetEncryptKey'));
      } else {
        await AlertAsync(t('Account.alert.resetEncryptKey'));
        //リセット後に暗号化キーをバックアップする。
        setAccountFormState('backupEncryptPassword');
      }
    },
    [checkPassword, checkUserPassword, resetEncryptKey, setAccountFormState, setAccountMessage]
  );

  const pressDeleteUserAccount = useCallback(
    async (password: string) => {
      const checkPasswordResult = checkPassword(password);
      if (!checkPasswordResult.isOK) return;
      const checkUserPasswordResult = await checkUserPassword(password);
      if (!checkUserPasswordResult.isOK) return;

      const { isOK } = await deleteUserAccount(password);
      setAccountMessage('');
      if (!isOK) {
        await AlertAsync(t('Account.alert.FailDeleteUserAccount'));
      } else {
        await AlertAsync(t('Account.alert.deleteUserAccount'));
        await logout();
        if (Platform.OS === 'web') {
          //同一画面のためnavigateでは再マウントされない。フォーム状態を直接切り替える。
          setAccountFormState('loginUserAccount');
        } else {
          navigation.navigate('Home');
        }
      }
    },
    [checkPassword, checkUserPassword, deleteUserAccount, logout, navigation, setAccountFormState, setAccountMessage]
  );

  const pressDeleteAllProjects = useCallback(
    async (password: string) => {
      const checkPasswordResult = checkPassword(password);
      if (!checkPasswordResult.isOK) return;
      const checkUserPasswordResult = await checkUserPassword(password);
      if (!checkUserPasswordResult.isOK) return;
      const { isOK, message } = await deleteAllProjects(password);
      setAccountMessage('');
      if (!isOK) {
        await AlertAsync(message);
      } else {
        await AlertAsync(t('Account.alert.deleteAllProjects'));
        navigateToPrevious();
      }
    },
    [checkPassword, checkUserPassword, deleteAllProjects, navigateToPrevious, setAccountMessage]
  );

  const pressConnectGoogle = useCallback(async () => {
    const result = await signInGoogleDrive();
    if (!result.isOK) {
      if (result.message === 'cancelled') return;
      const message =
        result.message === 'scope-denied'
          ? t('hooks.message.googleDriveScopeDenied')
          : t('hooks.message.googleDriveConnectFailed');
      await AlertAsync(message);
      return;
    }
    dispatch(setGoogleDriveConnectedEmailAction(result.email));
    setAccountMessage('');
    navigation.navigate('Home');
  }, [dispatch, navigation, setAccountMessage]);

  const changeLoginForm = useCallback(() => {
    setAccountMessage('');
    setAccountFormState('loginUserAccount');
  }, [setAccountFormState, setAccountMessage]);

  const changeSelectLoginMethodForm = useCallback(() => {
    setAccountMessage('');
    setAccountFormState('selectLoginMethod');
  }, [setAccountFormState, setAccountMessage]);

  const changeResetForm = useCallback(() => {
    setAccountMessage(t('Account.message.inputMail'));
    setAccountFormState('resetUserPassword');
  }, [setAccountFormState, setAccountMessage]);

  const changeSignUpForm = useCallback(() => {
    setAccountMessage('');
    setAccountFormState('signupUserAccount');
  }, [setAccountFormState, setAccountMessage]);

  const changeResetEncryptForm = useCallback(async () => {
    await AlertAsync(t('Account.alert.needResetEncryptKey'));
    setAccountMessage(t('Account.message.inputPassword'));
    setAccountFormState('resetEncryptKey');
  }, [setAccountFormState, setAccountMessage]);

  return (
    <AccountContext.Provider
      value={{
        user,
        accountFormState,
        message: accountMessage,
        isLoading,
        pressLoginUserAccount,
        pressClose,
        pressResetUserPassword,
        pressSignupUserAccount,
        pressUpdateUserProfile,
        pressChangeUserPassword,
        pressDeleteUserAccount,
        pressChangeEncryptPassword,
        pressRestoreEncryptKey,
        pressRegistEncryptPassword,
        pressBackupEncryptPassword,
        pressMigrateEncryptPassword,
        pressResetEncryptKey,
        pressDeleteAllProjects,
        changeSignUpForm,
        changeResetPasswordForm: changeResetForm,
        changeResetEncryptForm,
        changeLoginForm,
        changeSelectLoginMethodForm,
        pressConnectGoogle,
      }}
    >
      <Account />
    </AccountContext.Provider>
  );
}
