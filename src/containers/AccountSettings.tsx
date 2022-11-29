import React, { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import AccountSettings from '../components/pages/AccountSettings';
import { useLayers } from '../hooks/useLayers';
import { t } from '../i18n/config';
import { AppState } from '../modules';
import { Props_AccountSettings } from '../routes';

export default function AccountSettingsContainers({ navigation }: Props_AccountSettings) {
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const { importProject } = useLayers();

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

  const pressImportProject = useCallback(async () => {
    const { isOK, message } = await importProject();
    if (!isOK) {
      await AlertAsync(message);
    } else {
      navigation.navigate('Home');
    }
  }, [importProject, navigation]);

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
    <AccountSettings
      pressUpdateUserProfile={pressUpdateUserProfile}
      pressChangeUserPassword={pressChangeUserPassword}
      pressChangeEncryptPassword={pressChangeEncryptPassword}
      pressResetEncryptKey={pressResetEncryptKey}
      pressDeleteUserAccount={pressDeleteUserAccount}
      pressUpgradeAccount={pressUpgradeAccount}
      pressImportProject={pressImportProject}
      pressDeleteAllProjects={pressDeleteAllProjects}
      pressGotoHome={pressGotoHome}
    />
  );
}
