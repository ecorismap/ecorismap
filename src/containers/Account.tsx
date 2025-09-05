import React, { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { AlertAsync } from '../components/molecules/AlertAsync';
import Account from '../components/pages/Account';
import { AccountContext } from '../contexts/Account';
import { useAccount } from '../hooks/useAccount';
import { t } from '../i18n/config';
import { Props_Account } from '../routes';

export default function AccountContainers({ navigation, route }: Props_Account) {
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
    restoreEncryptKey,
    resetEncryptKey,
    deleteAllProjects,
  } = useAccount();

  useEffect(() => {
    setAccountFormState(route.params?.accountFormState ?? 'loginUserAccount');
    setAccountMessage(route.params?.message ?? '');
    navigation.setParams({ accountFormState: undefined, message: undefined });
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
        navigation.navigate('Account', {});
      } else {
        navigation.navigate('Home');
      }
    },
    [checkEmail, checkPassword, navigation, sendConfirmEMail, setAccountMessage, signUp]
  );

  const pressResetUserPassword = useCallback(
    async (email: string) => {
      const checkEmailResult = checkEmail(email);
      if (!checkEmailResult.isOK) return;
      const resetUserPasswordResult = await resetUserPassword(email);
      if (!resetUserPasswordResult.isOK) return;
      setAccountMessage('');
      await AlertAsync(t('Account.alert.resetPassword'));
      navigation.navigate('Home');
    },
    [checkEmail, navigation, resetUserPassword, setAccountMessage]
  );

  const pressClose = useCallback(async () => {
    if (accountFormState === 'registEncryptPassword' || accountFormState === 'backupEncryptPassword') {
      await AlertAsync(t('Account.alert.registEncryptKey'));
      await logout();
    }

    // if (Platform.OS === 'web') {
    //   if (route.params?.previous === 'AccountSettings') {
    //     navigation.navigate('AccountSettings', { previous: 'Home' });
    //   } else {
    //     setAccountFormState('loginUserAccount');
    //     navigation.navigate('Account', {});
    //   }
    //   //window.open('https://ecoris-map.web.app', '_self');
    // } else {
    navigation.navigate('Home');
    // }
  }, [accountFormState, logout, navigation]);

  const pressUpdateUserProfile = useCallback(
    async (displayName: string, photoURL: string) => {
      const checkProfileResult = checkProfile(displayName, photoURL);
      if (!checkProfileResult.isOK) return;
      const updateUserProfileResult = await updateUserProfile(displayName, photoURL);
      if (!updateUserProfileResult.isOK) return;
      setAccountMessage('');
      await AlertAsync(t('Account.alert.updateUserProfile'));
      navigation.navigate('Home');
    },
    [checkProfile, navigation, setAccountMessage, updateUserProfile]
  );

  const pressChangeUserPassword = useCallback(
    async (oldPassword: string, password: string) => {
      const checkPasswordResult = checkPassword(password);
      if (!checkPasswordResult.isOK) return;
      const { isOK } = await changeUserPassword(oldPassword, password);
      if (!isOK) return;
      setAccountMessage('');
      await AlertAsync(t('Account.alert.changeUserPassword'));
      navigation.navigate('Home');
    },
    [changeUserPassword, checkPassword, navigation, setAccountMessage]
  );

  const pressChangeEncryptPassword = useCallback(
    async (oldPassword: string, password: string) => {
      const checkEncryptPasswordResult = checkEncryptPassword(password);
      if (!checkEncryptPasswordResult.isOK) return;
      const { isOK } = await changeEncryptPassword(oldPassword, password);
      if (!isOK) return;
      setAccountMessage('');
      await AlertAsync(t('Account.alert.changeEncryptPassword'));
      navigation.navigate('Home');
    },
    [changeEncryptPassword, checkEncryptPassword, navigation, setAccountMessage]
  );

  const pressRestoreEncryptKey = useCallback(
    async (password: string) => {
      const checkEncryptPasswordResult = checkEncryptPassword(password);
      if (!checkEncryptPasswordResult.isOK) return;
      const { isOK } = await restoreEncryptKey(password);
      setAccountMessage('');
      if (!isOK) {
        await AlertAsync(t('Account.alert.FailRestoreEncryptKey'));
        await logout();
      } else {
        navigation.navigate('Home');
      }
    },
    [checkEncryptPassword, logout, navigation, restoreEncryptKey, setAccountMessage]
  );

  const pressRegistEncryptPassword = useCallback(
    async (password: string) => {
      const checkEncryptPasswordResult = checkEncryptPassword(password);
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
    [checkEncryptPassword, logout, navigation, registEncryptPassword, setAccountMessage]
  );

  const pressBackupEncryptPassword = useCallback(
    async (password: string) => {
      const checkEncryptPasswordResult = checkEncryptPassword(password);
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
          navigation.navigate('Account', {});
        } else {
          navigation.navigate('Home');
        }
      }
    },
    [backupEncryptPassword, checkEncryptPassword, logout, navigation, setAccountMessage]
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
          navigation.navigate('Account', {});
        } else {
          navigation.navigate('Home');
        }
      }
    },
    [checkPassword, checkUserPassword, deleteUserAccount, logout, navigation, setAccountMessage]
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
        navigation.navigate('Home');
      }
    },
    [checkPassword, checkUserPassword, deleteAllProjects, navigation, setAccountMessage]
  );

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
        pressResetEncryptKey,
        pressDeleteAllProjects,
        changeSignUpForm,
        changeResetPasswordForm: changeResetForm,
        changeResetEncryptForm,
      }}
    >
      <Account />
    </AccountContext.Provider>
  );
}
