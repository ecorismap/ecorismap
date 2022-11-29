import React, { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { AlertAsync } from '../components/molecules/AlertAsync';
import Account from '../components/pages/Account';
import { FUNC_PROJECT } from '../constants/AppConstants';
import { useAccount } from '../hooks/useAccount';
import { t } from '../i18n/config';
import { Props_Account } from '../routes';

export default function AccountContainers({ navigation, route }: Props_Account) {
  const {
    user,
    accountMessage,
    accountFormState,
    setAccountFormState,
    setAccountMessage,
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
  } = useAccount(route.params?.accountFormState, route.params?.message);

  const [isLoading, setIsLoading] = useState(false);

  const pressLoginUserAccount = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      const { isOK } = await login(email, password);
      setIsLoading(false);
      if (isOK) {
        if (FUNC_PROJECT) {
          navigation.navigate('Projects');
        } else {
          navigation.navigate('Home');
        }
      }
    },
    [login, navigation]
  );

  const pressSignupUserAccount = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      const { isOK } = await signUp(email, password);
      setIsLoading(false);
      if (isOK) {
        await AlertAsync(t('Account.alert.activate'));
        if (Platform.OS === 'web') {
          navigation.navigate('Account', {});
        } else {
          navigation.navigate('Home');
        }
      } else {
      }
    },
    [navigation, signUp]
  );

  const pressResetUserPassword = useCallback(
    async (email: string) => {
      setIsLoading(true);
      const { isOK } = await resetUserPassword(email);
      setIsLoading(false);
      if (isOK) {
        await AlertAsync(t('Account.alert.resetPassword'));
        if (Platform.OS === 'web') {
          navigation.navigate('Account', {});
        } else {
          navigation.navigate('Home');
        }
      } else {
      }
    },
    [navigation, resetUserPassword]
  );

  const pressClose = useCallback(async () => {
    if (accountFormState === 'registEncryptPassword' || accountFormState === 'backupEncryptPassword') {
      await AlertAsync(t('Account.alert.registEncryptKey'));
      await logout();
    }

    if (Platform.OS === 'web') {
      //navigation.navigate('Home');
      window.open('https://ecoris-map.web.app', '_self');
    } else {
      navigation.navigate('Home');
    }
  }, [accountFormState, logout, navigation]);

  const pressUpdateUserProfile = useCallback(
    async (displayName: string, photoURL: string) => {
      setIsLoading(true);
      const { isOK } = await updateUserProfile(displayName, photoURL);
      setIsLoading(false);
      if (isOK) {
        await AlertAsync(t('Account.alert.updateUserProfile'));
        navigation.navigate('Home');
      } else {
      }
    },
    [navigation, updateUserProfile]
  );

  const pressChangeUserPassword = useCallback(
    async (oldPassword: string, password: string) => {
      setIsLoading(true);
      const { isOK } = await changeUserPassword(oldPassword, password);
      setIsLoading(false);
      if (isOK) {
        await AlertAsync(t('Account.alert.changeUserPassword'));
        navigation.navigate('Home');
      } else {
      }
    },
    [changeUserPassword, navigation]
  );

  const pressChangeEncryptPassword = useCallback(
    async (oldPassword: string, password: string) => {
      setIsLoading(true);
      const { isOK } = await changeEncryptPassword(oldPassword, password);
      setIsLoading(false);
      if (isOK) {
        await AlertAsync(t('Account.alert.changeEncryptPassword'));
        navigation.navigate('Home');
      }
    },
    [changeEncryptPassword, navigation]
  );

  const pressRestoreEncryptKey = useCallback(
    async (password: string) => {
      setIsLoading(true);
      const { isOK } = await restoreEncryptKey(password);
      setIsLoading(false);
      if (!isOK) {
        await AlertAsync(t('Account.alert.FailRestoreEncryptKey'));
        await logout();
      } else {
        navigation.navigate('Home');
      }
    },
    [logout, navigation, restoreEncryptKey]
  );

  const pressRegistEncryptPassword = useCallback(
    async (password: string) => {
      setIsLoading(true);
      const { isOK } = await registEncryptPassword(password);
      setIsLoading(false);
      if (!isOK) {
        await AlertAsync(t('Account.alert.FailRegistEncryptPassword'));
        await logout();
      } else {
        navigation.navigate('Home');
      }
    },
    [logout, navigation, registEncryptPassword]
  );

  const pressBackupEncryptPassword = useCallback(
    async (password: string) => {
      setIsLoading(true);
      const { isOK } = await backupEncryptPassword(password);
      setIsLoading(false);
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
    [backupEncryptPassword, logout, navigation]
  );

  const pressResetEncryptKey = useCallback(
    async (password: string) => {
      setIsLoading(true);
      const { isOK } = await resetEncryptKey(password);
      setIsLoading(false);
      if (!isOK) {
        await AlertAsync(t('Account.alert.FailResetEncryptKey'));
      } else {
        await AlertAsync(t('Account.alert.resetEncryptKey'));
        //リセット後に暗号化キーをバックアップする。
        setAccountFormState('backupEncryptPassword');
      }
    },
    [resetEncryptKey, setAccountFormState]
  );

  const pressDeleteUserAccount = useCallback(
    async (password: string) => {
      setIsLoading(true);
      const { isOK } = await deleteUserAccount(password);
      setIsLoading(false);
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
    [deleteUserAccount, logout, navigation]
  );

  const pressDeleteAllProjects = useCallback(
    async (password: string) => {
      setIsLoading(true);
      const { isOK, message } = await deleteAllProjects(password);
      setIsLoading(false);
      if (!isOK) {
        await AlertAsync(message);
      } else {
        await AlertAsync(t('Account.alert.deleteAllProjects'));
        navigation.navigate('Home');
      }
    },
    [deleteAllProjects, navigation]
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
    <Account
      user={user}
      accountFormState={accountFormState}
      message={accountMessage}
      isLoading={isLoading}
      pressLoginUserAccount={pressLoginUserAccount}
      pressClose={pressClose}
      pressResetUserPassword={pressResetUserPassword}
      pressSignupUserAccount={pressSignupUserAccount}
      pressUpdateUserProfile={pressUpdateUserProfile}
      pressChangeUserPassword={pressChangeUserPassword}
      pressDeleteUserAccount={pressDeleteUserAccount}
      pressChangeEncryptPassword={pressChangeEncryptPassword}
      pressRestoreEncryptKey={pressRestoreEncryptKey}
      pressRegistEncryptPassword={pressRegistEncryptPassword}
      pressBackupEncryptPassword={pressBackupEncryptPassword}
      pressResetEncryptKey={pressResetEncryptKey}
      pressDeleteAllProjects={pressDeleteAllProjects}
      changeSignUpForm={changeSignUpForm}
      changeResetPasswordForm={changeResetForm}
      changeResetEncryptForm={changeResetEncryptForm}
    />
  );
}
