import React, { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import AccountSettings from '../components/pages/AccountSettings';
import { t } from '../i18n/config';
import { AppState } from '../modules';
import { Props_AccountSettings } from '../routes';
import { AccountSettingsContext } from '../contexts/AccountSettings';

export default function AccountSettingsContainers({ navigation }: Props_AccountSettings) {
  const projectId = useSelector((state: AppState) => state.settings.projectId);

  const pressUpdateUserProfile = useCallback(() => {
    navigation.navigate('Account', { accountFormState: 'updateUserProfile' });
  }, [navigation]);
  const pressChangeUserPassword = useCallback(() => {
    navigation.navigate('Account', { accountFormState: 'changeUserPassword' });
  }, [navigation]);

  const pressChangeEncryptPassword = useCallback(() => {
    navigation.navigate('Account', { accountFormState: 'changeEncryptPassword' });
  }, [navigation]);

  const pressResetEncryptKey = useCallback(async () => {
    const ret = await ConfirmAsync(t('AccountSettings.confirm.resetEncryptKey'));
    if (ret) {
      navigation.navigate('Account', {
        accountFormState: 'resetEncryptKey',
        message: t('AccountSettings.message.resetEncryptKey'),
      });
    }
  }, [navigation]);

  const pressDeleteUserAccount = useCallback(async () => {
    const ret = await ConfirmAsync(t('AccountSettings.confirm.deleteUserAccount'));
    if (ret) {
      navigation.navigate('Account', {
        accountFormState: 'deleteUserAccount',
        message: t('AccountSettings.message.deleteUserAccount'),
      });
    }
  }, [navigation]);

  const pressDeleteAllProjects = useCallback(async () => {
    if (projectId !== undefined) {
      await AlertAsync(t('AccountSettings.alert.deleteAllProjects'));
      return;
    }
    const ret = await ConfirmAsync(t('AccountSettings.confirm.deleteAllProjects'));
    if (ret) {
      navigation.navigate('Account', {
        accountFormState: 'deleteAllProjects',
        message: t('AccountSettings.message.deleteAllProjects'),
      });
    }
  }, [navigation, projectId]);

  const pressUpgradeAccount = useCallback(async () => {
    navigation.navigate('Purchases');
  }, [navigation]);

  const pressGotoHome = useCallback(() => {
    navigation.navigate('Home');
  }, [navigation]);

  return (
    <AccountSettingsContext.Provider
      value={{
        pressUpdateUserProfile,
        pressChangeUserPassword,
        pressChangeEncryptPassword,
        pressResetEncryptKey,
        pressDeleteUserAccount,
        pressUpgradeAccount,
        pressDeleteAllProjects,
        pressGotoHome,
      }}
    >
      <AccountSettings />
    </AccountSettingsContext.Provider>
  );
}
